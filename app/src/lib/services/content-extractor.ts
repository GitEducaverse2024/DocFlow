import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { logger } from '@/lib/logger';

export interface ExtractionResult {
  text: string;
  method: 'pdftotext' | 'utf8' | 'office-xml' | 'none';
  warning?: string;
}

// --- Extension sets ---

const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'rst', 'csv', 'tsv', 'json', 'yaml', 'yml',
  'toml', 'xml', 'html', 'htm', 'css', 'js', 'ts', 'jsx', 'tsx',
  'py', 'java', 'go', 'rs', 'rb', 'php', 'c', 'cpp', 'h', 'hpp',
  'sql', 'sh', 'bash', 'zsh', 'bat', 'ps1', 'env', 'ini', 'cfg',
  'log', 'tex', 'r', 'scala', 'kt', 'swift', 'lua', 'pl',
  'gitignore', 'dockerignore', 'editorconfig', 'prettierrc',
]);

const IMAGE_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'tiff', 'tif',
]);

const BINARY_EXTENSIONS = new Set([
  'zip', 'tar', 'gz', 'rar', '7z', 'exe', 'dll', 'so', 'dylib',
  'bin', 'dat', 'iso', 'dmg', 'woff', 'woff2', 'ttf', 'otf', 'eot',
]);

// Office formats that are ZIP-based XML — handled by extractOfficeXml
const OFFICE_EXTENSIONS = new Set([
  'docx', 'pptx', 'xlsx', 'odt', 'odp', 'ods',
]);

// Legacy Office binary formats — can't extract natively, need AI
const LEGACY_OFFICE_EXTENSIONS = new Set([
  'doc', 'xls', 'ppt',
]);

// --- Helpers ---

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

/** Strip XML/HTML tags, collapse whitespace, trim */
function stripXmlTags(xml: string): string {
  return xml
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// --- Main entry ---

export async function extractContent(filePath: string): Promise<ExtractionResult> {
  const ext = getExtension(filePath);

  if (ext === 'pdf') {
    return extractPdf(filePath);
  }

  if (OFFICE_EXTENSIONS.has(ext)) {
    return extractOfficeXml(filePath, ext);
  }

  if (LEGACY_OFFICE_EXTENSIONS.has(ext)) {
    return {
      text: `[Formato legacy sin soporte nativo: ${path.basename(filePath)}]`,
      method: 'none',
      warning: `Formato .${ext} requiere extracción AI — usa el botón "Extraer con IA" en la fuente`,
    };
  }

  if (ext === 'rtf') {
    return extractRtf(filePath);
  }

  if (ext === 'epub') {
    return extractEpub(filePath);
  }

  if (IMAGE_EXTENSIONS.has(ext)) {
    return {
      text: `[Imagen: ${path.basename(filePath)}]`,
      method: 'none',
      warning: 'Archivo de imagen — usa extracción AI para OCR',
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

// --- PDF extraction ---

function extractPdf(filePath: string): ExtractionResult {
  try {
    const text = execSync(`pdftotext "${filePath}" -`, {
      maxBuffer: 50 * 1024 * 1024,
      timeout: 30000,
    }).toString('utf-8').trim();

    if (!text || text.length === 0) {
      const stats = fs.statSync(filePath);
      const warning = stats.size > 10240
        ? 'PDF sin texto extraíble (posiblemente escaneado/imagen) — usa extracción AI'
        : 'PDF vacío';
      return {
        text: `[PDF sin texto extraíble: ${path.basename(filePath)}]`,
        method: 'pdftotext',
        warning,
      };
    }

    const stats = fs.statSync(filePath);
    if (text.length < 50 && stats.size > 10240) {
      return {
        text,
        method: 'pdftotext',
        warning: 'PDF con muy poco texto extraíble (posiblemente contiene imágenes) — usa extracción AI para mejor resultado',
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

// --- Office XML extraction (DOCX, PPTX, XLSX, ODT, ODP, ODS) ---

function extractOfficeXml(filePath: string, ext: string): ExtractionResult {
  // These formats are ZIP archives with XML content inside.
  // We use `unzip -p` to read the relevant XML files and strip tags.
  try {
    if (!fs.existsSync(filePath)) {
      return {
        text: `[Archivo no encontrado: ${path.basename(filePath)}]`,
        method: 'none',
        warning: 'Archivo no existe en disco',
      };
    }

    let xmlContent = '';

    switch (ext) {
      case 'docx': {
        // word/document.xml contains the main body text
        xmlContent = execSync(`unzip -p "${filePath}" word/document.xml 2>/dev/null || true`, {
          maxBuffer: 50 * 1024 * 1024,
          timeout: 15000,
        }).toString('utf-8');
        break;
      }
      case 'pptx': {
        // ppt/slides/slide*.xml — list all slides, extract each
        const slideList = execSync(`unzip -l "${filePath}" 2>/dev/null | grep "ppt/slides/slide" | awk '{print $4}' || true`, {
          maxBuffer: 1 * 1024 * 1024,
          timeout: 10000,
        }).toString('utf-8').trim();

        const slideFiles = slideList.split('\n').filter(s => s.endsWith('.xml')).sort();
        if (slideFiles.length > 0) {
          const parts: string[] = [];
          for (const slide of slideFiles) {
            try {
              const slideXml = execSync(`unzip -p "${filePath}" "${slide}" 2>/dev/null || true`, {
                maxBuffer: 10 * 1024 * 1024,
                timeout: 10000,
              }).toString('utf-8');
              const slideText = stripXmlTags(slideXml);
              if (slideText.length > 0) {
                const slideNum = slide.match(/slide(\d+)/)?.[1] || '?';
                parts.push(`--- Slide ${slideNum} ---\n${slideText}`);
              }
            } catch {
              // Skip problematic slides
            }
          }
          xmlContent = parts.join('\n\n');
        }
        break;
      }
      case 'xlsx': {
        // xl/sharedStrings.xml has all text strings used in cells
        const sharedStrings = execSync(`unzip -p "${filePath}" xl/sharedStrings.xml 2>/dev/null || true`, {
          maxBuffer: 50 * 1024 * 1024,
          timeout: 15000,
        }).toString('utf-8');
        xmlContent = sharedStrings;
        break;
      }
      case 'odt':
      case 'odp':
      case 'ods': {
        // OpenDocument: content.xml has the body
        xmlContent = execSync(`unzip -p "${filePath}" content.xml 2>/dev/null || true`, {
          maxBuffer: 50 * 1024 * 1024,
          timeout: 15000,
        }).toString('utf-8');
        break;
      }
    }

    const text = ext === 'pptx' ? xmlContent : stripXmlTags(xmlContent);

    if (!text || text.trim().length < 5) {
      return {
        text: `[${ext.toUpperCase()} sin texto extraíble: ${path.basename(filePath)}]`,
        method: 'none',
        warning: `Archivo .${ext} sin contenido de texto — puede contener solo imágenes. Usa extracción AI.`,
      };
    }

    logger.info('processing', `Office XML extraction OK: ${ext}`, { file: path.basename(filePath), chars: text.length });
    return { text, method: 'office-xml' };
  } catch (error) {
    logger.error('processing', `Office XML extraction error: ${ext}`, { error: (error as Error).message, file: path.basename(filePath) });
    return {
      text: `[Error al extraer ${ext.toUpperCase()}: ${path.basename(filePath)}]`,
      method: 'none',
      warning: `Error extrayendo .${ext}: ${(error as Error).message}`,
    };
  }
}

// --- RTF extraction ---

function extractRtf(filePath: string): ExtractionResult {
  // RTF is technically a text format but uses binary-like control words.
  // We strip RTF control words to get plain text.
  try {
    const raw = fs.readFileSync(filePath, 'latin1');

    // Basic RTF-to-text: remove RTF control groups and commands
    const text = raw
      .replace(/\{\\pict[^}]*\}/g, '')         // Remove embedded images
      .replace(/\{\\[*]?\\[a-z]+[^}]*\}/g, '') // Remove nested control groups
      .replace(/\\par\b/g, '\n')                // \par → newline
      .replace(/\\tab\b/g, '\t')                // \tab → tab
      .replace(/\\line\b/g, '\n')               // \line → newline
      .replace(/\\[a-z]+\d*\s?/g, '')           // Remove control words like \fs24
      .replace(/[{}]/g, '')                      // Remove remaining braces
      .replace(/\\'([0-9a-f]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16))) // Decode hex escapes
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    if (!text || text.length < 5) {
      return {
        text: `[RTF sin texto extraíble: ${path.basename(filePath)}]`,
        method: 'none',
        warning: 'RTF sin contenido de texto',
      };
    }

    return { text, method: 'utf8' };
  } catch (error) {
    return {
      text: `[Error al extraer RTF: ${path.basename(filePath)}]`,
      method: 'none',
      warning: `Error extrayendo RTF: ${(error as Error).message}`,
    };
  }
}

// --- EPUB extraction ---

function extractEpub(filePath: string): ExtractionResult {
  // EPUB is a ZIP with XHTML content files
  try {
    // List all xhtml/html files in the epub
    const fileList = execSync(`unzip -l "${filePath}" 2>/dev/null | grep -iE "\\.(xhtml|html|htm)$" | awk '{print $4}' || true`, {
      maxBuffer: 1 * 1024 * 1024,
      timeout: 10000,
    }).toString('utf-8').trim();

    const htmlFiles = fileList.split('\n').filter(f => f.length > 0).sort();
    if (htmlFiles.length === 0) {
      return {
        text: `[EPUB sin contenido HTML: ${path.basename(filePath)}]`,
        method: 'none',
        warning: 'EPUB sin archivos XHTML internos',
      };
    }

    const parts: string[] = [];
    for (const htmlFile of htmlFiles) {
      try {
        const html = execSync(`unzip -p "${filePath}" "${htmlFile}" 2>/dev/null || true`, {
          maxBuffer: 10 * 1024 * 1024,
          timeout: 10000,
        }).toString('utf-8');
        const text = stripXmlTags(html);
        if (text.length > 10) {
          parts.push(text);
        }
      } catch {
        // Skip problematic files
      }
    }

    const fullText = parts.join('\n\n');
    if (fullText.length < 5) {
      return {
        text: `[EPUB sin texto extraíble: ${path.basename(filePath)}]`,
        method: 'none',
        warning: 'EPUB sin contenido de texto',
      };
    }

    logger.info('processing', 'EPUB extraction OK', { file: path.basename(filePath), chars: fullText.length });
    return { text: fullText, method: 'office-xml' };
  } catch (error) {
    return {
      text: `[Error al extraer EPUB: ${path.basename(filePath)}]`,
      method: 'none',
      warning: `Error extrayendo EPUB: ${(error as Error).message}`,
    };
  }
}

// --- Plain text extraction ---

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
