'use client';

import { useState, useCallback } from 'react';
import { Copy, Send, Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface PreviewPanelProps {
  html: string;
  templateId: string;
}

export default function PreviewPanel({ html, templateId }: PreviewPanelProps) {
  const t = useTranslations('catpower');
  const [copied, setCopied] = useState(false);
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [sendEmail, setSendEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<'success' | 'error' | null>(null);

  const handleCopyHtml = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(html);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const el = document.createElement('textarea');
      el.value = html;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [html]);

  const handleSendTest = useCallback(async () => {
    if (!sendEmail.trim()) return;
    setSending(true);
    setSendResult(null);
    try {
      const res = await fetch(`/api/email-templates/${templateId}/send-test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: sendEmail.trim(), html }),
      });
      if (res.ok) {
        setSendResult('success');
        setTimeout(() => {
          setSendModalOpen(false);
          setSendResult(null);
          setSendEmail('');
        }, 2000);
      } else {
        setSendResult('error');
      }
    } catch {
      setSendResult('error');
    } finally {
      setSending(false);
    }
  }, [sendEmail, html, templateId]);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-3 shrink-0">
        <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
          {t('templates.preview.title')}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopyHtml}
            className={`h-7 px-2.5 text-xs gap-1.5 ${
              copied
                ? 'text-green-400 bg-green-500/10'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5" />
                {t('templates.preview.copied')}
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                {t('templates.preview.copyHtml')}
              </>
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSendModalOpen(true)}
            className="h-7 px-2.5 text-xs gap-1.5 text-violet-400 hover:text-violet-300 hover:bg-violet-500/10"
          >
            <Send className="w-3.5 h-3.5" />
            {t('templates.preview.sendTest')}
          </Button>
        </div>
      </div>

      {/* Preview iframe */}
      <div className="flex-1 bg-zinc-100 rounded-xl overflow-hidden border border-zinc-700">
        {html ? (
          <iframe
            srcDoc={html}
            title="Email Preview"
            className="w-full h-full"
            sandbox="allow-same-origin"
            style={{ border: 'none', minHeight: '400px' }}
          />
        ) : (
          <div className="h-full flex items-center justify-center">
            <p className="text-sm text-zinc-400">{t('templates.preview.empty')}</p>
          </div>
        )}
      </div>

      {/* Send test modal */}
      {sendModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => {
              setSendModalOpen(false);
              setSendResult(null);
              setSendEmail('');
            }}
          />
          {/* Modal */}
          <div className="relative bg-zinc-900 border border-zinc-800 rounded-xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-base font-semibold text-zinc-100 mb-1">
              {t('templates.preview.sendTest')}
            </h3>
            <p className="text-xs text-zinc-500 mb-4">
              {t('templates.preview.sendTestDesc')}
            </p>

            <div className="space-y-3">
              <div>
                <Label className="text-zinc-400 text-xs mb-1.5 block">
                  {t('templates.preview.emailAddress')}
                </Label>
                <Input
                  type="email"
                  value={sendEmail}
                  onChange={(e) => setSendEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendTest()}
                  placeholder="test@example.com"
                  className="bg-zinc-800 border-zinc-700 text-zinc-200"
                  autoFocus
                />
              </div>

              {sendResult === 'success' && (
                <p className="text-xs text-green-400 flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5" />
                  {t('templates.preview.sendSuccess')}
                </p>
              )}
              {sendResult === 'error' && (
                <p className="text-xs text-red-400">{t('templates.preview.sendError')}</p>
              )}

              <div className="flex gap-2 pt-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSendModalOpen(false);
                    setSendResult(null);
                    setSendEmail('');
                  }}
                  className="flex-1 text-zinc-400 hover:text-zinc-200"
                >
                  {t('templates.preview.cancel')}
                </Button>
                <Button
                  size="sm"
                  onClick={handleSendTest}
                  disabled={!sendEmail.trim() || sending}
                  className="flex-1 bg-violet-600 hover:bg-violet-500 text-white"
                >
                  {sending ? (
                    <span className="flex items-center gap-1.5">
                      <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      {t('templates.preview.sending')}
                    </span>
                  ) : (
                    t('templates.preview.send')
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
