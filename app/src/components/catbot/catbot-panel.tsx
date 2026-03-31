"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { X, Minus, Send, Trash2, Loader2, Shield, ShieldCheck, Lock, Terminal, FileText, Key, Globe, Server, Square, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import logoImg from '@/../Images/logo.jpg';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useSSEStream } from '@/hooks/use-sse-stream';
// Error interception now goes to notifications (bell icon) — CatBot no longer auto-opens on errors
import { useTranslations } from 'next-intl';

interface ToolCall {
  name: string;
  args: Record<string, unknown>;
  result: unknown;
  sudo?: boolean;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  tool_calls?: ToolCall[];
  actions?: Array<{ type: string; url: string; label: string }>;
  timestamp: number;
  sudo_required?: boolean;
}

const SUGGESTION_ROUTES = [
  { path: '/', key: 'dashboard' },
  { path: '/catbrains', key: 'catbrains' },
  { path: '/agents', key: 'agents' },
  { path: '/catflow', key: 'tasks' },
  { path: '/connectors', key: 'connectors' },
  { path: '/settings', key: 'settings' },
  { path: '/workers', key: 'workers' },
  { path: '/skills', key: 'skills' },
] as const;

const STORAGE_KEY = 'docatflow_catbot_messages';
const SUDO_TOKEN_KEY = 'docatflow_catbot_sudo_token';
const MAX_STORED = 50;

function loadMessages(): Message[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const msgs = JSON.parse(stored) as Message[];
      return msgs.slice(-MAX_STORED);
    }
  } catch { /* ignore */ }
  return [];
}

function saveMessages(messages: Message[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_STORED)));
  } catch { /* ignore */ }
}

// ─── Tool Icons & Border Colors ───

function getToolStyle(toolName: string, isSudo: boolean): { icon: typeof Terminal; borderClass: string; labelKey: string } {
  if (!isSudo) return { icon: Terminal, borderClass: 'border-zinc-700/50', labelKey: '' };

  switch (toolName) {
    case 'bash_execute':
      return { icon: Terminal, borderClass: 'border-amber-500/40', labelKey: 'terminal' };
    case 'service_manage':
      return { icon: Server, borderClass: 'border-amber-500/40', labelKey: 'service' };
    case 'file_operation':
      return { icon: FileText, borderClass: 'border-blue-500/40', labelKey: 'file' };
    case 'credential_manage':
      return { icon: Key, borderClass: 'border-red-500/40', labelKey: 'credential' };
    case 'mcp_bridge':
      return { icon: Globe, borderClass: 'border-purple-500/40', labelKey: 'mcp' };
    default:
      return { icon: Shield, borderClass: 'border-amber-500/40', labelKey: '' };
  }
}

function formatToolOutput(result: unknown): string | null {
  if (!result || typeof result !== 'object') return null;
  const r = result as Record<string, unknown>;

  // Bash output
  if ('output' in r && typeof r.output === 'string') {
    return r.output;
  }
  // File content
  if ('content' in r && typeof r.content === 'string') {
    return r.content;
  }
  return null;
}

export function CatBotPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [model] = useState('gemini-main');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations('catbot');

  // Streaming state
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingToolCalls, setStreamingToolCalls] = useState<ToolCall[]>([]);
  const [activeToolCall, setActiveToolCall] = useState<string | null>(null);
  const streamingContentRef = useRef('');
  const streamingToolCallsRef = useRef<ToolCall[]>([]);

  // Sync streamingToolCalls state to ref for closure access
  useEffect(() => {
    streamingToolCallsRef.current = streamingToolCalls;
  }, [streamingToolCalls]);

  // Error interceptor state
  const [hasUnreadError, setHasUnreadError] = useState(false);

  // Sudo state
  const [sudoToken, setSudoToken] = useState<string | null>(null);
  const [sudoActive, setSudoActive] = useState(false);
  const [sudoRemainingMs, setSudoRemainingMs] = useState(0);
  const [sudoPromptVisible, setSudoPromptVisible] = useState(false);
  const [sudoPassword, setSudoPassword] = useState('');
  const [sudoError, setSudoError] = useState('');
  const [sudoLoading, setSudoLoading] = useState(false);
  const sudoPasswordRef = useRef<HTMLInputElement>(null);

  // SSE Stream hook
  const { start, stop, isStreaming } = useSSEStream({
    onToken: (token) => {
      streamingContentRef.current += token;
      setStreamingContent(streamingContentRef.current);
    },
    onToolCallStart: (data) => {
      setActiveToolCall(data.name);
    },
    onToolCallResult: (data) => {
      setActiveToolCall(null);
      const newTc: ToolCall = {
        name: data.name,
        args: {},
        result: data.result,
      };
      setStreamingToolCalls(prev => [...prev, newTc]);
    },
    onDone: (data) => {
      const d = data as Record<string, unknown>;
      const finalMsg: Message = {
        role: 'assistant',
        content: streamingContentRef.current || (d.reply as string) || t('ui.noResponse'),
        tool_calls: streamingToolCallsRef.current.length > 0 ? streamingToolCallsRef.current : (d.tool_calls as ToolCall[] | undefined),
        actions: d.actions as Message['actions'],
        timestamp: Date.now(),
        sudo_required: d.sudo_required as boolean | undefined,
      };
      setMessages(prev => [...prev, finalMsg]);
      // Reset streaming state
      setStreamingContent('');
      streamingContentRef.current = '';
      setStreamingToolCalls([]);
      streamingToolCallsRef.current = [];
      setActiveToolCall(null);
      // Handle sudo prompt
      if (d.sudo_required && !sudoActive) {
        setSudoPromptVisible(true);
      }
      if (d.sudo_active !== undefined) {
        setSudoActive(d.sudo_active as boolean);
      }
    },
    onError: (error) => {
      if (streamingContentRef.current) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: streamingContentRef.current,
          tool_calls: streamingToolCallsRef.current.length > 0 ? streamingToolCallsRef.current : undefined,
          timestamp: Date.now(),
        }]);
      } else {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: t('ui.connectionError'),
          timestamp: Date.now(),
        }]);
      }
      setStreamingContent('');
      streamingContentRef.current = '';
      setStreamingToolCalls([]);
      streamingToolCallsRef.current = [];
      setActiveToolCall(null);
      console.error('CatBot stream error:', error);
    },
  });

  // Load messages and sudo token on mount
  useEffect(() => {
    setMessages(loadMessages());
    const token = localStorage.getItem(SUDO_TOKEN_KEY);
    if (token) {
      setSudoToken(token);
      checkSudoStatus(token);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Errors now go to notifications (bell icon) instead of auto-opening CatBot.
  // The error interceptor sends errors via POST /api/notifications.
  // CatBot can still read error history via read_error_history tool if needed.

  // Save messages when they change
  useEffect(() => {
    if (messages.length > 0) saveMessages(messages);
  }, [messages]);

  // Auto-scroll handler
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    shouldAutoScroll.current = distanceFromBottom < 100;
  }, []);

  // Auto-scroll on new streaming content
  useEffect(() => {
    if (shouldAutoScroll.current && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [streamingContent, streamingToolCalls, activeToolCall]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (shouldAutoScroll.current && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen && !isMinimized) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, isMinimized]);

  // Focus sudo password input when prompt appears
  useEffect(() => {
    if (sudoPromptVisible) {
      setTimeout(() => sudoPasswordRef.current?.focus(), 100);
    }
  }, [sudoPromptVisible]);

  // Sudo countdown timer
  useEffect(() => {
    if (!sudoActive || sudoRemainingMs <= 0) return;

    const interval = setInterval(() => {
      setSudoRemainingMs(prev => {
        if (prev <= 1000) {
          setSudoActive(false);
          setSudoToken(null);
          localStorage.removeItem(SUDO_TOKEN_KEY);
          return 0;
        }
        return prev - 1000;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [sudoActive, sudoRemainingMs]);

  // Check sudo status
  const checkSudoStatus = async (token: string) => {
    try {
      const res = await fetch('/api/catbot/sudo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'check', token }),
      });
      const data = await res.json();
      if (data.active) {
        setSudoActive(true);
        setSudoRemainingMs(data.remaining_ms);
      } else {
        setSudoActive(false);
        setSudoToken(null);
        localStorage.removeItem(SUDO_TOKEN_KEY);
      }
    } catch {
      setSudoActive(false);
    }
  };

  // Verify sudo password
  const verifySudo = async () => {
    if (!sudoPassword.trim()) return;
    setSudoLoading(true);
    setSudoError('');

    try {
      const res = await fetch('/api/catbot/sudo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', password: sudoPassword, client_id: 'catbot-panel' }),
      });
      const data = await res.json();

      if (data.success && data.token) {
        setSudoToken(data.token);
        setSudoActive(true);
        setSudoRemainingMs(data.remaining_ms);
        localStorage.setItem(SUDO_TOKEN_KEY, data.token);
        setSudoPromptVisible(false);
        setSudoPassword('');
        setSudoError('');

        // Add system message
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: t('ui.sudoActivated'),
          timestamp: Date.now(),
        }]);
      } else {
        setSudoError(data.error || t('ui.wrongKey'));
      }
    } catch {
      setSudoError(t('ui.connectionErrorShort'));
    } finally {
      setSudoLoading(false);
      setSudoPassword('');
    }
  };

  const sendMessage = useCallback((text: string) => {
    if (!text.trim() || isStreaming) return;

    setHasUnreadError(false);
    const userMsg: Message = { role: 'user', content: text.trim(), timestamp: Date.now() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');

    const apiMessages = newMessages.map(m => ({ role: m.role, content: m.content }));
    streamingContentRef.current = '';
    streamingToolCallsRef.current = [];
    setStreamingContent('');
    setStreamingToolCalls([]);
    setActiveToolCall(null);

    start('/api/catbot/chat', {
      messages: apiMessages,
      context: { page: pathname },
      model,
      sudo_token: sudoToken,
    });
  }, [messages, isStreaming, pathname, model, sudoToken, start]);

  const clearHistory = () => {
    setMessages([]);
    localStorage.removeItem(STORAGE_KEY);
  };

  const logoutSudo = async () => {
    if (sudoToken) {
      try {
        await fetch('/api/catbot/sudo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'logout', token: sudoToken }),
        });
      } catch { /* ignore */ }
    }
    setSudoToken(null);
    setSudoActive(false);
    setSudoRemainingMs(0);
    localStorage.removeItem(SUDO_TOKEN_KEY);
  };

  const formatCountdown = (ms: number): string => {
    const totalSecs = Math.ceil(ms / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Build suggestions from translations based on current route
  const suggestions = useMemo(() => {
    for (const { path, key } of SUGGESTION_ROUTES) {
      if (pathname === path || (path !== '/' && pathname.startsWith(path))) {
        return t.raw(`suggestions.${key}`) as string[];
      }
    }
    return t.raw('suggestions.dashboard') as string[];
  }, [pathname, t]);

  // Floating button
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 group"
        title={t('ui.openCatBot')}
      >
        <div className="relative">
          <Image
            src={logoImg}
            alt="CatBot"
            width={56}
            height={56}
            className="rounded-full object-cover ring-2 ring-violet-500/50 group-hover:ring-violet-400 group-hover:scale-110 transition-all shadow-lg shadow-violet-500/20"
          />
          {hasUnreadError ? (
            <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 border-2 border-zinc-950 flex items-center justify-center animate-bounce">
              <AlertCircle className="w-2.5 h-2.5 text-white" />
            </div>
          ) : (
            <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-500 border-2 border-zinc-950" />
          )}
          {sudoActive && (
            <div className="absolute -bottom-1 -left-1 w-4 h-4 rounded-full bg-amber-500 border-2 border-zinc-950 flex items-center justify-center">
              <ShieldCheck className="w-2.5 h-2.5 text-zinc-900" />
            </div>
          )}
        </div>
      </button>
    );
  }

  // Minimized state
  if (isMinimized) {
    return (
      <div className="fixed bottom-6 right-6 z-50">
        <button
          onClick={() => setIsMinimized(false)}
          className="flex items-center gap-2 bg-zinc-900 border border-zinc-700 rounded-full px-4 py-2 hover:bg-zinc-800 transition-colors shadow-lg"
        >
          <Image src={logoImg} alt="CatBot" width={24} height={24} className="rounded-full object-cover" />
          <span className="text-sm font-medium text-zinc-200">CatBot</span>
          {sudoActive && (
            <span className="bg-amber-500/20 text-amber-400 text-xs px-1.5 rounded-full flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" />
              {formatCountdown(sudoRemainingMs)}
            </span>
          )}
          {messages.length > 0 && (
            <span className="bg-violet-500/20 text-violet-400 text-xs px-1.5 rounded-full">{messages.length}</span>
          )}
        </button>
      </div>
    );
  }

  // Full panel
  return (
    <div className="fixed bottom-6 right-6 z-50 w-[420px] h-[600px] max-h-[80vh] bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl shadow-black/50 flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900/95 backdrop-blur">
        <div className="flex items-center gap-2">
          <Image src={logoImg} alt="CatBot" width={28} height={28} className="rounded-full object-cover" />
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-zinc-100">CatBot</span>
            <span className="text-xs text-zinc-500">{model}</span>
            {sudoActive && (
              <button
                onClick={logoutSudo}
                className="flex items-center gap-1 bg-amber-500/15 text-amber-400 text-xs px-2 py-0.5 rounded-full border border-amber-500/30 hover:bg-amber-500/25 transition-colors"
                title={t('ui.deactivateSudo')}
              >
                <ShieldCheck className="w-3 h-3" />
                <span className="font-mono">{formatCountdown(sudoRemainingMs)}</span>
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {!sudoActive && (
            <button
              onClick={() => setSudoPromptVisible(true)}
              className="p-1.5 text-zinc-500 hover:text-amber-400 transition-colors"
              title={t('ui.activateSudo')}
            >
              <Lock className="w-3.5 h-3.5" />
            </button>
          )}
          <button onClick={clearHistory} className="p-1.5 text-zinc-500 hover:text-zinc-300 transition-colors" title={t('ui.clearHistory')}>
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setIsMinimized(true)} className="p-1.5 text-zinc-500 hover:text-zinc-300 transition-colors" title={t('ui.minimize')}>
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setIsOpen(false)} className="p-1.5 text-zinc-500 hover:text-zinc-300 transition-colors" title={t('ui.close')}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && !isStreaming && (
          <div className="text-center py-8 space-y-3">
            <Image src={logoImg} alt="CatBot" width={48} height={48} className="rounded-full object-cover mx-auto" />
            <p className="text-sm text-zinc-300">
              {t.rich('ui.greeting', { strong: (chunks) => <strong>{chunks}</strong> })}
            </p>
            <p className="text-xs text-zinc-500">
              {t.rich('ui.greetingContext', {
                page: pathname,
                highlight: (chunks) => <span className="text-violet-400">{chunks}</span>,
              })}
            </p>
            {sudoActive && (
              <p className="text-xs text-amber-400/70 flex items-center justify-center gap-1">
                <ShieldCheck className="w-3 h-3" /> {t('ui.sudoModeActive')}
              </p>
            )}
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
              msg.role === 'user'
                ? 'bg-violet-600/20 text-zinc-100 rounded-tr-sm'
                : 'bg-zinc-800 text-zinc-200 rounded-tl-sm'
            }`}>
              {msg.role === 'assistant' && (
                <span className="text-xs text-violet-400 font-medium">🐱 </span>
              )}
              {msg.role === 'assistant' ? (
                <div className="prose prose-invert prose-sm max-w-none inline">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {msg.content}
                  </ReactMarkdown>
                </div>
              ) : (
                <span className="whitespace-pre-wrap">{msg.content}</span>
              )}

              {/* Tool call results */}
              {msg.tool_calls && msg.tool_calls.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {msg.tool_calls.map((tc, j) => {
                    const style = getToolStyle(tc.name, !!tc.sudo);
                    const IconComp = style.icon;
                    const label = style.labelKey ? t(`tools.${style.labelKey}`) : tc.name;
                    const output = tc.sudo ? formatToolOutput(tc.result) : null;
                    const hasError = tc.result && typeof tc.result === 'object' && 'error' in (tc.result as Record<string, unknown>);
                    const errorMsg = hasError ? String((tc.result as Record<string, unknown>).error) : null;
                    const isSudoRequired = errorMsg === 'SUDO_REQUIRED';

                    return (
                      <div key={j} className={`rounded px-2 py-1.5 text-xs border ${style.borderClass} ${
                        tc.sudo ? 'bg-zinc-900/80' : 'bg-zinc-900/50'
                      }`}>
                        <div className="flex items-center gap-1.5">
                          <IconComp className={`w-3 h-3 ${
                            tc.name === 'credential_manage' ? 'text-red-400' :
                            tc.name === 'file_operation' ? 'text-blue-400' :
                            tc.name === 'mcp_bridge' ? 'text-purple-400' :
                            tc.sudo ? 'text-amber-400' : 'text-violet-400'
                          }`} />
                          <span className={`font-medium ${
                            tc.sudo ? 'text-amber-300' : 'text-violet-400'
                          }`}>{label}</span>
                          {!hasError && (
                            <span className="ml-auto text-emerald-400">✓</span>
                          )}
                          {isSudoRequired && (
                            <span className="ml-auto text-amber-400">🔒</span>
                          )}
                          {hasError && !isSudoRequired ? (
                            <span className="ml-auto text-red-400">✗</span>
                          ) : null}
                        </div>
                        {/* Show bash/file output in terminal style */}
                        {output && output.trim().length > 0 && (
                          <pre className={`mt-1.5 p-2 rounded text-[11px] leading-relaxed overflow-x-auto max-h-[200px] overflow-y-auto font-mono ${
                            tc.name === 'bash_execute' || tc.name === 'service_manage'
                              ? 'bg-zinc-950 text-emerald-300/80 border border-amber-500/20'
                              : 'bg-zinc-950 text-zinc-300 border border-blue-500/20'
                          }`}>
                            {output.length > 2000 ? output.slice(0, 2000) + '\n' + t('ui.truncated') : output}
                          </pre>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Action buttons */}
              {msg.actions && msg.actions.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {msg.actions.map((action, j) => (
                    <button
                      key={j}
                      onClick={() => router.push(action.url)}
                      className="text-xs bg-violet-600/20 text-violet-300 hover:bg-violet-600/30 px-2 py-1 rounded transition-colors"
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Sudo required prompt */}
              {msg.sudo_required && !sudoActive && (
                <div className="mt-2 p-2 rounded border border-amber-500/30 bg-amber-500/5">
                  <p className="text-xs text-amber-300 mb-1.5 flex items-center gap-1">
                    <Lock className="w-3 h-3" />
                    {t('ui.protectedAction')}
                  </p>
                  <button
                    onClick={() => setSudoPromptVisible(true)}
                    className="text-xs bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 px-3 py-1 rounded transition-colors"
                  >
                    {t('ui.enterKey')}
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Streaming message bubble */}
        {isStreaming && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-xl rounded-tl-sm px-3 py-2 text-sm bg-zinc-800 text-zinc-200">
              <span className="text-xs text-violet-400 font-medium">🐱 </span>
              {/* Active tool call with spinner */}
              {activeToolCall && (
                <div className="flex items-center gap-2 text-xs text-zinc-400 my-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>{t('ui.executing', { tool: activeToolCall })}</span>
                </div>
              )}
              {/* Completed tool calls */}
              {streamingToolCalls.map((tc, i) => (
                <div key={i} className="text-xs text-emerald-400 my-0.5">
                  ✓ {tc.name}
                </div>
              ))}
              {/* Streaming content with cursor */}
              {streamingContent ? (
                <div className="prose prose-invert prose-sm max-w-none streaming-cursor">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {streamingContent}
                  </ReactMarkdown>
                </div>
              ) : !activeToolCall ? (
                <span className="text-zinc-500">{t('ui.thinking')}</span>
              ) : null}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Sudo Password Prompt (inline) */}
      {sudoPromptVisible && !sudoActive && (
        <div className="px-4 py-3 border-t border-amber-500/20 bg-amber-500/5">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-medium text-amber-300">{t('ui.sudoAuth')}</span>
            <button
              onClick={() => { setSudoPromptVisible(false); setSudoError(''); setSudoPassword(''); }}
              className="ml-auto text-zinc-500 hover:text-zinc-300"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); verifySudo(); }} className="flex items-center gap-2">
            <input
              ref={sudoPasswordRef}
              type="password"
              value={sudoPassword}
              onChange={(e) => setSudoPassword(e.target.value)}
              placeholder={t('ui.secretKeyPlaceholder')}
              className="flex-1 bg-zinc-900 border border-amber-500/30 rounded-lg px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
              disabled={sudoLoading}
            />
            <Button
              type="submit"
              size="sm"
              disabled={!sudoPassword.trim() || sudoLoading}
              className="bg-amber-600 hover:bg-amber-500 text-zinc-900 font-medium h-8 px-3"
            >
              {sudoLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3" />}
            </Button>
          </form>
          {sudoError && (
            <p className="text-xs text-red-400 mt-1.5">{sudoError}</p>
          )}
        </div>
      )}

      {/* Suggestions */}
      {messages.length === 0 && !sudoPromptVisible && !isStreaming && (
        <div className="px-4 pb-2 flex flex-wrap gap-1.5">
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => sendMessage(s)}
              className="text-xs bg-zinc-800 text-zinc-300 hover:bg-zinc-700 px-2.5 py-1 rounded-full transition-colors border border-zinc-700/50"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="p-3 border-t border-zinc-800">
        <form
          onSubmit={(e) => { e.preventDefault(); sendMessage(input); }}
          className="flex items-center gap-2"
        >
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={sudoActive ? t('ui.placeholderSudo') : t('ui.placeholder')}
            className={`flex-1 bg-zinc-800 border rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 ${
              sudoActive
                ? 'border-amber-500/30 focus:ring-amber-500/50'
                : 'border-zinc-700 focus:ring-purple-500/50'
            }`}
            disabled={isStreaming}
          />
          {isStreaming ? (
            <Button
              type="button"
              size="sm"
              onClick={stop}
              className="h-9 w-9 p-0 bg-red-500/20 hover:bg-red-500/30 text-red-400 hover:text-red-300"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
            </Button>
          ) : (
            <Button
              type="submit"
              size="sm"
              disabled={!input.trim()}
              className={`h-9 w-9 p-0 ${
                sudoActive
                  ? 'bg-gradient-to-r from-amber-600 to-orange-700 hover:from-amber-500 hover:to-orange-600 text-white'
                  : 'bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white'
              }`}
            >
              <Send className="w-4 h-4" />
            </Button>
          )}
        </form>
      </div>
    </div>
  );
}
