import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { logger } from '@/lib/logger';

export interface ExtractionResult {
  text: string;
  method: 'pdftotext' | 'utf8' | 'none';
  warning?: string;
}

const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'rst', 'csv', 'tsv', 'json', 'yaml', 'yml',
  'toml', 'xml', 'html', 'htm', 'css', 'js', 'ts', 'jsx', 'tsx',
  'py', 'java', 'go', 'rs', 'rb', 'php', 'c', 'cpp', 'h', 'hpp',
  'sql', 'sh', 'bash', 'zsh', 'bat', 'ps1', 'env', 'ini', 'cfg',
  'log', 'rtf', 'tex', 'r', 'scala', 'kt', 'swift', 'lua', 'pl',
  'gitignore', 'dockerignore', 'editorconfig', 'prettierrc',
]);

const IMAGE_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'tiff', 'tif',
]);

const BINARY_EXTENSIONS = new Set([
  'zip', 'tar', 'gz', 'rar', '7z', 'exe', 'dll', 'so', 'dylib',
  'bin', 'dat', 'iso', 'dmg', 'woff', 'woff2', 'ttf', 'otf', 'eot',
]);

function getExtension(filePath: string): string {
  return path.extname(filePath).replace('.', '').toLowerCase();
}

function isBinaryBuffer(buffer: Buffer): boolean {
  const checkLen = Math.min(buffer.length, 8192);
  for (let i = 0; i < checkLen; i++) {
    if (buffer[i] === 0) return true;
  }
  return false;
}

export async function extractContent(filePath: string): Promise<ExtractionResult> {
  const ext = getExtension(filePath);

  if (ext === 'pdf') {
    return extractPdf(filePath);
  }

  if (IMAGE_EXTENSIONS.has(ext)) {
    return {
      text: `[Imagen: ${path.basename(filePath)}]`,
      method: 'none',
      warning: 'Archivo de imagen — no se puede extraer texto',
    };
  }

  if (BINARY_EXTENSIONS.has(ext)) {
    return {
      text: `[Archivo binario: ${path.basename(filePath)}]`,
      method: 'none',
      warning: 'Archivo binario — no se puede extraer texto',
    };
  }

  return extractText(filePath, ext);
}

function extractPdf(filePath: string): ExtractionResult {
  try {
    const text = execSync(`pdftotext "${filePath}" -`, {
      maxBuffer: 50 * 1024 * 1024,
      timeout: 30000,
    }).toString('utf-8').trim();

    if (!text || text.length === 0) {
      // Check file size to determine if it's likely a scanned PDF
      const stats = fs.statSync(filePath);
      const warning = stats.size > 10240
        ? 'PDF sin texto extraíble (posiblemente escaneado/imagen)'
        : 'PDF vacío';
      return {
        text: `[PDF sin texto extraíble: ${path.basename(filePath)}]`,
        method: 'pdftotext',
        warning,
      };
    }

    // If extracted text is very short for a large file, warn
    const stats = fs.statSync(filePath);
    if (text.length < 50 && stats.size > 10240) {
      return {
        text,
        method: 'pdftotext',
        warning: 'PDF con muy poco texto extraíble (posiblemente contiene imágenes)',
      };
    }

    return { text, method: 'pdftotext' };
  } catch (error) {
    logger.error('processing', 'pdftotext extraction error', { error: (error as Error).message, file: path.basename(filePath) });
    return {
      text: `[Error al extraer PDF: ${path.basename(filePath)}]`,
      method: 'none',
      warning: `Error al extraer PDF: ${(error as Error).message}`,
    };
  }
}

function extractText(filePath: string, ext: string): ExtractionResult {
  try {
    const buffer = fs.readFileSync(filePath);

    if (!TEXT_EXTENSIONS.has(ext) && isBinaryBuffer(buffer)) {
      return {
        text: `[Archivo binario: ${path.basename(filePath)}]`,
        method: 'none',
        warning: 'Archivo binario detectado — no se puede extraer texto',
      };
    }

    const text = buffer.toString('utf-8');
    return { text, method: 'utf8' };
  } catch (error) {
    return {
      text: `[Error al leer archivo: ${path.basename(filePath)}]`,
      method: 'none',
      warning: `Error al leer: ${(error as Error).message}`,
    };
  }
}
