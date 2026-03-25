"use client";

import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageSquare, Send, Bot, User, Square, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { useSSEStream } from '@/hooks/use-sse-stream';
import { useTranslations } from 'next-intl';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { toast } from 'sonner';

interface CatPawChatSheetProps {
  pawId: string;
  pawName: string;
  pawEmoji: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  sources?: string[];
  isHistory?: boolean;
}

interface EntityCache {
  employees: Record<string, string>;
  projects: Record<string, string>;
  contacts: Record<string, string>;
  leads: Record<string, string>;
}

const EMPTY_CACHE: EntityCache = { employees: {}, projects: {}, contacts: {}, leads: {} };

export function CatPawChatSheet({ pawId, pawName, pawEmoji, open, onOpenChange }: CatPawChatSheetProps) {
  const t = useTranslations('agents');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streamingContent, setStreamingContent] = useState('');
  const [entityCache, setEntityCache] = useState<EntityCache>(EMPTY_CACHE);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyCount, setHistoryCount] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);
  const streamingContentRef = useRef('');

  const { start, stop, isStreaming } = useSSEStream({
    onToken: (token) => {
      streamingContentRef.current += token;
      setStreamingContent(streamingContentRef.current);
    },
    onDone: (data) => {
      const finalContent = streamingContentRef.current;
      const sources = (data as Record<string, unknown>).sources as string[] | undefined;
      const updatedCache = (data as Record<string, unknown>).entityCache as EntityCache | undefined;
      if (updatedCache) {
        setEntityCache(updatedCache);
      }
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: finalContent,
        sources: Array.isArray(sources) ? sources.map(s =>
          typeof s === 'string' ? s : (s as { payload?: { source_name?: string } })?.payload?.source_name || t('detail.chat.source')
        ) : undefined,
      }]);
      setStreamingContent('');
      streamingContentRef.current = '';
    },
    onError: () => {
      if (streamingContentRef.current) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: streamingContentRef.current,
        }]);
      } else {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: t('detail.chat.streamError'),
        }]);
      }
      setStreamingContent('');
      streamingContentRef.current = '';
    },
  });

  // Load chat history when sheet opens
  useEffect(() => {
    if (open && !historyLoaded) {
      (async () => {
        try {
          const res = await fetch(`/api/cat-paws/${pawId}/chat-history`);
          if (res.ok) {
            const data = await res.json();
            const historyMessages: ChatMessage[] = (data.messages || []).map(
              (m: { role: string; content: string }) => ({
                role: m.role as 'user' | 'assistant',
                content: m.content,
                isHistory: true,
              })
            );
            if (historyMessages.length > 0) {
              setHistoryCount(historyMessages.length);
              setMessages(historyMessages);
            }
          }
        } catch {
          // Silently fail — history is optional
        }
        setHistoryLoaded(true);
      })();
    }
  }, [open, historyLoaded, pawId]);

  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    shouldAutoScroll.current = distanceFromBottom < 100;
  }, []);

  useEffect(() => {
    if (shouldAutoScroll.current && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [streamingContent]);

  useEffect(() => {
    if (shouldAutoScroll.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || isStreaming) return;
    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    streamingContentRef.current = '';
    shouldAutoScroll.current = true;
    start(`/api/cat-paws/${pawId}/chat`, { message: userMessage, entityCache });
  };

  const handleClearHistory = async () => {
    try {
      const res = await fetch(`/api/cat-paws/${pawId}/chat-history`, { method: 'DELETE' });
      if (res.ok) {
        if (isStreaming) stop();
        setMessages([]);
        setStreamingContent('');
        streamingContentRef.current = '';
        setEntityCache(EMPTY_CACHE);
        setHistoryCount(0);
        toast.success(t('detail.chat.historyCleared'));
      } else {
        toast.error(t('detail.chat.clearHistoryError'));
      }
    } catch {
      toast.error(t('detail.chat.clearHistoryError'));
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="!w-[480px] !max-w-[90vw] !sm:max-w-[480px] bg-zinc-950 border-zinc-800 flex flex-col p-0"
        showCloseButton={false}
      >
        {/* Header */}
        <SheetHeader className="px-4 py-3 border-b border-zinc-800 flex-shrink-0">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2 text-zinc-50">
              <span className="text-lg">{pawEmoji}</span>
              {t('detail.chat.sheetTitle', { name: pawName })}
            </SheetTitle>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <AlertDialog>
                  <AlertDialogTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-zinc-500 hover:text-zinc-300 h-8 px-2"
                      />
                    }
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        {t('detail.chat.clearHistoryConfirm')}
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        {t('detail.chat.clearHistoryDescription')}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>
                        Cancel
                      </AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleClearHistory}
                        className="bg-red-600 text-white hover:bg-red-500"
                      >
                        {t('detail.chat.clearChat')}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </div>
        </SheetHeader>

        {/* Messages area */}
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
        >
          {messages.length === 0 && !isStreaming ? (
            <div className="h-full flex flex-col items-center justify-center px-4">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center mb-4">
                <MessageSquare className="w-6 h-6 text-white" />
              </div>
              <p className="text-sm text-zinc-500 text-center">{t('detail.chat.emptyState')}</p>
            </div>
          ) : (
            <>
              {messages.map((msg, idx) => {
                // Show separator between history and current session
                const showHistorySeparator = historyCount > 0 && idx === historyCount;

                return (
                  <div key={idx}>
                    {showHistorySeparator && (
                      <div className="flex items-center gap-3 my-4">
                        <div className="flex-1 border-t border-zinc-700/50" />
                        <span className="text-xs text-zinc-500 whitespace-nowrap">
                          {t('detail.chat.previousConversation')}
                        </span>
                        <div className="flex-1 border-t border-zinc-700/50" />
                      </div>
                    )}
                    <div className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      {msg.role === 'assistant' && (
                        <div className="w-7 h-7 rounded-full bg-violet-500/20 flex items-center justify-center flex-shrink-0 mt-1">
                          <Bot className="w-3.5 h-3.5 text-violet-500" />
                        </div>
                      )}

                      <div className={`max-w-[80%] rounded-lg px-3.5 py-2.5 ${
                        msg.role === 'user'
                          ? 'bg-violet-600 text-white rounded-tr-none'
                          : `bg-zinc-800 text-zinc-200 rounded-tl-none ${msg.isHistory ? 'opacity-70' : ''}`
                      }`}>
                        {msg.role === 'user' ? (
                          <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                        ) : (
                          <div className="prose prose-invert prose-sm max-w-none">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {msg.content}
                            </ReactMarkdown>
                          </div>
                        )}
                        {msg.sources && msg.sources.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {msg.sources.map((src, j) => (
                              <Badge key={j} className="bg-zinc-700 text-zinc-400 text-xs">{src}</Badge>
                            ))}
                          </div>
                        )}
                      </div>

                      {msg.role === 'user' && (
                        <div className="w-7 h-7 rounded-full bg-zinc-800 flex items-center justify-center flex-shrink-0 mt-1">
                          <User className="w-3.5 h-3.5 text-zinc-400" />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Streaming message */}
              {isStreaming && (
                <div className="flex gap-3 justify-start">
                  <div className="w-7 h-7 rounded-full bg-violet-500/20 flex items-center justify-center flex-shrink-0 mt-1">
                    <Bot className="w-3.5 h-3.5 text-violet-500" />
                  </div>
                  <div className="max-w-[80%] rounded-lg px-3.5 py-2.5 bg-zinc-800 text-zinc-200 rounded-tl-none">
                    {streamingContent ? (
                      <div className="prose prose-invert prose-sm max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {streamingContent}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <span className="text-sm text-zinc-400">{t('detail.chat.thinking')}</span>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="px-4 py-3 border-t border-zinc-800 flex-shrink-0">
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
              placeholder={t('detail.chat.placeholder')}
              className="bg-zinc-900 border-zinc-800 text-zinc-50 placeholder:text-zinc-500"
              disabled={isStreaming}
            />
            {isStreaming ? (
              <Button
                onClick={stop}
                variant="outline"
                size="sm"
                className="border-red-500/50 text-red-400 hover:bg-red-500/10 px-3"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
              </Button>
            ) : (
              <Button
                onClick={handleSend}
                disabled={!input.trim()}
                className="bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white px-3"
              >
                <Send className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
