"use client";

import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { Skill } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  Loader2, Sparkles, Plus, Pencil, Copy, Trash2, Search, Download, Upload,
  ChevronDown, ChevronRight, X, Bot, Pen, BarChart3, Target, Code2, LayoutTemplate, Zap, Handshake,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

// ---------------------------------------------------------------------------
// Category config
// ---------------------------------------------------------------------------

const CATEGORY_COLORS: Record<string, string> = {
  writing: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  analysis: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  strategy: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
  technical: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  format: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  sales: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
};

const CATEGORY_BORDER_COLORS: Record<string, string> = {
  writing: 'border-emerald-400',
  analysis: 'border-blue-400',
  strategy: 'border-violet-400',
  technical: 'border-amber-400',
  format: 'border-cyan-400',
  sales: 'border-rose-400',
};

const CATEGORY_TEXT_COLORS: Record<string, string> = {
  writing: 'text-emerald-400',
  analysis: 'text-blue-400',
  strategy: 'text-violet-400',
  technical: 'text-amber-400',
  format: 'text-cyan-400',
  sales: 'text-rose-400',
};

const CATEGORY_BADGE_STYLES: Record<string, string> = {
  writing: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  analysis: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  strategy: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
  technical: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  format: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  sales: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
};

const CATEGORY_KEYS = ['writing', 'analysis', 'strategy', 'technical', 'format', 'sales'] as const;
type CategoryKey = typeof CATEGORY_KEYS[number];

const CATEGORY_ICONS: Record<string, ReactNode> = {
  writing: <Pen className="w-4 h-4" />,
  analysis: <BarChart3 className="w-4 h-4" />,
  strategy: <Target className="w-4 h-4" />,
  technical: <Code2 className="w-4 h-4" />,
  format: <LayoutTemplate className="w-4 h-4" />,
  sales: <Handshake className="w-4 h-4" />,
};

const CATEGORY_ICONS_LG: Record<string, ReactNode> = {
  writing: <Pen className="w-5 h-5" />,
  analysis: <BarChart3 className="w-5 h-5" />,
  strategy: <Target className="w-5 h-5" />,
  technical: <Code2 className="w-5 h-5" />,
  format: <LayoutTemplate className="w-5 h-5" />,
  sales: <Handshake className="w-5 h-5" />,
};

const STORAGE_KEY = 'skills-sections-state';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadSectionsState(): Record<string, boolean> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveSectionsState(state: Record<string, boolean>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* ignore */ }
}

function parseTags(s: Skill): string[] {
  if (!s.tags) return [];
  try { return JSON.parse(s.tags); } catch { return []; }
}

function matchesSearch(skill: Skill, query: string): boolean {
  const q = query.toLowerCase();
  if (skill.name.toLowerCase().includes(q)) return true;
  if (skill.description?.toLowerCase().includes(q)) return true;
  const tags = parseTags(skill);
  if (tags.some(t => t.toLowerCase().includes(q))) return true;
  return false;
}

function groupByCategory(skills: Skill[]): Record<CategoryKey, Skill[]> {
  const groups: Record<string, Skill[]> = {};
  for (const key of CATEGORY_KEYS) groups[key] = [];
  for (const skill of skills) {
    const cat = CATEGORY_KEYS.includes(skill.category as CategoryKey) ? skill.category : 'writing';
    groups[cat].push(skill);
  }
  return groups as Record<CategoryKey, Skill[]>;
}

function highlightText(text: string, query: string): ReactNode {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-500/30 text-yellow-200 rounded-sm px-0.5">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface CategorySectionProps {
  categoryKey: CategoryKey;
  label: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}

function CategorySection({ categoryKey, label, count, expanded, onToggle, children }: CategorySectionProps) {
  const borderColor = CATEGORY_BORDER_COLORS[categoryKey];
  const textColor = CATEGORY_TEXT_COLORS[categoryKey];
  const badgeStyle = CATEGORY_BADGE_STYLES[categoryKey];
  const isEmpty = count === 0;
  const t = useTranslations('skills');

  return (
    <div className={`border-l-[3px] ${borderColor} rounded-r-lg`}>
      <button
        onClick={isEmpty ? undefined : onToggle}
        className={`w-full flex items-center gap-3 px-4 py-3 bg-zinc-900/60 hover:bg-zinc-800/40 rounded-r-lg transition-colors ${isEmpty ? 'opacity-50 cursor-default' : 'cursor-pointer'}`}
      >
        {!isEmpty && (
          <ChevronRight className={`w-4 h-4 text-zinc-400 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`} />
        )}
        <span className={textColor}>{CATEGORY_ICONS_LG[categoryKey]}</span>
        <span className="font-semibold text-zinc-100">{label}</span>
        {isEmpty ? (
          <span className="ml-auto text-xs text-zinc-500 italic">({t('section.empty')})</span>
        ) : (
          <Badge className={`ml-auto ${badgeStyle} border hover:${badgeStyle}`}>
            {count}
          </Badge>
        )}
      </button>
      {expanded && !isEmpty && (
        <div className="py-3 px-3">
          {children}
        </div>
      )}
    </div>
  );
}

interface SkillCardProps {
  skill: Skill;
  searchTerm: string;
  onEdit: (s: Skill) => void;
  onDuplicate: (s: Skill) => void;
  onExport: (s: Skill) => void;
  onDelete: (s: Skill) => void;
}

function SkillCard({ skill, searchTerm, onEdit, onDuplicate, onExport, onDelete }: SkillCardProps) {
  const t = useTranslations('skills');
  const catColor = CATEGORY_COLORS[skill.category] || CATEGORY_COLORS.writing;
  const catTextColor = CATEGORY_TEXT_COLORS[skill.category] || CATEGORY_TEXT_COLORS.writing;
  const tags = parseTags(skill);
  const maxTags = 3;
  const overflowCount = tags.length - maxTags;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 hover:border-zinc-700 transition-colors group">
      {/* Header: icon + name + category badge */}
      <div className="flex items-start justify-between mb-2">
        <button onClick={() => onEdit(skill)} className="text-left flex-1 min-w-0 flex items-start gap-2">
          <span className={`mt-0.5 shrink-0 ${catTextColor}`}>{CATEGORY_ICONS[skill.category]}</span>
          <div className="min-w-0 flex-1">
            <h3 className="text-zinc-200 font-medium truncate group-hover:text-violet-400 transition-colors">
              {highlightText(skill.name, searchTerm)}
            </h3>
            <p className="text-zinc-500 text-sm line-clamp-2 mt-1">
              {skill.description || t('noDescription')}
            </p>
          </div>
        </button>
        <Badge variant="outline" className={`text-xs border ml-2 shrink-0 ${catColor}`}>
          {t(`categories.${skill.category}`)}
        </Badge>
      </div>

      {/* Tags */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {tags.slice(0, maxTags).map(tg => (
            <span key={tg} className="text-xs px-1.5 py-0.5 bg-zinc-800 text-zinc-500 rounded">{tg}</span>
          ))}
          {overflowCount > 0 && (
            <span className="text-xs text-zinc-600">+{overflowCount} {t('card.moreTags', { count: overflowCount }).replace(`+${overflowCount} `, '')}</span>
          )}
        </div>
      )}

      {/* Footer: metadata + actions */}
      <div className="flex items-center justify-between pt-2 border-t border-zinc-800/50">
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <span className="px-1.5 py-0.5 bg-zinc-800/80 rounded text-zinc-400">{t(`sources.${skill.source}`)}</span>
          <span className="text-zinc-700">v{skill.version}</span>
          <span className="flex items-center gap-0.5">
            <Zap className="w-3 h-3" />
            {skill.times_used}
          </span>
        </div>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button variant="ghost" size="sm" onClick={() => onEdit(skill)} className="h-7 w-7 p-0 text-zinc-400 hover:text-zinc-50">
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onDuplicate(skill)} className="h-7 w-7 p-0 text-zinc-400 hover:text-zinc-50">
            <Copy className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onExport(skill)} className="h-7 w-7 p-0 text-zinc-400 hover:text-zinc-50">
            <Download className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onDelete(skill)} className="h-7 w-7 p-0 text-zinc-400 hover:text-red-400">
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Form state
// ---------------------------------------------------------------------------

type FormState = {
  name: string; description: string; category: string; tags: string;
  instructions: string; output_template: string; example_input: string;
  example_output: string; constraints: string; version: string; author: string;
};

const emptyForm: FormState = {
  name: '', description: '', category: 'writing', tags: '',
  instructions: '', output_template: '', example_input: '',
  example_output: '', constraints: '', version: '1.0', author: ''
};

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function SkillsPage() {
  const t = useTranslations('skills');

  // Data
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Sections
  const [sections, setSections] = useState<Record<string, boolean>>({});
  const [hasLoadedStorage, setHasLoadedStorage] = useState(false);

  // Sheet editor state
  const [editSkill, setEditSkill] = useState<Skill | null>(null);
  const [showSheet, setShowSheet] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<Skill | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Form
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

  // -------------------------------------------------------------------------
  // Fetch skills (all, no server-side filtering for instant client UX)
  // -------------------------------------------------------------------------
  const fetchSkills = useCallback(async () => {
    try {
      const res = await fetch('/api/skills');
      if (res.ok) setSkills(await res.json());
    } catch { /* silent */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchSkills(); }, [fetchSkills]);

  // -------------------------------------------------------------------------
  // Client-side filtering
  // -------------------------------------------------------------------------
  const isSearching = searchTerm.trim().length > 0;
  const searchQuery = searchTerm.trim();

  const filteredSkills = useMemo(() => {
    let result = skills;
    if (filterCategory !== 'all') {
      result = result.filter(s => s.category === filterCategory);
    }
    if (isSearching) {
      result = result.filter(s => matchesSearch(s, searchQuery));
    }
    return result;
  }, [skills, filterCategory, isSearching, searchQuery]);

  const byCategory = useMemo(() => groupByCategory(filteredSkills), [filteredSkills]);

  // -------------------------------------------------------------------------
  // Section state (localStorage persistence + search override)
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (loading || hasLoadedStorage) return;
    const stored = loadSectionsState();
    if (Object.keys(stored).length > 0) {
      setSections(stored);
    } else {
      // Default: expand first category that has skills
      const defaults: Record<string, boolean> = {};
      let foundFirst = false;
      for (const key of CATEGORY_KEYS) {
        const hasSkills = skills.filter(s => s.category === key).length > 0;
        defaults[key] = hasSkills && !foundFirst;
        if (hasSkills && !foundFirst) foundFirst = true;
      }
      setSections(defaults);
    }
    setHasLoadedStorage(true);
  }, [loading, skills, hasLoadedStorage]);

  // Persist to localStorage
  useEffect(() => {
    if (hasLoadedStorage && !isSearching) {
      saveSectionsState(sections);
    }
  }, [sections, hasLoadedStorage, isSearching]);

  const toggleSection = useCallback((key: string) => {
    setSections(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const getSectionExpanded = useCallback((key: string): boolean => {
    if (isSearching) {
      // When searching: auto-expand sections with results, collapse others
      return (byCategory[key as CategoryKey]?.length ?? 0) > 0;
    }
    return !!sections[key];
  }, [isSearching, sections, byCategory]);

  // -------------------------------------------------------------------------
  // CRUD handlers (preserved from original)
  // -------------------------------------------------------------------------
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

  const handleDownloadTemplate = () => {
    const template = {
      _instructions: [
        "=== PLANTILLA DE SKILL PARA DOCATFLOW ===",
        "",
        "Esta plantilla sirve para crear una skill profesional que se inyecta en agentes (CatPaws).",
        "Puedes importarla en CatPower > Skills > Importar JSON.",
        "",
        "CAMPOS OBLIGATORIOS: name, instructions",
        "CAMPOS OPCIONALES: description, category, tags, output_template, example_input, example_output, constraints, author",
        "",
        "COMO CREAR UNA SKILL PROFESIONAL CON IA:",
        "1. Define el ROL: Que persona o experto es el agente cuando usa esta skill.",
        "2. Define el PROTOCOLO: Pasos numerados que el agente debe seguir siempre.",
        "3. Define las REGLAS: Que debe y que NO debe hacer.",
        "4. Define el FORMATO de salida: JSON, markdown, texto plano, HTML.",
        "5. Incluye EJEMPLOS si el formato es complejo.",
        "",
        "CATEGORIAS DISPONIBLES: writing, analysis, strategy, technical, format, sales, system",
        "",
        "TIPS:",
        "- Las instrucciones se inyectan como system prompt del agente.",
        "- Si el agente tiene herramientas (Gmail, Holded, Drive), puedes referenciarlas.",
        "- Usa markdown en instructions para mejor legibilidad.",
        "- Para importar multiples skills, usa un array: [{...}, {...}]",
        "",
        "ELIMINA este campo _instructions antes de importar (o dejalo, se ignora)."
      ],
      name: "Mi Skill Personalizada",
      description: "Descripcion corta de lo que hace esta skill (aparece en la lista de skills).",
      category: "strategy",
      tags: ["ejemplo", "plantilla", "personalizada"],
      instructions: "Eres un [ROL PROFESIONAL]. Tu trabajo es [OBJETIVO PRINCIPAL].\n\n## Protocolo\n\n1. **Analiza el contexto**: [que debe analizar el agente]\n2. **Ejecuta la accion**: [que pasos debe seguir]\n3. **Formatea la salida**: [como debe presentar el resultado]\n\n## Reglas\n- [Regla 1]\n- [Regla 2]\n- NO [restriccion importante]\n\n## Formato de salida\n[Describe el formato esperado: JSON, markdown, texto, etc.]",
      output_template: null,
      example_input: "Ejemplo de lo que el usuario le pediria al agente con esta skill activa.",
      example_output: "Ejemplo de la respuesta esperada del agente.",
      constraints: "Restricciones opcionales: limites, prohibiciones, formato obligatorio.",
      author: "Tu nombre",
      version: "1.0"
    };

    const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'skill-template.json';
    a.click();
    URL.revokeObjectURL(url);
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
          category: 'writing',
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

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
      </div>
    );
  }

  const hasAnyResults = filteredSkills.length > 0;

  return (
    <div className="max-w-6xl mx-auto py-8 px-6 space-y-6 animate-slide-up">
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
            <Button variant="outline" className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50" onClick={handleDownloadTemplate} title={t('downloadTemplate')}>
              <Download className="w-4 h-4 mr-2" />{t('downloadTemplate')}
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

      {/* Search input -- full width */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
        <Input
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          placeholder={t('searchPlaceholder')}
          className="pl-9 bg-zinc-900 border-zinc-800 text-zinc-50 placeholder:text-zinc-500"
        />
        {searchTerm && (
          <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Category filter pills */}
      <div className="flex gap-1 flex-wrap">
        <button
          onClick={() => setFilterCategory('all')}
          className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
            filterCategory === 'all'
              ? 'bg-violet-500/20 text-violet-400 border-violet-500/30'
              : 'bg-transparent border-zinc-700 text-zinc-400 hover:text-zinc-50 hover:border-zinc-600'
          }`}
        >
          {t('filterAll')}
        </button>
        {CATEGORY_KEYS.map(key => (
          <button
            key={key}
            onClick={() => setFilterCategory(filterCategory === key ? 'all' : key)}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors flex items-center gap-1.5 ${
              filterCategory === key
                ? `${CATEGORY_COLORS[key]}`
                : 'bg-transparent border-zinc-700 text-zinc-400 hover:text-zinc-50 hover:border-zinc-600'
            }`}
          >
            {CATEGORY_ICONS[key]}
            {t(`categories.${key}`)}
          </button>
        ))}
      </div>

      {/* Directory sections */}
      {isSearching && !hasAnyResults ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border border-zinc-800 border-dashed rounded-lg">
          <Sparkles className="w-16 h-16 text-zinc-700 mb-4" />
          <p className="text-zinc-400 font-medium">{t('search.noResults')}</p>
          <p className="text-sm text-zinc-500 mt-1">{t('search.noResultsHint')}</p>
        </div>
      ) : !isSearching && skills.length === 0 ? (
        <div className="text-center py-20 border border-zinc-800 border-dashed rounded-lg">
          <Sparkles className="w-16 h-16 text-zinc-700 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-zinc-300 mb-2">{t('noSkills')}</h2>
          <p className="text-zinc-500 max-w-md mx-auto mb-6">{t('noSkillsDescription')}</p>
          <Button onClick={openCreate} className="bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white">
            <Plus className="w-4 h-4 mr-2" />
            {t('createFirst')}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {CATEGORY_KEYS.map(key => {
            const catSkills = byCategory[key];
            return (
              <CategorySection
                key={key}
                categoryKey={key}
                label={t(`categories.${key}`)}
                count={catSkills.length}
                expanded={getSectionExpanded(key)}
                onToggle={() => toggleSection(key)}
              >
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {catSkills.map(skill => (
                    <SkillCard
                      key={skill.id}
                      skill={skill}
                      searchTerm={isSearching ? searchQuery : ''}
                      onEdit={openEdit}
                      onDuplicate={handleDuplicate}
                      onExport={handleExport}
                      onDelete={setDeleteTarget}
                    />
                  ))}
                </div>
              </CategorySection>
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
                        <SelectItem key={key} value={key}>
                          <span className="flex items-center gap-2">
                            {CATEGORY_ICONS[key]}
                            {t(`categories.${key}`)}
                          </span>
                        </SelectItem>
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
