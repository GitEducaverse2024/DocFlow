"use client";

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, Eye, EyeOff, Check, X, Trash2, FlaskConical, Plug, Palette, Cpu, Cat, Settings, Shield, ShieldCheck, Send, Play, Pause, Power, Users, ChevronRight, ChevronLeft, UserPlus } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import Link from 'next/link';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { ModelCenterShell } from '@/components/settings/model-center/model-center-shell';

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

interface MidModel {
  model_key: string;
  display_name: string;
  provider: string;
  tier: string;
  status: string;
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
  const [midModels, setMidModels] = useState<MidModel[]>([]);

  useEffect(() => {
    Promise.all([
      fetch('/api/settings?key=catbot_config').then(r => r.json()).catch(() => null),
      fetch('/api/mid?status=active').then(r => r.json()).catch(() => ({ models: [] })),
    ]).then(([data, midData]) => {
      if (data && data.value) {
        try { setConfig(JSON.parse(data.value)); } catch { /* use defaults */ }
      }
      setMidModels(Array.isArray(midData.models) ? midData.models : []);
    }).finally(() => setLoaded(true));
  }, []);

  const groupedModels = midModels.reduce<Record<string, MidModel[]>>((acc, m) => {
    const tier = m.tier || 'Sin clasificar';
    if (!acc[tier]) acc[tier] = [];
    acc[tier].push(m);
    return acc;
  }, {});

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
            <select
              value={config.model}
              onChange={e => setConfig(prev => ({ ...prev, model: e.target.value }))}
              className="w-full max-w-sm rounded-md bg-zinc-950 border border-zinc-800 text-zinc-50 px-3 py-2 text-sm mt-1 focus:outline-none focus:border-violet-500"
            >
              {['Elite', 'Pro', 'Libre', 'Sin clasificar'].map(tier => {
                const models = groupedModels[tier];
                if (!models || models.length === 0) return null;
                return (
                  <optgroup key={tier} label={`${tier} (${models.length})`}>
                    {models.map(m => (
                      <option key={m.model_key} value={m.model_key}>
                        {m.display_name} — {m.provider}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
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

// ---------------------------------------------------------------------------
// UI-01..08: Telegram Settings — "Canales externos"
// ---------------------------------------------------------------------------

interface TelegramConfig {
  configured: boolean;
  bot_username?: string;
  status?: 'active' | 'paused' | 'inactive';
  authorized_usernames?: string;
  permissions_no_sudo?: string;
  messages_count?: number;
  last_message_at?: string | null;
  token_hint?: string | null;
}

interface BotInfo {
  id: number;
  username: string;
  first_name: string;
}

function TelegramSettings() {
  const [config, setConfig] = useState<TelegramConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);

  // Step 1 state
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [savingToken, setSavingToken] = useState(false);

  // Step 2 state
  const [accessMode, setAccessMode] = useState<'any' | 'whitelist'>('any');
  const [usernames, setUsernames] = useState('');
  const [permissions, setPermissions] = useState<string[]>([]);

  // Step 3 state
  const [testing, setTesting] = useState(false);
  const [botInfo, setBotInfo] = useState<BotInfo | null>(null);
  const [testError, setTestError] = useState('');
  const [activating, setActivating] = useState(false);

  // Action state
  const [actionLoading, setActionLoading] = useState('');

  // New username input
  const [newUsername, setNewUsername] = useState('');

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/telegram/config');
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
        if (data.configured && data.authorized_usernames) {
          try {
            const parsed = JSON.parse(data.authorized_usernames);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setAccessMode('whitelist');
              setUsernames(parsed.join(', '));
            }
          } catch { /* empty */ }
        }
        if (data.configured && data.permissions_no_sudo) {
          try {
            const parsed = JSON.parse(data.permissions_no_sudo);
            if (Array.isArray(parsed)) setPermissions(parsed);
          } catch { /* empty */ }
        }
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchConfig(); }, []);

  // Wizard Step 1: Save token
  const handleSaveToken = async () => {
    if (!token.trim()) return;
    setSavingToken(true);
    try {
      const res = await fetch('/api/telegram/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(`Bot @${data.bot_username} verificado`);
        setWizardStep(2);
        await fetchConfig();
      } else {
        toast.error(data.error || 'Error guardando token');
      }
    } catch {
      toast.error('Error de conexion');
    } finally {
      setSavingToken(false);
    }
  };

  // Wizard Step 2: Save access settings
  const handleSaveAccess = async () => {
    const authorizedList = accessMode === 'whitelist'
      ? usernames.split(',').map(u => u.trim().replace(/^@/, '')).filter(Boolean)
      : [];

    try {
      const res = await fetch('/api/telegram/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          authorized_usernames: JSON.stringify(authorizedList),
          permissions_no_sudo: JSON.stringify(permissions),
        }),
      });
      if (res.ok) {
        setWizardStep(3);
        // Auto-test connection
        handleTestConnection();
      } else {
        toast.error('Error guardando configuracion de acceso');
      }
    } catch {
      toast.error('Error de conexion');
    }
  };

  // Step 3 / Action: Test connection
  const handleTestConnection = async () => {
    setTesting(true);
    setTestError('');
    setBotInfo(null);
    try {
      const res = await fetch('/api/telegram/test', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        setBotInfo(data.bot);
      } else {
        setTestError(data.error || 'Error de test');
      }
    } catch {
      setTestError('Error de conexion');
    } finally {
      setTesting(false);
    }
  };

  // Activate bot (wizard step 3)
  const handleActivate = async () => {
    setActivating(true);
    try {
      // Set status to active
      await fetch('/api/telegram/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'active' }),
      });
      // Resume polling
      await fetch('/api/telegram/resume', { method: 'POST' });
      toast.success('Bot de Telegram activado');
      setWizardOpen(false);
      setWizardStep(1);
      setToken('');
      await fetchConfig();
    } catch {
      toast.error('Error activando bot');
    } finally {
      setActivating(false);
    }
  };

  // Pause/Resume
  const handlePause = async () => {
    setActionLoading('pause');
    try {
      const res = await fetch('/api/telegram/pause', { method: 'POST' });
      if (res.ok) {
        toast.success('Bot pausado');
        await fetchConfig();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Error pausando');
      }
    } catch {
      toast.error('Error de conexion');
    } finally {
      setActionLoading('');
    }
  };

  const handleResume = async () => {
    setActionLoading('resume');
    try {
      const res = await fetch('/api/telegram/resume', { method: 'POST' });
      if (res.ok) {
        toast.success('Bot reanudado');
        await fetchConfig();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Error reanudando');
      }
    } catch {
      toast.error('Error de conexion');
    } finally {
      setActionLoading('');
    }
  };

  // Deactivate
  const handleDeactivate = async () => {
    setActionLoading('deactivate');
    try {
      const res = await fetch('/api/telegram/config', { method: 'DELETE' });
      if (res.ok) {
        toast.success('Bot desactivado');
        await fetchConfig();
      }
    } catch {
      toast.error('Error desactivando');
    } finally {
      setActionLoading('');
    }
  };

  // Save user changes (inline edit)
  const handleSaveUsers = async () => {
    const authorizedList = accessMode === 'whitelist'
      ? usernames.split(',').map(u => u.trim().replace(/^@/, '')).filter(Boolean)
      : [];

    setActionLoading('users');
    try {
      const res = await fetch('/api/telegram/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          authorized_usernames: JSON.stringify(authorizedList),
          permissions_no_sudo: JSON.stringify(permissions),
        }),
      });
      if (res.ok) {
        toast.success('Usuarios actualizados');
        await fetchConfig();
      }
    } catch {
      toast.error('Error guardando');
    } finally {
      setActionLoading('');
    }
  };

  // Add username helper
  const addUsername = () => {
    if (!newUsername.trim()) return;
    const clean = newUsername.trim().replace(/^@/, '');
    const current = usernames ? usernames.split(',').map(u => u.trim()).filter(Boolean) : [];
    if (!current.includes(clean)) {
      current.push(clean);
      setUsernames(current.join(', '));
    }
    setNewUsername('');
  };

  // Remove username helper
  const removeUsername = (name: string) => {
    const current = usernames.split(',').map(u => u.trim()).filter(Boolean);
    setUsernames(current.filter(u => u !== name).join(', '));
  };

  // Toggle permission
  const togglePermission = (perm: string) => {
    setPermissions(prev =>
      prev.includes(perm) ? prev.filter(p => p !== perm) : [...prev, perm]
    );
  };

  const availablePermissions = [
    { key: 'read_catbrains', label: 'Consultar CatBrains' },
    { key: 'read_status', label: 'Ver estado del sistema' },
    { key: 'read_projects', label: 'Listar proyectos' },
    { key: 'read_tasks', label: 'Listar tareas' },
    { key: 'execute_canvas', label: 'Ejecutar Canvas' },
  ];

  const statusColor = config?.status === 'active' ? 'bg-emerald-500' :
    config?.status === 'paused' ? 'bg-yellow-500' : 'bg-zinc-600';
  const statusLabel = config?.status === 'active' ? 'Activo' :
    config?.status === 'paused' ? 'Pausado' : 'Inactivo';

  if (loading) {
    return (
      <section className="mb-10">
        <div className="flex items-center gap-2 mb-4">
          <Send className="w-5 h-5 text-sky-400" />
          <h2 className="text-xl font-semibold text-zinc-50">Canales externos</h2>
        </div>
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
        </div>
      </section>
    );
  }

  return (
    <section className="mb-10">
      <div className="flex items-center gap-2 mb-4">
        <Send className="w-5 h-5 text-sky-400" />
        <h2 className="text-xl font-semibold text-zinc-50">Canales externos</h2>
      </div>
      <p className="text-sm text-zinc-400 mb-6">
        Conecta canales de mensajeria para interactuar con CatBot desde fuera de la web.
      </p>

      {/* UI-02: Telegram card */}
      {!config?.configured ? (
        // Empty state — not configured
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-6 text-center">
            <Send className="w-10 h-10 text-sky-400 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-zinc-100 mb-2">Telegram Bot</h3>
            <p className="text-sm text-zinc-400 mb-4">
              Conecta un bot de Telegram para chatear con CatBot desde tu movil.
            </p>
            <Button
              onClick={() => { setWizardOpen(true); setWizardStep(1); }}
              className="bg-gradient-to-r from-sky-600 to-blue-700 hover:from-sky-500 hover:to-blue-600 text-white"
            >
              <Send className="w-4 h-4 mr-2" />
              Configurar Telegram
            </Button>
          </CardContent>
        </Card>
      ) : (
        // Configured state
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-6 space-y-5">
            {/* Header with status */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Send className="w-6 h-6 text-sky-400" />
                <div>
                  <h3 className="text-lg font-semibold text-zinc-100">Telegram Bot</h3>
                  {config.bot_username && (
                    <span className="text-sm text-zinc-400">@{config.bot_username}</span>
                  )}
                </div>
              </div>
              <Badge className={`${
                config.status === 'active' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                config.status === 'paused' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' :
                'bg-zinc-700/50 text-zinc-400 border-zinc-600'
              }`}>
                <div className={`w-2 h-2 rounded-full mr-1.5 ${statusColor}`} />
                {statusLabel}
              </Badge>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div className="bg-zinc-800/50 rounded-lg p-3">
                <p className="text-xs text-zinc-500 mb-1">Mensajes</p>
                <p className="text-xl font-bold text-zinc-100">{config.messages_count ?? 0}</p>
              </div>
              <div className="bg-zinc-800/50 rounded-lg p-3">
                <p className="text-xs text-zinc-500 mb-1">Ultimo mensaje</p>
                <p className="text-sm text-zinc-300">
                  {config.last_message_at
                    ? new Date(config.last_message_at).toLocaleString()
                    : 'Ninguno'}
                </p>
              </div>
              <div className="bg-zinc-800/50 rounded-lg p-3">
                <p className="text-xs text-zinc-500 mb-1">Token</p>
                <p className="text-sm text-zinc-300 font-mono">{config.token_hint || '****'}</p>
              </div>
            </div>

            {/* UI-08: Authorized users */}
            <div>
              <Label className="text-zinc-300 text-sm mb-2 block">
                <Users className="w-4 h-4 inline mr-1" />
                Usuarios autorizados
              </Label>
              <div className="flex flex-wrap gap-2 mb-2">
                {usernames ? usernames.split(',').map(u => u.trim()).filter(Boolean).map(u => (
                  <span key={u} className="inline-flex items-center gap-1 px-2 py-1 bg-zinc-800 rounded-md text-sm text-zinc-300">
                    @{u}
                    <button onClick={() => removeUsername(u)} className="text-zinc-500 hover:text-red-400">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )) : (
                  <span className="text-sm text-zinc-500">Cualquier usuario</span>
                )}
              </div>
              <div className="flex gap-2">
                <Input
                  value={newUsername}
                  onChange={e => setNewUsername(e.target.value)}
                  placeholder="@username"
                  className="bg-zinc-900 border-zinc-800 text-zinc-50 max-w-xs"
                  onKeyDown={e => e.key === 'Enter' && addUsername()}
                />
                <Button onClick={addUsername} size="sm" variant="outline" className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800">
                  <UserPlus className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Permissions */}
            <div>
              <Label className="text-zinc-300 text-sm mb-2 block">Permisos sin sudo</Label>
              <div className="space-y-2">
                {availablePermissions.map(p => (
                  <label key={p.key} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={permissions.includes(p.key)}
                      onCheckedChange={() => togglePermission(p.key)}
                    />
                    <span className="text-sm text-zinc-300">{p.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Save users/permissions */}
            <Button
              onClick={handleSaveUsers}
              disabled={actionLoading === 'users'}
              size="sm"
              className="bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white"
            >
              {actionLoading === 'users' ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
              Guardar cambios
            </Button>

            {/* UI-07: Action buttons */}
            <div className="flex flex-wrap gap-2 pt-2 border-t border-zinc-800">
              <Button
                onClick={handleTestConnection}
                disabled={testing}
                size="sm"
                variant="outline"
                className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              >
                {testing ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <FlaskConical className="w-4 h-4 mr-1.5" />}
                Probar conexion
              </Button>

              {config.status === 'active' ? (
                <Button
                  onClick={handlePause}
                  disabled={actionLoading === 'pause'}
                  size="sm"
                  variant="outline"
                  className="bg-transparent border-yellow-700/50 text-yellow-400 hover:bg-yellow-900/20"
                >
                  {actionLoading === 'pause' ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Pause className="w-4 h-4 mr-1.5" />}
                  Pausar
                </Button>
              ) : (
                <Button
                  onClick={handleResume}
                  disabled={actionLoading === 'resume'}
                  size="sm"
                  variant="outline"
                  className="bg-transparent border-emerald-700/50 text-emerald-400 hover:bg-emerald-900/20"
                >
                  {actionLoading === 'resume' ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Play className="w-4 h-4 mr-1.5" />}
                  Reanudar
                </Button>
              )}

              <Button
                onClick={handleDeactivate}
                disabled={actionLoading === 'deactivate'}
                size="sm"
                variant="outline"
                className="bg-transparent border-red-700/50 text-red-400 hover:bg-red-900/20"
              >
                {actionLoading === 'deactivate' ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Power className="w-4 h-4 mr-1.5" />}
                Desactivar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* UI-03: Wizard Dialog (3 steps) */}
      <Dialog open={wizardOpen} onOpenChange={setWizardOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-50 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-zinc-50">
              Configurar Telegram Bot
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              Paso {wizardStep} de 3
            </DialogDescription>
          </DialogHeader>

          {/* Step indicators */}
          <div className="flex items-center gap-2 mb-4">
            {[1, 2, 3].map(step => (
              <div key={step} className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  step < wizardStep ? 'bg-emerald-500/20 text-emerald-400' :
                  step === wizardStep ? 'bg-violet-500/20 text-violet-400' :
                  'bg-zinc-800 text-zinc-500'
                }`}>
                  {step < wizardStep ? <Check className="w-4 h-4" /> : step}
                </div>
                {step < 3 && <div className={`w-8 h-0.5 ${step < wizardStep ? 'bg-emerald-500/40' : 'bg-zinc-700'}`} />}
              </div>
            ))}
          </div>

          {/* UI-04: Step 1 — Token */}
          {wizardStep === 1 && (
            <div className="space-y-4">
              <div>
                <Label className="text-zinc-300 text-sm mb-2 block">Token del bot</Label>
                <div className="relative">
                  <Input
                    type={showToken ? 'text' : 'password'}
                    value={token}
                    onChange={e => setToken(e.target.value)}
                    placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
                    className="bg-zinc-900 border-zinc-800 text-zinc-50 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                  >
                    {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-zinc-500 mt-2">
                  Obten tu token de @BotFather en Telegram. Abre Telegram, busca @BotFather, envia /newbot y sigue las instrucciones.
                </p>
              </div>
              <DialogFooter>
                <Button
                  onClick={handleSaveToken}
                  disabled={!token.trim() || savingToken}
                  className="bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white"
                >
                  {savingToken ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
                  Siguiente
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </DialogFooter>
            </div>
          )}

          {/* UI-05: Step 2 — Access */}
          {wizardStep === 2 && (
            <div className="space-y-4">
              <div>
                <Label className="text-zinc-300 text-sm mb-2 block">Acceso al bot</Label>
                <div className="space-y-3">
                  <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors
                    ${accessMode === 'any' ? 'border-violet-500/50 bg-violet-500/5' : 'border-zinc-800 hover:border-zinc-700'}">
                    <input
                      type="radio"
                      name="access"
                      checked={accessMode === 'any'}
                      onChange={() => setAccessMode('any')}
                      className="accent-violet-500"
                    />
                    <div>
                      <p className="text-sm text-zinc-200 font-medium">Cualquier usuario</p>
                      <p className="text-xs text-zinc-500">Cualquiera que escriba al bot recibira respuesta</p>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors
                    ${accessMode === 'whitelist' ? 'border-violet-500/50 bg-violet-500/5' : 'border-zinc-800 hover:border-zinc-700'}">
                    <input
                      type="radio"
                      name="access"
                      checked={accessMode === 'whitelist'}
                      onChange={() => setAccessMode('whitelist')}
                      className="accent-violet-500"
                    />
                    <div>
                      <p className="text-sm text-zinc-200 font-medium">Solo usuarios autorizados</p>
                      <p className="text-xs text-zinc-500">Solo los @usernames de la lista podran interactuar</p>
                    </div>
                  </label>
                </div>
              </div>

              {accessMode === 'whitelist' && (
                <div>
                  <Label className="text-zinc-300 text-sm mb-2 block">Usernames autorizados</Label>
                  <Textarea
                    value={usernames}
                    onChange={e => setUsernames(e.target.value)}
                    placeholder="usuario1, usuario2, usuario3"
                    className="bg-zinc-900 border-zinc-800 text-zinc-50"
                    rows={3}
                  />
                  <p className="text-xs text-zinc-500 mt-1">Separados por coma, sin @</p>
                </div>
              )}

              <div>
                <Label className="text-zinc-300 text-sm mb-2 block">Permisos sin sudo</Label>
                <div className="space-y-2">
                  {availablePermissions.map(p => (
                    <label key={p.key} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={permissions.includes(p.key)}
                        onCheckedChange={() => togglePermission(p.key)}
                      />
                      <span className="text-sm text-zinc-300">{p.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <DialogFooter className="flex justify-between">
                <Button
                  onClick={() => setWizardStep(1)}
                  variant="outline"
                  className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Atras
                </Button>
                <Button
                  onClick={handleSaveAccess}
                  className="bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white"
                >
                  Siguiente
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </DialogFooter>
            </div>
          )}

          {/* UI-06: Step 3 — Test & Activate */}
          {wizardStep === 3 && (
            <div className="space-y-4">
              <div className="bg-zinc-800/50 rounded-lg p-4">
                {testing ? (
                  <div className="flex items-center gap-3">
                    <Loader2 className="w-5 h-5 animate-spin text-violet-400" />
                    <span className="text-zinc-300">Verificando conexion con Telegram...</span>
                  </div>
                ) : testError ? (
                  <div className="flex items-center gap-3">
                    <X className="w-5 h-5 text-red-400" />
                    <div>
                      <p className="text-red-400 font-medium">Error de conexion</p>
                      <p className="text-sm text-zinc-500">{testError}</p>
                    </div>
                  </div>
                ) : botInfo ? (
                  <div className="flex items-center gap-3">
                    <Check className="w-5 h-5 text-emerald-400" />
                    <div>
                      <p className="text-emerald-400 font-medium">Conexion exitosa</p>
                      <p className="text-sm text-zinc-400">
                        Bot: {botInfo.first_name} (@{botInfo.username})
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <FlaskConical className="w-5 h-5 text-zinc-500" />
                    <span className="text-zinc-400">Listo para verificar</span>
                  </div>
                )}
              </div>

              {!botInfo && !testing && (
                <Button
                  onClick={handleTestConnection}
                  variant="outline"
                  className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 w-full"
                >
                  <FlaskConical className="w-4 h-4 mr-1.5" />
                  Probar conexion
                </Button>
              )}

              <DialogFooter className="flex justify-between">
                <Button
                  onClick={() => setWizardStep(2)}
                  variant="outline"
                  className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Atras
                </Button>
                <Button
                  onClick={handleActivate}
                  disabled={!botInfo || activating}
                  className="bg-gradient-to-r from-emerald-600 to-green-700 hover:from-emerald-500 hover:to-green-600 text-white"
                >
                  {activating ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Play className="w-4 h-4 mr-1.5" />}
                  Activar bot
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

export default function SettingsPage() {
  const t = useTranslations('settings');

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 lg:px-8 py-6 animate-slide-up">
      <PageHeader
        title={t('title')}
        description={t('description')}
        icon={<Settings className="w-6 h-6" />}
      />

      {/* Section: Processing */}
      <ProcessingSettings />

      {/* Section: Centro de Modelos (replaces API Keys, Model Intelligence, Model Pricing, Embeddings) */}
      <ModelCenterShell />

      {/* Section: CatBot (CATCFG-01..04) */}
      <CatBotSettings />

      {/* Section: CatBot Security (Sudo) */}
      <CatBotSecurity />

      {/* Section: Canales externos (Telegram) — UI-01 */}
      <TelegramSettings />

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
              <Link href="/#system-health" className="text-violet-400 hover:text-violet-300 underline">{t('connections.linkText')}</Link>
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
