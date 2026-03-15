"use client";

import Link from 'next/link';
import { AlertTriangle, FileOutput, PawPrint } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default function WorkersPage() {
  return (
    <div className="max-w-6xl mx-auto p-8 animate-slide-up">
      <PageHeader
        title="Docs Workers"
        description="Procesadores de documentos estructurados."
        icon={<FileOutput className="w-6 h-6" />}
      />

      <div className="flex items-center justify-center mt-12">
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 max-w-lg text-center space-y-5">
          <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto" />
          <h2 className="text-xl font-semibold text-zinc-50">
            Docs Workers migrados a CatPaws
          </h2>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Los procesadores de documentos ahora son CatPaws con modo procesador.
            Todos tus workers existentes han sido migrados automaticamente.
          </p>
          <div className="flex justify-center">
            <Badge variant="outline" className="text-xs bg-teal-500/10 text-teal-400 border-teal-500/20">
              <PawPrint className="w-3 h-3 mr-1" />
              processor
            </Badge>
          </div>
          <Link href="/agents?mode=processor">
            <Button className="bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white gap-2 mt-2">
              <PawPrint className="w-4 h-4" />
              Ver procesadores en Agentes
            </Button>
          </Link>
          <p className="text-xs text-zinc-500">
            Puedes crear nuevos procesadores desde la pagina de Agentes.
          </p>
        </div>
      </div>
    </div>
  );
}
