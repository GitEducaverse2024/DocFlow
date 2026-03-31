"use client";

import { useEffect } from 'react';
import { detectService, pushErrorToHistory } from '@/lib/error-formatter';
import type { CatBotError } from '@/lib/error-formatter';

// Endpoints to ignore (polling/health) to avoid spamming notifications
const IGNORED_ENDPOINTS = [
  '/api/system',
  '/api/health',
  '/api/testing/status',
  '/api/testing/runs',
  '/api/notifications',
  '/api/canvas/runs/',
  '/api/telegram/',
];

function shouldIgnore(url: string): boolean {
  return IGNORED_ENDPOINTS.some(ep => url.includes(ep));
}

/**
 * Send error to notifications API (non-intrusive bell icon).
 * Uses XMLHttpRequest to avoid recursive fetch interception.
 */
function sendErrorToNotifications(error: CatBotError): void {
  try {
    const service = error.service ? ` [${error.service}]` : '';
    const status = error.statusCode ? ` (${error.statusCode})` : '';
    const title = `Error${service}${status}`;
    const message = `${error.message}\n${error.endpoint ? 'Endpoint: ' + error.endpoint : ''}${error.page ? '\nPagina: ' + error.page : ''}`;

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/notifications', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.send(JSON.stringify({
      type: 'system',
      title,
      message,
      severity: 'error',
      link: error.page || undefined,
    }));
  } catch {
    // Silently fail — don't let notification sending break the app
  }
}

export function useErrorInterceptor() {
  useEffect(() => {
    const originalFetch = window.fetch;

    window.fetch = async function (...args: Parameters<typeof fetch>) {
      const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request).url;

      try {
        const response = await originalFetch.apply(this, args);

        if (response.status >= 400 && !shouldIgnore(url)) {
          const cloned = response.clone();
          let errorMessage = `HTTP ${response.status}`;

          try {
            const body = await cloned.json();
            errorMessage = body.error?.message || body.error || body.details || body.message || errorMessage;
            if (typeof errorMessage === 'object') errorMessage = JSON.stringify(errorMessage);
          } catch {
            try {
              const text = await cloned.text();
              if (text.length < 500) errorMessage = text;
            } catch { /* ignore */ }
          }

          const endpoint = url.split('?')[0];
          const error: CatBotError = {
            message: String(errorMessage).slice(0, 500),
            endpoint,
            statusCode: response.status,
            page: window.location.pathname,
            timestamp: Date.now(),
            source: 'fetch',
            service: detectService(url),
          };

          pushErrorToHistory(error);
          sendErrorToNotifications(error);
        }

        return response;
      } catch (networkError) {
        if (!shouldIgnore(url)) {
          const endpoint = url.split('?')[0];
          const error: CatBotError = {
            message: (networkError as Error).message || 'Error de red',
            endpoint,
            statusCode: 0,
            page: window.location.pathname,
            timestamp: Date.now(),
            source: 'fetch',
            service: detectService(url),
          };

          pushErrorToHistory(error);
          sendErrorToNotifications(error);
        }
        throw networkError;
      }
    };

    const IGNORED_JS_ERRORS = [
      'ResizeObserver loop',
      'ResizeObserver loop completed',
    ];

    const handleError = (event: ErrorEvent) => {
      const msg = event.message || 'Error JavaScript no capturado';
      if (IGNORED_JS_ERRORS.some(pattern => msg.includes(pattern))) return;

      const error: CatBotError = {
        message: msg,
        endpoint: event.filename || '',
        statusCode: 0,
        page: window.location.pathname,
        timestamp: Date.now(),
        source: 'js',
      };
      pushErrorToHistory(error);
      sendErrorToNotifications(error);
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      const msg = event.reason?.message || String(event.reason) || 'Promise rechazada';
      const error: CatBotError = {
        message: String(msg).slice(0, 500),
        endpoint: '',
        statusCode: 0,
        page: window.location.pathname,
        timestamp: Date.now(),
        source: 'js',
      };
      pushErrorToHistory(error);
      sendErrorToNotifications(error);
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);

    return () => {
      window.fetch = originalFetch;
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);
}
