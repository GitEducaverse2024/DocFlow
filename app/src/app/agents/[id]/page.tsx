"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Image from 'next/image';
import {
  ArrowLeft, Save, Trash2, Loader2, Plus, X,
  Brain, Plug, Users, MessageSquare, ExternalLink, RefreshCw, Send,
  Crown, Briefcase, Megaphone, TrendingUp, Wrench, Truck, User, Grid3X3
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { PageHeader } from '@/components/layout/page-header';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import type { CatPaw } from '@/lib/types/catpaw';
import { CatPawChatSheet } from '@/components/agents/catpaw-chat-sheet';

// --- Types ---

interface RelationCatBrain {
  paw_id: string;
  catbrain_id: string;
  query_mode: string;
  priority: number;
  catbrain_name: string;
}

interface RelationConnector {
  paw_id: string;
  connector_id: string;
  usage_hint: string | null;
  is_active: number;
  connector_name: string;
  connector_type: string;
}

interface RelationAgent {
  paw_id: string;
  target_paw_id: string;
  relationship: string;
  target_name: string;
  target_emoji: string;
}

interface RelationSkill {
  paw_id: string;
  skill_id: string;
  skill_name: string;
}

interface PawDetail extends CatPaw {
  catbrains: RelationCatBrain[];
  connectors: RelationConnector[];
  agents: RelationAgent[];
  skills: RelationSkill[];
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  sources?: string[];
}

// --- Tab list ---

type TabKey = 'identidad' | 'conexiones' | 'skills' | 'chat' | 'openclaw';

const COLOR_PRESETS = [
  { name: 'violet', value: '#8B5CF6' },
  { name: 'teal', value: '#14B8A6' },
  { name: 'amber', value: '#F59E0B' },
  { name: 'rose', value: '#F43F5E' },
  { name: 'blue', value: '#3B82F6' },
  { name: 'emerald', value: '#10B981' },
];

const TONE_KEYS = ['profesional', 'casual', 'tecnico', 'creativo', 'formal'];
const OUTPUT_FORMAT_OPTIONS = ['markdown', 'json', 'text', 'csv'];

type Department = 'direction' | 'business' | 'marketing' | 'finance' | 'production' | 'logistics' | 'hr' | 'personal' | 'other';

const DEPARTMENT_ICONS: Record<Department, React.ReactNode> = {
  direction: <Crown className="w-4 h-4" />,
  business: <Briefcase className="w-4 h-4" />,
  marketing: <Megaphone className="w-4 h-4" />,
  finance: <TrendingUp className="w-4 h-4" />,
  production: <Wrench className="w-4 h-4" />,
  logistics: <Truck className="w-4 h-4" />,
  hr: <Users className="w-4 h-4" />,
  personal: <User className="w-4 h-4" />,
  other: <Grid3X3 className="w-4 h-4" />,
};

const COMPANY_DEPARTMENTS: Department[] = ['direction', 'business', 'marketing', 'finance', 'production', 'logistics', 'hr'];

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function AgentDetailPage() {
  const t = useTranslations('agents');
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [paw, setPaw] = useState<PawDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>('identidad');
  const [chatOpen, setChatOpen] = useState(false);

  const modeBadge = (mode: string) => {
    switch (mode) {
      case 'chat': return <Badge className="bg-violet-500/20 text-violet-400 border-violet-500/30">{t('modes.chat')}</Badge>;
      case 'processor': return <Badge className="bg-teal-500/20 text-teal-400 border-teal-500/30">{t('modes.processor')}</Badge>;
      case 'hybrid': return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">{t('modes.hybrid')}</Badge>;
      default: return <Badge>{mode}</Badge>;
    }
  };

  const fetchPaw = useCallback(async () => {
    try {
      const res = await fetch(`/api/cat-paws/${id}`);
      if (!res.ok) throw new Error('Not found');
      const data = await res.json();
      setPaw(data);
    } catch {
      toast.error(t('detail.loadError'));
      router.push('/agents');
    } finally {
      setLoading(false);
    }
  }, [id, router, t]);

  useEffect(() => {
    fetchPaw();
  }, [fetchPaw]);

  if (loading || !paw) {
    return (
      <div className="flex justify-center items-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
      </div>
    );
  }

  const showChatTab = paw.mode === 'chat' || paw.mode === 'hybrid';

  const tabs: { key: TabKey; label: string; hidden?: boolean }[] = [
    { key: 'identidad', label: t('detail.tabs.identity') },
    { key: 'conexiones', label: t('detail.tabs.connections') },
    { key: 'skills', label: t('detail.tabs.skills') },
    { key: 'chat', label: t('detail.tabs.chat'), hidden: !showChatTab },
    { key: 'openclaw', label: t('detail.tabs.openclaw'), hidden: !showChatTab },
  ];

  return (
    <div className="max-w-4xl mx-auto py-8 px-6 space-y-6 animate-slide-up">
      <PageHeader
        title={`${paw.avatar_emoji} ${paw.name}`}
        description={paw.description || undefined}
        icon={
          <Image src="/Images/icon/catpaw.png" alt="CatPaw" width={24} height={24} />
        }
        action={
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setChatOpen(true)}
              className="bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white"
            >
              <MessageSquare className="w-4 h-4 mr-2" />
              {t('detail.chat.openChat')}
            </Button>
            <Button
              variant="outline"
              onClick={() => router.push('/agents')}
              className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              {t('detail.back')}
            </Button>
          </div>
        }
      />

      {/* Tab bar */}
      <div className="flex gap-1 bg-zinc-900 rounded-lg p-1 border border-zinc-800 overflow-x-auto">
        {tabs.filter(tab => !tab.hidden).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
              activeTab === tab.key
                ? 'bg-zinc-700 text-zinc-50'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
        {activeTab === 'identidad' && <IdentidadTab paw={paw} onSave={fetchPaw} modeBadge={modeBadge} />}
        {activeTab === 'conexiones' && <ConexionesTab paw={paw} onRefresh={fetchPaw} />}
        {activeTab === 'skills' && <SkillsTab paw={paw} onRefresh={fetchPaw} />}
        {activeTab === 'chat' && showChatTab && <ChatTab pawId={id} />}
        {activeTab === 'openclaw' && showChatTab && <OpenClawTab paw={paw} onRefresh={fetchPaw} />}
      </div>

      <CatPawChatSheet
        pawId={id}
        pawName={paw.name}
        pawEmoji={paw.avatar_emoji || '🐾'}
        open={chatOpen}
        onOpenChange={setChatOpen}
      />
    </div>
  );
}

// ============================================================
// TAB 1: IDENTIDAD
// ============================================================

function IdentidadTab({ paw, onSave, modeBadge }: { paw: PawDetail; onSave: () => void; modeBadge: (mode: string) => React.ReactNode }) {
  const t = useTranslations('agents');
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  const [name, setName] = useState(paw.name);
  const [avatarEmoji, setAvatarEmoji] = useState(paw.avatar_emoji);
  const [avatarColor, setAvatarColor] = useState(paw.avatar_color);
  const [description, setDescription] = useState(paw.description || '');
  const [department, setDepartment] = useState<Department>((paw.department as Department) || 'other');
  const [departmentTags, setDepartmentTags] = useState(() => {
    try {
      const parsed = JSON.parse(paw.department_tags || '[]');
      return Array.isArray(parsed) ? parsed.join(', ') : '';
    } catch { return ''; }
  });
  const [systemPrompt, setSystemPrompt] = useState(paw.system_prompt || '');
  const [tone, setTone] = useState(paw.tone);
  const [model, setModel] = useState(paw.model);
  const [temperature, setTemperature] = useState(paw.temperature);
  const [maxTokens, setMaxTokens] = useState(paw.max_tokens);
  const [processingInstructions, setProcessingInstructions] = useState(paw.processing_instructions || '');
  const [outputFormat, setOutputFormat] = useState(paw.output_format);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);

  useEffect(() => {
    fetch('/api/models')
      .then(res => res.json())
      .then(data => {
        const list = Array.isArray(data.models) ? data.models : [];
        setAvailableModels(list);
      })
      .catch(() => setAvailableModels([]))
      .finally(() => setModelsLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const tags = departmentTags.split(',').map(tag => tag.trim()).filter(Boolean);
      const res = await fetch(`/api/cat-paws/${paw.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, avatar_emoji: avatarEmoji, avatar_color: avatarColor,
          description: description || null,
          department,
          department_tags: tags.length > 0 ? tags : null,
          system_prompt: systemPrompt || null,
          tone, model, temperature, max_tokens: maxTokens,
          processing_instructions: processingInstructions || null,
          output_format: outputFormat,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success(t('detail.identity.saved'));
      onSave();
    } catch {
      toast.error(t('detail.identity.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/cat-paws/${paw.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      toast.success(t('detail.identity.deleted'));
      router.push('/agents');
    } catch {
      toast.error(t('detail.identity.deleteError'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="text-2xl">{modeBadge(paw.mode)}</span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-zinc-300">{t('detail.identity.name')}</Label>
          <Input value={name} onChange={e => setName(e.target.value)} className="bg-zinc-900 border-zinc-800 text-zinc-50" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-zinc-300">{t('detail.identity.emoji')}</Label>
            <Input value={avatarEmoji} onChange={e => setAvatarEmoji(e.target.value)} className="bg-zinc-900 border-zinc-800 text-zinc-50 text-2xl text-center" />
          </div>
          <div className="space-y-2">
            <Label className="text-zinc-300">{t('detail.identity.color')}</Label>
            <div className="flex gap-1.5 mt-1">
              {COLOR_PRESETS.map(c => (
                <button key={c.name} type="button" onClick={() => setAvatarColor(c.value)}
                  className={`w-7 h-7 rounded-full border-2 transition-all ${avatarColor === c.value ? 'border-white scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c.value }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-zinc-300">{t('detail.identity.description')}</Label>
        <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className="bg-zinc-900 border-zinc-800 text-zinc-50 resize-none" />
      </div>

      <div className="space-y-2">
        <Label className="text-zinc-300">{t('form.department')} *</Label>
        <Select value={department} onValueChange={(v) => setDepartment(v as Department)}>
          <SelectTrigger className="bg-zinc-900 border-zinc-800 text-zinc-50">
            <SelectValue placeholder={t('form.departmentPlaceholder')} />
          </SelectTrigger>
          <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-50">
            <SelectGroup>
              <SelectLabel className="text-zinc-500 text-xs">{t('section.company')}</SelectLabel>
              {COMPANY_DEPARTMENTS.map((d) => (
                <SelectItem key={d} value={d}>
                  <span className="flex items-center gap-2 text-violet-400">
                    {DEPARTMENT_ICONS[d]}
                    <span className="text-zinc-200">{t(`department.${d}`)}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectGroup>
            <SelectSeparator />
            <SelectGroup>
              <SelectItem value="personal">
                <span className="flex items-center gap-2 text-sky-400">
                  {DEPARTMENT_ICONS.personal}
                  <span className="text-zinc-200">{t('section.personal')}</span>
                </span>
              </SelectItem>
            </SelectGroup>
            <SelectSeparator />
            <SelectGroup>
              <SelectItem value="other">
                <span className="flex items-center gap-2 text-zinc-400">
                  {DEPARTMENT_ICONS.other}
                  <span className="text-zinc-200">{t('section.other')}</span>
                </span>
              </SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label className="text-zinc-300">{t('detail.identity.departments')}</Label>
        <Input value={departmentTags} onChange={e => setDepartmentTags(e.target.value)} placeholder={t('detail.identity.departmentsPlaceholder')} className="bg-zinc-900 border-zinc-800 text-zinc-50 placeholder:text-zinc-500" />
      </div>

      <div className="space-y-2">
        <Label className="text-zinc-300">{t('detail.identity.systemPrompt')}</Label>
        <Textarea value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)} rows={5} className="bg-zinc-900 border-zinc-800 text-zinc-50 resize-none" />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label className="text-zinc-300">{t('detail.identity.tone')}</Label>
          <select value={tone} onChange={e => setTone(e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 text-zinc-300 text-sm rounded-md px-3 py-2">
            {TONE_KEYS.map(key => <option key={key} value={key}>{t(`tones.${key}`)}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <Label className="text-zinc-300">{t('detail.identity.model')}</Label>
          {modelsLoading ? (
            <div className="flex items-center gap-2 h-9 px-3 bg-zinc-900 border border-zinc-800 rounded-md">
              <Loader2 className="w-3.5 h-3.5 text-violet-400 animate-spin" />
              <span className="text-xs text-zinc-500">{t('detail.identity.loading')}</span>
            </div>
          ) : availableModels.length > 0 ? (
            <select value={model} onChange={e => setModel(e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 text-zinc-300 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-violet-500">
              {!availableModels.includes(model) && model && <option value={model}>{model}</option>}
              {availableModels.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          ) : (
            <Input value={model} onChange={e => setModel(e.target.value)} placeholder="gemini-main" className="bg-zinc-900 border-zinc-800 text-zinc-50 placeholder:text-zinc-500" />
          )}
        </div>
        <div className="space-y-2">
          <Label className="text-zinc-300">{t('detail.identity.maxTokens')}</Label>
          <Input type="number" value={maxTokens} onChange={e => setMaxTokens(parseInt(e.target.value) || 2048)} className="bg-zinc-900 border-zinc-800 text-zinc-50" />
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-zinc-300">{t('detail.identity.temperature', { value: temperature })}</Label>
        <input type="range" min={0} max={2} step={0.1} value={temperature} onChange={e => setTemperature(parseFloat(e.target.value))} className="w-full accent-violet-500" />
      </div>

      {(paw.mode === 'processor' || paw.mode === 'hybrid') && (
        <>
          <div className="space-y-2">
            <Label className="text-zinc-300">{t('detail.identity.processingInstructions')}</Label>
            <Textarea value={processingInstructions} onChange={e => setProcessingInstructions(e.target.value)} rows={4} className="bg-zinc-900 border-zinc-800 text-zinc-50 resize-none" />
          </div>
          <div className="space-y-2">
            <Label className="text-zinc-300">{t('detail.identity.outputFormat')}</Label>
            <select value={outputFormat} onChange={e => setOutputFormat(e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 text-zinc-300 text-sm rounded-md px-3 py-2">
              {OUTPUT_FORMAT_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
        </>
      )}

      <div className="flex justify-between pt-4 border-t border-zinc-800">
        <Button variant="outline" onClick={() => setShowDelete(true)} className="bg-transparent border-red-800 text-red-400 hover:bg-red-900/30">
          <Trash2 className="w-4 h-4 mr-2" /> {t('detail.identity.delete')}
        </Button>
        <Button onClick={handleSave} disabled={saving} className="bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white">
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          {t('detail.identity.saveChanges')}
        </Button>
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={showDelete} onOpenChange={setShowDelete}>
        <DialogContent className="bg-zinc-900 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-zinc-50">{t('detail.identity.deleteTitle')}</DialogTitle>
          </DialogHeader>
          <p className="text-zinc-400 text-sm">{t('detail.identity.deleteConfirm', { name: paw.name })}</p>
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="outline" onClick={() => setShowDelete(false)} className="bg-transparent border-zinc-700 text-zinc-300">{t('new.buttons.cancel')}</Button>
            <Button onClick={handleDelete} disabled={deleting} className="bg-red-600 hover:bg-red-700 text-white">
              {deleting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
              {t('detail.identity.delete')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// TAB 2: CONEXIONES
// ============================================================

function ConexionesTab({ paw, onRefresh }: { paw: PawDetail; onRefresh: () => void }) {
  const t = useTranslations('agents');
  const [linkDialog, setLinkDialog] = useState<'catbrains' | 'connectors' | 'agents' | null>(null);
  const [available, setAvailable] = useState<{ id: string; name: string; [k: string]: unknown }[]>([]);
  const [loadingAvailable, setLoadingAvailable] = useState(false);

  // Link config state
  const [selectedId, setSelectedId] = useState('');
  const [queryMode, setQueryMode] = useState('rag');
  const [priority, setPriority] = useState(1);
  const [usageHint, setUsageHint] = useState('');
  const [relationship, setRelationship] = useState('collaborator');
  const [linking, setLinking] = useState(false);

  const openDialog = async (type: 'catbrains' | 'connectors' | 'agents') => {
    setLinkDialog(type);
    setSelectedId('');
    setLoadingAvailable(true);

    try {
      let url = '';
      if (type === 'catbrains') url = '/api/catbrains?limit=100';
      else if (type === 'connectors') url = '/api/connectors';
      else url = '/api/cat-paws';

      const res = await fetch(url);
      const data = await res.json();
      const items = Array.isArray(data) ? data : data.data || data.catbrains || [];

      // Exclude already linked
      const linkedIds = type === 'catbrains'
        ? paw.catbrains.map(cb => cb.catbrain_id)
        : type === 'connectors'
        ? paw.connectors.map(cn => cn.connector_id)
        : paw.agents.map(ag => ag.target_paw_id);

      setAvailable(items.filter((i: { id: string }) => !linkedIds.includes(i.id) && i.id !== paw.id));
    } catch {
      setAvailable([]);
    } finally {
      setLoadingAvailable(false);
    }
  };

  const handleLink = async () => {
    if (!selectedId) return;
    setLinking(true);
    try {
      let url = '';
      let body = {};
      if (linkDialog === 'catbrains') {
        url = `/api/cat-paws/${paw.id}/catbrains`;
        body = { catbrain_id: selectedId, query_mode: queryMode, priority };
      } else if (linkDialog === 'connectors') {
        url = `/api/cat-paws/${paw.id}/connectors`;
        body = { connector_id: selectedId, usage_hint: usageHint || null };
      } else {
        url = `/api/cat-paws/${paw.id}/agents`;
        body = { target_paw_id: selectedId, relationship };
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      toast.success(t('detail.connections.linked'));
      setLinkDialog(null);
      onRefresh();
    } catch {
      toast.error(t('detail.connections.linkError'));
    } finally {
      setLinking(false);
    }
  };

  const handleUnlink = async (type: 'catbrains' | 'connectors' | 'agents', targetId: string) => {
    try {
      const url = `/api/cat-paws/${paw.id}/${type}/${targetId}`;
      const res = await fetch(url, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      toast.success(t('detail.connections.unlinked'));
      onRefresh();
    } catch {
      toast.error(t('detail.connections.unlinkError'));
    }
  };

  const linkTitleMap: Record<string, string> = {
    catbrains: t('detail.connections.linkCatBrain'),
    connectors: t('detail.connections.linkConnector'),
    agents: t('detail.connections.linkAgent'),
  };

  const renderSection = (
    title: string,
    icon: React.ReactNode,
    items: { id: string; name: string; detail?: string }[],
    type: 'catbrains' | 'connectors' | 'agents'
  ) => (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-zinc-300 font-medium text-sm">
          {icon} {title} ({items.length})
        </div>
        <Button size="sm" variant="outline" onClick={() => openDialog(type)} className="bg-transparent border-zinc-700 text-zinc-400 hover:bg-zinc-800 h-7 text-xs">
          <Plus className="w-3 h-3 mr-1" /> {t('detail.connections.link')}
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="text-zinc-600 text-sm pl-6">{t('detail.connections.noLinks')}</p>
      ) : (
        <div className="space-y-1 pl-6">
          {items.map(item => (
            <div key={item.id} className="flex items-center justify-between bg-zinc-900 rounded-md px-3 py-2 border border-zinc-800">
              <div>
                <span className="text-zinc-300 text-sm">{item.name}</span>
                {item.detail && <span className="text-zinc-500 text-xs ml-2">{item.detail}</span>}
              </div>
              <button onClick={() => handleUnlink(type, item.id)} className="text-zinc-600 hover:text-red-400 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {renderSection(
        t('detail.connections.catbrainsLinked'),
        <Brain className="w-4 h-4" />,
        paw.catbrains.map(cb => ({ id: cb.catbrain_id, name: cb.catbrain_name || cb.catbrain_id, detail: `${cb.query_mode} | ${t('detail.connections.priority').toLowerCase()}: ${cb.priority}` })),
        'catbrains'
      )}

      {renderSection(
        t('detail.connections.connectorsLinked'),
        <Plug className="w-4 h-4" />,
        paw.connectors.map(cn => ({ id: cn.connector_id, name: cn.connector_name || cn.connector_id, detail: cn.connector_type })),
        'connectors'
      )}

      {renderSection(
        t('detail.connections.agentsLinked'),
        <Users className="w-4 h-4" />,
        paw.agents.map(ag => ({ id: ag.target_paw_id, name: `${ag.target_emoji || ''} ${ag.target_name || ag.target_paw_id}`.trim(), detail: ag.relationship })),
        'agents'
      )}

      {/* Link dialog */}
      <Dialog open={!!linkDialog} onOpenChange={() => setLinkDialog(null)}>
        <DialogContent className="bg-zinc-900 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-zinc-50">
              {linkDialog && linkTitleMap[linkDialog]}
            </DialogTitle>
          </DialogHeader>
          {loadingAvailable ? (
            <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-violet-500" /></div>
          ) : available.length === 0 ? (
            <p className="text-zinc-500 text-sm py-4">{t('detail.connections.noAvailable')}</p>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                {available.map(item => (
                  <label key={item.id} className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer border transition-colors ${selectedId === item.id ? 'border-violet-500 bg-violet-500/10' : 'border-zinc-800 hover:border-zinc-700'}`}>
                    <input type="radio" name="link-target" checked={selectedId === item.id} onChange={() => setSelectedId(item.id)} className="accent-violet-500" />
                    <span className="text-zinc-300 text-sm">{item.name as string}</span>
                  </label>
                ))}
              </div>

              {/* Config fields */}
              {linkDialog === 'catbrains' && selectedId && (
                <div className="flex gap-3">
                  <div className="space-y-1 flex-1">
                    <Label className="text-zinc-400 text-xs">{t('detail.connections.mode')}</Label>
                    <select value={queryMode} onChange={e => setQueryMode(e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs rounded px-2 py-1.5">
                      <option value="rag">{t('detail.connections.queryMode.rag')}</option>
                      <option value="connector">{t('detail.connections.queryMode.connector')}</option>
                      <option value="both">{t('detail.connections.queryMode.both')}</option>
                    </select>
                  </div>
                  <div className="space-y-1 w-24">
                    <Label className="text-zinc-400 text-xs">{t('detail.connections.priority')}</Label>
                    <Input type="number" value={priority} onChange={e => setPriority(parseInt(e.target.value) || 1)} className="bg-zinc-800 border-zinc-700 text-zinc-300 text-xs h-7" />
                  </div>
                </div>
              )}
              {linkDialog === 'connectors' && selectedId && (
                <div className="space-y-1">
                  <Label className="text-zinc-400 text-xs">{t('detail.connections.usageHint')}</Label>
                  <Input value={usageHint} onChange={e => setUsageHint(e.target.value)} placeholder={t('detail.connections.usageHintOptional')} className="bg-zinc-800 border-zinc-700 text-zinc-300 text-xs h-7" />
                </div>
              )}
              {linkDialog === 'agents' && selectedId && (
                <div className="space-y-1">
                  <Label className="text-zinc-400 text-xs">{t('detail.connections.relationship')}</Label>
                  <select value={relationship} onChange={e => setRelationship(e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs rounded px-2 py-1.5">
                    <option value="collaborator">{t('detail.connections.relationships.collaborator')}</option>
                    <option value="delegate">{t('detail.connections.relationships.delegate')}</option>
                    <option value="supervisor">{t('detail.connections.relationships.supervisor')}</option>
                  </select>
                </div>
              )}

              <div className="flex justify-end">
                <Button onClick={handleLink} disabled={!selectedId || linking} className="bg-gradient-to-r from-violet-600 to-purple-700 text-white text-sm">
                  {linking ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                  {t('detail.connections.link')}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// TAB 3: SKILLS
// ============================================================

function SkillsTab({ paw, onRefresh }: { paw: PawDetail; onRefresh: () => void }) {
  const t = useTranslations('agents');
  const [showAdd, setShowAdd] = useState(false);
  const [allSkills, setAllSkills] = useState<{ id: string; name: string }[]>([]);
  const [loadingSkills, setLoadingSkills] = useState(false);
  const [adding, setAdding] = useState(false);
  const [selectedSkillId, setSelectedSkillId] = useState('');

  const openAdd = async () => {
    setShowAdd(true);
    setSelectedSkillId('');
    setLoadingSkills(true);
    try {
      const res = await fetch('/api/skills');
      const data = await res.json();
      const skills = Array.isArray(data) ? data : data.skills || [];
      const linkedIds = paw.skills.map(s => s.skill_id);
      setAllSkills(skills.filter((s: { id: string }) => !linkedIds.includes(s.id)));
    } catch {
      setAllSkills([]);
    } finally {
      setLoadingSkills(false);
    }
  };

  const handleAdd = async () => {
    if (!selectedSkillId) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/cat-paws/${paw.id}/skills`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skill_id: selectedSkillId }),
      });
      if (!res.ok) throw new Error();
      toast.success(t('detail.skills.added'));
      setShowAdd(false);
      onRefresh();
    } catch {
      toast.error(t('detail.skills.addError'));
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (skillId: string) => {
    try {
      const res = await fetch(`/api/cat-paws/${paw.id}/skills`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skill_id: skillId }),
      });
      if (!res.ok) throw new Error();
      toast.success(t('detail.skills.removed'));
      onRefresh();
    } catch {
      toast.error(t('detail.skills.removeError'));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-zinc-300 font-medium text-sm">{t('detail.skills.title', { count: paw.skills.length })}</span>
        <Button size="sm" variant="outline" onClick={openAdd} className="bg-transparent border-zinc-700 text-zinc-400 hover:bg-zinc-800 h-7 text-xs">
          <Plus className="w-3 h-3 mr-1" /> {t('detail.skills.addSkill')}
        </Button>
      </div>

      {paw.skills.length === 0 ? (
        <p className="text-zinc-600 text-sm">{t('detail.skills.noSkills')}</p>
      ) : (
        <div className="space-y-1">
          {paw.skills.map(skill => (
            <div key={skill.skill_id} className="flex items-center justify-between bg-zinc-900 rounded-md px-3 py-2 border border-zinc-800">
              <span className="text-zinc-300 text-sm">{skill.skill_name || skill.skill_id}</span>
              <button onClick={() => handleRemove(skill.skill_id)} className="text-zinc-600 hover:text-red-400 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="bg-zinc-900 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-zinc-50">{t('detail.skills.addTitle')}</DialogTitle>
          </DialogHeader>
          {loadingSkills ? (
            <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-violet-500" /></div>
          ) : allSkills.length === 0 ? (
            <p className="text-zinc-500 text-sm py-4">{t('detail.skills.noAvailable')}</p>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2 max-h-[250px] overflow-y-auto">
                {allSkills.map(skill => (
                  <label key={skill.id} className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer border transition-colors ${selectedSkillId === skill.id ? 'border-violet-500 bg-violet-500/10' : 'border-zinc-800 hover:border-zinc-700'}`}>
                    <Checkbox checked={selectedSkillId === skill.id} onCheckedChange={() => setSelectedSkillId(selectedSkillId === skill.id ? '' : skill.id)} />
                    <span className="text-zinc-300 text-sm">{skill.name}</span>
                  </label>
                ))}
              </div>
              <div className="flex justify-end">
                <Button onClick={handleAdd} disabled={!selectedSkillId || adding} className="bg-gradient-to-r from-violet-600 to-purple-700 text-white text-sm">
                  {adding ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                  {t('detail.skills.add')}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// TAB 4: CHAT
// ============================================================

function ChatTab({ pawId }: { pawId: string }) {
  const t = useTranslations('agents');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || streaming) return;

    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: trimmed }]);
    setStreaming(true);

    // Add empty assistant message
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    try {
      abortRef.current = new AbortController();

      const res = await fetch(`/api/cat-paws/${pawId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed, stream: true }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error');
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine) continue;

          if (trimmedLine.startsWith('event: ')) {
            continue;
          }

          if (trimmedLine.startsWith('data: ')) {
            const dataStr = trimmedLine.slice(6);
            try {
              const data = JSON.parse(dataStr);

              if (data.token !== undefined) {
                setMessages(prev => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last && last.role === 'assistant') {
                    updated[updated.length - 1] = { ...last, content: last.content + data.token };
                  }
                  return updated;
                });
              }

              if (data.sources) {
                const sources = Array.isArray(data.sources) ? data.sources.map((s: string | { payload?: { source_name?: string } }) =>
                  typeof s === 'string' ? s : s?.payload?.source_name || t('detail.chat.source')
                ) : [];
                if (sources.length > 0) {
                  setMessages(prev => {
                    const updated = [...prev];
                    const last = updated[updated.length - 1];
                    if (last && last.role === 'assistant') {
                      updated[updated.length - 1] = { ...last, sources };
                    }
                    return updated;
                  });
                }
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setMessages(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === 'assistant' && !last.content) {
            updated[updated.length - 1] = { ...last, content: `Error: ${(err as Error).message}` };
          }
          return updated;
        });
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  return (
    <div className="flex flex-col h-[500px]">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <MessageSquare className="w-10 h-10 text-zinc-700 mb-3" />
            <p className="text-zinc-500 text-sm">{t('detail.chat.emptyState')}</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-xl px-4 py-2.5 ${
              msg.role === 'user'
                ? 'bg-violet-600/20 text-violet-100 border border-violet-500/20'
                : 'bg-zinc-800 text-zinc-200 border border-zinc-700'
            }`}>
              <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
              {msg.role === 'assistant' && streaming && i === messages.length - 1 && (
                <span className="inline-block w-2 h-4 bg-violet-400 animate-pulse ml-0.5" />
              )}
              {msg.sources && msg.sources.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {msg.sources.map((src, j) => (
                    <Badge key={j} className="bg-zinc-700 text-zinc-400 text-xs">{src}</Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2 border-t border-zinc-800 pt-3">
        <Input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder={t('detail.chat.placeholder')}
          disabled={streaming}
          className="bg-zinc-900 border-zinc-800 text-zinc-50 placeholder:text-zinc-500 flex-1"
        />
        <Button onClick={handleSend} disabled={streaming || !input.trim()} className="bg-gradient-to-r from-violet-600 to-purple-700 text-white">
          {streaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      </div>
    </div>
  );
}

// ============================================================
// TAB 5: OPENCLAW
// ============================================================

function OpenClawTab({ paw, onRefresh }: { paw: PawDetail; onRefresh: () => void }) {
  const t = useTranslations('agents');
  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch(`/api/cat-paws/${paw.id}/openclaw-sync`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || t('detail.openclaw.syncError'));
      }
      toast.success(t('detail.openclaw.synced'));
      onRefresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSyncing(false);
    }
  };

  const openclawUrl = process.env.NEXT_PUBLIC_OPENCLAW_URL || 'http://localhost:18789';

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="text-zinc-300 font-medium">{t('detail.openclaw.title')}</h3>
        <p className="text-zinc-500 text-sm">{t('detail.openclaw.description')}</p>
      </div>

      {paw.openclaw_id ? (
        <div className="space-y-4">
          <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-zinc-500">{t('detail.openclaw.openclawId')}</span>
              <span className="text-zinc-300 font-mono text-xs">{paw.openclaw_id}</span>
            </div>
            {paw.openclaw_synced_at && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-zinc-500">{t('detail.openclaw.lastSync')}</span>
                <span className="text-zinc-300">{new Date(paw.openclaw_synced_at).toLocaleString()}</span>
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <Button onClick={handleSync} disabled={syncing} variant="outline" className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800">
              {syncing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              {t('detail.openclaw.resync')}
            </Button>
            <a
              href={`${openclawUrl}/mission-control`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors text-sm"
            >
              <ExternalLink className="w-4 h-4" />
              {t('detail.openclaw.openMissionControl')}
            </a>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
            <p className="text-zinc-400 text-sm">{t('detail.openclaw.notSynced')}</p>
          </div>
          <Button onClick={handleSync} disabled={syncing} className="bg-gradient-to-r from-violet-600 to-purple-700 text-white">
            {syncing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ExternalLink className="w-4 h-4 mr-2" />}
            {t('detail.openclaw.syncWithOpenClaw')}
          </Button>
        </div>
      )}
    </div>
  );
}
