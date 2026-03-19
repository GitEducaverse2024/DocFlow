"use client";

import { useEffect } from 'react';
import { detectService, pushErrorToHistory } from '@/lib/error-formatter';
import type { CatBotError } from '@/lib/error-formatter';

// Endpoints to ignore (polling/health) to avoid spamming CatBot
const IGNORED_ENDPOINTS = [
  '/api/system',
  '/api/health',
  '/api/testing/status',
  '/api/testing/runs',
  '/api/notifications/count',
  '/api/canvas/runs/',
];

function shouldIgnore(url: string): boolean {
  return IGNORED_ENDPOINTS.some(ep => url.includes(ep));
}

export function useErrorInterceptor() {
  useEffect(() => {
    const originalFetch = window.fetch;

    window.fetch = async function (...args: Parameters<typeof fetch>) {
      const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request).url;

      try {
        const response = await originalFetch.apply(this, args);

        if (response.status >= 400 && !shouldIgnore(url)) {
          // Clone to read body without consuming
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
          window.dispatchEvent(new CustomEvent('catbot:error', { detail: error }));
        }

        return response;
      } catch (networkError) {
        // Network errors (ECONNREFUSED, etc.)
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
          window.dispatchEvent(new CustomEvent('catbot:error', { detail: error }));
        }
        throw networkError;
      }
    };

    // Unhandled JS errors
    const handleError = (event: ErrorEvent) => {
      const error: CatBotError = {
        message: event.message || 'Error JavaScript no capturado',
        endpoint: event.filename || '',
        statusCode: 0,
        page: window.location.pathname,
        timestamp: Date.now(),
        source: 'js',
      };
      pushErrorToHistory(error);
      window.dispatchEvent(new CustomEvent('catbot:error', { detail: error }));
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
      window.dispatchEvent(new CustomEvent('catbot:error', { detail: error }));
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
