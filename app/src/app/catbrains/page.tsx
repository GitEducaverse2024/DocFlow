"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { FolderOpen, Loader2, Plus, Search } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/layout/page-header';
import { Project } from '@/lib/types';

export default function CatBrainsList() {
  const [catbrains, setCatbrains] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const fetchCatBrains = async () => {
      try {
        const res = await fetch('/api/catbrains?limit=100');
        const data = await res.json();
        setCatbrains(data.data || []);
      } catch (error) {
        console.error('Error fetching catbrains:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchCatBrains();
  }, []);

  const filteredCatBrains = catbrains.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.description && p.description.toLowerCase().includes(search.toLowerCase()))
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-zinc-500';
      case 'sources_added': return 'bg-blue-500';
      case 'processing': return 'bg-amber-500';
      case 'processed': return 'bg-emerald-500';
      case 'rag_indexed': return 'bg-violet-500';
      default: return 'bg-zinc-500';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'draft': return 'Borrador';
      case 'sources_added': return 'Fuentes Anadidas';
      case 'processing': return 'Procesando';
      case 'processed': return 'Procesado';
      case 'rag_indexed': return 'RAG Activo';
      default: return status;
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <PageHeader
        title="CatBrains"
        description="Gestiona tus CatBrains de documentacion"
        icon={
          <Image
            src="/Images/icon/ico_catbrain.png"
            alt="CatBrain"
            width={120}
            height={120}
            className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 lg:w-28 lg:h-28"
          />
        }
        action={
          <Link href="/catbrains/new">
            <Button className="bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white gap-2">
              <Plus className="w-4 h-4" />
              Nuevo CatBrain
            </Button>
          </Link>
        }
      />

      <div className="mb-6 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
        <Input
          placeholder="Buscar CatBrains..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 bg-zinc-900 border-zinc-800 text-zinc-50"
        />
      </div>

      {filteredCatBrains.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-12 text-center">
          <FolderOpen className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-zinc-300 mb-2">No se encontraron CatBrains</h3>
          <p className="text-zinc-500 mb-6">
            {search ? 'Intenta con otros terminos de busqueda.' : 'Aun no has creado ningun CatBrain.'}
          </p>
          {!search && (
            <Link href="/catbrains/new">
              <Button variant="outline" className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50">
                Crear mi primer CatBrain
              </Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCatBrains.map(catbrain => (
            <Card key={catbrain.id} className="bg-zinc-900 border-zinc-800 hover:border-zinc-700 transition-colors flex flex-col">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2">
                    <Image src="/Images/icon/ico_catbrain.png" alt="CatBrain" width={24} height={24} />
                    <CardTitle className="text-lg text-zinc-50 truncate pr-2" title={catbrain.name}>
                      {catbrain.name}
                    </CardTitle>
                  </div>
                  <Badge className={`${getStatusColor(catbrain.status)} text-white border-0 whitespace-nowrap`}>
                    {getStatusLabel(catbrain.status)}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col">
                <p className="text-sm text-zinc-400 line-clamp-2 mb-4 flex-1">
                  {catbrain.description || 'Sin descripcion'}
                </p>
                <div className="flex items-center justify-between mt-auto pt-4 border-t border-zinc-800/50">
                  <span className="text-xs text-zinc-500" suppressHydrationWarning>
                    Actualizado: {new Date(catbrain.updated_at).toLocaleDateString()}
                  </span>
                  <Link href={`/catbrains/${catbrain.id}`}>
                    <Button variant="secondary" size="sm" className="bg-zinc-800 text-zinc-300 hover:bg-zinc-700">
                      Ver Detalles
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
