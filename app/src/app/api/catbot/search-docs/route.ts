import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '@/lib/logger';
import { cacheGet, cacheSet } from '@/lib/cache';

export const dynamic = 'force-dynamic';

const DOC_CACHE_TTL = 5 * 60 * 1000; // 5 min

interface DocChunk {
  file: string;
  chunk: string;
  score: number;
}

interface CachedDoc {
  content: string;
  mtimeMs: number;
}

// Directories and files to search
const DOC_PATHS = [
  // Planning docs
  { dir: '/app/.planning', glob: ['PROJECT.md', 'STATE.md', 'ROADMAP.md'] },
  // Progress session files
  { dir: '/app/.planning/Progress', glob: [] }, // all .md in dir
  // Root README
  { dir: '/app', glob: ['README.md'] },
];

// Fallback paths for local development (not Docker)
const LOCAL_DOC_PATHS = [
  { dir: '.planning', glob: ['PROJECT.md', 'STATE.md', 'ROADMAP.md'] },
  { dir: '.planning/Progress', glob: [] },
  { dir: '.', glob: ['README.md'] },
];

function resolveDocPaths(): Array<{ dir: string; glob: string[] }> {
  // Check if running inside Docker (/app exists with package.json)
  if (fs.existsSync('/app/package.json')) return DOC_PATHS;
  // Try project root
  const projectRoot = process.cwd();
  return LOCAL_DOC_PATHS.map(p => ({
    dir: path.resolve(projectRoot, p.dir),
    glob: p.glob,
  }));
}

function getDocFiles(): string[] {
  const paths = resolveDocPaths();
  const files: string[] = [];

  for (const { dir, glob } of paths) {
    if (!fs.existsSync(dir)) continue;

    if (glob.length > 0) {
      // Specific files
      for (const name of glob) {
        const filePath = path.join(dir, name);
        if (fs.existsSync(filePath)) files.push(filePath);
      }
    } else {
      // All .md files in directory
      try {
        const entries = fs.readdirSync(dir);
        for (const entry of entries) {
          if (entry.endsWith('.md')) {
            files.push(path.join(dir, entry));
          }
        }
      } catch { /* ignore */ }
    }
  }

  return files;
}

function readDocCached(filePath: string): string | null {
  const cacheKey = `doc:${filePath}`;
  const cached = cacheGet<CachedDoc>(cacheKey);

  try {
    const stat = fs.statSync(filePath);
    if (cached && cached.mtimeMs === stat.mtimeMs) {
      return cached.content;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    cacheSet<CachedDoc>(cacheKey, { content, mtimeMs: stat.mtimeMs }, DOC_CACHE_TTL);
    return content;
  } catch {
    return null;
  }
}

function chunkDocument(content: string): string[] {
  // Split by headings or double newlines
  const sections = content.split(/\n(?=##?\s)|(?:\n\s*\n)/);
  const chunks: string[] = [];

  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed || trimmed.length < 10) continue;

    if (trimmed.length <= 600) {
      chunks.push(trimmed);
    } else {
      // Split long sections into ~500 char chunks
      const words = trimmed.split(/\s+/);
      let current = '';
      for (const word of words) {
        if (current.length + word.length + 1 > 500 && current.length > 100) {
          chunks.push(current.trim());
          current = word;
        } else {
          current += (current ? ' ' : '') + word;
        }
      }
      if (current.trim()) chunks.push(current.trim());
    }
  }

  return chunks;
}

function searchDocs(query: string): DocChunk[] {
  const files = getDocFiles();
  const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);

  if (queryWords.length === 0) return [];

  const results: DocChunk[] = [];

  for (const filePath of files) {
    const content = readDocCached(filePath);
    if (!content) continue;

    const fileName = path.basename(filePath);
    const chunks = chunkDocument(content);

    for (const chunk of chunks) {
      const lower = chunk.toLowerCase();
      let score = 0;
      for (const word of queryWords) {
        if (lower.includes(word)) score++;
      }
      if (score > 0) {
        results.push({ file: fileName, chunk: chunk.slice(0, 600), score });
      }
    }
  }

  // Sort by score descending, return top 5
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, 5);
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = url.searchParams.get('q') || '';

    if (!query.trim()) {
      return NextResponse.json({ results: [], files: getDocFiles().map(f => path.basename(f)) });
    }

    const results = searchDocs(query);
    logger.info('catbot', 'Busqueda en documentacion', { query, resultsCount: results.length });

    return NextResponse.json({ results });
  } catch (error) {
    logger.error('catbot', 'Error buscando documentacion', { error: (error as Error).message });
    return NextResponse.json({ results: [], error: (error as Error).message }, { status: 500 });
  }
}
