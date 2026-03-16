'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plug, Plus, Pencil, Trash2, Play, FileText, Loader2, Mail } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import type { Connector, ConnectorLog, GmailConfig } from '@/lib/types';
import { GmailWizard } from '@/components/connectors/gmail-wizard';

/* ─── Type Configuration ─── */

interface TypeField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'select';
  required?: boolean;
  placeholder?: string;
  options?: string[];
  default?: string | number;
}

interface TypeInfo {
  label: string;
  description: string;
  icon: string;
  color: string;
  fields: TypeField[];
}

const TYPE_CONFIG: Record<Connector['type'], TypeInfo> = {
  n8n_webhook: {
    label: 'n8n Webhook',
    description: 'Conectar con flujos de n8n via webhook',
    icon: '\u{1F517}',
    color: 'orange',
    fields: [
      { key: 'url', label: 'Webhook URL', type: 'text', required: true, placeholder: 'https://n8n.example.com/webhook/...' },
      { key: 'method', label: 'Metodo', type: 'select', options: ['POST', 'GET', 'PUT'], default: 'POST' },
      { key: 'headers', label: 'Headers (JSON)', type: 'textarea', placeholder: '{"Authorization": "Bearer ..."}' },
      { key: 'timeout', label: 'Timeout (segundos)', type: 'number', default: 30 },
    ],
  },
  http_api: {
    label: 'HTTP API',
    description: 'Conectar con cualquier API REST',
    icon: '\u{1F310}',
    color: 'blue',
    fields: [
      { key: 'url', label: 'URL', type: 'text', required: true, placeholder: 'https://api.example.com/...' },
      { key: 'method', label: 'Metodo', type: 'select', options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], default: 'GET' },
      { key: 'headers', label: 'Headers (JSON)', type: 'textarea', placeholder: '{"Authorization": "Bearer ..."}' },
      { key: 'body_template', label: 'Body template (JSON)', type: 'textarea', placeholder: '{"key": "{{output}}"}' },
    ],
  },
  mcp_server: {
    label: 'MCP Server',
    description: 'Conectar con servidor MCP',
    icon: '\u{1F916}',
    color: 'violet',
    fields: [
      { key: 'url', label: 'Server URL', type: 'text', required: true, placeholder: 'http://localhost:3001' },
      { key: 'name', label: 'Nombre del servidor', type: 'text' },
      { key: 'tools', label: 'Tools disponibles (JSON)', type: 'textarea', placeholder: '["tool1", "tool2"]' },
    ],
  },
  email: {
    label: 'Email',
    description: 'Enviar notificaciones por email',
    icon: '\u{1F4E7}',
    color: 'emerald',
    fields: [
      { key: 'url', label: 'Webhook URL (n8n)', type: 'text', placeholder: 'https://n8n.example.com/webhook/email' },
      { key: 'smtp_host', label: 'SMTP Host', type: 'text', placeholder: 'smtp.gmail.com' },
      { key: 'smtp_port', label: 'SMTP Port', type: 'number', default: 587 },
      { key: 'from_address', label: 'Email remitente', type: 'text', placeholder: 'noreply@example.com' },
    ],
  },
  gmail: {
    label: 'Gmail',
    description: 'Enviar emails via Gmail (App Password / OAuth2)',
    icon: '\u{1F4E8}',
    color: 'emerald',
    fields: [
      { key: 'user', label: 'Gmail Address', type: 'text', required: true, placeholder: 'user@gmail.com' },
      { key: 'account_type', label: 'Tipo de cuenta', type: 'select', options: ['personal', 'workspace'], default: 'personal' },
      { key: 'auth_mode', label: 'Modo de autenticacion', type: 'select', options: ['app_password', 'oauth2'], default: 'app_password' },
      { key: 'app_password', label: 'App Password', type: 'text', placeholder: 'xxxx xxxx xxxx xxxx' },
      { key: 'from_name', label: 'Nombre remitente', type: 'text', placeholder: 'DoCatFlow' },
    ],
  },
};

const typeColors: Record<string, { bg: string; text: string; border: string }> = {
  n8n_webhook: { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/20' },
  http_api: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20' },
  mcp_server: { bg: 'bg-violet-500/10', text: 'text-violet-400', border: 'border-violet-500/20' },
  email: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
  gmail: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
};

const CONNECTOR_TYPES = Object.keys(TYPE_CONFIG) as Connector['type'][];

/* ─── Suggested Templates ─── */

const SUGGESTED_TEMPLATES = [
  {
    name: 'Email (n8n)',
    type: 'n8n_webhook' as const,
    emoji: '\u{1F4E7}',
    description: 'Enviar email via n8n webhook',
    config: { url: '', method: 'POST', timeout: 30 },
  },
  {
    name: 'Asana (n8n)',
    type: 'n8n_webhook' as const,
    emoji: '\u{1F4CB}',
    description: 'Crear tarea en Asana via n8n',
    config: { url: '', method: 'POST', timeout: 30 },
  },
  {
    name: 'Telegram (n8n)',
    type: 'n8n_webhook' as const,
    emoji: '\u{1F4AC}',
    description: 'Enviar mensaje a Telegram via n8n',
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
  const config = (() => {
    try {
      return typeof connector.config === 'string' ? JSON.parse(connector.config) as Partial<GmailConfig> : null;
    } catch { return null; }
  })();

  const subtypeLabel = (() => {
    const st = connector.gmail_subtype;
    if (st === 'gmail_personal') return 'Personal';
    if (st === 'gmail_workspace_oauth2') return 'Workspace (OAuth2)';
    if (st === 'gmail_workspace') return 'Workspace (App Password)';
    // fallback from config
    if (config?.account_type === 'personal') return 'Personal';
    if (config?.auth_mode === 'oauth2') return 'Workspace (OAuth2)';
    if (config?.account_type === 'workspace') return 'Workspace (App Password)';
    return 'Gmail';
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

/* ─── Page Component ─── */

export default function ConnectorsPage() {
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

  // Gmail wizard
  const [gmailWizardOpen, setGmailWizardOpen] = useState(false);

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
      toast.error('El nombre es obligatorio');
      return;
    }
    const requiredFields = TYPE_CONFIG[formType].fields.filter((f) => f.required);
    for (const f of requiredFields) {
      if (!formConfig[f.key]) {
        toast.error(`El campo "${f.label}" es obligatorio`);
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
        throw new Error((err as { error?: string }).error || 'Error al guardar');
      }

      toast.success(editingConnector ? 'Conector actualizado' : 'Conector creado');
      setSheetOpen(false);
      setEditingConnector(null);
      fetchConnectors();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al guardar conector');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (connector: Connector) => {
    if (!confirm(`Eliminar el conector "${connector.name}"?`)) return;
    try {
      const res = await fetch(`/api/connectors/${connector.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Error');
      toast.success('Conector eliminado');
      fetchConnectors();
    } catch {
      toast.error('Error al eliminar conector');
    }
  };

  const handleTest = async (connector: Connector) => {
    setTestingId(connector.id);
    try {
      const res = await fetch(`/api/connectors/${connector.id}/test`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        toast.success('Test exitoso', { description: data.message || `${data.duration_ms}ms` });
      } else {
        toast.error('Test fallido', { description: data.message || 'Error desconocido' });
      }
      fetchConnectors();
    } catch {
      toast.error('Error al ejecutar test');
    } finally {
      setTestingId(null);
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
      toast.error('Error al cargar logs');
    } finally {
      setLogsLoading(false);
    }
  };

  const handleUseTemplate = (template: (typeof SUGGESTED_TEMPLATES)[number]) => {
    setEditingConnector(null);
    setFormName(template.name);
    setFormType(template.type);
    setFormEmoji(template.emoji);
    setFormDescription(template.description);
    const defaults: Record<string, string | number> = {};
    TYPE_CONFIG[template.type].fields.forEach((f) => {
      if (f.default !== undefined) defaults[f.key] = f.default;
    });
    setFormConfig({ ...defaults, ...template.config });
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
      toast.success(connector.is_active ? 'Conector desactivado' : 'Conector activado');
      fetchConnectors();
    } catch {
      toast.error('Error al cambiar estado');
    }
  };

  /* ─── Render helpers ─── */

  const renderTestBadge = (status: Connector['test_status']) => {
    switch (status) {
      case 'ok':
        return <Badge className="bg-emerald-500/10 text-emerald-400 border-0">OK</Badge>;
      case 'failed':
        return <Badge className="bg-red-500/10 text-red-400 border-0">Fallo</Badge>;
      default:
        return <Badge variant="secondary" className="bg-zinc-800 text-zinc-400 border-0">Sin probar</Badge>;
    }
  };

  const renderTypeBadge = (type: string) => {
    const c = typeColors[type] || typeColors.n8n_webhook;
    const info = TYPE_CONFIG[type as Connector['type']];
    return (
      <Badge className={`${c.bg} ${c.text} border ${c.border}`}>
        {info?.label || type}
      </Badge>
    );
  };

  const renderFormField = (field: TypeField) => {
    const value = formConfig[field.key] ?? field.default ?? '';

    if (field.type === 'select' && field.options) {
      return (
        <div key={field.key}>
          <Label className="text-xs text-zinc-400 mb-1 block">
            {field.label} {field.required && <span className="text-red-400">*</span>}
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
            {field.label} {field.required && <span className="text-red-400">*</span>}
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
            {field.label} {field.required && <span className="text-red-400">*</span>}
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
          {field.label} {field.required && <span className="text-red-400">*</span>}
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
        title="Conectores"
        description="Gestiona las conexiones con servicios externos"
        icon={<Plug className="w-6 h-6" />}
        action={
          <Button
            onClick={handleCreate}
            className="bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nuevo conector
          </Button>
        }
      />

      {/* Type cards */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-zinc-300 uppercase tracking-wider">
          Tipos de conector
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {CONNECTOR_TYPES.map((type) => {
            const info = TYPE_CONFIG[type];
            const c = typeColors[type];
            const count = connectorsByType(type).length;
            return (
              <button
                key={type}
                onClick={() => {
                  if (type === 'gmail') {
                    setGmailWizardOpen(true);
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
                  <span className={`font-medium text-sm ${c.text}`}>{info.label}</span>
                </div>
                <p className="text-xs text-zinc-400 mb-2">{info.description}</p>
                <p className="text-xs text-zinc-500">
                  {count} configurado{count !== 1 ? 's' : ''}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Configured connectors list */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-zinc-300 uppercase tracking-wider">
          Conectores configurados
        </h2>

        {connectors.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center">
            <Plug className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
            <p className="text-sm text-zinc-400 mb-1">No hay conectores configurados</p>
            <p className="text-xs text-zinc-500 mb-4">
              Crea tu primer conector o usa una plantilla sugerida
            </p>
            <Button
              onClick={handleCreate}
              variant="outline"
              size="sm"
              className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Crear conector
            </Button>
          </div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-4 py-3">
                    Conector
                  </th>
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-4 py-3">
                    Tipo
                  </th>
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-4 py-3 hidden md:table-cell">
                    Estado
                  </th>
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-4 py-3 hidden md:table-cell">
                    Test
                  </th>
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-4 py-3 hidden lg:table-cell">
                    Usos
                  </th>
                  <th className="text-right text-xs font-medium text-zinc-500 uppercase tracking-wider px-4 py-3">
                    Acciones
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
                        title={connector.is_active ? 'Desactivar' : 'Activar'}
                      >
                        {connector.is_active ? (
                          <Badge className="bg-emerald-500/10 text-emerald-400 border-0 cursor-pointer">
                            Activo
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-zinc-800 text-zinc-500 border-0 cursor-pointer">
                            Inactivo
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
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleTest(connector)}
                          disabled={testingId === connector.id}
                          className="text-zinc-400 hover:text-zinc-50 h-8 w-8 p-0"
                          title="Probar conector"
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
                          title="Ver logs"
                        >
                          <FileText className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(connector)}
                          className="text-zinc-400 hover:text-zinc-50 h-8 w-8 p-0"
                          title="Editar"
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(connector)}
                          className="text-red-400 hover:text-red-300 h-8 w-8 p-0"
                          title="Eliminar"
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
          Plantillas sugeridas
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {SUGGESTED_TEMPLATES.map((template) => {
            const c = typeColors[template.type];
            return (
              <div
                key={template.name}
                className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex flex-col"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">{template.emoji}</span>
                  <span className="font-medium text-sm text-zinc-50">{template.name}</span>
                </div>
                <p className="text-xs text-zinc-400 mb-3 flex-1">{template.description}</p>
                <div className="flex items-center justify-between">
                  <Badge className={`${c.bg} ${c.text} border ${c.border} text-xs`}>
                    n8n Webhook
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleUseTemplate(template)}
                    className="text-violet-400 hover:text-violet-300 text-xs h-7"
                  >
                    Usar plantilla
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
              {editingConnector ? 'Editar conector' : 'Nuevo conector'}
            </SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {/* Type selector (only for new) */}
            {!editingConnector && (
              <div>
                <Label className="text-xs text-zinc-400 mb-2 block">Tipo de conector</Label>
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
                            {info.label}
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
                <Label className="text-xs text-zinc-400 mb-1 block">Emoji</Label>
                <Input
                  value={formEmoji}
                  onChange={(e) => setFormEmoji(e.target.value)}
                  className="bg-zinc-900 border-zinc-800 text-zinc-50 text-center text-lg"
                  maxLength={4}
                />
              </div>
              <div>
                <Label className="text-xs text-zinc-400 mb-1 block">
                  Nombre <span className="text-red-400">*</span>
                </Label>
                <Input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Mi conector"
                  className="bg-zinc-900 border-zinc-800 text-zinc-50"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs text-zinc-400 mb-1 block">Descripcion</Label>
              <Textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Descripcion opcional..."
                className="bg-zinc-900 border-zinc-800 text-zinc-50 h-16 resize-none"
              />
            </div>

            {/* Dynamic config fields */}
            <div className="space-y-3">
              <Label className="text-xs text-zinc-400 block">
                Configuracion ({TYPE_CONFIG[formType].label})
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
                Cancelar
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving || !formName.trim()}
                className="flex-1 bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white"
              >
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editingConnector ? 'Guardar cambios' : 'Crear conector'}
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

      {/* Logs Dialog */}
      <Dialog open={!!logsConnector} onOpenChange={(open) => { if (!open) setLogsConnector(null); }}>
        <DialogContent className="max-w-3xl w-[90vw] max-h-[80vh] bg-zinc-950 border-zinc-800 flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-lg text-zinc-50 flex items-center gap-2">
              <span className="text-xl">{logsConnector?.emoji}</span>
              Logs de {logsConnector?.name}
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
                <p className="text-sm text-zinc-500">No hay logs para este conector</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-3 py-2">
                      Fecha
                    </th>
                    <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-3 py-2">
                      Tarea
                    </th>
                    <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-3 py-2">
                      Estado
                    </th>
                    <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-3 py-2">
                      Duracion
                    </th>
                    <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-3 py-2">
                      Error
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-zinc-800/30">
                      <td className="px-3 py-2 text-xs text-zinc-400 whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString('es-ES', {
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
                            OK
                          </Badge>
                        ) : log.status === 'timeout' ? (
                          <Badge className="bg-amber-500/10 text-amber-400 border-0 text-xs">
                            Timeout
                          </Badge>
                        ) : (
                          <Badge className="bg-red-500/10 text-red-400 border-0 text-xs">
                            Fallo
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
