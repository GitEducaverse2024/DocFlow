"use client";

import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  GripVertical, FileText, Table, Presentation, Image as ImageIcon,
  Code, Archive, File, Link as LinkIcon, Youtube, StickyNote,
  Pencil, Trash2, Loader2, Check, X, ExternalLink, AlertTriangle, RotateCw, Sparkles
} from 'lucide-react';
import { Source } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface SourceItemProps {
  source: Source;
  onDelete: (id: string) => void;
  onUpdate: (id: string, data: Partial<Source>) => void;
  onReextract?: (id: string) => void;
  onAiExtract?: (id: string, model: string) => Promise<{ extracted_length: number; total_tokens: number } | null>;
  availableModels?: string[];
}

export function SourceItem({ source, onDelete, onUpdate, onReextract, onAiExtract, availableModels = [] }: SourceItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(source?.name || '');
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [editNoteContent, setEditNoteContent] = useState(source.content_text || '');
  const [isReextracting, setIsReextracting] = useState(false);
  const [showAiExtract, setShowAiExtract] = useState(false);
  const [aiModel, setAiModel] = useState(availableModels[0] || '');
  const [isAiExtracting, setIsAiExtracting] = useState(false);

  const AI_SUPPORTED_EXTS = new Set(['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tiff', 'tif', 'docx', 'pptx', 'xlsx']);
  const fileExt = (source?.name || '').split('.').pop()?.toLowerCase() || '';
  const canAiExtract = source.type === 'file' && AI_SUPPORTED_EXTS.has(fileExt);
  const hasLimitedExtraction = !!(source.extraction_log) ||
    (source.type === 'file' && (!source.content_text || source.content_text.length < 100));

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: source.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 1 : 0,
  };

  const getIcon = () => {
    if (source.type === 'url') return <LinkIcon className="w-5 h-5 text-green-500" />;
    if (source.type === 'youtube') return <Youtube className="w-5 h-5 text-red-500" />;
    if (source.type === 'note') return <StickyNote className="w-5 h-5 text-purple-500" />;
    
    // File types
    const ext = (source?.name || '').split('.').pop()?.toLowerCase();
    if (['pdf', 'docx', 'doc', 'txt', 'md', 'rtf'].includes(ext || '')) return <FileText className="w-5 h-5 text-blue-500" />;
    if (['xlsx', 'xls', 'csv', 'tsv'].includes(ext || '')) return <Table className="w-5 h-5 text-emerald-500" />;
    if (['pptx', 'ppt'].includes(ext || '')) return <Presentation className="w-5 h-5 text-orange-500" />;
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext || '')) return <ImageIcon className="w-5 h-5 text-pink-500" />;
    if (['js', 'ts', 'py', 'java', 'go', 'rs', 'html', 'css', 'json', 'yaml', 'toml', 'xml', 'sql'].includes(ext || '')) return <Code className="w-5 h-5 text-yellow-500" />;
    if (['zip', 'tar', 'gz'].includes(ext || '')) return <Archive className="w-5 h-5 text-zinc-500" />;
    
    return <File className="w-5 h-5 text-blue-500" />;
  };

  const getTypeBadge = () => {
    switch (source.type) {
      case 'file': return <Badge className="bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 border-0">FILE</Badge>;
      case 'url': return <Badge className="bg-green-500/10 text-green-500 hover:bg-green-500/20 border-0">URL</Badge>;
      case 'youtube': return <Badge className="bg-red-500/10 text-red-500 hover:bg-red-500/20 border-0">YOUTUBE</Badge>;
      case 'note': return <Badge className="bg-purple-500/10 text-purple-500 hover:bg-purple-500/20 border-0">NOTE</Badge>;
    }
  };

  const getStatusBadge = () => {
    switch (source.status) {
      case 'ready': return <Badge className="bg-emerald-500/10 text-emerald-500 border-0">Ready</Badge>;
      case 'pending': return <Badge className="bg-zinc-500/10 text-zinc-500 border-0">Pending</Badge>;
      case 'extracting': return (
        <Badge className="bg-amber-500/10 text-amber-500 border-0 flex items-center gap-1">
          <Loader2 className="w-3 h-3 animate-spin" /> Extracting
        </Badge>
      );
      case 'error': return (
        <Tooltip>
          <TooltipTrigger>
            <Badge className="bg-red-500/10 text-red-500 border-0 cursor-help">Error</Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>{source.extraction_log || 'Error desconocido'}</p>
          </TooltipContent>
        </Tooltip>
      );
    }
  };

  const formatSize = (bytes: number | null) => {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const handleSaveNote = () => {
    if (editNoteContent !== source.content_text) {
      onUpdate(source.id, { content_text: editNoteContent });
    }
    setIsEditingNote(false);
  };

  const handleSaveEdit = () => {
    if (editName.trim() && editName !== (source?.name || '')) {
      onUpdate(source.id, { name: editName });
    }
    setIsEditing(false);
  };

  const handleDeleteClick = () => {
    if (isDeleting) {
      onDelete(source.id);
    } else {
      setIsDeleting(true);
      setTimeout(() => setIsDeleting(false), 3000);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex flex-col bg-zinc-900 border border-zinc-800 rounded-lg group hover:border-zinc-700 transition-colors",
        isDragging && "opacity-50 border-violet-500 shadow-lg"
      )}
    >
      <div className="flex items-center gap-3 px-3 h-12">
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-zinc-500 hover:text-zinc-300 flex-shrink-0"
      >
        <GripVertical className="w-4 h-4" />
      </div>

      <div className="flex-shrink-0">
        {getIcon()}
      </div>

      <div className="flex-1 min-w-0 flex items-center gap-2">
        {isEditing ? (
          <div className="flex items-center gap-2 flex-1">
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="h-7 bg-zinc-950 border-zinc-700 text-zinc-50 text-sm"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveEdit();
                if (e.key === 'Escape') {
                  setEditName(source?.name || '');
                  setIsEditing(false);
                }
              }}
            />
            <Button size="icon" variant="ghost" className="h-7 w-7 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10" onClick={handleSaveEdit}>
              <Check className="w-3.5 h-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7 text-zinc-400 hover:text-zinc-300" onClick={() => {
              setEditName(source?.name || '');
              setIsEditing(false);
            }}>
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        ) : (
          <>
            <Tooltip>
              <TooltipTrigger>
                {source.type === 'url' ? (
                  <a href={source.url || '#'} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-blue-400 hover:text-blue-300 truncate flex items-center gap-1 max-w-[200px] sm:max-w-[300px]">
                    {(source?.name || 'Sin nombre').split('/').pop()}
                    <ExternalLink className="w-3 h-3 flex-shrink-0" />
                  </a>
                ) : source.type === 'youtube' ? (
                  <a href={source.url || `https://youtube.com/watch?v=${source.youtube_id}`} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-red-400 hover:text-red-300 truncate flex items-center gap-1 max-w-[200px] sm:max-w-[300px]">
                    {(source?.name || 'Sin nombre').split('/').pop()}
                    <ExternalLink className="w-3 h-3 flex-shrink-0" />
                  </a>
                ) : (
                  <span className="text-sm font-medium text-zinc-50 truncate cursor-default max-w-[200px] sm:max-w-[300px] block">
                    {(source?.name || 'Sin nombre').split('/').pop()}
                  </span>
                )}
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-md">
                <p className="break-all">{source?.name || 'Sin nombre'}</p>
              </TooltipContent>
            </Tooltip>
            {getTypeBadge()}
            {source.file_size && (
              <span className="text-xs text-zinc-500 whitespace-nowrap hidden sm:inline">
                {formatSize(source.file_size)}
              </span>
            )}
          </>
        )}
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {getStatusBadge()}
        {source.type === 'file' && source.extraction_log && (
          <Tooltip>
            <TooltipTrigger>
              <Badge className="bg-amber-500/10 text-amber-500 border-0 cursor-help flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                <span className="hidden sm:inline">Extracción limitada</span>
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs">
              <p>{source.extraction_log}</p>
            </TooltipContent>
          </Tooltip>
        )}
        {source.type === 'file' && (source.name || '').toLowerCase().endsWith('.pdf') && (source.file_size ?? 0) > 100000 && (source.content_text_length ?? 0) < 500 && (
          <Tooltip>
            <TooltipTrigger>
              <Badge className="bg-amber-500/10 text-amber-500 border-0 cursor-help flex items-center gap-1">
                <ImageIcon className="w-3 h-3" />
                <span className="hidden sm:inline">Mayormente imágenes</span>
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs">
              <p>Este PDF pesa {formatSize(source.file_size)} pero solo se extrajeron {source.content_text_length ?? 0} caracteres de texto. Probablemente contiene mayormente imágenes o texto escaneado.</p>
            </TooltipContent>
          </Tooltip>
        )}
        {source.type === 'file' && (!source.content_text || source.content_text.length < 100) && onReextract && (
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 text-amber-500 hover:text-amber-400 hover:bg-amber-500/10"
            onClick={() => {
              setIsReextracting(true);
              onReextract(source.id);
              setTimeout(() => setIsReextracting(false), 3000);
            }}
            disabled={isReextracting}
            title="Re-extraer contenido"
          >
            <RotateCw className={cn("w-3 h-3", isReextracting && "animate-spin")} />
          </Button>
        )}
        {canAiExtract && hasLimitedExtraction && onAiExtract && availableModels.length > 0 && (
          <Tooltip>
            <TooltipTrigger>
              <Button
                size="icon"
                variant="ghost"
                className={cn(
                  "h-6 w-6",
                  isAiExtracting
                    ? "text-violet-400 animate-pulse"
                    : "text-violet-500 hover:text-violet-400 hover:bg-violet-500/10"
                )}
                onClick={() => setShowAiExtract(!showAiExtract)}
                disabled={isAiExtracting}
              >
                {isAiExtracting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Extraer con IA</p>
            </TooltipContent>
          </Tooltip>
        )}

        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {!isEditing && !isEditingNote && (
            <>
              {source.type === 'note' && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-zinc-400 hover:text-zinc-50 hover:bg-zinc-800"
                  onClick={() => setIsEditingNote(true)}
                  title="Editar contenido"
                >
                  <FileText className="w-3.5 h-3.5" />
                </Button>
              )}
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-zinc-400 hover:text-zinc-50 hover:bg-zinc-800"
                onClick={() => setIsEditing(true)}
                title="Renombrar"
              >
                <Pencil className="w-3.5 h-3.5" />
              </Button>
            </>
          )}
          <Button
            size="icon"
            variant="ghost"
            className={cn(
              "h-7 w-7 transition-colors",
              isDeleting
                ? "text-white bg-red-600 hover:bg-red-700"
                : "text-zinc-400 hover:text-red-500 hover:bg-red-500/10"
            )}
            onClick={handleDeleteClick}
            title={isDeleting ? "Click para confirmar" : "Eliminar"}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
      
      {showAiExtract && !isAiExtracting && (
        <div className="px-3 pb-3 pt-1 border-t border-zinc-800/50 mt-1">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-3.5 h-3.5 text-violet-400" />
            <span className="text-xs font-medium text-violet-400">Extraer con IA</span>
          </div>
          <p className="text-[11px] text-zinc-500 mb-2">
            Enviar el archivo ({formatSize(source.file_size)}) a un modelo de IA para extraer su contenido.
            Esto consume tokens del modelo seleccionado.
          </p>
          <div className="flex items-center gap-2">
            <Select value={aiModel} onValueChange={(v) => setAiModel(v || '')}>
              <SelectTrigger className="h-7 text-xs bg-zinc-950 border-zinc-700 text-zinc-300 flex-1">
                <SelectValue placeholder="Modelo..." />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-700 text-zinc-50">
                {availableModels.map(m => (
                  <SelectItem key={m} value={m} className="text-xs">{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              className="h-7 text-xs bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white"
              onClick={async () => {
                if (!aiModel) return;
                setIsAiExtracting(true);
                setShowAiExtract(false);
                const result = await onAiExtract!(source.id, aiModel);
                setIsAiExtracting(false);
                if (result) {
                  setShowAiExtract(false);
                }
              }}
              disabled={!aiModel}
            >
              Extraer
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-zinc-400"
              onClick={() => setShowAiExtract(false)}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {isEditingNote && (
        <div className="p-3 pt-0 border-t border-zinc-800/50 mt-2">
          <Textarea
            value={editNoteContent}
            onChange={(e) => setEditNoteContent(e.target.value)}
            className="min-h-[100px] bg-zinc-950 border-zinc-800 text-zinc-50 mb-2 text-sm"
            placeholder="Contenido de la nota..."
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => {
              setEditNoteContent(source.content_text || '');
              setIsEditingNote(false);
            }}>
              Cancelar
            </Button>
            <Button size="sm" className="bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white" onClick={handleSaveNote}>
              Guardar nota
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
