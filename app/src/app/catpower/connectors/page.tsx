'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plug, Plus, Pencil, Trash2, Play, FileText, Loader2, LogIn } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import type { Connector, ConnectorLog, GmailConfig, GoogleDriveConfig } from '@/lib/types';
import { GmailWizard } from '@/components/connectors/gmail-wizard';
import { GoogleDriveWizard } from '@/components/connectors/google-drive-wizard';

/* ─── Type Configuration ─── */

interface TypeField {
  key: string;
  labelKey: string;
  type: 'text' | 'textarea' | 'number' | 'select';
  required?: boolean;
  placeholder?: string;
  options?: string[];
  default?: string | number;
}

interface TypeInfo {
  icon: string;
  color: string;
  fields: TypeField[];
}

const TYPE_CONFIG: Record<Connector['type'], TypeInfo> = {
  n8n_webhook: {
    icon: '\u{1F517}',
    color: 'orange',
    fields: [
      { key: 'url', labelKey: 'webhookUrl', type: 'text', required: true, placeholder: 'https://n8n.example.com/webhook/...' },
      { key: 'method', labelKey: 'method', type: 'select', options: ['POST', 'GET', 'PUT'], default: 'POST' },
      { key: 'headers', labelKey: 'headers', type: 'textarea', placeholder: '{"Authorization": "Bearer ..."}' },
      { key: 'timeout', labelKey: 'timeout', type: 'number', default: 30 },
    ],
  },
  http_api: {
    icon: '\u{1F310}',
    color: 'blue',
    fields: [
      { key: 'url', labelKey: 'url', type: 'text', required: true, placeholder: 'https://api.example.com/...' },
      { key: 'method', labelKey: 'method', type: 'select', options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], default: 'GET' },
      { key: 'headers', labelKey: 'headers', type: 'textarea', placeholder: '{"Authorization": "Bearer ..."}' },
      { key: 'body_template', labelKey: 'bodyTemplate', type: 'textarea', placeholder: '{"key": "{{output}}"}' },
    ],
  },
  mcp_server: {
    icon: '\u{1F916}',
    color: 'violet',
    fields: [
      { key: 'url', labelKey: 'serverUrl', type: 'text', required: true, placeholder: 'http://localhost:3001' },
      { key: 'name', labelKey: 'serverName', type: 'text' },
      { key: 'tools', labelKey: 'toolsAvailable', type: 'textarea', placeholder: '["tool1", "tool2"]' },
    ],
  },
  email: {
    icon: '\u{1F4E7}',
    color: 'emerald',
    fields: [
      { key: 'url', labelKey: 'webhookUrlN8n', type: 'text', placeholder: 'https://n8n.example.com/webhook/email' },
      { key: 'smtp_host', labelKey: 'smtpHost', type: 'text', placeholder: 'smtp.gmail.com' },
      { key: 'smtp_port', labelKey: 'smtpPort', type: 'number', default: 587 },
      { key: 'from_address', labelKey: 'fromAddress', type: 'text', placeholder: 'noreply@example.com' },
    ],
  },
  gmail: {
    icon: '\u{1F4E8}',
    color: 'emerald',
    fields: [
      { key: 'user', labelKey: 'gmailAddress', type: 'text', required: true, placeholder: 'user@gmail.com' },
      { key: 'account_type', labelKey: 'accountType', type: 'select', options: ['personal', 'workspace'], default: 'personal' },
      { key: 'auth_mode', labelKey: 'authMode', type: 'select', options: ['app_password', 'oauth2'], default: 'app_password' },
      { key: 'app_password', labelKey: 'appPassword', type: 'text', placeholder: 'xxxx xxxx xxxx xxxx' },
      { key: 'from_name', labelKey: 'senderName', type: 'text', placeholder: 'DoCatFlow' },
    ],
  },
  google_drive: {
    icon: '\uD83D\uDCC1',
    color: 'sky',
    fields: [],
  },
  email_template: {
    icon: '\uD83C\uDFA8',
    color: 'fuchsia',
    fields: [],
  },
};

const typeColors: Record<string, { bg: string; text: string; border: string }> = {
  n8n_webhook: { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/20' },
  http_api: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20' },
  mcp_server: { bg: 'bg-violet-500/10', text: 'text-violet-400', border: 'border-violet-500/20' },
  email: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
  gmail: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
  google_drive: { bg: 'bg-sky-500/10', text: 'text-sky-400', border: 'border-sky-500/20' },
  email_template: { bg: 'bg-fuchsia-500/10', text: 'text-fuchsia-400', border: 'border-fuchsia-500/20' },
};

const CONNECTOR_TYPES = Object.keys(TYPE_CONFIG) as Connector['type'][];

/* ─── Suggested Templates ─── */

const SUGGESTED_TEMPLATES = [
  {
    nameKey: 'emailN8n',
    type: 'n8n_webhook' as const,
    emoji: '\u{1F4E7}',
    config: { url: '', method: 'POST', timeout: 30 },
  },
  {
    nameKey: 'asanaN8n',
    type: 'n8n_webhook' as const,
    emoji: '\u{1F4CB}',
    config: { url: '', method: 'POST', timeout: 30 },
  },
  {
    nameKey: 'telegramN8n',
    type: 'n8n_webhook' as const,
    emoji: '\u{1F4AC}',
    config: { url: '', method: 'POST', timeout: 30 },
  },
];

/* ─── Helper: parse config JSON safely ─── */

function parseConfig(connector: Connector): Record<string, string | number> {
  try {
    if (typeof connector.config === 'string') {
      return JSON.parse(connector.config);
    }
    return (connector.config as unknown as Record<string, string | number>) ?? {};
  } catch {
    return {};
  }
}

/* ─── Gmail Subtitle Helper ─── */

function GmailSubtitle({ connector }: { connector: Connector }) {
  const t = useTranslations('connectors');
  const config = (() => {
    try {
      return typeof connector.config === 'string' ? JSON.parse(connector.config) as Partial<GmailConfig> : null;
    } catch { return null; }
  })();

  const subtypeLabel = (() => {
    const st = connector.gmail_subtype;
    if (st === 'gmail_personal') return t('subtypes.personal');
    if (st === 'gmail_workspace_oauth2') return t('subtypes.workspaceOAuth2');
    if (st === 'gmail_workspace') return t('subtypes.workspaceAppPassword');
    // fallback from config
    if (config?.account_type === 'personal') return t('subtypes.personal');
    if (config?.auth_mode === 'oauth2') return t('subtypes.workspaceOAuth2');
    if (config?.account_type === 'workspace') return t('subtypes.workspaceAppPassword');
    return t('subtypes.gmail');
  })();

  return (
    <div className="flex flex-col">
      <p className="text-xs text-emerald-400/70">{subtypeLabel}</p>
      {config?.user && (
        <p className="text-xs text-zinc-500 truncate max-w-[200px]">{config.user}</p>
      )}
    </div>
  );
}

/* ─── Drive Subtitle Helper ─── */

function DriveSubtitle({ connector }: { connector: Connector }) {
  const t = useTranslations('connectors');
  const config = (() => {
    try {
      return typeof connector.config === 'string'
        ? JSON.parse(connector.config) as Partial<GoogleDriveConfig>
        : null;
    } catch { return null; }
  })();

  const authLabel = config?.auth_mode === 'oauth2'
    ? t('drive.subtitle.oauth2')
    : t('drive.subtitle.serviceAccount');
  const email = config?.auth_mode === 'oauth2'
    ? config?.oauth2_email
    : config?.sa_email;

  return (
    <div className="flex flex-col">
      <p className="text-xs text-sky-400/70">{authLabel}</p>
      {email && (
        <p className="text-xs text-zinc-500 truncate max-w-[200px]">{email}</p>
      )}
      {config?.root_folder_name && (
        <p className="text-xs text-zinc-600 truncate max-w-[200px]">{config.root_folder_name}</p>
      )}
    </div>
  );
}

/* ─── Page Component ─── */

export default function ConnectorsPage() {
  const t = useTranslations('connectors');
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [loading, setLoading] = useState(true);

  // Sheet (create/edit)
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingConnector, setEditingConnector] = useState<Connector | null>(null);
  const [saving, setSaving] = useState(false);

  // Logs dialog
  const [logsConnector, setLogsConnector] = useState<Connector | null>(null);
  const [logs, setLogs] = useState<ConnectorLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // Test
  const [testingId, setTestingId] = useState<string | null>(null);
  const [linkedinLoginLoading, setLinkedinLoginLoading] = useState(false);

  // Gmail wizard
  const [gmailWizardOpen, setGmailWizardOpen] = useState(false);

  // Google Drive wizard
  const [driveWizardOpen, setDriveWizardOpen] = useState(false);

  // Form state
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<Connector['type']>('n8n_webhook');
  const [formEmoji, setFormEmoji] = useState('\u{1F50C}');
  const [formDescription, setFormDescription] = useState('');
  const [formConfig, setFormConfig] = useState<Record<string, string | number>>({});

  /* ─── Data fetching ─── */

  const fetchConnectors = useCallback(async () => {
    try {
      const res = await fetch('/api/connectors');
      if (res.ok) {
        const data = await res.json();
        setConnectors(Array.isArray(data) ? data : data.connectors ?? []);
      }
    } catch (e) {
      console.error('Error fetching connectors:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConnectors();
  }, [fetchConnectors]);

  /* ─── Helpers ─── */

  const resetForm = (type: Connector['type'] = 'n8n_webhook') => {
    setFormName('');
    setFormType(type);
    setFormEmoji('\u{1F50C}');
    setFormDescription('');
    const defaults: Record<string, string | number> = {};
    TYPE_CONFIG[type].fields.forEach((f) => {
      if (f.default !== undefined) defaults[f.key] = f.default;
    });
    setFormConfig(defaults);
  };

  const connectorsByType = (type: string) => connectors.filter((c) => c.type === type);

  /* ─── Actions ─── */

  const handleCreate = () => {
    setEditingConnector(null);
    resetForm();
    setSheetOpen(true);
  };

  const handleEdit = (connector: Connector) => {
    setEditingConnector(connector);
    setFormName(connector.name);
    setFormType(connector.type);
    setFormEmoji(connector.emoji || '\u{1F50C}');
    setFormDescription(connector.description || '');
    setFormConfig(parseConfig(connector));
    setSheetOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      toast.error(t('toasts.nameRequired'));
      return;
    }
    const requiredFields = TYPE_CONFIG[formType].fields.filter((f) => f.required);
    for (const f of requiredFields) {
      if (!formConfig[f.key]) {
        toast.error(t('toasts.fieldRequired', { label: t(`fields.${f.labelKey}`) }));
        return;
      }
    }

    setSaving(true);
    try {
      const body = {
        name: formName.trim(),
        type: formType,
        emoji: formEmoji,
        description: formDescription.trim() || null,
        config: formConfig,
        is_active: editingConnector ? editingConnector.is_active : 1,
      };

      const url = editingConnector
        ? `/api/connectors/${editingConnector.id}`
        : '/api/connectors';
      const method = editingConnector ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || t('toasts.saveError'));
      }

      toast.success(editingConnector ? t('toasts.updated') : t('toasts.created'));
      setSheetOpen(false);
      setEditingConnector(null);
      fetchConnectors();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('toasts.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (connector: Connector) => {
    if (!confirm(t('toasts.deleteConfirm', { name: connector.name }))) return;
    try {
      const res = await fetch(`/api/connectors/${connector.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Error');
      toast.success(t('toasts.deleted'));
      fetchConnectors();
    } catch {
      toast.error(t('toasts.deleteError'));
    }
  };

  const handleTest = async (connector: Connector) => {
    setTestingId(connector.id);
    try {
      const res = await fetch(`/api/connectors/${connector.id}/test`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        toast.success(t('toasts.testSuccess'), { description: data.message || `${data.duration_ms}ms` });
      } else {
        toast.error(t('toasts.testFailed'), { description: data.message || t('toasts.unknownError') });
      }
      fetchConnectors();
    } catch {
      toast.error(t('toasts.testError'));
    } finally {
      setTestingId(null);
    }
  };

  const handleLinkedInLogin = async () => {
    setLinkedinLoginLoading(true);
    try {
      const res = await fetch('/api/connectors/linkedin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login' }),
      });
      const data = await res.json();
      if (data.started) {
        toast.success('LinkedIn Login iniciado', {
          description: 'Se ha abierto el navegador en el servidor. Completa el login en la pantalla del servidor.',
          duration: 10000,
        });
      } else {
        toast.error('Error al iniciar login', { description: data.error || 'Error desconocido' });
      }
    } catch {
      toast.error('Error de conexion con el servidor');
    } finally {
      setLinkedinLoginLoading(false);
    }
  };

  const handleShowLogs = async (connector: Connector) => {
    setLogsConnector(connector);
    setLogs([]);
    setLogsLoading(true);
    try {
      const res = await fetch(`/api/connectors/${connector.id}/logs`);
      if (res.ok) {
        const data = await res.json();
        setLogs(Array.isArray(data) ? data : data.logs ?? []);
      }
    } catch {
      toast.error(t('toasts.logsError'));
    } finally {
      setLogsLoading(false);
    }
  };

  const handleUseTemplate = (tpl: (typeof SUGGESTED_TEMPLATES)[number]) => {
    setEditingConnector(null);
    setFormName(t(`templates.${tpl.nameKey}.name`));
    setFormType(tpl.type);
    setFormEmoji(tpl.emoji);
    setFormDescription(t(`templates.${tpl.nameKey}.description`));
    const defaults: Record<string, string | number> = {};
    TYPE_CONFIG[tpl.type].fields.forEach((f) => {
      if (f.default !== undefined) defaults[f.key] = f.default;
    });
    setFormConfig({ ...defaults, ...tpl.config });
    setSheetOpen(true);
  };

  const handleTypeChange = (newType: Connector['type']) => {
    setFormType(newType);
    const defaults: Record<string, string | number> = {};
    TYPE_CONFIG[newType].fields.forEach((f) => {
      if (f.default !== undefined) defaults[f.key] = f.default;
    });
    setFormConfig(defaults);
  };

  const handleToggleActive = async (connector: Connector) => {
    try {
      const res = await fetch(`/api/connectors/${connector.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: connector.is_active ? 0 : 1 }),
      });
      if (!res.ok) throw new Error('Error');
      toast.success(connector.is_active ? t('toasts.deactivated') : t('toasts.activated'));
      fetchConnectors();
    } catch {
      toast.error(t('toasts.toggleError'));
    }
  };

  /* ─── Render helpers ─── */

  const renderTestBadge = (status: Connector['test_status']) => {
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
        {t(`types.${type}.label`)}
      </Badge>
    );
  };

  const renderFormField = (field: TypeField) => {
    const value = formConfig[field.key] ?? field.default ?? '';
    const fieldLabel = t(`fields.${field.labelKey}`);

    if (field.type === 'select' && field.options) {
      return (
        <div key={field.key}>
          <Label className="text-xs text-zinc-400 mb-1 block">
            {fieldLabel} {field.required && <span className="text-red-400">*</span>}
          </Label>
          <select
            value={String(value)}
            onChange={(e) => setFormConfig((prev) => ({ ...prev, [field.key]: e.target.value }))}
            className="w-full h-9 rounded-md border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-50 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
          >
            {field.options.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
      );
    }

    if (field.type === 'textarea') {
      return (
        <div key={field.key}>
          <Label className="text-xs text-zinc-400 mb-1 block">
            {fieldLabel} {field.required && <span className="text-red-400">*</span>}
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
            {fieldLabel} {field.required && <span className="text-red-400">*</span>}
          </Label>
          <Input
            type="number"
            value={String(value)}
            onChange={(e) =>
              setFormConfig((prev) => ({ ...prev, [field.key]: Number(e.target.value) || 0 }))
            }
            placeholder={field.placeholder}
            className="bg-zinc-900 border-zinc-800 text-zinc-50"
          />
        </div>
      );
    }

    return (
      <div key={field.key}>
        <Label className="text-xs text-zinc-400 mb-1 block">
          {fieldLabel} {field.required && <span className="text-red-400">*</span>}
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

  /* ─── Loading state ─── */

  if (loading) {
    return (
      <div className="flex justify-center items-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
      </div>
    );
  }

  /* ─── Main render ─── */

  return (
    <div className="max-w-5xl mx-auto py-8 px-6 space-y-8 animate-slide-up">
      <PageHeader
        title={t('title')}
        description={t('description')}
        icon={<Plug className="w-6 h-6" />}
        action={
          <Button
            onClick={handleCreate}
            className="bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            {t('new')}
          </Button>
        }
      />

      {/* Type cards */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-zinc-300 uppercase tracking-wider">
          {t('typesTitle')}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {CONNECTOR_TYPES.map((type) => {
            const info = TYPE_CONFIG[type];
            const c = typeColors[type] || typeColors.n8n_webhook;
            const count = connectorsByType(type).length;
            return (
              <button
                key={type}
                onClick={() => {
                  if (type === 'gmail') {
                    setGmailWizardOpen(true);
                    return;
                  }
                  if (type === 'google_drive') {
                    setDriveWizardOpen(true);
                    return;
                  }
                  setEditingConnector(null);
                  resetForm(type);
                  setSheetOpen(true);
                }}
                className={`text-left p-4 rounded-lg border ${c.border} ${c.bg} hover:opacity-80 transition-opacity`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">{info.icon}</span>
                  <span className={`font-medium text-sm ${c.text}`}>{t(`types.${type}.label`)}</span>
                </div>
                <p className="text-xs text-zinc-400 mb-2">{t(`types.${type}.description`)}</p>
                <p className="text-xs text-zinc-500">
                  {t('configured', { count })}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Configured connectors list */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-zinc-300 uppercase tracking-wider">
          {t('configuredTitle')}
        </h2>

        {connectors.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center">
            <Plug className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
            <p className="text-sm text-zinc-400 mb-1">{t('list.emptyTitle')}</p>
            <p className="text-xs text-zinc-500 mb-4">
              {t('list.emptyDescription')}
            </p>
            <Button
              onClick={handleCreate}
              variant="outline"
              size="sm"
              className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              {t('list.createConnector')}
            </Button>
          </div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-4 py-3">
                    {t('list.connector')}
                  </th>
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-4 py-3">
                    {t('list.type')}
                  </th>
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-4 py-3 hidden md:table-cell">
                    {t('list.status')}
                  </th>
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-4 py-3 hidden md:table-cell">
                    {t('list.test')}
                  </th>
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-4 py-3 hidden lg:table-cell">
                    {t('list.uses')}
                  </th>
                  <th className="text-right text-xs font-medium text-zinc-500 uppercase tracking-wider px-4 py-3">
                    {t('list.actions')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {connectors.map((connector) => (
                  <tr key={connector.id} className="hover:bg-zinc-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="text-lg">{connector.emoji || '\u{1F50C}'}</span>
                        <div className="min-w-0">
                          <p className="font-medium text-zinc-50 text-sm truncate">
                            {connector.name}
                          </p>
                          {connector.type === 'gmail' ? (
                            <GmailSubtitle connector={connector} />
                          ) : connector.type === 'google_drive' ? (
                            <DriveSubtitle connector={connector} />
                          ) : connector.description ? (
                            <p className="text-xs text-zinc-500 truncate max-w-[200px]">
                              {connector.description}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">{renderTypeBadge(connector.type)}</td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <button
                        onClick={() => handleToggleActive(connector)}
                        title={connector.is_active ? t('list.deactivate') : t('list.activate')}
                      >
                        {connector.is_active ? (
                          <Badge className="bg-emerald-500/10 text-emerald-400 border-0 cursor-pointer">
                            {t('list.active')}
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-zinc-800 text-zinc-500 border-0 cursor-pointer">
                            {t('list.inactive')}
                          </Badge>
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {renderTestBadge(connector.test_status)}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className="text-sm text-zinc-400">{connector.times_used}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {connector.id === 'seed-linkedin-mcp' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleLinkedInLogin}
                            disabled={linkedinLoginLoading}
                            className="text-blue-400 hover:text-blue-300 h-8 w-8 p-0"
                            title="Login LinkedIn"
                          >
                            {linkedinLoginLoading ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <LogIn className="w-4 h-4" />
                            )}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleTest(connector)}
                          disabled={testingId === connector.id}
                          className="text-zinc-400 hover:text-zinc-50 h-8 w-8 p-0"
                          title={t('list.testConnector')}
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
                          onClick={() => handleShowLogs(connector)}
                          className="text-zinc-400 hover:text-zinc-50 h-8 w-8 p-0"
                          title={t('list.viewLogs')}
                        >
                          <FileText className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(connector)}
                          className="text-zinc-400 hover:text-zinc-50 h-8 w-8 p-0"
                          title={t('list.edit')}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(connector)}
                          className="text-red-400 hover:text-red-300 h-8 w-8 p-0"
                          title={t('list.delete')}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Suggested templates */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-zinc-300 uppercase tracking-wider">
          {t('templatesTitle')}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {SUGGESTED_TEMPLATES.map((tpl) => {
            const c = typeColors[tpl.type] || typeColors.n8n_webhook;
            return (
              <div
                key={tpl.nameKey}
                className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex flex-col"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">{tpl.emoji}</span>
                  <span className="font-medium text-sm text-zinc-50">{t(`templates.${tpl.nameKey}.name`)}</span>
                </div>
                <p className="text-xs text-zinc-400 mb-3 flex-1">{t(`templates.${tpl.nameKey}.description`)}</p>
                <div className="flex items-center justify-between">
                  <Badge className={`${c.bg} ${c.text} border ${c.border} text-xs`}>
                    {t('list.n8nWebhook')}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleUseTemplate(tpl)}
                    className="text-violet-400 hover:text-violet-300 text-xs h-7"
                  >
                    {t('list.useTemplate')}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Create/Edit Sheet */}
      <Sheet open={sheetOpen} onOpenChange={(open) => { if (!open) { setSheetOpen(false); setEditingConnector(null); } }}>
        <SheetContent
          side="right"
          className="sm:max-w-lg w-full bg-zinc-950 border-zinc-800 flex flex-col p-0"
        >
          <SheetHeader className="p-6 pb-4 border-b border-zinc-800">
            <SheetTitle className="text-lg text-zinc-50">
              {editingConnector ? t('sheet.editTitle') : t('sheet.newTitle')}
            </SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {/* Type selector (only for new) */}
            {!editingConnector && (
              <div>
                <Label className="text-xs text-zinc-400 mb-2 block">{t('sheet.connectorType')}</Label>
                <div className="grid grid-cols-2 gap-2">
                  {CONNECTOR_TYPES.map((type) => {
                    const info = TYPE_CONFIG[type];
                    const c = typeColors[type];
                    const isSelected = formType === type;
                    return (
                      <button
                        key={type}
                        onClick={() => {
                          if (type === 'gmail') {
                            setSheetOpen(false);
                            setGmailWizardOpen(true);
                            return;
                          }
                          if (type === 'google_drive') {
                            setSheetOpen(false);
                            setDriveWizardOpen(true);
                            return;
                          }
                          handleTypeChange(type);
                        }}
                        className={`text-left p-3 rounded-lg border transition-all ${
                          isSelected
                            ? `${c.border} ${c.bg} ring-1 ring-offset-0 ring-${info.color}-500/30`
                            : 'border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800/50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-base">{info.icon}</span>
                          <span className={`text-xs font-medium ${isSelected ? c.text : 'text-zinc-300'}`}>
                            {t(`types.${type}.label`)}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Basic info */}
            <div className="grid grid-cols-[60px_1fr] gap-3">
              <div>
                <Label className="text-xs text-zinc-400 mb-1 block">{t('sheet.emoji')}</Label>
                <Input
                  value={formEmoji}
                  onChange={(e) => setFormEmoji(e.target.value)}
                  className="bg-zinc-900 border-zinc-800 text-zinc-50 text-center text-lg"
                  maxLength={4}
                />
              </div>
              <div>
                <Label className="text-xs text-zinc-400 mb-1 block">
                  {t('sheet.name')} <span className="text-red-400">*</span>
                </Label>
                <Input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder={t('sheet.namePlaceholder')}
                  className="bg-zinc-900 border-zinc-800 text-zinc-50"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs text-zinc-400 mb-1 block">{t('sheet.description')}</Label>
              <Textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder={t('sheet.descriptionPlaceholder')}
                className="bg-zinc-900 border-zinc-800 text-zinc-50 h-16 resize-none"
              />
            </div>

            {/* Dynamic config fields */}
            <div className="space-y-3">
              <Label className="text-xs text-zinc-400 block">
                {t('sheet.configuration', { type: t(`types.${formType}.label`) })}
              </Label>
              {TYPE_CONFIG[formType].fields.map((field) => renderFormField(field))}
            </div>
          </div>

          <SheetFooter className="p-4 border-t border-zinc-800 bg-zinc-950">
            <div className="flex gap-2 w-full">
              <Button
                variant="outline"
                onClick={() => { setSheetOpen(false); setEditingConnector(null); }}
                className="flex-1 bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              >
                {t('sheet.cancel')}
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving || !formName.trim()}
                className="flex-1 bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white"
              >
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editingConnector ? t('sheet.saveChanges') : t('sheet.createConnector')}
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Gmail Wizard */}
      <GmailWizard
        open={gmailWizardOpen}
        onClose={() => setGmailWizardOpen(false)}
        onCreated={() => { setGmailWizardOpen(false); fetchConnectors(); }}
      />

      {/* Google Drive Wizard */}
      <GoogleDriveWizard
        open={driveWizardOpen}
        onClose={() => setDriveWizardOpen(false)}
        onCreated={() => { setDriveWizardOpen(false); fetchConnectors(); }}
      />

      {/* Logs Dialog */}
      <Dialog open={!!logsConnector} onOpenChange={(open) => { if (!open) setLogsConnector(null); }}>
        <DialogContent className="max-w-3xl w-[90vw] max-h-[80vh] bg-zinc-950 border-zinc-800 flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-lg text-zinc-50 flex items-center gap-2">
              <span className="text-xl">{logsConnector?.emoji}</span>
              {t('logs.title', { name: logsConnector?.name ?? '' })}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto min-h-0">
            {logsLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
              </div>
            ) : logs.length === 0 ? (
              <div className="py-12 text-center">
                <FileText className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                <p className="text-sm text-zinc-500">{t('list.noLogs')}</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-3 py-2">
                      {t('logs.date')}
                    </th>
                    <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-3 py-2">
                      {t('logs.task')}
                    </th>
                    <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-3 py-2">
                      {t('logs.status')}
                    </th>
                    <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-3 py-2">
                      {t('logs.duration')}
                    </th>
                    <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-3 py-2">
                      {t('logs.error')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-zinc-800/30">
                      <td className="px-3 py-2 text-xs text-zinc-400 whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString(undefined, {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="px-3 py-2 text-xs text-zinc-400">
                        {log.task_id ? log.task_id.substring(0, 8) : '-'}
                      </td>
                      <td className="px-3 py-2">
                        {log.status === 'success' ? (
                          <Badge className="bg-emerald-500/10 text-emerald-400 border-0 text-xs">
                            {t('logs.ok')}
                          </Badge>
                        ) : log.status === 'timeout' ? (
                          <Badge className="bg-amber-500/10 text-amber-400 border-0 text-xs">
                            {t('logs.timeout')}
                          </Badge>
                        ) : (
                          <Badge className="bg-red-500/10 text-red-400 border-0 text-xs">
                            {t('logs.failed')}
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-zinc-400">
                        {log.duration_ms}ms
                      </td>
                      <td className="px-3 py-2 text-xs text-red-400 max-w-[200px] truncate">
                        {log.error_message || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
