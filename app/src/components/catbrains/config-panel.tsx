'use client';

import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2, Copy, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Project } from '@/lib/types';

interface ConfigPanelProps {
  catbrain: Project;
  onCatBrainUpdate: () => void;
  onDelete: () => void;
}

export function ConfigPanel({ catbrain, onCatBrainUpdate, onDelete }: ConfigPanelProps) {
  const [name, setName] = useState(catbrain.name || '');
  const [description, setDescription] = useState(catbrain.description || '');
  const [systemPrompt, setSystemPrompt] = useState(catbrain.system_prompt || '');
  const [defaultModel, setDefaultModel] = useState(catbrain.default_model || '');
  const [mcpEnabled, setMcpEnabled] = useState((catbrain.mcp_enabled ?? 0) === 1);
  const [models, setModels] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Fetch available models on mount
  useEffect(() => {
    fetch('/api/models')
      .then(res => res.json())
      .then(data => {
        const list = Array.isArray(data.models) ? data.models : [];
        setModels(list);
      })
      .catch(() => setModels([]));
  }, []);

  // Sync state when catbrain prop changes
  useEffect(() => {
    setName(catbrain.name || '');
    setDescription(catbrain.description || '');
    setSystemPrompt(catbrain.system_prompt || '');
    setDefaultModel(catbrain.default_model || '');
    setMcpEnabled((catbrain.mcp_enabled ?? 0) === 1);
  }, [catbrain]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/catbrains/${catbrain.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          system_prompt: systemPrompt.trim() || null,
          default_model: defaultModel || null,
          mcp_enabled: mcpEnabled ? 1 : 0,
        }),
      });
      if (!res.ok) throw new Error('Error al guardar');
      toast.success('Configuracion guardada');
      onCatBrainUpdate();
    } catch {
      toast.error('Error al guardar la configuracion');
    } finally {
      setSaving(false);
    }
  };

  const mcpUrl = typeof window !== 'undefined'
    ? `http://${window.location.hostname}:3500/api/mcp/${catbrain.id}`
    : '';

  const handleCopyMcpUrl = async () => {
    try {
      await navigator.clipboard.writeText(mcpUrl);
      toast.success('URL copiada');
    } catch {
      toast.error('No se pudo copiar la URL');
    }
  };

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Informacion basica */}
      <section className="space-y-4">
        <h3 className="text-lg font-semibold text-zinc-50">Informacion basica</h3>
        <div className="space-y-3">
          <div>
            <Label htmlFor="config-name" className="text-zinc-300 text-sm">Nombre</Label>
            <Input
              id="config-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Nombre del CatBrain"
              className="mt-1 bg-zinc-900 border-zinc-700 text-zinc-50 focus:border-violet-500"
            />
          </div>
          <div>
            <Label htmlFor="config-desc" className="text-zinc-300 text-sm">Descripcion</Label>
            <Textarea
              id="config-desc"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Descripcion del CatBrain..."
              rows={2}
              className="mt-1 bg-zinc-900 border-zinc-700 text-zinc-50 focus:border-violet-500 resize-y"
            />
          </div>
        </div>
      </section>

      {/* System Prompt */}
      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-zinc-50">System Prompt</h3>
        <Textarea
          value={systemPrompt}
          onChange={e => setSystemPrompt(e.target.value)}
          placeholder="Instrucciones de personalidad para el CatBrain... (ej: Eres un experto en...)"
          className="bg-zinc-900 border-zinc-700 text-zinc-50 focus:border-violet-500 min-h-[120px] resize-y"
        />
        <p className="text-xs text-zinc-500">
          Este prompt se inyecta en cada interaccion LLM del CatBrain
        </p>
      </section>

      {/* Modelo LLM */}
      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-zinc-50">Modelo por defecto</h3>
        <select
          value={defaultModel}
          onChange={e => setDefaultModel(e.target.value)}
          className="w-full rounded-md bg-zinc-900 border border-zinc-700 text-zinc-50 px-3 py-2 text-sm focus:outline-none focus:border-violet-500"
        >
          <option value="">Automatico (modelo del sistema)</option>
          {models.map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </section>

      {/* MCP Endpoint */}
      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-zinc-50">MCP Endpoint</h3>
        <div className="flex items-center gap-3">
          <span className="text-sm text-zinc-400">Endpoint MCP</span>
          <div
            role="button"
            tabIndex={0}
            onClick={() => setMcpEnabled(!mcpEnabled)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setMcpEnabled(!mcpEnabled); }}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
              mcpEnabled ? 'bg-violet-600' : 'bg-zinc-700'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                mcpEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </div>
        </div>
        {mcpEnabled ? (
          <div className="flex items-center gap-2">
            <Input
              readOnly
              value={mcpUrl}
              className="bg-zinc-900 border-zinc-700 text-zinc-300 text-sm font-mono flex-1"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyMcpUrl}
              className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50 flex-shrink-0"
            >
              <Copy className="w-4 h-4 mr-1" />
              Copiar
            </Button>
          </div>
        ) : (
          <p className="text-sm text-zinc-500">Endpoint MCP desactivado</p>
        )}
      </section>

      {/* Guardar */}
      <div className="sticky bottom-0 pt-4 pb-2 bg-zinc-950">
        <Button
          onClick={handleSave}
          disabled={saving || !name.trim()}
          className="w-full bg-violet-600 hover:bg-violet-700 text-white"
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Guardando...
            </>
          ) : (
            'Guardar configuracion'
          )}
        </Button>
      </div>

      {/* Zona peligrosa */}
      <section className="space-y-3 border border-red-500/30 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-red-400">Zona peligrosa</h3>
        <p className="text-sm text-zinc-400">
          Eliminar este CatBrain y todos sus datos asociados. Esta accion no se puede deshacer.
        </p>
        <Button
          variant="destructive"
          onClick={onDelete}
          className="bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/30"
        >
          <Trash2 className="w-4 h-4 mr-2" />
          Eliminar CatBrain
        </Button>
      </section>
    </div>
  );
}
