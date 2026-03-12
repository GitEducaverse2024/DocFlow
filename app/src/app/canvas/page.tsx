"use client";

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Loader2, Workflow, Plus } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { CanvasCard } from '@/components/canvas/canvas-card';
import { CanvasWizard } from '@/components/canvas/canvas-wizard';
import { toast } from 'sonner';

interface CanvasListItem {
  id: string;
  name: string;
  emoji: string;
  description: string | null;
  mode: 'agents' | 'projects' | 'mixed';
  status: string;
  thumbnail: string | null;
  tags: string | null;
  is_template: number;
  node_count: number;
  created_at: string;
  updated_at: string;
}

interface CanvasTemplate {
  id: string;
  name: string;
  emoji: string;
  description: string | null;
  preview_svg: string | null;
  category: string;
  times_used: number;
  created_at: string;
}

type FilterKey = 'all' | 'agents' | 'projects' | 'mixed' | 'templates';

export default function CanvasPage() {
  const router = useRouter();
  const [canvases, setCanvases] = useState<CanvasListItem[]>([]);
  const [templates, setTemplates] = useState<CanvasTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [selectedTemplateForWizard, setSelectedTemplateForWizard] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [canvasRes, templatesRes] = await Promise.all([
        fetch('/api/canvas'),
        fetch('/api/canvas/templates'),
      ]);
      if (canvasRes.ok) setCanvases(await canvasRes.json());
      if (templatesRes.ok) setTemplates(await templatesRes.json());
    } catch {
      toast.error('Error al cargar canvas');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const counts = {
    all: canvases.filter(c => c.is_template === 0).length,
    agents: canvases.filter(c => c.mode === 'agents' && c.is_template === 0).length,
    projects: canvases.filter(c => c.mode === 'projects' && c.is_template === 0).length,
    mixed: canvases.filter(c => c.mode === 'mixed' && c.is_template === 0).length,
    templates: templates.length,
  };

  const filteredCanvases = canvases.filter(c => {
    if (filter === 'all') return c.is_template === 0;
    if (filter === 'agents') return c.mode === 'agents' && c.is_template === 0;
    if (filter === 'projects') return c.mode === 'projects' && c.is_template === 0;
    if (filter === 'mixed') return c.mode === 'mixed' && c.is_template === 0;
    if (filter === 'templates') return c.is_template === 1;
    return true;
  });

  const filterItems: { key: FilterKey; label: string }[] = [
    { key: 'all', label: 'Todos' },
    { key: 'agents', label: 'Agentes' },
    { key: 'projects', label: 'Proyectos' },
    { key: 'mixed', label: 'Mixtos' },
    { key: 'templates', label: 'Plantillas' },
  ];

  async function handleDelete(id: string) {
    if (!window.confirm('¿Seguro que deseas eliminar este canvas?')) return;
    try {
      const res = await fetch(`/api/canvas/${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Canvas eliminado');
        fetchData();
      } else {
        toast.error('Error al eliminar canvas');
      }
    } catch {
      toast.error('Error al eliminar canvas');
    }
  }

  function handleCreated(id: string) {
    setWizardOpen(false);
    fetchData();
    router.push(`/canvas/${id}`);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-8 animate-slide-up">
      <PageHeader
        title="Canvas"
        description="Diseña y ejecuta workflows visuales de agentes y proyectos."
        icon={<Workflow className="w-6 h-6" />}
        action={
          <Button
            onClick={() => setWizardOpen(true)}
            className="bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nuevo
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex items-center gap-1 mb-6">
        {filterItems.map(f => (
          <Button
            key={f.key}
            variant={filter === f.key ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter(f.key)}
            className={filter === f.key
              ? 'bg-violet-500/20 text-violet-400 border-violet-500/30'
              : 'bg-transparent border-zinc-700 text-zinc-400 hover:text-zinc-50'}
          >
            {f.label} ({counts[f.key]})
          </Button>
        ))}
      </div>

      {/* Canvas grid or empty state */}
      {filteredCanvases.length === 0 && filter === 'all' ? (
        <div className="text-center py-20 border border-zinc-800 border-dashed rounded-lg">
          <Workflow className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-zinc-300 mb-2">No hay canvas creados</h2>
          <p className="text-zinc-500 max-w-md mx-auto mb-6">
            Crea tu primer workflow visual o pidele ayuda a CatBot
          </p>
          <Button
            onClick={() => setWizardOpen(true)}
            className="bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            Crear Canvas
          </Button>
          <div className="mt-3">
            <span className="text-zinc-500 text-sm cursor-pointer hover:text-zinc-300 transition-colors">
              o preguntale a CatBot
            </span>
          </div>
        </div>
      ) : filteredCanvases.length === 0 ? (
        <div className="text-center py-12 text-zinc-500">
          No se encontraron canvas con este filtro
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredCanvases.map(canvas => (
            <CanvasCard
              key={canvas.id}
              canvas={canvas}
              onEdit={(id) => router.push(`/canvas/${id}`)}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Templates section */}
      {templates.length > 0 && (
        <div className="mt-12">
          <div className="mb-4">
            <h2 className="text-xl font-semibold text-zinc-200">Plantillas</h2>
            <p className="text-zinc-500 text-sm mt-1">Comienza rapido con una plantilla pre-configurada.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {templates.map(tmpl => (
              <div
                key={tmpl.id}
                className="bg-zinc-900 border border-zinc-800 rounded-xl hover:border-zinc-700 transition-colors flex flex-col overflow-hidden"
              >
                {/* Preview */}
                <div className="w-full h-[100px] bg-zinc-950 flex items-center justify-center overflow-hidden">
                  {tmpl.preview_svg ? (
                    <img
                      src={`data:image/svg+xml,${encodeURIComponent(tmpl.preview_svg)}`}
                      alt={`Vista previa de ${tmpl.name}`}
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="w-full h-full bg-zinc-800/50 flex items-center justify-center">
                      <span className="text-3xl opacity-30">{tmpl.emoji}</span>
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">{tmpl.emoji}</span>
                    <h3 className="font-medium text-zinc-200 truncate flex-1">{tmpl.name}</h3>
                  </div>
                  {tmpl.description && (
                    <p className="text-sm text-zinc-500 line-clamp-2 mb-3">{tmpl.description}</p>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-zinc-500">{tmpl.times_used} usos</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { setSelectedTemplateForWizard(tmpl.id); setWizardOpen(true); }}
                      className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50 h-7"
                    >
                      Usar
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <CanvasWizard
        open={wizardOpen}
        onClose={() => { setWizardOpen(false); setSelectedTemplateForWizard(null); }}
        onCreated={handleCreated}
        initialMode={selectedTemplateForWizard ? 'template' : undefined}
        initialTemplateId={selectedTemplateForWizard || undefined}
      />
    </div>
  );
}
