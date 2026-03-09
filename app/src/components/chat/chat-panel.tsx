"use client";

import { useState, useRef, useEffect } from 'react';
import { Project } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Send, Bot, User, MessageCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

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
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  if (!(project.rag_enabled ?? 0) || !project.rag_collection) {
    return (
      <div className="text-center py-16 border border-zinc-800 border-dashed rounded-lg bg-zinc-900/50 flex flex-col items-center justify-center">
        <MessageCircle className="w-16 h-16 text-zinc-700 mb-4" />
        <h3 className="text-xl font-medium text-zinc-50 mb-2">El chat no está disponible</h3>
        <p className="text-zinc-400 max-w-md mx-auto mb-6">
          Para usar el chat, primero necesitas indexar las fuentes en la pestaña RAG.
        </p>
        <Button 
          onClick={() => {
            const ragTab = document.querySelector('[value="rag"]') as HTMLElement;
            if (ragTab) ragTab.click();
          }}
          className="bg-violet-500 hover:bg-violet-400 text-white"
        >
          Ir a RAG
        </Button>
      </div>
    );
  }

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const res = await fetch(`/api/projects/${project.id}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage })
      });

      if (!res.ok) throw new Error('Error en el chat');

      const data = await res.json();
      setMessages(prev => [...prev, { role: 'bot', content: data.reply, sources: data.sources }]);
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [...prev, { role: 'bot', content: 'Lo siento, ha ocurrido un error al procesar tu mensaje.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="bg-zinc-900 border-zinc-800 flex flex-col h-[600px]">
      <CardContent className="flex-1 p-0 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-zinc-500">
              <MessageCircle className="w-12 h-12 mb-4 opacity-50" />
              <p>💬 Chatea con tu documentación.</p>
              <p className="text-sm mt-2">Haz una pregunta y el bot responderá basándose en las fuentes indexadas.</p>
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
          
          {isLoading && (
            <div className="flex gap-3 justify-start">
              <div className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center flex-shrink-0 mt-1">
                <Bot className="w-4 h-4 text-violet-500" />
              </div>
              <div className="bg-zinc-800 rounded-lg rounded-tl-none p-4 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
                <span className="text-sm text-zinc-400">Pensando...</span>
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
              placeholder="Pregunta algo sobre la documentación del proyecto..."
              className="bg-zinc-900 border-zinc-800 text-zinc-50"
              disabled={isLoading}
            />
            <Button 
              onClick={handleSend} 
              disabled={!input.trim() || isLoading}
              className="bg-violet-600 hover:bg-violet-500 text-white"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
