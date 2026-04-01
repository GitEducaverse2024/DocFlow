'use client';

import { Image as ImageIcon, Video, Upload, Bot } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { TemplateBlock } from '@/lib/types';

interface BlockRendererProps {
  block: TemplateBlock;
  isSelected: boolean;
  onClick: () => void;
}

function getYouTubeThumbnail(url?: string): string | null {
  if (!url) return null;
  const match = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  return match ? `https://img.youtube.com/vi/${match[1]}/hqdefault.jpg` : null;
}

/** Render simple markdown: **bold**, *italic*, [link](url), - list items */
function renderMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" class="text-violet-400 underline">$1</a>')
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/\n/g, '<br />');
}

export default function BlockRenderer({ block, isSelected, onClick }: BlockRendererProps) {
  const t = useTranslations('catpower');

  const wrapperClass = `rounded-lg p-3 cursor-pointer transition-all border-2 ${
    isSelected
      ? 'ring-2 ring-violet-500 border-violet-500/50'
      : 'border-transparent hover:border-zinc-700'
  }`;

  if (block.type === 'logo' || block.type === 'image') {
    const alignClass =
      block.align === 'center' ? 'mx-auto' : block.align === 'right' ? 'ml-auto' : '';
    return (
      <div className={wrapperClass} onClick={onClick}>
        {block.src ? (
          <img
            src={block.src}
            alt={block.alt || ''}
            style={{ width: block.width ? `${block.width}px` : 'auto', maxWidth: '100%' }}
            className={`rounded ${alignClass} block`}
          />
        ) : (
          <div
            className={`flex flex-col items-center justify-center gap-2 py-8 border-2 border-dashed border-zinc-700 rounded-lg bg-zinc-800/50 ${alignClass}`}
            style={{ width: block.width ? `${block.width}px` : '100%', maxWidth: '100%' }}
          >
            {block.type === 'logo' ? (
              <ImageIcon className="w-8 h-8 text-zinc-600" />
            ) : (
              <Upload className="w-8 h-8 text-zinc-600" />
            )}
            <span className="text-xs text-zinc-500">{t('templates.config.uploadImage')}</span>
          </div>
        )}
      </div>
    );
  }

  if (block.type === 'video') {
    const thumbnail = getYouTubeThumbnail(block.url);
    return (
      <div className={wrapperClass} onClick={onClick}>
        {thumbnail ? (
          <div className="relative rounded-lg overflow-hidden">
            <img src={thumbnail} alt="Video thumbnail" className="w-full rounded-lg" />
            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
              <div className="w-14 h-14 rounded-full bg-red-600 flex items-center justify-center">
                <Video className="w-6 h-6 text-white ml-1" />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 py-8 border-2 border-dashed border-zinc-700 rounded-lg bg-zinc-800/50">
            <Video className="w-8 h-8 text-zinc-600" />
            <span className="text-xs text-zinc-500">{t('templates.config.youtubeUrl')}</span>
          </div>
        )}
      </div>
    );
  }

  if (block.type === 'text') {
    const content = block.content || block.text || '';
    return (
      <div className={wrapperClass} onClick={onClick}>
        {content ? (
          <div
            className="text-sm text-zinc-300 leading-relaxed prose prose-invert prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
          />
        ) : (
          <p className="text-sm text-zinc-600 italic">{t('templates.config.textPlaceholder')}</p>
        )}
      </div>
    );
  }

  if (block.type === 'instruction') {
    return (
      <div
        className={`${wrapperClass} bg-violet-500/5 !border-dashed ${
          isSelected ? '!border-violet-500/50' : '!border-violet-500/30'
        }`}
        onClick={onClick}
      >
        <div className="flex items-start gap-2">
          <Bot className="w-4 h-4 text-violet-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm text-violet-300">
              {block.content || block.text || t('templates.blocks.instructionDesc')}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
