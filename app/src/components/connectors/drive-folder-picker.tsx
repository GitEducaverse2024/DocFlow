'use client';

import { useState, useCallback } from 'react';
import { Folder, ChevronRight, ChevronDown, Loader2, AlertCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import type { DriveFile } from '@/lib/types';

/* ─── Types ─── */

export interface WizardCredentials {
  client_id: string;
  client_secret_encrypted: string;
  refresh_token_encrypted: string;
}

interface DriveFolderPickerProps {
  connectorId?: string;
  credentials?: WizardCredentials;
  value?: string;
  valueName?: string;
  onChange: (folderId: string, folderName: string) => void;
  disabled?: boolean;
}

interface FolderNode {
  file: DriveFile;
  children: FolderNode[] | null; // null = not loaded
  loading: boolean;
  expanded: boolean;
}

interface BreadcrumbItem {
  id: string;
  name: string;
}

/* ─── Component ─── */

export function DriveFolderPicker({
  connectorId,
  credentials,
  value,
  valueName,
  onChange,
  disabled = false,
}: DriveFolderPickerProps) {
  const t = useTranslations('connectors');

  const [open, setOpen] = useState(false);
  const [rootNodes, setRootNodes] = useState<FolderNode[] | null>(null);
  const [rootLoading, setRootLoading] = useState(false);
  const [rootError, setRootError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(value ?? null);
  const [selectedName, setSelectedName] = useState<string | null>(valueName ?? null);
  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbItem[]>([
    { id: 'root', name: t('drive.folderPicker.myDrive') },
  ]);

  /* ─── Fetch folders from browse API ─── */

  const fetchFolders = useCallback(
    async (parentId: string): Promise<DriveFile[]> => {
      if (credentials) {
        // Wizard mode: POST with credentials (no connector exists yet)
        const res = await fetch('/api/connectors/google-drive/browse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...credentials, parent_id: parentId }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return data.folders ?? [];
      }
      // Normal mode: GET with connectorId
      const res = await fetch(
        `/api/connectors/google-drive/${connectorId}/browse?parent_id=${encodeURIComponent(parentId)}`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return data.folders ?? [];
    },
    [connectorId, credentials]
  );

  /* ─── Load root folders on first open ─── */

  const handleOpen = useCallback(async () => {
    if (disabled) return;
    setOpen(true);

    if (rootNodes !== null) return; // already loaded

    setRootLoading(true);
    setRootError(null);
    try {
      const folders = await fetchFolders('root');
      setRootNodes(
        folders.map((f) => ({
          file: f,
          children: null,
          loading: false,
          expanded: false,
        }))
      );
    } catch (err) {
      setRootError(err instanceof Error ? err.message : String(err));
    } finally {
      setRootLoading(false);
    }
  }, [disabled, rootNodes, fetchFolders]);

  /* ─── Expand / collapse a folder node ─── */

  const toggleExpand = useCallback(
    async (nodeId: string, nodes: FolderNode[], setNodes: (ns: FolderNode[]) => void) => {
      const idx = nodes.findIndex((n) => n.file.id === nodeId);
      if (idx === -1) return;

      const node = nodes[idx];

      // Collapse
      if (node.expanded) {
        const updated = [...nodes];
        updated[idx] = { ...node, expanded: false };
        setNodes(updated);
        return;
      }

      // Expand — load children if needed
      if (node.children === null) {
        const updated = [...nodes];
        updated[idx] = { ...node, loading: true };
        setNodes(updated);

        try {
          const folders = await fetchFolders(nodeId);
          const children = folders.map((f) => ({
            file: f,
            children: null as FolderNode[] | null,
            loading: false,
            expanded: false,
          }));
          const final = [...nodes];
          final[idx] = { ...node, children, loading: false, expanded: true };
          setNodes(final);
        } catch {
          const final = [...nodes];
          final[idx] = { ...node, children: [], loading: false, expanded: true };
          setNodes(final);
        }
      } else {
        const updated = [...nodes];
        updated[idx] = { ...node, expanded: true };
        setNodes(updated);
      }
    },
    [fetchFolders]
  );

  /* ─── Retry loading root ─── */

  const handleRetry = useCallback(() => {
    setRootNodes(null);
    setRootError(null);
    handleOpen();
  }, [handleOpen]);

  /* ─── Confirm selection ─── */

  const handleSelect = useCallback(() => {
    if (selectedId && selectedName) {
      onChange(selectedId, selectedName);
      setOpen(false);
    }
  }, [selectedId, selectedName, onChange]);

  /* ─── Breadcrumb navigation ─── */

  const handleBreadcrumbClick = useCallback(
    (idx: number) => {
      setBreadcrumb((prev) => prev.slice(0, idx + 1));
      // Reset to root view if clicking "Mi Drive"
      if (idx === 0) {
        setRootNodes(null);
        handleOpen();
      }
    },
    [handleOpen]
  );

  /* ─── Render folder row ─── */

  const renderNode = (
    node: FolderNode,
    level: number,
    parentNodes: FolderNode[],
    setParentNodes: (ns: FolderNode[]) => void
  ) => {
    const isSelected = selectedId === node.file.id;
    const paddingLeft = level * 16 + 8;

    return (
      <div key={node.file.id}>
        <div
          className={`flex items-center gap-2 py-1.5 px-2 rounded cursor-pointer transition-colors ${
            isSelected
              ? 'bg-sky-500/10 border border-sky-500/30'
              : 'hover:bg-zinc-800/50 border border-transparent'
          }`}
          style={{ paddingLeft }}
          onClick={() => {
            setSelectedId(node.file.id);
            setSelectedName(node.file.name);
          }}
        >
          {/* Expand/collapse arrow */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleExpand(node.file.id, parentNodes, setParentNodes);
            }}
            className="p-0.5 hover:bg-zinc-700/50 rounded shrink-0"
          >
            {node.loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-500" />
            ) : node.expanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />
            )}
          </button>

          <Folder className="w-4 h-4 text-sky-400/70 shrink-0" />
          <span className="text-sm text-zinc-200 truncate">{node.file.name}</span>
        </div>

        {/* Render children */}
        {node.expanded && node.children && node.children.length > 0 && (
          <div>
            {node.children.map((child) =>
              renderNode(child, level + 1, node.children!, (newChildren) => {
                const updated = [...parentNodes];
                const idx = updated.findIndex((n) => n.file.id === node.file.id);
                if (idx !== -1) {
                  updated[idx] = { ...updated[idx], children: newChildren };
                  setParentNodes(updated);
                }
              })
            )}
          </div>
        )}
      </div>
    );
  };

  /* ─── Closed state: button ─── */

  if (!open) {
    return (
      <button
        type="button"
        onClick={handleOpen}
        disabled={disabled}
        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors text-left ${
          disabled
            ? 'border-zinc-800 bg-zinc-900/30 text-zinc-600 cursor-not-allowed'
            : 'border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800/50 text-zinc-300 cursor-pointer'
        }`}
      >
        <Folder className="w-4 h-4 text-sky-400/70 shrink-0" />
        <span className="text-sm truncate">
          {valueName || t('drive.folderPicker.selectFolder')}
        </span>
      </button>
    );
  }

  /* ─── Open state: inline tree panel ─── */

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg overflow-hidden">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-zinc-800/50 overflow-x-auto">
        {breadcrumb.map((item, idx) => (
          <div key={item.id} className="flex items-center gap-1 shrink-0">
            {idx > 0 && <ChevronRight className="w-3 h-3 text-zinc-600" />}
            <button
              onClick={() => handleBreadcrumbClick(idx)}
              className={`text-xs px-1 py-0.5 rounded hover:bg-zinc-800/50 transition-colors ${
                idx === breadcrumb.length - 1 ? 'text-sky-400' : 'text-zinc-400'
              }`}
            >
              {item.name}
            </button>
          </div>
        ))}
      </div>

      {/* Tree content */}
      <div className="max-h-60 overflow-y-auto p-2">
        {rootLoading && (
          <div className="flex items-center justify-center gap-2 py-8">
            <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />
            <span className="text-xs text-zinc-500">{t('drive.folderPicker.loading')}</span>
          </div>
        )}

        {rootError && (
          <div className="flex flex-col items-center gap-2 py-8">
            <AlertCircle className="w-5 h-5 text-red-400" />
            <p className="text-xs text-red-400">{t('drive.folderPicker.error')}</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRetry}
              className="text-xs text-zinc-400 hover:text-zinc-200"
            >
              {t('drive.folderPicker.retry')}
            </Button>
          </div>
        )}

        {!rootLoading && !rootError && rootNodes && rootNodes.length === 0 && (
          <div className="flex items-center justify-center py-8">
            <p className="text-xs text-zinc-500">{t('drive.folderPicker.noFolders')}</p>
          </div>
        )}

        {!rootLoading &&
          !rootError &&
          rootNodes &&
          rootNodes.length > 0 &&
          rootNodes.map((node) =>
            renderNode(node, 0, rootNodes, (updated) => setRootNodes(updated))
          )}
      </div>

      {/* Footer: select + cancel */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-zinc-800/50">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setOpen(false)}
          className="text-xs text-zinc-400 hover:text-zinc-200"
        >
          {t('drive.nav.cancel')}
        </Button>
        <Button
          size="sm"
          onClick={handleSelect}
          disabled={!selectedId}
          className="text-xs bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-40"
        >
          {t('drive.folderPicker.select')}
        </Button>
      </div>
    </div>
  );
}
