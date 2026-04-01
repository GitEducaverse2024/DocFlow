import type { TemplateStructure, TemplateSection, TemplateBlock } from '@/lib/types';

/**
 * Simple markdown-to-HTML for email: **bold**, *italic*, [link](url), - lists, \n→<br>
 */
function mdToHtml(md: string): string {
  return md
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:#7C3AED;text-decoration:underline">$1</a>')
    .replace(/^- (.+)$/gm, '<li style="margin:2px 0">$1</li>')
    .replace(/(<li.*<\/li>\n?)+/g, (m) => `<ul style="margin:8px 0;padding-left:20px">${m}</ul>`)
    .replace(/\n/g, '<br>');
}

/**
 * Extract YouTube video ID from URL
 */
function youtubeId(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

function renderBlock(block: TemplateBlock, variables?: Record<string, string>, styles?: TemplateStructure['styles']): { html: string; text: string } {
  const textColor = styles?.textColor || '#333333';
  const fontFamily = styles?.fontFamily || 'Arial, sans-serif';

  switch (block.type) {
    case 'logo':
    case 'image': {
      if (!block.src) return { html: '', text: '' };
      const w = block.width ? (typeof block.width === 'number' ? `${block.width}px` : block.width === 'full' ? '100%' : block.width) : 'auto';
      const align = block.align || 'center';
      return {
        html: `<img src="${block.src}" alt="${block.alt || ''}" width="${w.replace('px', '')}" style="display:block;max-width:100%;height:auto;${align === 'full' ? 'width:100%' : ''}" />`,
        text: `[${block.alt || 'Image'}]`,
      };
    }
    case 'video': {
      const vid = block.url ? youtubeId(block.url) : null;
      if (!vid) return { html: '', text: '' };
      const thumb = block.thumbnailUrl || `https://img.youtube.com/vi/${vid}/hqdefault.jpg`;
      return {
        html: `<a href="${block.url}" target="_blank" style="display:block;text-decoration:none"><img src="${thumb}" alt="Video" width="100%" style="display:block;max-width:100%;height:auto;border-radius:4px" /></a>`,
        text: `[Video: ${block.url}]`,
      };
    }
    case 'text': {
      const content = block.content || '';
      return {
        html: `<div style="font-family:${fontFamily};color:${textColor};font-size:14px;line-height:1.6">${mdToHtml(content)}</div>`,
        text: content.replace(/\*\*/g, '').replace(/\*/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'),
      };
    }
    case 'instruction': {
      const key = block.text || '';
      const filled = variables?.[key];
      if (filled) {
        return {
          html: `<div style="font-family:${fontFamily};color:${textColor};font-size:14px;line-height:1.6">${mdToHtml(filled)}</div>`,
          text: filled.replace(/\*\*/g, '').replace(/\*/g, ''),
        };
      }
      return {
        html: `<div style="font-family:${fontFamily};color:#9CA3AF;font-size:14px;line-height:1.6;padding:12px;background:#F3F4F6;border-radius:4px;border:1px dashed #D1D5DB">${block.text || 'Contenido dinamico'}</div>`,
        text: `[${block.text || 'Contenido dinamico'}]`,
      };
    }
    default:
      return { html: '', text: '' };
  }
}

function renderSection(section: TemplateSection, variables?: Record<string, string>, styles?: TemplateStructure['styles']): { html: string; text: string } {
  if (!section.rows || section.rows.length === 0) return { html: '', text: '' };

  let html = '';
  let text = '';

  for (const row of section.rows) {
    if (!row.columns || row.columns.length === 0) continue;

    if (row.columns.length === 1) {
      const col = row.columns[0];
      const blockResult = renderBlock(col.block, variables, styles);
      const align = col.block.align || 'left';
      html += `<tr><td align="${align === 'full' ? 'center' : align}" style="padding:4px 0">${blockResult.html}</td></tr>`;
      text += blockResult.text + '\n';
    } else {
      // Multi-column row
      html += '<tr><td style="padding:4px 0"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>';
      for (const col of row.columns) {
        const w = col.width || `${Math.floor(100 / row.columns.length)}%`;
        const blockResult = renderBlock(col.block, variables, styles);
        const align = col.block.align || 'left';
        html += `<td width="${w}" align="${align === 'full' ? 'center' : align}" valign="top" style="padding:0 4px">${blockResult.html}</td>`;
        text += blockResult.text + ' | ';
      }
      html += '</tr></table></td></tr>';
      text += '\n';
    }
  }

  return { html, text };
}

/**
 * Render an email template structure to HTML + plain-text.
 *
 * @param structure - The template structure with sections and styles
 * @param variables - Map of instruction text → filled content (from LLM or user)
 * @returns { html, text } ready to use as email body
 */
export function renderTemplate(
  structure: TemplateStructure,
  variables?: Record<string, string>
): { html: string; text: string } {
  const s = structure.styles || {
    backgroundColor: '#ffffff',
    fontFamily: 'Arial, sans-serif',
    primaryColor: '#7C3AED',
    textColor: '#333333',
    maxWidth: 600,
  };

  const header = renderSection(structure.sections.header, variables, s);
  const body = renderSection(structure.sections.body, variables, s);
  const footer = renderSection(structure.sections.footer, variables, s);

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:${s.fontFamily}">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f5">
<tr><td align="center" style="padding:20px 0">
<table width="${s.maxWidth}" cellpadding="0" cellspacing="0" border="0" style="max-width:${s.maxWidth}px;width:100%;background-color:${s.backgroundColor};border-radius:8px;overflow:hidden">
${header.html ? `<!-- Header -->\n<tr><td style="background-color:${s.primaryColor};padding:16px 24px"><table width="100%" cellpadding="0" cellspacing="0" border="0">${header.html}</table></td></tr>` : ''}
${body.html ? `<!-- Body -->\n<tr><td style="padding:24px"><table width="100%" cellpadding="0" cellspacing="0" border="0">${body.html}</table></td></tr>` : ''}
${footer.html ? `<!-- Footer -->\n<tr><td style="padding:16px 24px;border-top:1px solid #e4e4e7;background-color:#fafafa"><table width="100%" cellpadding="0" cellspacing="0" border="0">${footer.html}</table></td></tr>` : ''}
</table>
</td></tr>
</table>
</body>
</html>`;

  const text = [header.text, body.text, footer.text].filter(Boolean).join('\n---\n');

  return { html, text };
}
