'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Eye, EyeOff, Palette } from 'lucide-react';
import { generateId } from '@/lib/utils';
import { renderTemplate } from '@/lib/services/template-renderer';
import { Button } from '@/components/ui/button';
import SectionEditor from './section-editor';
import BlockConfigPanel from './block-config-panel';
import StylesPanel from './styles-panel';
import PreviewPanel from './preview-panel';
import { blockTypes } from './block-type-selector';
import type {
  TemplateBlock,
  TemplateStructure,
  TemplateRow,
  TemplateColumn,
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
  const [showPreview, setShowPreview] = useState(false);
  const [rightPanel, setRightPanel] = useState<'block' | 'styles'>('block');
  const [previewHtml, setPreviewHtml] = useState('');

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  // Debounced preview refresh (500ms)
  const triggerPreviewRefresh = useCallback((s: TemplateStructure) => {
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    previewTimerRef.current = setTimeout(() => {
      try {
        const { html } = renderTemplate(s);
        setPreviewHtml(html);
      } catch {
        // silently fail
      }
    }, 500);
  }, []);

  // Refresh preview whenever structure changes (if preview is active)
  useEffect(() => {
    if (showPreview) {
      triggerPreviewRefresh(structure);
    }
  }, [structure, showPreview, triggerPreviewRefresh]);

  // Toggle preview — render immediately on first open
  const handleTogglePreview = useCallback(() => {
    setShowPreview((prev) => {
      const next = !prev;
      if (next) {
        try {
          const { html } = renderTemplate(structureRef.current);
          setPreviewHtml(html);
        } catch {
          setPreviewHtml('');
        }
      }
      return next;
    });
  }, []);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
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

  const handleStylesChange = useCallback(
    (styles: TemplateStructure['styles']) => {
      updateStructure((s) => ({ ...s, styles }));
    },
    [updateStructure]
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
      setRightPanel('block');
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

  // Reorder rows via DnD (swap by ID)
  const handleReorderRows = useCallback(
    (sectionKey: string, fromId: string, toId: string) => {
      updateStructure((s) => {
        const sec = s.sections[sectionKey as keyof typeof s.sections];
        const rows = [...sec.rows];
        const fromIndex = rows.findIndex((r) => r.id === fromId);
        const toIndex = rows.findIndex((r) => r.id === toId);
        if (fromIndex === -1 || toIndex === -1) return s;
        const [moved] = rows.splice(fromIndex, 1);
        rows.splice(toIndex, 0, moved);
        return {
          ...s,
          sections: { ...s.sections, [sectionKey]: { rows } },
        };
      });
      // Adjust selection if needed
      if (selectedBlockPath?.section === sectionKey) {
        setSelectedBlockPath(null);
      }
    },
    [updateStructure, selectedBlockPath]
  );

  // Add a second column to an existing row
  const handleAddColumn = useCallback(
    (sectionKey: string, rowIndex: number, type: TemplateBlock['type']) => {
      updateStructure((s) => {
        const sec = s.sections[sectionKey as keyof typeof s.sections];
        const rows = [...sec.rows];
        const row = { ...rows[rowIndex] };
        if (row.columns.length >= 2) return s; // max 2 columns
        const newCol: TemplateColumn = {
          id: generateId(),
          width: '50%',
          block: createBlock(type),
        };
        // Also update first column width to 50%
        const updatedCols = [
          { ...row.columns[0], width: '50%' },
          newCol,
        ];
        rows[rowIndex] = { ...row, columns: updatedCols };
        return {
          ...s,
          sections: { ...s.sections, [sectionKey]: { rows } },
        };
      });
    },
    [updateStructure]
  );

  // Remove a column from a row (collapse to 1-col if needed)
  const handleDeleteColumn = useCallback(
    (sectionKey: string, rowIndex: number, colIndex: number) => {
      updateStructure((s) => {
        const sec = s.sections[sectionKey as keyof typeof s.sections];
        const rows = [...sec.rows];
        const row = { ...rows[rowIndex] };
        if (row.columns.length === 1) {
          // Remove the whole row if only 1 column
          return {
            ...s,
            sections: {
              ...s.sections,
              [sectionKey]: { rows: rows.filter((_, i) => i !== rowIndex) },
            },
          };
        }
        // Remove the column and restore 100% width to remaining
        const updatedCols = row.columns
          .filter((_, i) => i !== colIndex)
          .map((c) => ({ ...c, width: '100%' }));
        rows[rowIndex] = { ...row, columns: updatedCols };
        return {
          ...s,
          sections: { ...s.sections, [sectionKey]: { rows } },
        };
      });
      // Deselect if the removed column was selected
      if (
        selectedBlockPath?.section === sectionKey &&
        selectedBlockPath.rowIndex === rowIndex &&
        selectedBlockPath.colIndex === colIndex
      ) {
        setSelectedBlockPath(null);
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
    <div className="flex flex-col h-full gap-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          {saveStatus !== 'idle' && (
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
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleTogglePreview}
          className={`h-8 px-3 text-xs gap-1.5 ${
            showPreview
              ? 'bg-violet-500/20 text-violet-400 hover:bg-violet-500/30'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          {showPreview ? (
            <>
              <EyeOff className="w-3.5 h-3.5" />
              {t('templates.preview.hide')}
            </>
          ) : (
            <>
              <Eye className="w-3.5 h-3.5" />
              {t('templates.preview.show')}
            </>
          )}
        </Button>
      </div>

      {/* Main layout */}
      <div className="flex gap-6 flex-1 min-h-0">
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
              onSelectBlock={(path) => {
                setSelectedBlockPath(path);
                if (path) setRightPanel('block');
              }}
              onReorderRows={handleReorderRows}
              onAddColumn={handleAddColumn}
              onDeleteColumn={handleDeleteColumn}
            />
          ))}
        </div>

        {/* Preview panel */}
        {showPreview && (
          <div className="w-[460px] shrink-0 flex flex-col min-h-0">
            <div className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col min-h-0">
              <PreviewPanel html={previewHtml} templateId={templateId} />
            </div>
          </div>
        )}

        {/* Right panel: Block config / Styles */}
        <div className="w-80 shrink-0">
          <div className="sticky top-4 space-y-3">
            {/* Panel tabs */}
            <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-1">
              <button
                onClick={() => setRightPanel('block')}
                className={`flex-1 text-xs py-1.5 rounded-md transition-colors ${
                  rightPanel === 'block'
                    ? 'bg-zinc-800 text-zinc-100'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {t('templates.config.blockTab')}
              </button>
              <button
                onClick={() => setRightPanel('styles')}
                className={`flex-1 text-xs py-1.5 rounded-md transition-colors flex items-center justify-center gap-1 ${
                  rightPanel === 'styles'
                    ? 'bg-zinc-800 text-zinc-100'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <Palette className="w-3 h-3" />
                {t('templates.styles.tab')}
              </button>
            </div>

            {/* Block config content */}
            {rightPanel === 'block' && (
              <>
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
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                    <h3 className="text-sm font-semibold text-zinc-300 mb-3">
                      {t('templates.blocks.add')}
                    </h3>
                    <div className="space-y-1">
                      {blockTypes.map((bt) => {
                        const Icon = bt.icon;
                        return (
                          <button
                            key={bt.type}
                            className="w-full flex items-center gap-3 py-2.5 px-3 text-left rounded-md hover:bg-violet-500/10 transition-colors"
                            onClick={() => handleAddBlock('body', bt.type)}
                          >
                            <Icon className="w-4 h-4 text-violet-400 shrink-0" />
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-zinc-200">
                                {t(`templates.blocks.${bt.labelKey}` as Parameters<typeof t>[0])}
                              </div>
                              <div className="text-xs text-zinc-500">
                                {t(`templates.blocks.${bt.descKey}` as Parameters<typeof t>[0])}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Styles content */}
            {rightPanel === 'styles' && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-zinc-300 mb-4">
                  {t('templates.styles.title')}
                </h3>
                <StylesPanel
                  styles={structure.styles}
                  onChange={handleStylesChange}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
