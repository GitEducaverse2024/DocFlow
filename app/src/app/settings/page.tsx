"use client";

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, Eye, EyeOff, Check, X, Trash2, FlaskConical, Database, Plug, Palette, Key, Cpu, DollarSign, Plus, Cat, Settings, Shield, ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import Link from 'next/link';

interface ProviderConfig {
  id: string;
  provider: string;
  api_key: string | null;
  endpoint: string | null;
  has_key: boolean;
  is_active: number;
  last_tested: string | null;
  test_status: string;
}

const PROVIDER_META: Record<string, { emoji: string; name: string; description: string; models: string[]; needsKey: boolean }> = {
  openai: { emoji: '🟢', name: 'OpenAI', description: 'GPT-4o, GPT-4o-mini, GPT-5.4', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-5.4'], needsKey: true },
  anthropic: { emoji: '🟤', name: 'Anthropic (Claude)', description: 'Claude Sonnet 4.6, Claude Opus 4.6', models: ['claude-sonnet-4-6', 'claude-opus-4-6'], needsKey: true },
  google: { emoji: '🔵', name: 'Google (Gemini)', description: 'Gemini 2.5 Pro, Gemini 2.5 Flash', models: ['gemini-2.5-pro', 'gemini-2.5-flash'], needsKey: true },
  litellm: { emoji: '⚡', name: 'LiteLLM (Gateway local)', description: 'Proxy local con modelos de tu routing.yaml', models: [], needsKey: false },
  ollama: { emoji: '🦙', name: 'Ollama (Local)', description: 'Modelos locales en tu GPU. No requiere API key', models: [], needsKey: false },
};

function ProviderCard({ config, onUpdate }: { config: ProviderConfig; onUpdate: () => void }) {
  const t = useTranslations('settings');
  const meta = PROVIDER_META[config.provider];
  const [keyInput, setKeyInput] = useState('');
  const [endpointInput, setEndpointInput] = useState(config.endpoint || '');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [testResult, setTestResult] = useState<{ status: string; models?: string[]; error?: string } | null>(null);
  const [editingEndpoint, setEditingEndpoint] = useState(false);

  const handleSaveKey = async () => {
    if (!keyInput.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/settings/api-keys/${config.provider}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: keyInput.trim() }),
      });
      if (!res.ok) throw new Error('Error');
      toast.success(t('apiKeys.toasts.keySaved', { name: meta.name }));
      setKeyInput('');
      onUpdate();
    } catch {
      toast.error(t('apiKeys.toasts.keySaveError'));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEndpoint = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/settings/api-keys/${config.provider}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: endpointInput.trim() }),
      });
      if (!res.ok) throw new Error('Error');
      toast.success(t('apiKeys.toasts.endpointUpdated'));
      setEditingEndpoint(false);
      onUpdate();
    } catch {
      toast.error(t('apiKeys.toasts.endpointError'));
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`/api/settings/api-keys/${config.provider}/test`, { method: 'POST' });
      const data = await res.json();
      setTestResult(data);
      if (data.status === 'ok') {
        toast.success(t('apiKeys.toasts.verified', { name: meta.name }));
      } else {
        toast.error(`${meta.name}: ${data.error}`);
      }
      onUpdate();
    } catch {
      toast.error(t('apiKeys.toasts.verifyError'));
    } finally {
      setTesting(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/settings/api-keys/${config.provider}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Error');
      toast.success(t('apiKeys.toasts.keyDeleted'));
      setTestResult(null);
      onUpdate();
    } catch {
      toast.error(t('apiKeys.toasts.deleteError'));
    } finally {
      setDeleting(false);
    }
  };

  const isConfigured = config.has_key || !meta.needsKey;
  const borderClass = isConfigured
    ? config.test_status === 'ok'
      ? 'border-emerald-500/30'
      : config.test_status === 'failed'
        ? 'border-red-500/30'
        : 'border-zinc-700'
    : 'border-dashed border-zinc-700';

  return (
    <Card className={`bg-zinc-900 ${borderClass}`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <span className={`text-2xl ${!isConfigured ? 'opacity-40' : ''}`}>{meta.emoji}</span>
            <div>
              <h3 className="font-semibold text-zinc-50">{meta.name}</h3>
              <p className="text-xs text-zinc-500">{meta.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {config.test_status === 'ok' && (
              <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                <Check className="w-3 h-3 mr-1" /> {t('apiKeys.verified')}
              </Badge>
            )}
            {config.test_status === 'failed' && (
              <Badge className="bg-red-500/10 text-red-400 border-red-500/20">
                <X className="w-3 h-3 mr-1" /> {t('apiKeys.error')}
              </Badge>
            )}
            {config.test_status === 'untested' && isConfigured && (
              <Badge className="bg-zinc-800 text-zinc-400 border-zinc-700">
                {t('apiKeys.untested')}
              </Badge>
            )}
            {!isConfigured && (
              <Badge className="bg-zinc-800 text-zinc-500 border-zinc-700">
                {t('apiKeys.notConfigured')}
              </Badge>
            )}
          </div>
        </div>

        {/* API Key input */}
        {meta.needsKey && (
          <div className="space-y-2 mb-3">
            {config.has_key ? (
              <div className="flex items-center gap-2">
                <div className="flex-1 relative">
                  <Input
                    type={showKey ? 'text' : 'password'}
                    value={config.api_key || ''}
                    readOnly
                    className="bg-zinc-950 border-zinc-800 text-zinc-400 pr-10 font-mono text-sm"
                  />
                  <button
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                  >
                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleTest}
                  disabled={testing}
                  className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 flex-shrink-0"
                >
                  {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FlaskConical className="w-4 h-4" />}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="bg-transparent border-red-500/20 text-red-400 hover:bg-red-500/10 flex-shrink-0"
                >
                  {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Input
                  type="password"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  placeholder={t('apiKeys.placeholder')}
                  className="bg-zinc-950 border-zinc-800 text-zinc-50 flex-1 font-mono text-sm"
                />
                <Button
                  size="sm"
                  onClick={handleSaveKey}
                  disabled={saving || !keyInput.trim()}
                  className="bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white flex-shrink-0"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : t('apiKeys.save')}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* No-key providers: just test button */}
        {!meta.needsKey && (
          <div className="flex items-center gap-2 mb-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleTest}
              disabled={testing}
              className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            >
              {testing ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <FlaskConical className="w-4 h-4 mr-1.5" />}
              {t('apiKeys.verifyConnection')}
            </Button>
          </div>
        )}

        {/* Endpoint */}
        <div className="text-xs text-zinc-500 mb-2">
          <span className="text-zinc-600">{t('apiKeys.endpoint')} </span>
          {editingEndpoint ? (
            <div className="flex items-center gap-2 mt-1">
              <Input
                value={endpointInput}
                onChange={(e) => setEndpointInput(e.target.value)}
                className="bg-zinc-950 border-zinc-800 text-zinc-50 text-xs h-7 font-mono"
              />
              <Button size="sm" onClick={handleSaveEndpoint} disabled={saving} className="h-7 text-xs bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white">
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : 'OK'}
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setEditingEndpoint(false); setEndpointInput(config.endpoint || ''); }} className="h-7 text-xs bg-transparent border-zinc-700 text-zinc-400">
                X
              </Button>
            </div>
          ) : (
            <button onClick={() => setEditingEndpoint(true)} className="text-zinc-400 hover:text-zinc-300 font-mono underline decoration-dotted">
              {config.endpoint || t('apiKeys.notSet')}
            </button>
          )}
        </div>

        {/* Last tested */}
        {config.last_tested && (
          <p className="text-xs text-zinc-600">
            {t('apiKeys.lastTest')} {new Date(config.last_tested).toLocaleString()}
          </p>
        )}

        {/* Test result models */}
        {testResult?.status === 'ok' && testResult.models && testResult.models.length > 0 && (
          <div className="mt-3 pt-3 border-t border-zinc-800/50">
            <p className="text-xs text-zinc-500 mb-1.5">{t('apiKeys.availableModels')}</p>
            <div className="flex flex-wrap gap-1">
              {testResult.models.slice(0, 10).map(m => (
                <Badge key={m} variant="outline" className="text-[10px] bg-zinc-950 border-zinc-800 text-zinc-400">
                  {m}
                </Badge>
              ))}
              {testResult.models.length > 10 && (
                <Badge variant="outline" className="text-[10px] bg-zinc-950 border-zinc-800 text-zinc-500">
                  {t('apiKeys.moreModels', { count: testResult.models.length - 10 })}
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* Test result error */}
        {testResult?.status === 'failed' && testResult.error && (
          <div className="mt-3 pt-3 border-t border-red-500/10">
            <p className="text-xs text-red-400 font-mono">{testResult.error}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ProcessingSettings() {
  const t = useTranslations('settings');
  const [settings, setSettings] = useState<{ maxTokens: number; autoTruncate: boolean; includeMetadata: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [localMaxTokens, setLocalMaxTokens] = useState('50000');

  useEffect(() => {
    fetch('/api/settings/processing')
      .then(res => res.json())
      .then(data => {
        setSettings(data);
        setLocalMaxTokens(String(data.maxTokens));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const updateSetting = async (patch: Record<string, unknown>) => {
    setSaving(true);
    try {
      const res = await fetch('/api/settings/processing', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error('Error');
      // Refetch
      const updated = await fetch('/api/settings/processing').then(r => r.json());
      setSettings(updated);
      setLocalMaxTokens(String(updated.maxTokens));
      toast.success(t('processing.toasts.saved'));
    } catch {
      toast.error(t('processing.toasts.saveError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mb-10">
      <div className="flex items-center gap-2 mb-4">
        <Cpu className="w-5 h-5 text-violet-400" />
        <h2 className="text-xl font-semibold text-zinc-50">{t('processing.title')}</h2>
      </div>
      <p className="text-sm text-zinc-400 mb-6">
        {t('processing.description')}
      </p>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
        </div>
      ) : settings ? (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-5 space-y-6">
            {/* Max Tokens */}
            <div className="space-y-2">
              <Label className="text-zinc-300 font-medium">{t('processing.maxTokens')}</Label>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  value={localMaxTokens}
                  onChange={(e) => setLocalMaxTokens(e.target.value)}
                  min={10000}
                  max={500000}
                  step={5000}
                  className="bg-zinc-950 border-zinc-800 text-zinc-50 w-40 font-mono"
                />
                <Button
                  size="sm"
                  onClick={() => updateSetting({ maxTokens: parseInt(localMaxTokens, 10) })}
                  disabled={saving || String(settings.maxTokens) === localMaxTokens}
                  className="bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white"
                >
                  {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : t('apiKeys.save')}
                </Button>
              </div>
              <p className="text-xs text-zinc-500">
                {t('processing.maxTokensHint')}
              </p>
            </div>

            {/* Auto Truncate */}
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label className="text-zinc-300 font-medium">{t('processing.autoTruncate')}</Label>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {t('processing.autoTruncateHint')}
                </p>
              </div>
              <Checkbox
                checked={settings.autoTruncate}
                onCheckedChange={(checked) => updateSetting({ autoTruncate: !!checked })}
                disabled={saving}
                className="border-zinc-600 data-[state=checked]:bg-violet-500 data-[state=checked]:border-violet-500"
              />
            </div>

            {/* Include Metadata */}
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label className="text-zinc-300 font-medium">{t('processing.includeMetadata')}</Label>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {t('processing.includeMetadataHint')}
                </p>
              </div>
              <Checkbox
                checked={settings.includeMetadata}
                onCheckedChange={(checked) => updateSetting({ includeMetadata: !!checked })}
                disabled={saving}
                className="border-zinc-600 data-[state=checked]:bg-violet-500 data-[state=checked]:border-violet-500"
              />
            </div>
          </CardContent>
        </Card>
      ) : null}
    </section>
  );
}

function ModelPricingSettings() {
  const t = useTranslations('settings');
  const [pricing, setPricing] = useState<Array<{ model: string; provider: string; input_price: number; output_price: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/settings?key=model_pricing')
      .then(res => {
        if (res.ok) return res.json();
        return null;
      })
      .then(data => {
        if (data?.value) {
          try { setPricing(JSON.parse(data.value)); } catch { /* invalid JSON */ }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'model_pricing', value: JSON.stringify(pricing) })
      });
      if (!res.ok) throw new Error('Error');
      toast.success(t('modelPricing.toasts.saved'));
    } catch {
      toast.error(t('modelPricing.toasts.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const updateRow = (idx: number, field: string, value: string | number) => {
    const updated = [...pricing];
    updated[idx] = { ...updated[idx], [field]: value };
    setPricing(updated);
  };

  return (
    <section className="mb-10">
      <div className="flex items-center gap-2 mb-4">
        <DollarSign className="w-5 h-5 text-violet-400" />
        <h2 className="text-xl font-semibold text-zinc-50">{t('modelPricing.title')}</h2>
      </div>
      <p className="text-sm text-zinc-400 mb-6">
        {t('modelPricing.description')}
      </p>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
        </div>
      ) : (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-5">
            <div className="border border-zinc-800 rounded-lg overflow-hidden mb-4">
              <table className="w-full">
                <thead className="bg-zinc-800/50">
                  <tr>
                    <th className="text-left text-xs font-medium text-zinc-400 px-4 py-2.5">{t('modelPricing.model')}</th>
                    <th className="text-left text-xs font-medium text-zinc-400 px-4 py-2.5">{t('modelPricing.provider')}</th>
                    <th className="text-left text-xs font-medium text-zinc-400 px-4 py-2.5">{t('modelPricing.inputPrice')}</th>
                    <th className="text-left text-xs font-medium text-zinc-400 px-4 py-2.5">{t('modelPricing.outputPrice')}</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {pricing.map((item, idx) => (
                    <tr key={idx} className="hover:bg-zinc-800/30">
                      <td className="px-4 py-2">
                        <input
                          value={item.model}
                          onChange={(e) => updateRow(idx, 'model', e.target.value)}
                          className="bg-transparent text-sm text-zinc-200 border-none outline-none w-full font-mono"
                          placeholder="model-name"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          value={item.provider}
                          onChange={(e) => updateRow(idx, 'provider', e.target.value)}
                          className="bg-transparent text-sm text-zinc-400 border-none outline-none w-full"
                          placeholder="provider"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="number"
                          step="0.01"
                          value={item.input_price}
                          onChange={(e) => updateRow(idx, 'input_price', parseFloat(e.target.value) || 0)}
                          className="bg-zinc-800 text-sm text-zinc-200 rounded px-2 py-1 w-24 border border-zinc-700 outline-none focus:border-violet-500"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="number"
                          step="0.01"
                          value={item.output_price}
                          onChange={(e) => updateRow(idx, 'output_price', parseFloat(e.target.value) || 0)}
                          className="bg-zinc-800 text-sm text-zinc-200 rounded px-2 py-1 w-24 border border-zinc-700 outline-none focus:border-violet-500"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <button
                          onClick={() => setPricing(pricing.filter((_, i) => i !== idx))}
                          className="text-zinc-500 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {pricing.length === 0 && (
                    <tr>
                      <td colSpan={5} className="text-center text-sm text-zinc-500 py-6">
                        {t('modelPricing.empty')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPricing([...pricing, { model: '', provider: '', input_price: 0, output_price: 0 }])}
                className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              >
                <Plus className="w-4 h-4 mr-1.5" /> {t('modelPricing.addModel')}
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving}
                className="bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white"
              >
                {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
                {saving ? t('modelPricing.saving') : t('modelPricing.savePrices')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </section>
  );
}

function CatBotSecurity() {
  const t = useTranslations('settings');
  const [config, setConfig] = useState({
    enabled: false,
    has_password: false,
    duration_minutes: 5,
    protected_actions: ['bash_execute', 'service_manage', 'file_operation', 'credential_manage', 'mcp_bridge'] as string[],
  });
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/catbot/sudo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get_config' }),
    })
      .then(r => r.json())
      .then(data => {
        if (data) {
          setConfig({
            enabled: data.enabled ?? false,
            has_password: data.has_password ?? false,
            duration_minutes: data.duration_minutes ?? 5,
            protected_actions: data.protected_actions?.length > 0 ? data.protected_actions : ['bash_execute', 'service_manage', 'file_operation', 'credential_manage', 'mcp_bridge'],
          });
        }
      })
      .finally(() => setLoaded(true));
  }, []);

  const handleSetPassword = async () => {
    if (!password || password.length < 4) {
      toast.error(t('catbotSecurity.toasts.minChars'));
      return;
    }
    if (password !== confirmPassword) {
      toast.error(t('catbotSecurity.toasts.mismatch'));
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/catbot/sudo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'set_password',
          password,
          duration_minutes: config.duration_minutes,
          protected_actions: config.protected_actions,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(t('catbotSecurity.toasts.configured'));
        setConfig(prev => ({ ...prev, enabled: true, has_password: true }));
        setPassword('');
        setConfirmPassword('');
      } else {
        toast.error(data.error || t('catbotSecurity.toasts.configError'));
      }
    } catch { toast.error(t('catbotSecurity.toasts.connectionError')); }
    finally { setSaving(false); }
  };

  const handleUpdateConfig = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/catbot/sudo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_config',
          duration_minutes: config.duration_minutes,
          protected_actions: config.protected_actions,
          enabled: config.enabled,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(t('catbotSecurity.toasts.updated'));
      } else {
        toast.error(data.error || t('catbotSecurity.toasts.updateError'));
      }
    } catch { toast.error(t('catbotSecurity.toasts.connectionError')); }
    finally { setSaving(false); }
  };

  const handleRemovePassword = async () => {
    setSaving(true);
    try {
      await fetch('/api/catbot/sudo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove_password' }),
      });
      setConfig({ enabled: false, has_password: false, duration_minutes: 5, protected_actions: ['bash_execute', 'service_manage', 'file_operation', 'credential_manage', 'mcp_bridge'] });
      toast.success(t('catbotSecurity.toasts.removed'));
    } catch { toast.error(t('catbotSecurity.toasts.removeError')); }
    finally { setSaving(false); }
  };

  const toggleProtectedAction = (action: string) => {
    setConfig(prev => ({
      ...prev,
      protected_actions: prev.protected_actions.includes(action)
        ? prev.protected_actions.filter(a => a !== action)
        : [...prev.protected_actions, action],
    }));
  };

  if (!loaded) return null;

  const protectedActionKeys = ['bash_execute', 'service_manage', 'file_operation', 'credential_manage', 'mcp_bridge'];

  return (
    <section className="mb-10">
      <div className="flex items-center gap-2 mb-4">
        <Shield className="w-5 h-5 text-amber-400" />
        <h2 className="text-xl font-semibold text-zinc-50">{t('catbotSecurity.title')}</h2>
        {config.enabled && config.has_password && (
          <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-xs">
            <ShieldCheck className="w-3 h-3 mr-1" />
            {t('catbotSecurity.configured')}
          </Badge>
        )}
      </div>
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="p-5 space-y-5">
          <p className="text-sm text-zinc-400">
            {t('catbotSecurity.description')}
          </p>

          {/* Set or Change Password */}
          {!config.has_password ? (
            <div className="space-y-3 p-4 rounded-lg border border-amber-500/20 bg-amber-500/5">
              <Label className="text-amber-300 text-sm font-medium">{t('catbotSecurity.setPassword')}</Label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder={t('catbotSecurity.secretKey')}
                    className="bg-zinc-950 border-zinc-800 text-zinc-50"
                  />
                </div>
                <div>
                  <Input
                    type="password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder={t('catbotSecurity.confirmKey')}
                    className="bg-zinc-950 border-zinc-800 text-zinc-50"
                  />
                </div>
              </div>
              <p className="text-xs text-zinc-500">{t('catbotSecurity.minChars')}</p>
              <Button onClick={handleSetPassword} disabled={saving || !password || !confirmPassword} size="sm" className="bg-amber-600 hover:bg-amber-500 text-zinc-900 font-medium">
                {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-1.5" />}
                {t('catbotSecurity.setKeyButton')}
              </Button>
            </div>
          ) : (
            <>
              {/* Toggle enabled */}
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-zinc-300 text-sm">{t('catbotSecurity.sudoSecurity')}</Label>
                  <p className="text-xs text-zinc-500">{t('catbotSecurity.sudoHint')}</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.enabled}
                    onChange={e => setConfig(prev => ({ ...prev, enabled: e.target.checked }))}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-zinc-700 rounded-full peer peer-checked:bg-amber-600 peer-focus:ring-2 peer-focus:ring-amber-500/30 transition-colors after:content-[''] after:absolute after:top-0.5 after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full" />
                </label>
              </div>

              {/* Duration */}
              <div>
                <Label className="text-zinc-300 text-sm">{t('catbotSecurity.sessionDuration')}</Label>
                <Input
                  type="number"
                  min={1}
                  max={60}
                  value={config.duration_minutes}
                  onChange={e => setConfig(prev => ({ ...prev, duration_minutes: parseInt(e.target.value) || 5 }))}
                  className="bg-zinc-950 border-zinc-800 text-zinc-50 mt-1 w-32"
                />
                <p className="text-xs text-zinc-500 mt-1">{t('catbotSecurity.sessionHint')}</p>
              </div>

              {/* Protected actions */}
              <div>
                <Label className="text-zinc-300 text-sm mb-2 block">{t('catbotSecurity.protectedActions')}</Label>
                <div className="space-y-2">
                  {protectedActionKeys.map(key => (
                    <label key={key} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={config.protected_actions.includes(key)}
                        onCheckedChange={() => toggleProtectedAction(key)}
                      />
                      <div>
                        <span className="text-sm text-zinc-300">{t(`catbotSecurity.actions.${key}.label`)}</span>
                        <span className="text-xs text-zinc-500 ml-2">— {t(`catbotSecurity.actions.${key}.description`)}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Save / Change password / Remove */}
              <div className="flex items-center gap-3 pt-2 flex-wrap">
                <Button onClick={handleUpdateConfig} disabled={saving} size="sm" className="bg-gradient-to-r from-amber-600 to-orange-700 hover:from-amber-500 hover:to-orange-600 text-white">
                  {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
                  {t('catbotSecurity.saveConfig')}
                </Button>
                <Button onClick={handleRemovePassword} variant="outline" size="sm" className="bg-transparent border-red-800 text-red-400 hover:bg-red-900/20">
                  <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                  {t('catbotSecurity.removeKey')}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function CatBotSettings() {
  const t = useTranslations('settings');
  const [config, setConfig] = useState({
    model: 'gemini-main',
    personality: 'friendly',
    allowed_actions: ['create_projects', 'create_agents', 'create_tasks', 'create_connectors', 'navigate'],
  });
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/settings?key=catbot_config')
      .then(r => r.json())
      .then(data => {
        if (data && data.value) {
          try { setConfig(JSON.parse(data.value)); } catch { /* use defaults */ }
        }
      })
      .finally(() => setLoaded(true));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'catbot_config', value: JSON.stringify(config) }),
      });
      toast.success(t('catbot.toasts.saved'));
    } catch { toast.error(t('catbot.toasts.saveError')); }
    finally { setSaving(false); }
  };

  const toggleAction = (action: string) => {
    setConfig(prev => ({
      ...prev,
      allowed_actions: prev.allowed_actions.includes(action)
        ? prev.allowed_actions.filter(a => a !== action)
        : [...prev.allowed_actions, action],
    }));
  };

  const clearHistory = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('docatflow_catbot_messages');
      toast.success(t('catbot.toasts.historyCleared'));
    }
  };

  if (!loaded) return null;

  const actionKeys = ['create_catbrains', 'create_agents', 'create_tasks', 'create_connectors', 'navigate'];

  return (
    <section className="mb-10">
      <div className="flex items-center gap-2 mb-4">
        <Cat className="w-5 h-5 text-violet-400" />
        <h2 className="text-xl font-semibold text-zinc-50">{t('catbot.title')}</h2>
      </div>
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="p-5 space-y-4">
          <div>
            <Label className="text-zinc-300 text-sm">{t('catbot.modelLabel')}</Label>
            <Input
              value={config.model}
              onChange={e => setConfig(prev => ({ ...prev, model: e.target.value }))}
              placeholder="gemini-main"
              className="bg-zinc-950 border-zinc-800 text-zinc-50 mt-1 w-64"
            />
            <p className="text-xs text-zinc-500 mt-1">{t('catbot.modelHint')}</p>
          </div>

          <div>
            <Label className="text-zinc-300 text-sm">{t('catbot.personality')}</Label>
            <select
              value={config.personality}
              onChange={e => setConfig(prev => ({ ...prev, personality: e.target.value }))}
              className="bg-zinc-950 border border-zinc-800 text-zinc-50 rounded-md px-3 py-2 text-sm mt-1 w-64"
            >
              <option value="friendly">{t('catbot.personalities.friendly')}</option>
              <option value="technical">{t('catbot.personalities.technical')}</option>
              <option value="minimal">{t('catbot.personalities.minimal')}</option>
            </select>
          </div>

          <div>
            <Label className="text-zinc-300 text-sm mb-2 block">{t('catbot.allowedActions')}</Label>
            <div className="space-y-2">
              {actionKeys.map(key => (
                <label key={key} className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={config.allowed_actions.includes(key)}
                    onCheckedChange={() => toggleAction(key)}
                  />
                  <span className="text-sm text-zinc-300">{t(`catbot.actions.${key}`)}</span>
                </label>
              ))}
              <label className="flex items-center gap-2 opacity-50 cursor-not-allowed">
                <Checkbox checked={false} disabled />
                <span className="text-sm text-zinc-500">{t('catbot.deleteDisabled')}</span>
              </label>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button onClick={handleSave} disabled={saving} size="sm" className="bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white">
              {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
              {t('apiKeys.save')}
            </Button>
            <Button onClick={clearHistory} variant="outline" size="sm" className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800">
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              {t('catbot.clearHistory')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

export default function SettingsPage() {
  const t = useTranslations('settings');
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProviders = async () => {
    try {
      const res = await fetch('/api/settings/api-keys');
      if (res.ok) setProviders(await res.json());
    } catch (e) {
      console.error('Error fetching providers:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchProviders(); }, []);

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 lg:px-8 py-6 animate-slide-up">
      <PageHeader
        title={t('title')}
        description={t('description')}
        icon={<Settings className="w-6 h-6" />}
      />

      {/* Section: API Keys */}
      <section className="mb-10">
        <div className="flex items-center gap-2 mb-4">
          <Key className="w-5 h-5 text-violet-400" />
          <h2 className="text-xl font-semibold text-zinc-50">{t('apiKeys.title')}</h2>
        </div>
        <p className="text-sm text-zinc-400 mb-6">
          {t('apiKeys.description')}
        </p>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
          </div>
        ) : (
          <div className="space-y-4">
            {providers.map(p => (
              <ProviderCard key={p.provider} config={p} onUpdate={fetchProviders} />
            ))}
          </div>
        )}
      </section>

      {/* Section: Processing */}
      <ProcessingSettings />

      {/* Section: Model Pricing (COST-01, COST-02) */}
      <ModelPricingSettings />

      {/* Section: CatBot (CATCFG-01..04) */}
      <CatBotSettings />

      {/* Section: CatBot Security (Sudo) */}
      <CatBotSecurity />

      {/* Section: Embeddings */}
      <section className="mb-10">
        <div className="flex items-center gap-2 mb-4">
          <Database className="w-5 h-5 text-violet-400" />
          <h2 className="text-xl font-semibold text-zinc-50">{t('embeddings.title')}</h2>
        </div>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-5">
            <p className="text-sm text-zinc-400">
              {t('embeddings.description')}
            </p>
            <p className="text-xs text-zinc-500 mt-2">{t('embeddings.comingSoon')}</p>
          </CardContent>
        </Card>
      </section>

      {/* Section: Connections */}
      <section className="mb-10">
        <div className="flex items-center gap-2 mb-4">
          <Plug className="w-5 h-5 text-violet-400" />
          <h2 className="text-xl font-semibold text-zinc-50">{t('connections.title')}</h2>
        </div>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-5">
            <p className="text-sm text-zinc-400">
              {t('connections.description')}{' '}
              <Link href="/system" className="text-violet-400 hover:text-violet-300 underline">{t('connections.linkText')}</Link>
            </p>
          </CardContent>
        </Card>
      </section>

      {/* Section: Preferences */}
      <section className="mb-10">
        <div className="flex items-center gap-2 mb-4">
          <Palette className="w-5 h-5 text-violet-400" />
          <h2 className="text-xl font-semibold text-zinc-50">{t('preferences.title')}</h2>
        </div>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-5">
            <p className="text-sm text-zinc-400">
              {t('preferences.description')}
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
