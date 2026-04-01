'use client';

import { useCallback, useState, useRef, useEffect } from 'react';
import {
  Upload,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Maximize2,
  Bold,
  Italic,
  Link,
  List,
  Trash2,
  Bot,
  Images,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { TemplateBlock } from '@/lib/types';

interface BlockConfigPanelProps {
  block: TemplateBlock;
  templateId: string;
  onChange: (updates: Partial<TemplateBlock>) => void;
  onDelete: () => void;
}

interface AssetItem {
  id: string;
  filename: string;
  url: string;
  mime_type: string | null;
  size_bytes: number | null;
}

type ImageTab = 'upload' | 'gallery';

export default function BlockConfigPanel({
  block,
  templateId,
  onChange,
  onDelete,
}: BlockConfigPanelProps) {
  const t = useTranslations('catpower');
  const [uploading, setUploading] = useState(false);
  const [imageTab, setImageTab] = useState<ImageTab>('upload');
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load gallery assets when switching to gallery tab
  useEffect(() => {
    if (imageTab !== 'gallery') return;
    setLoadingAssets(true);
    fetch(`/api/email-templates/${templateId}/assets`)
      .then((r) => r.json())
      .then((data: AssetItem[]) => setAssets(Array.isArray(data) ? data : []))
      .catch(() => setAssets([]))
      .finally(() => setLoadingAssets(false));
  }, [imageTab, templateId]);

  const handleUpload = useCallback(
    async (file: File) => {
      setUploading(true);
      try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch(`/api/email-templates/${templateId}/assets`, {
          method: 'POST',
          body: formData,
        });
        if (!res.ok) throw new Error('Upload failed');
        const data = await res.json();
        // Prefer drive_url (public) over local URL
        const src = data.drive_url || data.url || data.serve_url;
        onChange({ src });
        // Append to gallery cache if it's already loaded
        setAssets((prev) => [
          ...prev,
          {
            id: data.id,
            filename: data.filename,
            url: src,
            mime_type: data.mime_type,
            size_bytes: data.size_bytes,
          },
        ]);
      } catch {
        // silently fail — user can retry
      } finally {
        setUploading(false);
      }
    },
    [templateId, onChange]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) handleUpload(file);
    },
    [handleUpload]
  );

  const insertTextFormat = (prefix: string, suffix: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = block.content || block.text || '';
    const selected = text.substring(start, end);
    const newText = text.substring(0, start) + prefix + (selected || 'text') + suffix + text.substring(end);
    onChange({ content: newText });
  };

  const AlignButton = ({
    value,
    icon: Icon,
    label,
  }: {
    value: string;
    icon: typeof AlignLeft;
    label: string;
  }) => (
    <Button
      variant="ghost"
      size="icon"
      className={`h-8 w-8 ${
        block.align === value
          ? 'bg-violet-500/20 text-violet-400'
          : 'text-zinc-400 hover:text-zinc-200'
      }`}
      onClick={() => onChange({ align: value as TemplateBlock['align'] })}
      title={label}
    >
      <Icon className="w-4 h-4" />
    </Button>
  );

  return (
    <div className="space-y-5">
      {/* Image-based blocks: Logo, Image */}
      {(block.type === 'logo' || block.type === 'image') && (
        <>
          {/* Tab switcher: Upload / Galeria */}
          <div className="flex gap-1 p-1 bg-zinc-800 rounded-lg">
            <button
              onClick={() => setImageTab('upload')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs rounded-md transition-colors ${
                imageTab === 'upload'
                  ? 'bg-zinc-700 text-zinc-100'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              {t('templates.config.uploadImage')}
            </button>
            <button
              onClick={() => setImageTab('gallery')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs rounded-md transition-colors ${
                imageTab === 'gallery'
                  ? 'bg-zinc-700 text-zinc-100'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Images className="w-3.5 h-3.5" />
              Galeria
            </button>
          </div>

          {/* Upload tab */}
          {imageTab === 'upload' && (
            <>
              {/* Upload zone */}
              <div>
                <div
                  className="border-2 border-dashed border-zinc-700 rounded-lg p-6 text-center hover:border-violet-500/50 transition-colors cursor-pointer"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDrop}
                  onClick={() => fileRef.current?.click()}
                >
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleUpload(file);
                    }}
                  />
                  {uploading ? (
                    <div className="flex items-center justify-center gap-2 text-violet-400">
                      <div className="w-4 h-4 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
                      <span className="text-sm">Uploading...</span>
                    </div>
                  ) : block.src ? (
                    <div className="space-y-2">
                      <img
                        src={block.src}
                        alt=""
                        className="max-h-24 mx-auto rounded"
                      />
                      <p className="text-xs text-zinc-500">Click to replace</p>
                    </div>
                  ) : (
                    <>
                      <Upload className="w-6 h-6 text-zinc-600 mx-auto mb-2" />
                      <p className="text-sm text-zinc-500">
                        {t('templates.config.uploadImage')}
                      </p>
                    </>
                  )}
                </div>
              </div>

              {/* URL input — paste external URL */}
              <div>
                <Label className="text-zinc-400 text-xs mb-1.5 block">
                  {t('templates.config.orPasteUrl')}
                </Label>
                <Input
                  value={block.src || ''}
                  onChange={(e) => onChange({ src: e.target.value })}
                  placeholder="https://..."
                  className="bg-zinc-800 border-zinc-700 text-zinc-200"
                />
              </div>
            </>
          )}

          {/* Gallery tab */}
          {imageTab === 'gallery' && (
            <div>
              {loadingAssets ? (
                <div className="flex items-center justify-center py-8 text-zinc-500">
                  <div className="w-4 h-4 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin mr-2" />
                  <span className="text-sm">Cargando...</span>
                </div>
              ) : assets.length === 0 ? (
                <div className="text-center py-8">
                  <Images className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                  <p className="text-sm text-zinc-500">No hay imagenes subidas aun</p>
                  <p className="text-xs text-zinc-600 mt-1">Sube imagenes desde la pestana Upload</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {assets.map((asset) => (
                    <button
                      key={asset.id}
                      onClick={() => {
                        onChange({ src: asset.url });
                        setImageTab('upload');
                      }}
                      className={`relative rounded-lg overflow-hidden border-2 transition-colors aspect-square bg-zinc-800 ${
                        block.src === asset.url
                          ? 'border-violet-500'
                          : 'border-zinc-700 hover:border-zinc-500'
                      }`}
                      title={asset.filename}
                    >
                      <img
                        src={asset.url}
                        alt={asset.filename}
                        className="w-full h-full object-cover"
                      />
                      {block.src === asset.url && (
                        <div className="absolute inset-0 bg-violet-500/20 flex items-center justify-center">
                          <div className="w-4 h-4 rounded-full bg-violet-500" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Alignment */}
          <div>
            <Label className="text-zinc-400 text-xs mb-1.5 block">
              {t('templates.config.alignment')}
            </Label>
            <div className="flex gap-1">
              <AlignButton value="left" icon={AlignLeft} label={t('templates.config.left')} />
              <AlignButton value="center" icon={AlignCenter} label={t('templates.config.center')} />
              <AlignButton value="right" icon={AlignRight} label={t('templates.config.right')} />
              {block.type === 'image' && (
                <AlignButton value="full" icon={Maximize2} label={t('templates.config.full')} />
              )}
            </div>
          </div>

          {/* Width */}
          <div>
            <Label className="text-zinc-400 text-xs mb-1.5 block">
              {t('templates.config.width')}
            </Label>
            <Input
              type="number"
              value={block.width || 200}
              onChange={(e) => onChange({ width: parseInt(e.target.value) || 200 })}
              className="bg-zinc-800 border-zinc-700 text-zinc-200 w-32"
            />
          </div>

          {/* Alt text */}
          <div>
            <Label className="text-zinc-400 text-xs mb-1.5 block">
              {t('templates.config.altText')}
            </Label>
            <Input
              value={block.alt || ''}
              onChange={(e) => onChange({ alt: e.target.value })}
              className="bg-zinc-800 border-zinc-700 text-zinc-200"
            />
          </div>
        </>
      )}

      {/* Video block */}
      {block.type === 'video' && (
        <>
          <div>
            <Label className="text-zinc-400 text-xs mb-1.5 block">
              {t('templates.config.youtubeUrl')}
            </Label>
            <Input
              value={block.url || ''}
              onChange={(e) => {
                const url = e.target.value;
                const match = url.match(
                  /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
                );
                const thumbnailUrl = match
                  ? `https://img.youtube.com/vi/${match[1]}/hqdefault.jpg`
                  : undefined;
                onChange({ url, thumbnailUrl });
              }}
              placeholder="https://youtube.com/watch?v=..."
              className="bg-zinc-800 border-zinc-700 text-zinc-200"
            />
          </div>
          {block.thumbnailUrl && (
            <div className="rounded-lg overflow-hidden border border-zinc-700">
              <img src={block.thumbnailUrl} alt="Video thumbnail" className="w-full" />
            </div>
          )}
          <p className="text-xs text-zinc-500">
            {t('templates.blocks.videoDesc')}
          </p>
        </>
      )}

      {/* Text block */}
      {block.type === 'text' && (
        <div>
          {/* Mini toolbar */}
          <div className="flex items-center gap-0.5 mb-2 p-1 bg-zinc-800 rounded-lg border border-zinc-700">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-zinc-400 hover:text-zinc-200"
              onClick={() => insertTextFormat('**', '**')}
              title="Bold"
            >
              <Bold className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-zinc-400 hover:text-zinc-200"
              onClick={() => insertTextFormat('*', '*')}
              title="Italic"
            >
              <Italic className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-zinc-400 hover:text-zinc-200"
              onClick={() => insertTextFormat('[', '](url)')}
              title="Link"
            >
              <Link className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-zinc-400 hover:text-zinc-200"
              onClick={() => {
                const text = block.content || block.text || '';
                onChange({ content: text + '\n- ' });
              }}
              title="List"
            >
              <List className="w-3.5 h-3.5" />
            </Button>
          </div>

          <Textarea
            ref={textareaRef}
            value={block.content || block.text || ''}
            onChange={(e) => onChange({ content: e.target.value })}
            placeholder={t('templates.config.textPlaceholder')}
            className="bg-zinc-800 border-zinc-700 text-zinc-200 min-h-[120px] resize-y"
          />
        </div>
      )}

      {/* Instruction block */}
      {block.type === 'instruction' && (
        <>
          <div className="flex items-start gap-2 p-3 bg-violet-500/5 rounded-lg border border-dashed border-violet-500/30">
            <Bot className="w-4 h-4 text-violet-400 mt-0.5 shrink-0" />
            <p className="text-xs text-violet-300">{t('templates.config.instructionNote')}</p>
          </div>
          <div>
            <Textarea
              value={block.content || block.text || ''}
              onChange={(e) => onChange({ content: e.target.value })}
              placeholder={t('templates.blocks.instructionDesc')}
              className="bg-zinc-800 border-zinc-700 text-zinc-200 min-h-[100px] resize-y"
            />
          </div>
        </>
      )}

      {/* Delete button — all types */}
      <div className="pt-3 border-t border-zinc-800">
        <Button
          variant="ghost"
          className="w-full text-red-400 hover:text-red-300 hover:bg-red-500/10"
          onClick={onDelete}
        >
          <Trash2 className="w-4 h-4 mr-2" />
          {t('templates.blocks.delete')}
        </Button>
      </div>
    </div>
  );
}
