"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

export default function NewProject() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  
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

  const handleNext = () => {
    if (step === 1) {
      const newErrors = {
        name: !formData.name.trim(),
        purpose: !formData.purpose.trim()
      };
      
      setErrors(newErrors);
      
      if (newErrors.name || newErrors.purpose) {
        return;
      }
    }
    
    setStep(step + 1);
  };

  const handleCreate = async (status: 'draft' | 'sources_added' = 'draft') => {
    try {
      setLoading(true);
      
      const techStackArray = formData.tech_stack
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0);

      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          tech_stack: techStackArray.length > 0 ? techStackArray : null,
          status
        })
      });

      if (!res.ok) throw new Error('Error al crear el proyecto');

      const project = await res.json();
      toast.success('Proyecto creado correctamente');
      router.push(`/projects/${project.id}`);
    } catch (error) {
      toast.error('Error al crear el proyecto');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-zinc-50 mb-2">Nuevo Proyecto</h1>
        <p className="text-zinc-400">Configura los detalles básicos de tu proyecto de documentación.</p>
      </div>

      <div className="flex items-center justify-between mb-8 relative">
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-0.5 bg-zinc-800 -z-10"></div>
        {[1, 2, 3].map((s) => (
          <div 
            key={s}
            className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm transition-colors ${
              step === s 
                ? 'bg-violet-500 text-white' 
                : step > s 
                  ? 'bg-emerald-500 text-white' 
                  : 'bg-zinc-900 text-zinc-500 border-2 border-zinc-800'
            }`}
          >
            {s}
          </div>
        ))}
      </div>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-xl text-zinc-50">
            {step === 1 && 'Información Básica'}
            {step === 2 && 'Fuentes (Próximamente)'}
            {step === 3 && 'Agente IA (Próximamente)'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Nombre del proyecto <span className="text-red-500">*</span>
                </label>
                <Input 
                  value={formData.name}
                  onChange={(e) => {
                    setFormData({...formData, name: e.target.value});
                    if (errors.name) setErrors({...errors, name: false});
                  }}
                  placeholder="Ej: Documentación API Pagos"
                  className={`bg-zinc-950 border-zinc-800 text-zinc-50 ${errors.name ? 'border-red-500' : ''}`}
                  maxLength={100}
                />
                {errors.name && <p className="text-red-500 text-xs mt-1">El nombre es obligatorio</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Descripción
                </label>
                <Textarea 
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  placeholder="Describe brevemente de qué trata..."
                  className="bg-zinc-950 border-zinc-800 text-zinc-50 resize-none"
                  rows={3}
                  maxLength={500}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Finalidad <span className="text-red-500">*</span>
                </label>
                <Textarea 
                  value={formData.purpose}
                  onChange={(e) => {
                    setFormData({...formData, purpose: e.target.value});
                    if (errors.purpose) setErrors({...errors, purpose: false});
                  }}
                  placeholder="Qué quieres conseguir. Ej: Generar un documento de visión..."
                  className={`bg-zinc-950 border-zinc-800 text-zinc-50 resize-none ${errors.purpose ? 'border-red-500' : ''}`}
                  rows={4}
                  maxLength={1000}
                />
                {errors.purpose && <p className="text-red-500 text-xs mt-1">La finalidad es obligatoria</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Stack tecnológico
                </label>
                <Input 
                  value={formData.tech_stack}
                  onChange={(e) => setFormData({...formData, tech_stack: e.target.value})}
                  placeholder="Ej: Next.js, PostgreSQL, Docker (separados por comas)"
                  className="bg-zinc-950 border-zinc-800 text-zinc-50"
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="py-12 text-center text-zinc-400">
              <p className="mb-4">La gestión de fuentes se implementará en la siguiente fase.</p>
              <p>Por ahora, puedes guardar el proyecto y añadir fuentes más tarde.</p>
            </div>
          )}

          {step === 3 && (
            <div className="py-12 text-center text-zinc-400">
              <p className="mb-4">La asignación de agentes se implementará en la siguiente fase.</p>
              <p>Por ahora, puedes crear el proyecto sin agente.</p>
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
              <Button 
                variant="secondary" 
                onClick={() => handleCreate('draft')}
                disabled={loading || (step === 1 && (!formData.name.trim() || !formData.purpose.trim()))}
                className="bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
              >
                Guardar borrador
              </Button>
              
              {step < 3 ? (
                <Button 
                  onClick={handleNext}
                  className="bg-violet-500 hover:bg-violet-400 text-white"
                >
                  Siguiente
                </Button>
              ) : (
                <Button 
                  onClick={() => handleCreate('draft')}
                  disabled={loading}
                  className="bg-violet-500 hover:bg-violet-400 text-white"
                >
                  {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Crear Proyecto
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
