"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Loader2, Bot, AlertCircle } from 'lucide-react';
import Image from 'next/image';
import { SourceManager } from '@/components/sources/source-manager';
import { HelpText } from '@/components/ui/help-text';
import { AgentCreator } from '@/components/agents/agent-creator';

interface Agent {
  id: string;
  name: string;
  model: string;
  description: string;
  emoji: string;
}

export default function NewCatBrain() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [catbrainId, setCatbrainId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    purpose: '',
    tech_stack: ''
  });

  const [errors, setErrors] = useState({
    name: false,
    purpose: false
  });

  const [agents, setAgents] = useState<Agent[]>([]);
  const [isFallback, setIsFallback] = useState(false);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [agentsError, setAgentsError] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<string>('none');
  const [models, setModels] = useState<string[]>([]);

  useEffect(() => {
    if (step === 3 && agents.length === 0) {
      const fetchData = async () => {
        setLoadingAgents(true);
        setAgentsError(false);
        try {
          const [agentsRes, healthRes] = await Promise.all([
            fetch('/api/agents'),
            fetch('/api/health'),
          ]);
          if (!agentsRes.ok) throw new Error('Failed to fetch agents');
          const data = await agentsRes.json();
          if (data.fallback) {
            setIsFallback(true);
            setAgents(data.agents || []);
          } else {
            setAgents(Array.isArray(data) ? data : []);
          }
          if (healthRes.ok) {
            const healthData = await healthRes.json();
            if (healthData.litellm?.models) setModels(healthData.litellm.models);
          }
        } catch (error) {
          console.error('Error fetching agents:', error);
          setAgentsError(true);
        } finally {
          setLoadingAgents(false);
        }
      };
      fetchData();
    }
  }, [step, agents.length]);

  const handleCreateDraft = async () => {
    try {
      setLoading(true);

      const techStackArray = formData.tech_stack
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0);

      const res = await fetch('/api/catbrains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          tech_stack: techStackArray.length > 0 ? techStackArray : null,
          status: 'draft'
        })
      });

      if (!res.ok) throw new Error('Error al crear el CatBrain');

      const catbrain = await res.json();
      setCatbrainId(catbrain.id);
      return catbrain.id;
    } catch (error) {
      toast.error('Error al crear el CatBrain');
      console.error(error);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const handleNext = async () => {
    if (step === 1) {
      const newErrors = {
        name: !formData.name.trim(),
        purpose: !formData.purpose.trim()
      };

      setErrors(newErrors);

      if (newErrors.name || newErrors.purpose) {
        return;
      }

      if (!catbrainId) {
        const id = await handleCreateDraft();
        if (!id) return;
      } else {
        // Update existing draft
        const techStackArray = formData.tech_stack
          .split(',')
          .map(t => t.trim())
          .filter(t => t.length > 0);

        await fetch(`/api/catbrains/${catbrainId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...formData,
            tech_stack: techStackArray.length > 0 ? techStackArray : null,
          })
        });
      }
    }

    setStep(step + 1);
  };

  const handleFinish = async () => {
    try {
      setLoading(true);

      await fetch(`/api/catbrains/${catbrainId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: selectedAgent === 'none' ? null : selectedAgent,
          status: 'sources_added'
        })
      });

      toast.success('CatBrain creado correctamente');
      router.push(`/catbrains/${catbrainId}`);
    } catch (error) {
      toast.error('Error al finalizar el CatBrain');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Image src="/Images/icon/ico_catbrain.png" alt="CatBrain" width={32} height={32} />
          <h1 className="text-3xl font-bold text-zinc-50">Nuevo CatBrain</h1>
        </div>
        <p className="text-zinc-400">Configura los detalles basicos de tu CatBrain de documentacion.</p>
      </div>

      <div className="flex items-center justify-between mb-8 relative max-w-2xl mx-auto">
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-0.5 bg-zinc-800 -z-10"></div>
        {[
          { num: 1, label: 'Informacion' },
          { num: 2, label: 'Fuentes' },
          { num: 3, label: 'Agente IA' }
        ].map((s) => (
          <div key={s.num} className="flex flex-col items-center gap-2 bg-zinc-950 px-2">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm transition-colors ${
                step === s.num
                  ? 'bg-violet-500 text-white'
                  : step > s.num
                    ? 'bg-emerald-500 text-white'
                    : 'bg-zinc-900 text-zinc-500 border-2 border-zinc-800'
              }`}
            >
              {s.num}
            </div>
            <span className={`text-xs font-medium ${step >= s.num ? 'text-zinc-300' : 'text-zinc-600'}`}>
              {s.label}
            </span>
          </div>
        ))}
      </div>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-xl text-zinc-50">
              {step === 1 && 'Informacion Basica'}
              {step === 2 && 'Anadir Fuentes'}
              {step === 3 && 'Asignar Agente IA'}
            </CardTitle>
            <div className="mt-2">
              {step === 1 && <HelpText text="Define los datos basicos del CatBrain. El nombre y la finalidad son obligatorios." />}
              {step === 2 && <HelpText text="Sube todos los materiales que quieres que el agente analice. Puedes mezclar archivos, URLs, videos de YouTube y notas manuales." />}
              {step === 3 && <HelpText text="Selecciona el agente que procesara tu documentacion. Cada agente esta especializado en un tipo de analisis diferente." />}
            </div>
        </CardHeader>
        <CardContent>
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Nombre del CatBrain <span className="text-red-500">*</span>
                </label>
                <Input
                  value={formData.name}
                  onChange={(e) => {
                    setFormData({...formData, name: e.target.value});
                    if (errors.name) setErrors({...errors, name: false});
                  }}
                  placeholder="Ej: Documentacion API Pagos"
                  className={`bg-zinc-950 border-zinc-800 text-zinc-50 ${errors.name ? 'border-red-500' : ''}`}
                  maxLength={100}
                />
                {errors.name && <p className="text-red-500 text-xs mt-1">El nombre es obligatorio</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Descripcion
                </label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  placeholder="Describe brevemente de que trata..."
                  className="bg-zinc-950 border-zinc-800 text-zinc-50 resize-none"
                  rows={3}
                  maxLength={500}
                />
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2">
                    <label className="block text-sm font-medium text-zinc-300">
                      Finalidad <span className="text-red-500">*</span>
                    </label>
                    <HelpText text="Describe que quieres conseguir con este CatBrain. El agente IA usara esta informacion para entender el contexto." />
                  </div>
                <Textarea
                  value={formData.purpose}
                  onChange={(e) => {
                    setFormData({...formData, purpose: e.target.value});
                    if (errors.purpose) setErrors({...errors, purpose: false});
                  }}
                  placeholder="Que quieres conseguir. Ej: Generar un documento de vision..."
                  className={`bg-zinc-950 border-zinc-800 text-zinc-50 resize-none ${errors.purpose ? 'border-red-500' : ''}`}
                  rows={4}
                  maxLength={1000}
                />
                {errors.purpose && <p className="text-red-500 text-xs mt-1">La finalidad es obligatoria</p>}
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2">
                    <label className="block text-sm font-medium text-zinc-300">
                      Stack tecnologico
                    </label>
                    <HelpText text="Opcional. Si el CatBrain tiene un stack tecnico, indicarlo ayuda al agente a generar documentacion mas precisa." />
                  </div>
                <Input
                  value={formData.tech_stack}
                  onChange={(e) => setFormData({...formData, tech_stack: e.target.value})}
                  placeholder="Ej: Next.js, PostgreSQL, Docker (separados por comas)"
                  className="bg-zinc-950 border-zinc-800 text-zinc-50"
                />
              </div>
            </div>
          )}

          {step === 2 && catbrainId && (
            <SourceManager projectId={catbrainId} />
          )}

          {step === 3 && (
            <div className="space-y-6">
              {loadingAgents ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-violet-500 mb-4" />
                  <p className="text-zinc-400">Cargando agentes disponibles...</p>
                </div>
              ) : agentsError || (agents.length === 0 && !isFallback) ? (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-6 text-center">
                  <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-zinc-50 mb-2">No se encontraron agentes</h3>
                  <p className="text-zinc-400 mb-6">
                    No hay agentes disponibles. Configura agentes en OpenClaw o anade OPENCLAW_AGENTS en el .env
                  </p>
                  <Button
                    onClick={() => {
                      setSelectedAgent('none');
                      handleFinish();
                    }}
                    className="bg-zinc-800 hover:bg-zinc-700 text-zinc-50"
                  >
                    Continuar sin agente
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {isFallback && agents.length > 0 && (
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 text-sm text-amber-400">
                      No se pudieron obtener los agentes desde OpenClaw. Mostrando agentes configurados manualmente.
                    </div>
                  )}
                  <RadioGroup value={selectedAgent} onValueChange={setSelectedAgent} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {agents.map((agent) => (
                      <div key={agent.id}>
                        <RadioGroupItem value={agent.id} id={agent.id} className="peer sr-only" />
                        <Label
                          htmlFor={agent.id}
                          className="flex flex-col gap-2 p-4 border border-zinc-800 rounded-lg cursor-pointer bg-zinc-950 hover:bg-zinc-900 peer-data-[state=checked]:border-violet-500 peer-data-[state=checked]:bg-violet-500/5 transition-all"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-2xl">{agent.emoji}</span>
                              <span className="font-semibold text-zinc-50">{agent.name}</span>
                            </div>
                            <Badge variant="secondary" className="bg-zinc-800 text-zinc-300 border-0">
                              {agent.model}
                            </Badge>
                          </div>
                          <p className="text-sm text-zinc-400">{agent.description}</p>
                        </Label>
                      </div>
                    ))}
                  </div>

                  {/* Create custom agent */}
                  <AgentCreator
                    projectName={formData.name}
                    projectDescription={formData.description}
                    projectPurpose={formData.purpose}
                    projectTechStack={formData.tech_stack}
                    models={models}
                    onAgentCreated={(agent) => {
                      setAgents(prev => [...prev, { ...agent, description: agent.description || '' }]);
                      setSelectedAgent(agent.id);
                    }}
                  />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <RadioGroupItem value="none" id="none" className="peer sr-only" />
                      <Label
                        htmlFor="none"
                        className="flex flex-col gap-2 p-4 border border-zinc-800 rounded-lg cursor-pointer bg-zinc-950 hover:bg-zinc-900 peer-data-[state=checked]:border-zinc-500 peer-data-[state=checked]:bg-zinc-800/50 transition-all h-full justify-center"
                      >
                        <div className="flex items-center gap-2">
                          <Bot className="w-6 h-6 text-zinc-500" />
                          <span className="font-semibold text-zinc-50">Sin agente por ahora</span>
                        </div>
                        <p className="text-sm text-zinc-400">Podras asignar uno mas adelante antes de procesar.</p>
                      </Label>
                    </div>
                  </div>
                </RadioGroup>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-between mt-8 pt-6 border-t border-zinc-800">
            {step > 1 ? (
              <Button
                variant="outline"
                onClick={() => setStep(step - 1)}
                className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50"
              >
                Anterior
              </Button>
            ) : (
              <div></div>
            )}

            <div className="flex gap-3">
              {step === 1 && (
                <Button
                  variant="secondary"
                  onClick={async () => {
                    const id = await handleCreateDraft();
                    if (id) {
                      toast.success('Borrador guardado');
                      router.push(`/catbrains/${id}`);
                    }
                  }}
                  disabled={loading || (!formData.name.trim() || !formData.purpose.trim())}
                  className="bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                >
                  Guardar borrador
                </Button>
              )}

              {step < 3 ? (
                <Button
                  onClick={handleNext}
                  disabled={loading}
                  className="bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white"
                >
                  {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Siguiente
                </Button>
              ) : (
                <Button
                  onClick={handleFinish}
                  disabled={loading || (agentsError && selectedAgent !== 'none')}
                  className="bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white"
                >
                  {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Crear CatBrain
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
