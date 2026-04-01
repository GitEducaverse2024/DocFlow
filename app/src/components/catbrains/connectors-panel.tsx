'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Plug, Plus, Pencil, Trash2, Play, Loader2, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { toast } from 'sonner';
import type { CatBrainConnector } from '@/lib/types';

/* ── Type Configuration (adapted from connectors page) ── */

interface TypeField {
  key: string;
  label?: string;
  labelKey?: string;
  type: 'text' | 'textarea' | 'number' | 'select';
  required?: boolean;
  placeholder?: string;
  options?: string[];
  default?: string | number;
}

interface TypeInfo {
  color: string;
  fields: TypeField[];
}

const TYPE_CONFIG: Record<CatBrainConnector['type'], TypeInfo> = {
  n8n_webhook: {
    color: 'orange',
    fields: [
      { key: 'url', label: 'Webhook URL', type: 'text', required: true, placeholder: 'https://n8n.example.com/webhook/...' },
      { key: 'method', labelKey: 'method', type: 'select', options: ['POST', 'GET', 'PUT'], default: 'POST' },
      { key: 'headers', label: 'Headers (JSON)', type: 'textarea', placeholder: '{"Authorization": "Bearer ..."}' },
      { key: 'timeout', labelKey: 'timeout', type: 'number', default: 30 },
    ],
  },
  http_api: {
    color: 'blue',
    fields: [
      { key: 'url', label: 'URL', type: 'text', required: true, placeholder: 'https://api.example.com/...' },
      { key: 'method', labelKey: 'method', type: 'select', options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], default: 'GET' },
      { key: 'headers', label: 'Headers (JSON)', type: 'textarea', placeholder: '{"Authorization": "Bearer ..."}' },
      { key: 'body_template', labelKey: 'bodyTemplate', type: 'textarea', placeholder: '{"key": "{{output}}"}' },
    ],
  },
  mcp_server: {
    color: 'violet',
    fields: [
      { key: 'url', label: 'Server URL', type: 'text', required: true, placeholder: 'http://localhost:3001' },
      { key: 'name', labelKey: 'serverName', type: 'text' },
      { key: 'tools', labelKey: 'tools', type: 'textarea', placeholder: '["tool1", "tool2"]' },
    ],
  },
  email: {
    color: 'emerald',
    fields: [
      { key: 'url', label: 'Webhook URL (n8n)', type: 'text', placeholder: 'https://n8n.example.com/webhook/email' },
      { key: 'smtp_host', label: 'SMTP Host', type: 'text', placeholder: 'smtp.gmail.com' },
      { key: 'smtp_port', label: 'SMTP Port', type: 'number', default: 587 },
      { key: 'from_address', labelKey: 'senderEmail', type: 'text', placeholder: 'noreply@example.com' },
    ],
  },
  gmail: {
    color: 'emerald',
    fields: [],
  },
  google_drive: {
    color: 'sky',
    fields: [],
  },
  email_template: {
    color: 'fuchsia',
    fields: [],
  },
};

const typeColors: Record<string, { bg: string; text: string; border: string }> = {
  n8n_webhook: { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/20' },
  http_api: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20' },
  mcp_server: { bg: 'bg-violet-500/10', text: 'text-violet-400', border: 'border-violet-500/20' },
  email: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
};

const CONNECTOR_TYPES = Object.keys(TYPE_CONFIG) as CatBrainConnector['type'][];

/* ── Helper: parse config JSON safely ── */

function parseConfig(connector: CatBrainConnector): Record<string, string | number> {
  try {
    if (typeof connector.config === 'string') {
      return JSON.parse(connector.config);
    }
    return (connector.config as unknown as Record<string, string | number>) ?? {};
  } catch {
    return {};
  }
}

/* ── ConnectorsPanel Component ── */

interface ConnectorsPanelProps {
  catbrainId: string;
}

export function ConnectorsPanel({ catbrainId }: ConnectorsPanelProps) {
  const t = useTranslations('catbrainConnectors');
  const [connectors, setConnectors] = useState<CatBrainConnector[]>([]);
  const [loading, setLoading] = useState(true);

  // Sheet state
  const [showCreateSheet, setShowCreateSheet] = useState(false);
  const [showEditSheet, setShowEditSheet] = useState(false);
  const [selectedConnector, setSelectedConnector] = useState<CatBrainConnector | null>(null);
  const [saving, setSaving] = useState(false);

  // Test state
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string } | null>>({});

  // Form state
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<CatBrainConnector['type']>('n8n_webhook');
  const [formDescription, setFormDescription] = useState('');
  const [formConfig, setFormConfig] = useState<Record<string, string | number>>({});

  /* ── Helper: resolve field display label ── */

  const resolveFieldLabel = (field: TypeField): string => {
    return field.labelKey ? t('fields.' + field.labelKey) : (field.label ?? '');
  };

  /* ── Data fetching ── */

  const fetchConnectors = useCallback(async () => {
    try {
      const res = await fetch(`/api/catbrains/${catbrainId}/connectors`);
      if (res.ok) {
        const data = await res.json();
        setConnectors(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error('Error fetching catbrain connectors:', e);
    } finally {
      setLoading(false);
    }
  }, [catbrainId]);

  useEffect(() => {
    fetchConnectors();
  }, [fetchConnectors]);

  /* ── Form helpers ── */

  const resetForm = (type: CatBrainConnector['type'] = 'n8n_webhook') => {
    setFormName('');
    setFormType(type);
    setFormDescription('');
    const defaults: Record<string, string | number> = {};
    TYPE_CONFIG[type].fields.forEach((f) => {
      if (f.default !== undefined) defaults[f.key] = f.default;
    });
    setFormConfig(defaults);
  };

  const handleTypeChange = (newType: CatBrainConnector['type']) => {
    setFormType(newType);
    const defaults: Record<string, string | number> = {};
    TYPE_CONFIG[newType].fields.forEach((f) => {
      if (f.default !== undefined) defaults[f.key] = f.default;
    });
    setFormConfig(defaults);
  };

  /* ── Actions ── */

  const handleCreate = () => {
    setSelectedConnector(null);
    resetForm();
    setShowCreateSheet(true);
  };

  const handleEdit = (connector: CatBrainConnector) => {
    setSelectedConnector(connector);
    setFormName(connector.name);
    setFormType(connector.type);
    setFormDescription(connector.description || '');
    setFormConfig(parseConfig(connector));
    setShowEditSheet(true);
  };

  const handleSave = async (isEdit: boolean) => {
    if (!formName.trim()) {
      toast.error(t('validation.nameRequired'));
      return;
    }
    const requiredFields = TYPE_CONFIG[formType].fields.filter((f) => f.required);
    for (const f of requiredFields) {
      if (!formConfig[f.key]) {
        toast.error(t('validation.fieldRequired', { label: resolveFieldLabel(f) }));
        return;
      }
    }

    setSaving(true);
    try {
      const body = {
        name: formName.trim(),
        type: formType,
        description: formDescription.trim() || null,
        config: JSON.stringify(formConfig),
      };

      let url: string;
      let method: string;

      if (isEdit && selectedConnector) {
        url = `/api/catbrains/${catbrainId}/connectors/${selectedConnector.id}`;
        method = 'PATCH';
      } else {
        url = `/api/catbrains/${catbrainId}/connectors`;
        method = 'POST';
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || 'Error al guardar');
      }

      toast.success(isEdit ? t('toast.updated') : t('toast.created'));
      setShowCreateSheet(false);
      setShowEditSheet(false);
      setSelectedConnector(null);
      fetchConnectors();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('toast.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (connector: CatBrainConnector) => {
    if (!window.confirm(t('deleteConfirm', { name: connector.name }))) return;
    try {
      const res = await fetch(`/api/catbrains/${catbrainId}/connectors/${connector.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Error');
      toast.success(t('toast.deleted'));
      setConnectors((prev) => prev.filter((c) => c.id !== connector.id));
    } catch {
      toast.error(t('toast.deleteError'));
    }
  };

  const handleTest = async (connector: CatBrainConnector) => {
    setTestingId(connector.id);
    setTestResults((prev) => ({ ...prev, [connector.id]: null }));
    try {
      const res = await fetch(`/api/catbrains/${catbrainId}/connectors/${connector.id}/test`, {
        method: 'POST',
      });
      const data = await res.json();
      setTestResults((prev) => ({
        ...prev,
        [connector.id]: { success: data.success, message: data.message || (data.success ? t('toast.connectionSuccess') : t('toast.unknownError')) },
      }));
      if (data.success) {
        toast.success(t('toast.testSuccess'), { description: data.message || `${data.duration_ms}ms` });
      } else {
        toast.error(t('toast.testFailed'), { description: data.message || t('toast.unknownError') });
      }
      fetchConnectors();
    } catch {
      setTestResults((prev) => ({
        ...prev,
        [connector.id]: { success: false, message: t('toast.networkError') },
      }));
      toast.error(t('toast.testError'));
    } finally {
      setTestingId(null);
    }
  };

  const handleToggleActive = async (connector: CatBrainConnector) => {
    try {
      const res = await fetch(`/api/catbrains/${catbrainId}/connectors/${connector.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: connector.is_active ? 0 : 1 }),
      });
      if (!res.ok) throw new Error('Error');
      toast.success(connector.is_active ? t('toast.deactivated') : t('toast.activated'));
      fetchConnectors();
    } catch {
      toast.error(t('toast.stateError'));
    }
  };

  /* ── Render helpers ── */

  const renderTestBadge = (status: CatBrainConnector['test_status']) => {
    switch (status) {
      case 'ok':
        return <Badge className="bg-emerald-500/10 text-emerald-400 border-0">{t('testBadge.ok')}</Badge>;
      case 'failed':
        return <Badge className="bg-red-500/10 text-red-400 border-0">{t('testBadge.failed')}</Badge>;
      default:
        return <Badge variant="secondary" className="bg-zinc-800 text-zinc-400 border-0">{t('testBadge.untested')}</Badge>;
    }
  };

  const renderTypeBadge = (type: string) => {
    const c = typeColors[type] || typeColors.n8n_webhook;
    return (
      <Badge className={`${c.bg} ${c.text} border ${c.border}`}>
        {t('types.' + type + '.label')}
      </Badge>
    );
  };

  const renderFormField = (field: TypeField) => {
    const value = formConfig[field.key] ?? field.default ?? '';
    const displayLabel = resolveFieldLabel(field);

    if (field.type === 'select' && field.options) {
      return (
        <div key={field.key}>
          <Label className="text-xs text-zinc-400 mb-1 block">
            {displayLabel} {field.required && <span className="text-red-400">*</span>}
          </Label>
          <select
            value={String(value)}
            onChange={(e) => setFormConfig((prev) => ({ ...prev, [field.key]: e.target.value }))}
            className="w-full h-9 rounded-md border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-50 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
          >
            {field.options.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>
      );
    }

    if (field.type === 'textarea') {
      return (
        <div key={field.key}>
          <Label className="text-xs text-zinc-400 mb-1 block">
            {displayLabel} {field.required && <span className="text-red-400">*</span>}
          </Label>
          <Textarea
            value={String(value)}
            onChange={(e) => setFormConfig((prev) => ({ ...prev, [field.key]: e.target.value }))}
            placeholder={field.placeholder}
            className="bg-zinc-900 border-zinc-800 text-zinc-50 h-24 resize-none text-xs font-mono"
          />
        </div>
      );
    }

    if (field.type === 'number') {
      return (
        <div key={field.key}>
          <Label className="text-xs text-zinc-400 mb-1 block">
            {displayLabel} {field.required && <span className="text-red-400">*</span>}
          </Label>
          <Input
            type="number"
            value={String(value)}
            onChange={(e) => setFormConfig((prev) => ({ ...prev, [field.key]: Number(e.target.value) || 0 }))}
            placeholder={field.placeholder}
            className="bg-zinc-900 border-zinc-800 text-zinc-50"
          />
        </div>
      );
    }

    return (
      <div key={field.key}>
        <Label className="text-xs text-zinc-400 mb-1 block">
          {displayLabel} {field.required && <span className="text-red-400">*</span>}
        </Label>
        <Input
          value={String(value)}
          onChange={(e) => setFormConfig((prev) => ({ ...prev, [field.key]: e.target.value }))}
          placeholder={field.placeholder}
          className="bg-zinc-900 border-zinc-800 text-zinc-50"
        />
      </div>
    );
  };

  const renderSheet = (isEdit: boolean) => {
    const open = isEdit ? showEditSheet : showCreateSheet;
    const setOpen = isEdit
      ? (v: boolean) => { setShowEditSheet(v); if (!v) setSelectedConnector(null); }
      : (v: boolean) => { setShowCreateSheet(v); };

    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="sm:max-w-lg w-full bg-zinc-950 border-zinc-800 flex flex-col p-0"
        >
          <SheetHeader className="p-6 pb-4 border-b border-zinc-800">
            <SheetTitle className="text-lg text-zinc-50">
              {isEdit ? t('sheet.editTitle') : t('sheet.createTitle')}
            </SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {/* Type selector (only for new) */}
            {!isEdit && (
              <div>
                <Label className="text-xs text-zinc-400 mb-2 block">{t('fields.connectorType')}</Label>
                <div className="grid grid-cols-2 gap-2">
                  {CONNECTOR_TYPES.map((type) => {
                    const c = typeColors[type];
                    const isSelected = formType === type;
                    return (
                      <button
                        key={type}
                        onClick={() => handleTypeChange(type)}
                        className={`text-left p-3 rounded-lg border transition-all ${
                          isSelected
                            ? `${c.border} ${c.bg}`
                            : 'border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800/50'
                        }`}
                      >
                        <span className={`text-xs font-medium ${isSelected ? c.text : 'text-zinc-300'}`}>
                          {t('types.' + type + '.label')}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Name */}
            <div>
              <Label className="text-xs text-zinc-400 mb-1 block">
                {t('fields.name')} <span className="text-red-400">*</span>
              </Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder={t('placeholder.name')}
                className="bg-zinc-900 border-zinc-800 text-zinc-50"
              />
            </div>

            {/* Description */}
            <div>
              <Label className="text-xs text-zinc-400 mb-1 block">{t('fields.description')}</Label>
              <Textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder={t('placeholder.description')}
                className="bg-zinc-900 border-zinc-800 text-zinc-50 h-16 resize-none"
              />
            </div>

            {/* Dynamic config fields */}
            <div className="space-y-3">
              <Label className="text-xs text-zinc-400 block">
                {t('fields.configuration', { type: t('types.' + formType + '.label') })}
              </Label>
              {TYPE_CONFIG[formType].fields.map((field) => renderFormField(field))}

              {/* MCP hint */}
              {formType === 'mcp_server' && (
                <p className="text-xs text-violet-400/70 bg-violet-500/5 rounded-md p-2 border border-violet-500/10">
                  Para conectar a otro CatBrain, usa: http://&#123;host&#125;:3500/api/mcp/&#123;catbrain-id&#125;
                </p>
              )}
            </div>
          </div>

          <SheetFooter className="p-4 border-t border-zinc-800 bg-zinc-950">
            <div className="flex gap-2 w-full">
              <Button
                variant="outline"
                onClick={() => setOpen(false)}
                className="flex-1 bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              >
                {t('sheet.cancel')}
              </Button>
              <Button
                onClick={() => handleSave(isEdit)}
                disabled={saving || !formName.trim()}
                className="flex-1 bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white"
              >
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {isEdit ? t('sheet.save') : t('sheet.create')}
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    );
  };

  /* ── Loading state ── */

  if (loading) {
    return (
      <div className="flex justify-center items-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
      </div>
    );
  }

  /* ── Main render ── */

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-zinc-50">{t('title')}</h2>
          <Badge variant="secondary" className="bg-zinc-800 text-zinc-400 border-0">
            {connectors.length}
          </Badge>
        </div>
        <Button
          onClick={handleCreate}
          size="sm"
          className="bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white"
        >
          <Plus className="w-4 h-4 mr-1.5" />
          {t('newConnector')}
        </Button>
      </div>

      {/* Connector list */}
      {connectors.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-12 text-center">
          <Plug className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
          <p className="text-sm text-zinc-400 mb-1">{t('empty.title')}</p>
          <p className="text-xs text-zinc-500 mb-4">
            {t('empty.description')}
          </p>
          <Button
            onClick={handleCreate}
            variant="outline"
            size="sm"
            className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            {t('empty.button')}
          </Button>
        </div>
      ) : (
        <div className="grid gap-3">
          {connectors.map((connector) => {
            const testResult = testResults[connector.id];
            return (
              <div
                key={connector.id}
                className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 hover:border-zinc-700 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  {/* Left: info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className="font-medium text-sm text-zinc-50">{connector.name}</span>
                      {renderTypeBadge(connector.type)}
                      {renderTestBadge(connector.test_status)}
                    </div>
                    {connector.description && (
                      <p className="text-xs text-zinc-500 mb-2 line-clamp-2">{connector.description}</p>
                    )}
                    <div className="flex items-center gap-3 text-xs text-zinc-500">
                      {connector.last_tested && (
                        <span>
                          {t('tested')} {new Date(connector.last_tested).toLocaleString(undefined, {
                            day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
                          })}
                        </span>
                      )}
                    </div>

                    {/* Inline test result */}
                    {testResult && (
                      <div className={`mt-2 flex items-center gap-1.5 text-xs ${testResult.success ? 'text-emerald-400' : 'text-red-400'}`}>
                        {testResult.success ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                        <span>{testResult.message}</span>
                      </div>
                    )}
                  </div>

                  {/* Right: actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {/* Active toggle */}
                    <button
                      onClick={() => handleToggleActive(connector)}
                      title={connector.is_active ? t('actions.deactivate') : t('actions.activate')}
                      className="mr-2"
                    >
                      {connector.is_active ? (
                        <Badge className="bg-emerald-500/10 text-emerald-400 border-0 cursor-pointer text-xs">
                          {t('status.active')}
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-zinc-800 text-zinc-500 border-0 cursor-pointer text-xs">
                          {t('status.inactive')}
                        </Badge>
                      )}
                    </button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleTest(connector)}
                      disabled={testingId === connector.id}
                      className="text-zinc-400 hover:text-zinc-50 h-8 w-8 p-0"
                      title={t('actions.test')}
                    >
                      {testingId === connector.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Play className="w-4 h-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(connector)}
                      className="text-zinc-400 hover:text-zinc-50 h-8 w-8 p-0"
                      title={t('actions.edit')}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(connector)}
                      className="text-red-400 hover:text-red-300 h-8 w-8 p-0"
                      title={t('actions.delete')}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Sheet */}
      {renderSheet(false)}

      {/* Edit Sheet */}
      {renderSheet(true)}
    </div>
  );
}
