'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Loader2, Save } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import TemplateEditor from '@/components/templates/template-editor';
import type { EmailTemplate, TemplateStructure } from '@/lib/types';

const categories = ['general', 'corporate', 'commercial', 'report', 'notification'] as const;

export default function TemplateEditorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const t = useTranslations('catpower');
  const [template, setTemplate] = useState<EmailTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('general');
  const [metaSaving, setMetaSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/email-templates/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error('Not found');
        return r.json();
      })
      .then((data: EmailTemplate) => {
        setTemplate(data);
        setName(data.name);
        setDescription(data.description || '');
        setCategory(data.category);
      })
      .catch(() => router.push('/catpower/templates'))
      .finally(() => setLoading(false));
  }, [id, router]);

  const handleSaveStructure = useCallback(
    async (structure: TemplateStructure) => {
      await fetch(`/api/email-templates/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ structure }),
      });
    },
    [id]
  );

  const handleSaveMeta = useCallback(async () => {
    setMetaSaving(true);
    try {
      await fetch(`/api/email-templates/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, category }),
      });
    } finally {
      setMetaSaving(false);
    }
  }, [id, name, description, category]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
      </div>
    );
  }

  if (!template) return null;

  let parsedStructure: TemplateStructure;
  try {
    parsedStructure =
      typeof template.structure === 'string'
        ? JSON.parse(template.structure)
        : template.structure;
  } catch {
    parsedStructure = {
      sections: { header: { rows: [] }, body: { rows: [] }, footer: { rows: [] } },
      styles: {
        backgroundColor: '#ffffff',
        fontFamily: 'Arial, sans-serif',
        primaryColor: '#7C3AED',
        textColor: '#333333',
        maxWidth: 600,
      },
    };
  }

  return (
    <div className="flex flex-col h-[calc(100vh-120px)]">
      {/* Toolbar */}
      <div className="border-b border-zinc-800 bg-zinc-950/80 px-4 py-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={() => router.push('/catpower/templates')}
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>

          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="bg-zinc-900 border-zinc-700 text-zinc-100 font-semibold max-w-xs"
            placeholder={t('templates.metadata.name')}
          />

          <Select value={category} onValueChange={(v) => { if (v) setCategory(v); }}>
            <SelectTrigger className="bg-zinc-900 border-zinc-700 text-zinc-300 w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-700">
              {categories.map((cat) => (
                <SelectItem key={cat} value={cat} className="text-zinc-300">
                  {t(`templates.metadata.categories.${cat}` as Parameters<typeof t>[0])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="bg-zinc-900 border-zinc-700 text-zinc-300 flex-1"
            placeholder={t('templates.metadata.description')}
          />

          <Button
            onClick={handleSaveMeta}
            disabled={metaSaving}
            className="bg-violet-600 hover:bg-violet-700 text-white shrink-0"
          >
            {metaSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            {t('templates.save')}
          </Button>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-y-auto p-4">
        <TemplateEditor
          templateId={id}
          initialStructure={parsedStructure}
          onSave={handleSaveStructure}
        />
      </div>
    </div>
  );
}
