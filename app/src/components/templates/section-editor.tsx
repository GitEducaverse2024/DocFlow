'use client';

import { ChevronUp, ChevronDown, Trash2, Plus, LayoutTemplate, FileText, Copyright } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import BlockTypeSelector from './block-type-selector';
import BlockRenderer from './block-renderer';
import type { TemplateSection, TemplateBlock } from '@/lib/types';

const sectionConfig: Record<string, { icon: typeof LayoutTemplate; bgClass: string }> = {
  header: { icon: LayoutTemplate, bgClass: 'bg-violet-500/10 border-violet-500/20' },
  body: { icon: FileText, bgClass: 'bg-zinc-900 border-zinc-800' },
  footer: { icon: Copyright, bgClass: 'bg-zinc-800/50 border-zinc-700' },
};

interface SectionEditorProps {
  sectionKey: 'header' | 'body' | 'footer';
  section: TemplateSection;
  selectedBlockPath: { section: string; rowIndex: number; colIndex: number } | null;
  onAddBlock: (sectionKey: string, type: TemplateBlock['type']) => void;
  onMoveBlock: (sectionKey: string, rowIndex: number, direction: 'up' | 'down') => void;
  onDeleteBlock: (sectionKey: string, rowIndex: number) => void;
  onSelectBlock: (path: { section: string; rowIndex: number; colIndex: number } | null) => void;
}

export default function SectionEditor({
  sectionKey,
  section,
  selectedBlockPath,
  onAddBlock,
  onMoveBlock,
  onDeleteBlock,
  onSelectBlock,
}: SectionEditorProps) {
  const t = useTranslations('catpower');
  const config = sectionConfig[sectionKey] || sectionConfig.body;
  const Icon = config.icon;

  return (
    <div className={`rounded-xl border p-4 ${config.bgClass}`}>
      {/* Section title */}
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-zinc-400" />
        <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">
          {t(`templates.sections.${sectionKey}` as Parameters<typeof t>[0])}
        </h3>
        <span className="text-xs text-zinc-600">({section.rows.length})</span>
      </div>

      {/* Blocks */}
      <div className="space-y-2">
        {section.rows.map((row, rowIndex) => {
          const block = row.columns[0]?.block;
          if (!block) return null;

          const isSelected =
            selectedBlockPath?.section === sectionKey &&
            selectedBlockPath?.rowIndex === rowIndex;

          return (
            <div key={row.id} className="group relative">
              <BlockRenderer
                block={block}
                isSelected={isSelected}
                onClick={() =>
                  onSelectBlock(
                    isSelected ? null : { section: sectionKey, rowIndex, colIndex: 0 }
                  )
                }
              />

              {/* Overlay controls */}
              <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 bg-zinc-800/90 hover:bg-zinc-700"
                  onClick={(e) => {
                    e.stopPropagation();
                    onMoveBlock(sectionKey, rowIndex, 'up');
                  }}
                  disabled={rowIndex === 0}
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 bg-zinc-800/90 hover:bg-zinc-700"
                  onClick={(e) => {
                    e.stopPropagation();
                    onMoveBlock(sectionKey, rowIndex, 'down');
                  }}
                  disabled={rowIndex === section.rows.length - 1}
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 bg-zinc-800/90 hover:bg-red-900/80 hover:text-red-400"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteBlock(sectionKey, rowIndex);
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add block button */}
      <BlockTypeSelector onSelect={(type) => onAddBlock(sectionKey, type)}>
        <Button
          variant="ghost"
          className="w-full mt-3 border border-dashed border-zinc-700 text-zinc-500 hover:border-violet-500/50 hover:text-violet-400 hover:bg-violet-500/5"
        >
          <Plus className="w-4 h-4 mr-2" />
          {t('templates.blocks.add')}
        </Button>
      </BlockTypeSelector>
    </div>
  );
}
