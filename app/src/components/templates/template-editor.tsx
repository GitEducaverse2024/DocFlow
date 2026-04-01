'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { generateId } from '@/lib/utils';
import SectionEditor from './section-editor';
import BlockConfigPanel from './block-config-panel';
import type {
  TemplateBlock,
  TemplateStructure,
  TemplateRow,
} from '@/lib/types';

interface TemplateEditorProps {
  templateId: string;
  initialStructure: TemplateStructure;
  onSave: (structure: TemplateStructure) => Promise<void>;
}

const defaultStructure: TemplateStructure = {
  sections: {
    header: { rows: [] },
    body: { rows: [] },
    footer: { rows: [] },
  },
  styles: {
    backgroundColor: '#ffffff',
    fontFamily: 'Arial, sans-serif',
    primaryColor: '#7C3AED',
    textColor: '#333333',
    maxWidth: 600,
  },
};

function createBlock(type: TemplateBlock['type']): TemplateBlock {
  const base: TemplateBlock = { type };
  switch (type) {
    case 'logo':
      return { ...base, align: 'left', width: 200, alt: '' };
    case 'image':
      return { ...base, align: 'center', alt: '' };
    case 'video':
      return { ...base, url: '' };
    case 'text':
      return { ...base, content: '' };
    case 'instruction':
      return { ...base, content: '' };
    default:
      return base;
  }
}

function createRow(type: TemplateBlock['type']): TemplateRow {
  return {
    id: generateId(),
    columns: [{ id: generateId(), width: '100%', block: createBlock(type) }],
  };
}

export default function TemplateEditor({
  templateId,
  initialStructure,
  onSave,
}: TemplateEditorProps) {
  const t = useTranslations('catpower');
  const [structure, setStructure] = useState<TemplateStructure>(() => {
    // Merge with defaults to ensure all fields exist
    return {
      sections: {
        header: initialStructure?.sections?.header || defaultStructure.sections.header,
        body: initialStructure?.sections?.body || defaultStructure.sections.body,
        footer: initialStructure?.sections?.footer || defaultStructure.sections.footer,
      },
      styles: { ...defaultStructure.styles, ...(initialStructure?.styles || {}) },
    };
  });

  const [selectedBlockPath, setSelectedBlockPath] = useState<{
    section: string;
    rowIndex: number;
    colIndex: number;
  } | null>(null);

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const structureRef = useRef(structure);
  structureRef.current = structure;

  // Auto-save with 3s debounce
  const triggerAutoSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSaveStatus('saving');
      try {
        await onSave(structureRef.current);
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } catch {
        setSaveStatus('idle');
      }
    }, 3000);
  }, [onSave]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const updateStructure = useCallback(
    (updater: (s: TemplateStructure) => TemplateStructure) => {
      setStructure((prev) => {
        const next = updater(prev);
        return next;
      });
      triggerAutoSave();
    },
    [triggerAutoSave]
  );

  // Add block
  const handleAddBlock = useCallback(
    (sectionKey: string, type: TemplateBlock['type']) => {
      const newRow = createRow(type);
      updateStructure((s) => ({
        ...s,
        sections: {
          ...s.sections,
          [sectionKey]: {
            rows: [...s.sections[sectionKey as keyof typeof s.sections].rows, newRow],
          },
        },
      }));
      // Select the new block
      const section = structureRef.current.sections[sectionKey as keyof TemplateStructure['sections']];
      setSelectedBlockPath({
        section: sectionKey,
        rowIndex: section.rows.length, // new block is at end
        colIndex: 0,
      });
    },
    [updateStructure]
  );

  // Move block up/down
  const handleMoveBlock = useCallback(
    (sectionKey: string, rowIndex: number, direction: 'up' | 'down') => {
      updateStructure((s) => {
        const sec = s.sections[sectionKey as keyof typeof s.sections];
        const rows = [...sec.rows];
        const targetIndex = direction === 'up' ? rowIndex - 1 : rowIndex + 1;
        if (targetIndex < 0 || targetIndex >= rows.length) return s;
        [rows[rowIndex], rows[targetIndex]] = [rows[targetIndex], rows[rowIndex]];
        return {
          ...s,
          sections: { ...s.sections, [sectionKey]: { rows } },
        };
      });
      // Update selection if the moved block was selected
      if (
        selectedBlockPath?.section === sectionKey &&
        selectedBlockPath.rowIndex === rowIndex
      ) {
        const newIndex = direction === 'up' ? rowIndex - 1 : rowIndex + 1;
        setSelectedBlockPath({ ...selectedBlockPath, rowIndex: newIndex });
      }
    },
    [updateStructure, selectedBlockPath]
  );

  // Delete block
  const handleDeleteBlock = useCallback(
    (sectionKey: string, rowIndex: number) => {
      updateStructure((s) => {
        const sec = s.sections[sectionKey as keyof typeof s.sections];
        const rows = sec.rows.filter((_, i) => i !== rowIndex);
        return {
          ...s,
          sections: { ...s.sections, [sectionKey]: { rows } },
        };
      });
      if (
        selectedBlockPath?.section === sectionKey &&
        selectedBlockPath.rowIndex === rowIndex
      ) {
        setSelectedBlockPath(null);
      }
    },
    [updateStructure, selectedBlockPath]
  );

  // Update block config
  const handleBlockChange = useCallback(
    (updates: Partial<TemplateBlock>) => {
      if (!selectedBlockPath) return;
      updateStructure((s) => {
        const sec = s.sections[selectedBlockPath.section as keyof typeof s.sections];
        const rows = [...sec.rows];
        const row = { ...rows[selectedBlockPath.rowIndex] };
        const cols = [...row.columns];
        const col = { ...cols[selectedBlockPath.colIndex] };
        col.block = { ...col.block, ...updates };
        cols[selectedBlockPath.colIndex] = col;
        row.columns = cols;
        rows[selectedBlockPath.rowIndex] = row;
        return {
          ...s,
          sections: { ...s.sections, [selectedBlockPath.section]: { rows } },
        };
      });
    },
    [updateStructure, selectedBlockPath]
  );

  // Get selected block
  const selectedBlock = selectedBlockPath
    ? structure.sections[selectedBlockPath.section as keyof TemplateStructure['sections']]?.rows[
        selectedBlockPath.rowIndex
      ]?.columns[selectedBlockPath.colIndex]?.block
    : null;

  return (
    <div className="flex gap-6 h-full">
      {/* Left panel: Editor */}
      <div className="flex-1 min-w-0 space-y-4 overflow-y-auto">
        {(['header', 'body', 'footer'] as const).map((sectionKey) => (
          <SectionEditor
            key={sectionKey}
            sectionKey={sectionKey}
            section={structure.sections[sectionKey]}
            selectedBlockPath={selectedBlockPath}
            onAddBlock={handleAddBlock}
            onMoveBlock={handleMoveBlock}
            onDeleteBlock={handleDeleteBlock}
            onSelectBlock={setSelectedBlockPath}
          />
        ))}
      </div>

      {/* Right panel: Config */}
      <div className="w-80 shrink-0">
        <div className="sticky top-4">
          {/* Save status */}
          {saveStatus !== 'idle' && (
            <div className="mb-3 text-center">
              <span
                className={`text-xs px-2 py-1 rounded-full ${
                  saveStatus === 'saving'
                    ? 'bg-amber-500/20 text-amber-400'
                    : 'bg-green-500/20 text-green-400'
                }`}
              >
                {saveStatus === 'saving'
                  ? t('templates.saving')
                  : t('templates.saved')}
              </span>
            </div>
          )}

          {selectedBlock ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-zinc-300 mb-4">
                {t(
                  `templates.blocks.${selectedBlock.type}` as Parameters<typeof t>[0]
                )}
              </h3>
              <BlockConfigPanel
                block={selectedBlock}
                templateId={templateId}
                onChange={handleBlockChange}
                onDelete={() => {
                  if (selectedBlockPath) {
                    handleDeleteBlock(
                      selectedBlockPath.section,
                      selectedBlockPath.rowIndex
                    );
                  }
                }}
              />
            </div>
          ) : (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center">
              <p className="text-sm text-zinc-500">
                {t('templates.blocks.add')}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
