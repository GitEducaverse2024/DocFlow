"use client";

import { useState, useRef, useEffect, useCallback } from 'react';
import { Project } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send, Bot, User, MessageCircle, Sparkles, Square } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useSSEStream } from '@/hooks/use-sse-stream';

interface ChatPanelProps {
  project: Project;
}

interface Message {
  role: 'user' | 'bot';
  content: string;
  sources?: { payload: { text: string } }[];
}

export function ChatPanel({ project }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streamingContent, setStreamingContent] = useState('');
  const [vectorCount, setVectorCount] = useState<number | null>(null);
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
      setMessages(prev => [...prev, {
        role: 'bot',
        content: finalContent,
        sources: (data as Record<string, unknown>).sources as Message['sources'],
      }]);
      setStreamingContent('');
      streamingContentRef.current = '';
    },
    onError: (error) => {
      if (streamingContentRef.current) {
        const partialContent = streamingContentRef.current;
        setMessages(prev => [...prev, {
          role: 'bot',
          content: partialContent,
        }]);
      } else {
        setMessages(prev => [...prev, {
          role: 'bot',
          content: 'Lo siento, ha ocurrido un error al procesar tu mensaje.',
        }]);
      }
      setStreamingContent('');
      streamingContentRef.current = '';
      console.error('Stream error:', error);
    },
  });

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
  }, [streamingContent]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (shouldAutoScroll.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Fetch vector count for welcome message
  useEffect(() => {
    if (project.rag_collection) {
      fetch(`/api/projects/${project.id}/rag/info`)
        .then(res => res.json())
        .then(data => { if (data.vectorCount) setVectorCount(data.vectorCount); })
        .catch(() => {});
    }
  }, [project.id, project.rag_collection]);

  if (!(project.rag_enabled ?? 0) || !project.rag_collection) {
    return (
      <div className="text-center py-16 border border-zinc-800 border-dashed rounded-lg bg-zinc-900/50 flex flex-col items-center justify-center">
        <MessageCircle className="w-16 h-16 text-zinc-700 mb-4" />
        <h3 className="text-xl font-medium text-zinc-50 mb-2">El chat no esta disponible</h3>
        <p className="text-zinc-400 max-w-md mx-auto mb-6">
          Para usar el chat, primero necesitas indexar las fuentes en la pestana RAG.
        </p>
        <Button
          onClick={() => {
            const ragTab = document.querySelector('[value="rag"]') as HTMLElement;
            if (ragTab) ragTab.click();
          }}
          className="bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white"
        >
          Ir a RAG
        </Button>
      </div>
    );
  }

  const handleSend = () => {
    if (!input.trim() || isStreaming) return;
    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    streamingContentRef.current = '';
    shouldAutoScroll.current = true;
    start(`/api/projects/${project.id}/chat`, { message: userMessage });
  };

  return (
    <Card className="bg-zinc-900 border-zinc-800 flex flex-col h-[600px]">
      <CardContent className="flex-1 p-0 flex flex-col overflow-hidden">
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-4 space-y-4"
        >
          {messages.length === 0 && !isStreaming ? (
            <div className="h-full flex flex-col items-center justify-center px-4">
              <div className="max-w-md w-full bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-6 text-center">
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-violet-500 to-emerald-500 flex items-center justify-center mx-auto mb-4">
                  <Sparkles className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-lg font-semibold text-zinc-50 mb-2">Tu asistente esta listo</h3>
                <p className="text-sm text-zinc-400 mb-5">
                  Preguntale cualquier cosa sobre tu documentacion.
                  {vectorCount && <> Tiene acceso a <span className="text-emerald-400 font-medium">{vectorCount} vectores</span> de conocimiento del proyecto.</>}
                </p>
                <div className="text-left space-y-2">
                  <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider mb-2">Ejemplos de preguntas</p>
                  {[
                    'Cuales son las tecnologias principales?',
                    'Resume los puntos clave del proyecto',
                    'Que riesgos se identificaron?',
                  ].map((q, i) => (
                    <button
                      key={i}
                      onClick={() => { setInput(q); }}
                      className="w-full text-left text-sm text-zinc-300 hover:text-zinc-50 bg-zinc-900/50 hover:bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-lg px-3 py-2 transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            messages.map((msg, idx) => (
              <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'bot' && (
                  <div className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center flex-shrink-0 mt-1">
                    <Bot className="w-4 h-4 text-violet-500" />
                  </div>
                )}

                <div className={`max-w-[80%] rounded-lg p-4 ${
                  msg.role === 'user'
                    ? 'bg-violet-600 text-white rounded-tr-none'
                    : 'bg-zinc-800 text-zinc-200 rounded-tl-none'
                }`}>
                  {msg.role === 'user' ? (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  ) : (
                    <div className="prose prose-invert prose-sm max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>

                {msg.role === 'user' && (
                  <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center flex-shrink-0 mt-1">
                    <User className="w-4 h-4 text-zinc-400" />
                  </div>
                )}
              </div>
            ))
          )}

          {isStreaming && (
            <div className="flex gap-3 justify-start">
              <div className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center flex-shrink-0 mt-1">
                <Bot className="w-4 h-4 text-violet-500" />
              </div>
              <div className="max-w-[80%] rounded-lg p-4 bg-zinc-800 text-zinc-200 rounded-tl-none">
                <div className={`prose prose-invert prose-sm max-w-none ${streamingContent ? 'streaming-cursor' : ''}`}>
                  {streamingContent ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {streamingContent}
                    </ReactMarkdown>
                  ) : (
                    <span className="text-sm text-zinc-400">Pensando...</span>
                  )}
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 border-t border-zinc-800 bg-zinc-950">
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
              placeholder="Pregunta algo sobre la documentacion del proyecto..."
              className="bg-zinc-900 border-zinc-800 text-zinc-50"
              disabled={isStreaming}
            />
            {isStreaming ? (
              <Button
                onClick={stop}
                variant="outline"
                className="border-red-500/50 text-red-400 hover:bg-red-500/10"
              >
                <Square className="w-4 h-4 mr-1 fill-current" />
                Parar generacion
              </Button>
            ) : (
              <Button
                onClick={handleSend}
                disabled={!input.trim()}
                className="bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white"
              >
                <Send className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
