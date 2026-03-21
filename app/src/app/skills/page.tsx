"use client";

import { useState, useEffect, useCallback } from 'react';
import { Skill } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Loader2, Sparkles, Plus, Pencil, Copy, Trash2, Search, Download, Upload, ChevronDown, ChevronRight, X, Bot } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

const CATEGORY_COLORS: Record<string, string> = {
  documentation: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
  analysis: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  communication: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  code: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  design: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
  format: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
};

const CATEGORY_KEYS = ['documentation', 'analysis', 'communication', 'code', 'design', 'format'] as const;

type FormState = {
  name: string; description: string; category: string; tags: string;
  instructions: string; output_template: string; example_input: string;
  example_output: string; constraints: string; version: string; author: string;
};

const emptyForm: FormState = {
  name: '', description: '', category: 'documentation', tags: '',
  instructions: '', output_template: '', example_input: '',
  example_output: '', constraints: '', version: '1.0', author: ''
};

export default function SkillsPage() {
  const t = useTranslations('skills');
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const [editSkill, setEditSkill] = useState<Skill | null>(null);
  const [showSheet, setShowSheet] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Skill | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [form, setForm] = useState<FormState>(emptyForm);
  const [showTemplate, setShowTemplate] = useState(false);
  const [showExamples, setShowExamples] = useState(false);
  const [showConstraints, setShowConstraints] = useState(false);

  // OpenClaw import
  const [showOpenClaw, setShowOpenClaw] = useState(false);
  const [openClawSkills, setOpenClawSkills] = useState<{ workspace: string; name: string; soul: string; agents_md: string; identity: string }[]>([]);
  const [openClawSelected, setOpenClawSelected] = useState<Set<number>>(new Set());
  const [loadingOpenClaw, setLoadingOpenClaw] = useState(false);
  const [importingOpenClaw, setImportingOpenClaw] = useState(false);

  const fetchSkills = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterCategory !== 'all') params.set('category', filterCategory);
      if (searchTerm) params.set('search', searchTerm);
      const res = await fetch(`/api/skills?${params}`);
      if (res.ok) setSkills(await res.json());
    } catch { /* silent */ } finally { setLoading(false); }
  }, [filterCategory, searchTerm]);

  useEffect(() => { fetchSkills(); }, [fetchSkills]);

  const parseTags = (s: Skill): string[] => {
    if (!s.tags) return [];
    try { return JSON.parse(s.tags); } catch { return []; }
  };

  const openCreate = () => {
    setEditSkill(null);
    setForm(emptyForm);
    setShowTemplate(false);
    setShowExamples(false);
    setShowConstraints(false);
    setShowSheet(true);
  };

  const openEdit = (s: Skill) => {
    setEditSkill(s);
    const tags = parseTags(s);
    setForm({
      name: s.name,
      description: s.description || '',
      category: s.category,
      tags: tags.join(', '),
      instructions: s.instructions,
      output_template: s.output_template || '',
      example_input: s.example_input || '',
      example_output: s.example_output || '',
      constraints: s.constraints || '',
      version: s.version,
      author: s.author || ''
    });
    setShowTemplate(!!s.output_template);
    setShowExamples(!!(s.example_input || s.example_output));
    setShowConstraints(!!s.constraints);
    setShowSheet(true);
  };

  const handleDuplicate = async (s: Skill) => {
    try {
      const res = await fetch('/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${s.name} (${t('copy')})`, description: s.description, category: s.category,
          tags: s.tags, instructions: s.instructions, output_template: s.output_template,
          example_input: s.example_input, example_output: s.example_output,
          constraints: s.constraints, version: s.version, author: s.author, source: 'user'
        })
      });
      if (!res.ok) throw new Error();
      toast.success(t('toasts.duplicated'));
      fetchSkills();
    } catch { toast.error(t('toasts.duplicateError')); }
  };

  const handleExport = (s: Skill) => {
    const exportData = {
      name: s.name, description: s.description, category: s.category,
      tags: s.tags ? JSON.parse(s.tags) : [], instructions: s.instructions,
      output_template: s.output_template, example_input: s.example_input,
      example_output: s.example_output, constraints: s.constraints,
      version: s.version, author: s.author
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `skill-${s.name.toLowerCase().replace(/\s+/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t('toasts.exported'));
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const skillsToImport = Array.isArray(data) ? data : [data];
      const res = await fetch('/api/skills/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skills: skillsToImport })
      });
      if (!res.ok) throw new Error();
      const result = await res.json();
      toast.success(t('toasts.importSuccess', { count: result.imported }));
      fetchSkills();
    } catch { toast.error(t('toasts.importError')); }
    e.target.value = '';
  };

  const handleOpenClawScan = async () => {
    setLoadingOpenClaw(true);
    setOpenClawSkills([]);
    setOpenClawSelected(new Set());
    try {
      const res = await fetch('/api/skills/openclaw');
      if (!res.ok) throw new Error();
      const data = await res.json();
      setOpenClawSkills(data.skills || []);
      setShowOpenClaw(true);
    } catch { toast.error(t('toasts.openclawScanError')); }
    finally { setLoadingOpenClaw(false); }
  };

  const handleOpenClawImport = async () => {
    if (openClawSelected.size === 0) return;
    setImportingOpenClaw(true);
    try {
      const skillsToImport = Array.from(openClawSelected).map(idx => {
        const oc = openClawSkills[idx];
        let instructions = '';
        if (oc.soul) instructions += oc.soul;
        if (oc.agents_md) instructions += (instructions ? '\n\n---\n\n' : '') + oc.agents_md;
        return {
          name: oc.name,
          description: `Importado desde OpenClaw workspace: ${oc.workspace}`,
          category: 'documentation',
          instructions: instructions || 'Sin instrucciones',
          source: 'openclaw',
          source_path: oc.workspace,
          version: '1.0',
          author: 'OpenClaw',
        };
      });
      const res = await fetch('/api/skills/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skills: skillsToImport })
      });
      if (!res.ok) throw new Error();
      const result = await res.json();
      toast.success(t('toasts.openclawImportSuccess', { count: result.imported }));
      setShowOpenClaw(false);
      fetchSkills();
    } catch { toast.error(t('toasts.openclawImportError')); }
    finally { setImportingOpenClaw(false); }
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.instructions.trim()) {
      toast.error(t('sheet.requiredFields'));
      return;
    }
    setSaving(true);
    try {
      const tags = form.tags.split(',').map(tg => tg.trim()).filter(Boolean);
      const payload = { ...form, tags };
      const url = editSkill ? `/api/skills/${editSkill.id}` : '/api/skills';
      const method = editSkill ? 'PATCH' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error();
      toast.success(editSkill ? t('toasts.updated') : t('toasts.created'));
      setShowSheet(false);
      fetchSkills();
    } catch { toast.error(t('toasts.saveError')); } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/skills/${deleteTarget.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      toast.success(t('toasts.deleted'));
      setDeleteTarget(null);
      fetchSkills();
    } catch { toast.error(t('toasts.deleteError')); } finally { setDeleting(false); }
  };

  const handleGenerate = async () => {
    if (!form.name.trim()) { toast.error(t('sheet.nameRequiredForGenerate')); return; }
    setGenerating(true);
    try {
      const res = await fetch('/api/skills/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, description: form.description, category: form.category })
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Error');
      const data = await res.json();
      setForm(prev => ({
        ...prev,
        instructions: data.instructions || prev.instructions,
        output_template: data.output_template || prev.output_template,
        example_input: data.example_input || prev.example_input,
        example_output: data.example_output || prev.example_output,
        constraints: data.constraints || prev.constraints,
        tags: Array.isArray(data.tags) ? data.tags.join(', ') : prev.tags,
      }));
      if (data.output_template) setShowTemplate(true);
      if (data.example_input || data.example_output) setShowExamples(true);
      if (data.constraints) setShowConstraints(true);
      toast.success(t('toasts.generatedAI'));
    } catch (e) { toast.error((e as Error).message); } finally { setGenerating(false); }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-8 animate-slide-up">
      <PageHeader
        title={t('title')}
        description={t('description')}
        icon={<Sparkles className="w-6 h-6" />}
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleOpenClawScan} disabled={loadingOpenClaw} className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50">
              {loadingOpenClaw ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Bot className="w-4 h-4 mr-2" />}
              OpenClaw
            </Button>
            <Button variant="outline" className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50 relative" onClick={() => (document.getElementById('skills-json-import') as HTMLInputElement)?.click()}>
              <input id="skills-json-import" type="file" accept=".json" onChange={handleImportFile} className="hidden" />
              <Upload className="w-4 h-4 mr-2" />{t('importJson')}
            </Button>
            <Button onClick={openCreate} className="bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white">
              <Plus className="w-4 h-4 mr-2" />
              {t('createSkill')}
            </Button>
          </div>
        }
      />

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <Input
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="pl-9 bg-zinc-900 border-zinc-800 text-zinc-50"
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="flex gap-1">
          <Button
            variant={filterCategory === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterCategory('all')}
            className={filterCategory === 'all' ? 'bg-violet-500/20 text-violet-400 border-violet-500/30' : 'bg-transparent border-zinc-700 text-zinc-400 hover:text-zinc-50'}
          >
            {t('filterAll')}
          </Button>
          {CATEGORY_KEYS.map((key) => (
            <Button
              key={key}
              variant={filterCategory === key ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterCategory(key)}
              className={filterCategory === key ? 'bg-violet-500/20 text-violet-400 border-violet-500/30' : 'bg-transparent border-zinc-700 text-zinc-400 hover:text-zinc-50'}
            >
              {t(`categories.${key}`)}
            </Button>
          ))}
        </div>
      </div>

      {/* Skills grid */}
      {skills.length === 0 ? (
        <div className="text-center py-20 border border-zinc-800 border-dashed rounded-lg">
          <Sparkles className="w-16 h-16 text-zinc-700 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-zinc-300 mb-2">
            {searchTerm || filterCategory !== 'all' ? t('noResults') : t('noSkills')}
          </h2>
          <p className="text-zinc-500 max-w-md mx-auto mb-6">
            {t('noSkillsDescription')}
          </p>
          {!searchTerm && filterCategory === 'all' && (
            <Button onClick={openCreate} className="bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white">
              <Plus className="w-4 h-4 mr-2" />
              {t('createFirst')}
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {skills.map(s => {
            const catColor = CATEGORY_COLORS[s.category] || CATEGORY_COLORS.documentation;
            const tags = parseTags(s);
            return (
              <div
                key={s.id}
                className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 hover:border-zinc-700 transition-colors group"
              >
                <div className="flex items-start justify-between mb-3">
                  <button onClick={() => openEdit(s)} className="text-left flex-1 min-w-0">
                    <h3 className="text-zinc-200 font-medium truncate group-hover:text-violet-400 transition-colors">{s.name}</h3>
                    <p className="text-zinc-500 text-sm line-clamp-2 mt-1">{s.description || t('noDescription')}</p>
                  </button>
                  <Badge variant="outline" className={`text-xs border ml-2 shrink-0 ${catColor}`}>
                    {t(`categories.${s.category}`)}
                  </Badge>
                </div>

                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {tags.slice(0, 4).map(tg => (
                      <span key={tg} className="text-xs px-1.5 py-0.5 bg-zinc-800 text-zinc-500 rounded">{tg}</span>
                    ))}
                    {tags.length > 4 && <span className="text-xs text-zinc-600">+{tags.length - 4}</span>}
                  </div>
                )}

                <div className="flex items-center justify-between pt-2 border-t border-zinc-800/50">
                  <div className="flex items-center gap-2 text-xs text-zinc-500">
                    <span>{t(`sources.${s.source}`)}</span>
                    <span className="text-zinc-700">·</span>
                    <span>v{s.version}</span>
                    <span className="text-zinc-700">·</span>
                    <span>{s.times_used} {t('uses')}</span>
                  </div>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(s)} className="h-7 w-7 p-0 text-zinc-400 hover:text-zinc-50">
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDuplicate(s)} className="h-7 w-7 p-0 text-zinc-400 hover:text-zinc-50">
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleExport(s)} className="h-7 w-7 p-0 text-zinc-400 hover:text-zinc-50">
                      <Download className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(s)} className="h-7 w-7 p-0 text-zinc-400 hover:text-red-400">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Sheet */}
      <Sheet open={showSheet} onOpenChange={setShowSheet}>
        <SheetContent side="right" className="w-[600px] sm:max-w-[600px] bg-zinc-950 border-zinc-800 overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle className="text-xl text-zinc-50">
              {editSkill ? t('sheet.editTitle') : t('sheet.createTitle')}
            </SheetTitle>
          </SheetHeader>

          <div className="space-y-6 pb-24">
            {/* Section 1: Identity */}
            <section className="space-y-3">
              <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">{t('sheet.identity')}</h3>
              <div>
                <Label className="text-xs text-zinc-500">{t('sheet.fields.name')}</Label>
                <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder={t('sheet.fields.namePlaceholder')} className="bg-zinc-900 border-zinc-800 text-zinc-50" />
              </div>
              <div>
                <Label className="text-xs text-zinc-500">{t('sheet.fields.description')}</Label>
                <Textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder={t('sheet.fields.descriptionPlaceholder')} className="bg-zinc-900 border-zinc-800 text-zinc-50 min-h-[60px]" rows={2} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-zinc-500">{t('sheet.fields.category')}</Label>
                  <Select value={form.category} onValueChange={v => v && setForm(p => ({ ...p, category: v }))}>
                    <SelectTrigger className="bg-zinc-900 border-zinc-800 text-zinc-50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-50">
                      {CATEGORY_KEYS.map((key) => (
                        <SelectItem key={key} value={key}>{t(`categories.${key}`)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-zinc-500">{t('sheet.fields.version')}</Label>
                  <Input value={form.version} onChange={e => setForm(p => ({ ...p, version: e.target.value }))} className="bg-zinc-900 border-zinc-800 text-zinc-50" />
                </div>
              </div>
              <div>
                <Label className="text-xs text-zinc-500">{t('sheet.fields.tags')}</Label>
                <Input value={form.tags} onChange={e => setForm(p => ({ ...p, tags: e.target.value }))} placeholder={t('sheet.fields.tagsPlaceholder')} className="bg-zinc-900 border-zinc-800 text-zinc-50" />
              </div>
            </section>

            {/* Section 2: Instructions */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">{t('sheet.instructions')}</h3>
                <Button variant="outline" size="sm" onClick={handleGenerate} disabled={generating} className="bg-transparent border-zinc-700 text-violet-400 hover:bg-violet-500/10 hover:text-violet-300 h-7">
                  {generating ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1.5" />}
                  {t('sheet.generateAI')}
                </Button>
              </div>
              <Textarea
                value={form.instructions}
                onChange={e => setForm(p => ({ ...p, instructions: e.target.value }))}
                placeholder={t('sheet.fields.instructionsPlaceholder')}
                className="bg-zinc-900 border-zinc-800 text-zinc-50 min-h-[200px] font-mono text-sm"
              />
            </section>

            {/* Section 3: Output Template (collapsible) */}
            <section>
              <button onClick={() => setShowTemplate(!showTemplate)} className="flex items-center gap-2 text-sm font-medium text-zinc-400 uppercase tracking-wider hover:text-zinc-300 transition-colors w-full">
                {showTemplate ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                {t('sheet.outputTemplate')}
              </button>
              {showTemplate && (
                <Textarea
                  value={form.output_template}
                  onChange={e => setForm(p => ({ ...p, output_template: e.target.value }))}
                  placeholder={t('sheet.fields.outputTemplatePlaceholder')}
                  className="bg-zinc-900 border-zinc-800 text-zinc-50 min-h-[120px] font-mono text-sm mt-3"
                />
              )}
            </section>

            {/* Section 4: Constraints (collapsible) */}
            <section>
              <button onClick={() => setShowConstraints(!showConstraints)} className="flex items-center gap-2 text-sm font-medium text-zinc-400 uppercase tracking-wider hover:text-zinc-300 transition-colors w-full">
                {showConstraints ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                {t('sheet.constraints')}
              </button>
              {showConstraints && (
                <Textarea
                  value={form.constraints}
                  onChange={e => setForm(p => ({ ...p, constraints: e.target.value }))}
                  placeholder={t('sheet.fields.constraintsPlaceholder')}
                  className="bg-zinc-900 border-zinc-800 text-zinc-50 min-h-[80px] font-mono text-sm mt-3"
                />
              )}
            </section>

            {/* Section 5: Examples (collapsible) */}
            <section>
              <button onClick={() => setShowExamples(!showExamples)} className="flex items-center gap-2 text-sm font-medium text-zinc-400 uppercase tracking-wider hover:text-zinc-300 transition-colors w-full">
                {showExamples ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                {t('sheet.examples')}
              </button>
              {showExamples && (
                <div className="space-y-3 mt-3">
                  <div>
                    <Label className="text-xs text-zinc-500">{t('sheet.fields.exampleInput')}</Label>
                    <Textarea value={form.example_input} onChange={e => setForm(p => ({ ...p, example_input: e.target.value }))} placeholder={t('sheet.fields.exampleInputPlaceholder')} className="bg-zinc-900 border-zinc-800 text-zinc-50 min-h-[80px] font-mono text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs text-zinc-500">{t('sheet.fields.exampleOutput')}</Label>
                    <Textarea value={form.example_output} onChange={e => setForm(p => ({ ...p, example_output: e.target.value }))} placeholder={t('sheet.fields.exampleOutputPlaceholder')} className="bg-zinc-900 border-zinc-800 text-zinc-50 min-h-[80px] font-mono text-sm" />
                  </div>
                </div>
              )}
            </section>

            {/* Author */}
            <section>
              <div>
                <Label className="text-xs text-zinc-500">{t('sheet.fields.author')}</Label>
                <Input value={form.author} onChange={e => setForm(p => ({ ...p, author: e.target.value }))} placeholder={t('sheet.fields.authorPlaceholder')} className="bg-zinc-900 border-zinc-800 text-zinc-50" />
              </div>
            </section>
          </div>

          {/* Sticky footer */}
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-zinc-950 border-t border-zinc-800 flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowSheet(false)} className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50">
              {t('sheet.cancel')}
            </Button>
            <Button onClick={handleSave} disabled={saving} className="bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white">
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editSkill ? t('sheet.saveChanges') : t('sheet.createTitle')}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Delete dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <DialogContent className="bg-zinc-950 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-xl text-zinc-50">{t('delete.title', { name: deleteTarget?.name || '' })}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-zinc-400">{t('delete.confirm')}</p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50">{t('sheet.cancel')}</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting} className="bg-red-500/20 text-red-500 hover:bg-red-500/30 border border-red-500/20">
              {deleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t('delete.button')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* OpenClaw import dialog */}
      <Dialog open={showOpenClaw} onOpenChange={setShowOpenClaw}>
        <DialogContent className="max-w-2xl bg-zinc-950 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-xl text-zinc-50 flex items-center gap-2">
              <Bot className="w-5 h-5 text-violet-500" />
              {t('openclaw.title')}
            </DialogTitle>
          </DialogHeader>
          {openClawSkills.length === 0 ? (
            <div className="text-center py-8 text-zinc-500">
              <Bot className="w-12 h-12 text-zinc-700 mx-auto mb-3" />
              <p>{t('openclaw.noWorkspaces')}</p>
              <p className="text-xs mt-1">{t('openclaw.verifyPath')}</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {openClawSkills.map((oc, idx) => (
                <label
                  key={oc.workspace}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    openClawSelected.has(idx) ? 'border-violet-500/40 bg-violet-500/5' : 'border-zinc-800 hover:border-zinc-700'
                  }`}
                >
                  <Checkbox
                    checked={openClawSelected.has(idx)}
                    onCheckedChange={(checked) => {
                      const next = new Set(openClawSelected);
                      if (checked) next.add(idx); else next.delete(idx);
                      setOpenClawSelected(next);
                    }}
                    className="mt-0.5 border-zinc-600 data-[state=checked]:bg-violet-500 data-[state=checked]:border-violet-500"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-200">{oc.name}</p>
                    <p className="text-xs text-zinc-500 font-mono">{oc.workspace}</p>
                    {oc.soul && <p className="text-xs text-zinc-400 mt-1 line-clamp-2">{oc.soul.substring(0, 150)}...</p>}
                  </div>
                </label>
              ))}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowOpenClaw(false)} className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50">
              {t('openclaw.cancel')}
            </Button>
            <Button onClick={handleOpenClawImport} disabled={importingOpenClaw || openClawSelected.size === 0} className="bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white">
              {importingOpenClaw && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t('openclaw.import')} {openClawSelected.size > 0 ? `(${openClawSelected.size})` : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
