'use client';

import {
  GripVertical,
  Trash2,
  Plus,
  LayoutTemplate,
  FileText,
  Copyright,
  PanelLeft,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import BlockTypeSelector from './block-type-selector';
import BlockRenderer from './block-renderer';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useState } from 'react';
import type { TemplateSection, TemplateBlock, TemplateRow } from '@/lib/types';

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
  onReorderRows: (sectionKey: string, fromId: string, toId: string) => void;
  onAddColumn: (sectionKey: string, rowIndex: number, type: TemplateBlock['type']) => void;
  onDeleteColumn: (sectionKey: string, rowIndex: number, colIndex: number) => void;
}

// ─────────────────────────────────────────────────────────────
// Sortable row wrapper
// ─────────────────────────────────────────────────────────────
interface SortableRowProps {
  row: TemplateRow;
  rowIndex: number;
  sectionKey: string;
  selectedBlockPath: SectionEditorProps['selectedBlockPath'];
  isDraggingThis: boolean;
  onSelectBlock: SectionEditorProps['onSelectBlock'];
  onDeleteBlock: SectionEditorProps['onDeleteBlock'];
  onAddColumn: SectionEditorProps['onAddColumn'];
  onDeleteColumn: SectionEditorProps['onDeleteColumn'];
}

function SortableRow({
  row,
  rowIndex,
  sectionKey,
  selectedBlockPath,
  isDraggingThis,
  onSelectBlock,
  onDeleteBlock,
  onAddColumn,
  onDeleteColumn,
}: SortableRowProps) {
  const t = useTranslations('catpower');
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: row.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isTwoCol = row.columns.length >= 2;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative rounded-lg transition-all ${
        isDragging
          ? 'opacity-30 ring-2 ring-violet-500/50 bg-violet-500/5'
          : isDraggingThis
          ? 'opacity-30'
          : ''
      }`}
    >
      {/* Drop indicator line — shown while DnD active, before row */}
      <div className="h-0.5 w-full bg-transparent group-data-[over=true]:bg-blue-400 rounded-full transition-colors" />

      {/* Row content */}
      <div
        className={`flex gap-2 ${
          isTwoCol ? 'flex-row' : 'flex-col'
        }`}
      >
        {/* Drag handle — left side */}
        <div
          className={`flex items-center justify-center shrink-0 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity ${
            isTwoCol ? 'self-stretch' : 'absolute left-0 top-1/2 -translate-y-1/2 -translate-x-6'
          }`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="w-4 h-4 text-zinc-500" />
        </div>

        {/* Columns */}
        <div className={`flex-1 flex gap-2 min-w-0 ${isTwoCol ? 'flex-row' : 'flex-col'}`}>
          {row.columns.map((col, colIndex) => {
            const isSelected =
              selectedBlockPath?.section === sectionKey &&
              selectedBlockPath?.rowIndex === rowIndex &&
              selectedBlockPath?.colIndex === colIndex;

            return (
              <div
                key={col.id}
                className={`relative group/col min-w-0 ${isTwoCol ? 'flex-1' : 'w-full'}`}
              >
                <BlockRenderer
                  block={col.block}
                  isSelected={isSelected}
                  onClick={() =>
                    onSelectBlock(
                      isSelected ? null : { section: sectionKey, rowIndex, colIndex }
                    )
                  }
                />

                {/* Delete column button (only visible in 2-col row) */}
                {isTwoCol && (
                  <button
                    className="absolute top-1 left-1 z-10 flex items-center justify-center w-5 h-5 rounded bg-zinc-800/90 hover:bg-red-900/80 text-zinc-400 hover:text-red-400 opacity-0 group-hover/col:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteColumn(sectionKey, rowIndex, colIndex);
                    }}
                    title={t('templates.rows.removeColumn')}
                  >
                    <span className="text-xs leading-none">×</span>
                  </button>
                )}
              </div>
            );
          })}

          {/* "Añadir al lado" — only on single-column rows */}
          {!isTwoCol && (
            <BlockTypeSelector
              onSelect={(type) => onAddColumn(sectionKey, rowIndex, type)}
            >
              <button
                className="self-stretch min-h-[40px] border border-dashed border-zinc-700 rounded-lg flex items-center justify-center gap-1.5 text-xs text-zinc-500 hover:border-violet-500/50 hover:text-violet-400 hover:bg-violet-500/5 transition-colors px-3 py-2 sm:w-12 sm:min-h-0 sm:flex-col opacity-0 group-hover:opacity-100"
                title={t('templates.rows.addColumn')}
              >
                <PanelLeft className="w-3.5 h-3.5" />
                <span className="hidden sm:inline text-[10px]">{t('templates.rows.addColumn')}</span>
              </button>
            </BlockTypeSelector>
          )}
        </div>

        {/* Row-level controls: delete row */}
        <div className="flex flex-col gap-0.5 shrink-0 justify-start pt-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 bg-zinc-800/90 hover:bg-red-900/80 hover:text-red-400"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteBlock(sectionKey, rowIndex);
            }}
            title={t('templates.rows.deleteRow')}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Ghost row shown in DragOverlay
// ─────────────────────────────────────────────────────────────
function RowOverlay({ row }: { row: TemplateRow }) {
  const isTwoCol = row.columns.length >= 2;
  return (
    <div className="rounded-lg ring-2 ring-violet-500 bg-zinc-900/80 shadow-2xl shadow-violet-900/30 p-2 opacity-90">
      <div className={`flex gap-2 ${isTwoCol ? 'flex-row' : 'flex-col'}`}>
        {row.columns.map((col) => (
          <div key={col.id} className={isTwoCol ? 'flex-1 min-w-0' : 'w-full'}>
            <BlockRenderer block={col.block} isSelected={false} onClick={() => {}} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main section editor
// ─────────────────────────────────────────────────────────────
export default function SectionEditor(props: SectionEditorProps) {
  const {
    sectionKey,
    section,
    selectedBlockPath,
    onAddBlock,
    onDeleteBlock,
    onSelectBlock,
    onReorderRows,
    onAddColumn,
    onDeleteColumn,
  } = props;
  const t = useTranslations('catpower');
  const config = sectionConfig[sectionKey] || sectionConfig.body;
  const Icon = config.icon;

  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const rowIds = section.rows.map((r) => r.id);
  const activeRow = activeId ? section.rows.find((r) => r.id === activeId) : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over || active.id === over.id) return;
    onReorderRows(sectionKey, active.id as string, over.id as string);
  }

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

      {/* Sortable rows */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={rowIds} strategy={verticalListSortingStrategy}>
          <div className="space-y-2 pl-5">
            {section.rows.map((row, rowIndex) => (
              <SortableRow
                key={row.id}
                row={row}
                rowIndex={rowIndex}
                sectionKey={sectionKey}
                selectedBlockPath={selectedBlockPath}
                isDraggingThis={activeId === row.id}
                onSelectBlock={onSelectBlock}
                onDeleteBlock={onDeleteBlock}
                onAddColumn={onAddColumn}
                onDeleteColumn={onDeleteColumn}
              />
            ))}
          </div>
        </SortableContext>

        <DragOverlay dropAnimation={{ duration: 200, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)' }}>
          {activeRow ? <RowOverlay row={activeRow} /> : null}
        </DragOverlay>
      </DndContext>

      {/* Add new row (adds first column) */}
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
