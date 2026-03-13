'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

interface UseSSEStreamOptions {
  onToken: (token: string) => void;
  onToolCallStart?: (data: { name: string }) => void;
  onToolCallResult?: (data: { name: string; result: unknown }) => void;
  onStage?: (data: { stage: string; message: string }) => void;
  onDone: (data: Record<string, unknown>) => void;
  onError: (error: Error) => void;
}

interface UseSSEStreamReturn {
  start: (url: string, body: Record<string, unknown>) => void;
  stop: () => void;
  isStreaming: boolean;
}

export function useSSEStream(options: UseSSEStreamOptions): UseSSEStreamReturn {
  const [isStreaming, setIsStreaming] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const tokenBufferRef = useRef('');
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const flushTokens = useCallback(() => {
    rafIdRef.current = null;
    if (tokenBufferRef.current) {
      const tokens = tokenBufferRef.current;
      tokenBufferRef.current = '';
      optionsRef.current.onToken(tokens);
    }
  }, []);

  const stop = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      // Flush any remaining tokens before stopping
      if (tokenBufferRef.current) {
        const tokens = tokenBufferRef.current;
        tokenBufferRef.current = '';
        optionsRef.current.onToken(tokens);
      }
      rafIdRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  const start = useCallback((url: string, body: Record<string, unknown>) => {
    // Abort any existing stream
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    tokenBufferRef.current = '';
    setIsStreaming(true);

    (async () => {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...body, stream: true }),
          signal: controller.signal,
        });

        if (!response.ok) {
          let errorMessage = `HTTP ${response.status}`;
          try {
            const errData = await response.json();
            errorMessage = errData.error || errData.message || errorMessage;
          } catch {
            // ignore parse error
          }
          setIsStreaming(false);
          optionsRef.current.onError(new Error(errorMessage));
          return;
        }

        const reader = response.body!.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        let currentEvent = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();

            if (trimmed.startsWith('event: ')) {
              currentEvent = trimmed.slice(7).trim();
              continue;
            }

            if (trimmed.startsWith('data: ')) {
              const dataStr = trimmed.slice(6);
              try {
                const data = JSON.parse(dataStr);
                switch (currentEvent) {
                  case 'token':
                    tokenBufferRef.current += data.token || '';
                    if (rafIdRef.current === null) {
                      rafIdRef.current = requestAnimationFrame(flushTokens);
                    }
                    break;
                  case 'tool_call_start':
                    if (optionsRef.current.onToolCallStart) {
                      optionsRef.current.onToolCallStart(data);
                    }
                    break;
                  case 'tool_call_result':
                    if (optionsRef.current.onToolCallResult) {
                      optionsRef.current.onToolCallResult(data);
                    }
                    break;
                  case 'stage':
                    if (optionsRef.current.onStage) {
                      optionsRef.current.onStage(data);
                    }
                    break;
                  case 'done':
                    // Flush any remaining tokens before signaling done
                    if (rafIdRef.current !== null) {
                      cancelAnimationFrame(rafIdRef.current);
                      rafIdRef.current = null;
                    }
                    if (tokenBufferRef.current) {
                      const tokens = tokenBufferRef.current;
                      tokenBufferRef.current = '';
                      optionsRef.current.onToken(tokens);
                    }
                    setIsStreaming(false);
                    optionsRef.current.onDone(data);
                    return;
                  case 'error':
                    setIsStreaming(false);
                    optionsRef.current.onError(new Error(data.message || 'Stream error'));
                    return;
                  case 'start':
                    // Stream started, nothing to do
                    break;
                  default:
                    break;
                }
              } catch {
                // Skip malformed JSON
              }
              currentEvent = '';
              continue;
            }
          }
        }

        // Stream ended without explicit done event
        if (rafIdRef.current !== null) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }
        if (tokenBufferRef.current) {
          const tokens = tokenBufferRef.current;
          tokenBufferRef.current = '';
          optionsRef.current.onToken(tokens);
        }
        setIsStreaming(false);
      } catch (error: unknown) {
        if (error instanceof Error && error.name === 'AbortError') {
          // User-initiated stop — not an error
          setIsStreaming(false);
          return;
        }
        setIsStreaming(false);
        optionsRef.current.onError(error instanceof Error ? error : new Error(String(error)));
      }
    })();
  }, [flushTokens]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return { start, stop, isStreaming };
}
