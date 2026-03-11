"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, Eye, EyeOff, Check, X, Trash2, FlaskConical, Database, Plug, Palette, Key, Cpu, DollarSign, Plus } from 'lucide-react';
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
      toast.success(`API key de ${meta.name} guardada`);
      setKeyInput('');
      onUpdate();
    } catch {
      toast.error('Error al guardar la API key');
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
      toast.success('Endpoint actualizado');
      setEditingEndpoint(false);
      onUpdate();
    } catch {
      toast.error('Error al guardar el endpoint');
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
        toast.success(`${meta.name}: conexión verificada`);
      } else {
        toast.error(`${meta.name}: ${data.error}`);
      }
      onUpdate();
    } catch {
      toast.error('Error al verificar');
    } finally {
      setTesting(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/settings/api-keys/${config.provider}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Error');
      toast.success('API key eliminada');
      setTestResult(null);
      onUpdate();
    } catch {
      toast.error('Error al eliminar');
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
                <Check className="w-3 h-3 mr-1" /> Verificada
              </Badge>
            )}
            {config.test_status === 'failed' && (
              <Badge className="bg-red-500/10 text-red-400 border-red-500/20">
                <X className="w-3 h-3 mr-1" /> Error
              </Badge>
            )}
            {config.test_status === 'untested' && isConfigured && (
              <Badge className="bg-zinc-800 text-zinc-400 border-zinc-700">
                Sin verificar
              </Badge>
            )}
            {!isConfigured && (
              <Badge className="bg-zinc-800 text-zinc-500 border-zinc-700">
                No configurada
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
                  placeholder="Pega tu API key aquí..."
                  className="bg-zinc-950 border-zinc-800 text-zinc-50 flex-1 font-mono text-sm"
                />
                <Button
                  size="sm"
                  onClick={handleSaveKey}
                  disabled={saving || !keyInput.trim()}
                  className="bg-violet-500 hover:bg-violet-400 text-white flex-shrink-0"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Guardar'}
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
              Verificar conexión
            </Button>
          </div>
        )}

        {/* Endpoint */}
        <div className="text-xs text-zinc-500 mb-2">
          <span className="text-zinc-600">Endpoint: </span>
          {editingEndpoint ? (
            <div className="flex items-center gap-2 mt-1">
              <Input
                value={endpointInput}
                onChange={(e) => setEndpointInput(e.target.value)}
                className="bg-zinc-950 border-zinc-800 text-zinc-50 text-xs h-7 font-mono"
              />
              <Button size="sm" onClick={handleSaveEndpoint} disabled={saving} className="h-7 text-xs bg-violet-500 hover:bg-violet-400 text-white">
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : 'OK'}
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setEditingEndpoint(false); setEndpointInput(config.endpoint || ''); }} className="h-7 text-xs bg-transparent border-zinc-700 text-zinc-400">
                X
              </Button>
            </div>
          ) : (
            <button onClick={() => setEditingEndpoint(true)} className="text-zinc-400 hover:text-zinc-300 font-mono underline decoration-dotted">
              {config.endpoint || 'No configurado'}
            </button>
          )}
        </div>

        {/* Last tested */}
        {config.last_tested && (
          <p className="text-xs text-zinc-600">
            Último test: {new Date(config.last_tested).toLocaleString('es-ES')}
          </p>
        )}

        {/* Test result models */}
        {testResult?.status === 'ok' && testResult.models && testResult.models.length > 0 && (
          <div className="mt-3 pt-3 border-t border-zinc-800/50">
            <p className="text-xs text-zinc-500 mb-1.5">Modelos disponibles:</p>
            <div className="flex flex-wrap gap-1">
              {testResult.models.slice(0, 10).map(m => (
                <Badge key={m} variant="outline" className="text-[10px] bg-zinc-950 border-zinc-800 text-zinc-400">
                  {m}
                </Badge>
              ))}
              {testResult.models.length > 10 && (
                <Badge variant="outline" className="text-[10px] bg-zinc-950 border-zinc-800 text-zinc-500">
                  +{testResult.models.length - 10} más
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
      toast.success('Configuración guardada');
    } catch {
      toast.error('Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mb-10">
      <div className="flex items-center gap-2 mb-4">
        <Cpu className="w-5 h-5 text-violet-400" />
        <h2 className="text-xl font-semibold text-zinc-50">Procesamiento</h2>
      </div>
      <p className="text-sm text-zinc-400 mb-6">
        Configura los límites y el comportamiento del procesamiento de fuentes con LLMs.
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
              <Label className="text-zinc-300 font-medium">Límite máximo de tokens por request</Label>
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
                  className="bg-violet-500 hover:bg-violet-400 text-white"
                >
                  {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Guardar'}
                </Button>
              </div>
              <p className="text-xs text-zinc-500">
                Tokens máximos enviados al LLM por procesamiento. Gemini soporta ~1M, Claude ~200K, GPT-4o ~128K. Valor conservador: 50000.
              </p>
            </div>

            {/* Auto Truncate */}
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label className="text-zinc-300 font-medium">Truncar fuentes automáticamente</Label>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Si el texto excede el límite, se trunca proporcionalmente. Si está desactivado, el procesamiento falla con error.
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
                <Label className="text-zinc-300 font-medium">Incluir metadata de fuentes</Label>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Añade nombre de archivo y tipo como cabecera de cada fuente en el prompt.
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
      toast.success('Precios de modelos actualizados');
    } catch {
      toast.error('Error al guardar precios');
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
        <h2 className="text-xl font-semibold text-zinc-50">Costes de modelos</h2>
      </div>
      <p className="text-sm text-zinc-400 mb-6">
        Precios por 1M tokens para calcular costes estimados de uso. Formula: (input_tokens x input_price + output_tokens x output_price) / 1.000.000
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
                    <th className="text-left text-xs font-medium text-zinc-400 px-4 py-2.5">Modelo</th>
                    <th className="text-left text-xs font-medium text-zinc-400 px-4 py-2.5">Proveedor</th>
                    <th className="text-left text-xs font-medium text-zinc-400 px-4 py-2.5">Input ($/1M)</th>
                    <th className="text-left text-xs font-medium text-zinc-400 px-4 py-2.5">Output ($/1M)</th>
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
                        No hay precios configurados
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
                <Plus className="w-4 h-4 mr-1.5" /> Anadir modelo
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving}
                className="bg-violet-500 hover:bg-violet-400 text-white"
              >
                {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
                {saving ? 'Guardando...' : 'Guardar precios'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </section>
  );
}

export default function SettingsPage() {
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
    <div className="max-w-4xl mx-auto px-4 md:px-6 lg:px-8 py-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-zinc-50 mb-2">Configuración</h1>
        <p className="text-zinc-400">Gestiona las API keys, modelos y conexiones de DocFlow.</p>
      </div>

      {/* Section: API Keys */}
      <section className="mb-10">
        <div className="flex items-center gap-2 mb-4">
          <Key className="w-5 h-5 text-violet-400" />
          <h2 className="text-xl font-semibold text-zinc-50">API Keys de LLMs</h2>
        </div>
        <p className="text-sm text-zinc-400 mb-6">
          Configura las API keys de los providers de LLM que quieras usar. Los modelos disponibles dependerán de los providers con key verificada.
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

      {/* Section: Embeddings */}
      <section className="mb-10">
        <div className="flex items-center gap-2 mb-4">
          <Database className="w-5 h-5 text-violet-400" />
          <h2 className="text-xl font-semibold text-zinc-50">Modelos de Embeddings</h2>
        </div>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-5">
            <p className="text-sm text-zinc-400">
              Configuración de modelos de embeddings para RAG. Actualmente usando Ollama con <span className="text-zinc-300 font-mono">nomic-embed-text</span>.
            </p>
            <p className="text-xs text-zinc-500 mt-2">Próximamente: selección de modelo y provider de embeddings.</p>
          </CardContent>
        </Card>
      </section>

      {/* Section: Connections */}
      <section className="mb-10">
        <div className="flex items-center gap-2 mb-4">
          <Plug className="w-5 h-5 text-violet-400" />
          <h2 className="text-xl font-semibold text-zinc-50">Conexiones</h2>
        </div>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-5">
            <p className="text-sm text-zinc-400">
              Gestión de conexiones con servicios externos. Ve a{' '}
              <Link href="/system" className="text-violet-400 hover:text-violet-300 underline">Estado del Sistema</Link>
              {' '}para ver el estado actual de OpenClaw, n8n, Qdrant y LiteLLM.
            </p>
          </CardContent>
        </Card>
      </section>

      {/* Section: Preferences */}
      <section className="mb-10">
        <div className="flex items-center gap-2 mb-4">
          <Palette className="w-5 h-5 text-violet-400" />
          <h2 className="text-xl font-semibold text-zinc-50">Preferencias</h2>
        </div>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-5">
            <p className="text-sm text-zinc-400">
              Idioma, tema, notificaciones. Próximamente.
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
