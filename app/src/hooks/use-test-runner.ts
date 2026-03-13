"use client";

import { useState, useEffect, useCallback, useRef } from 'react';

export interface TestResult {
  title: string;
  file: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  error?: string;
}

export interface TestRun {
  id: string;
  type: string;
  section: string | null;
  status: string;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  duration_seconds: number;
  results_json: TestResult[];
  created_at: string;
}

export function useTestRunner() {
  const [runs, setRuns] = useState<TestRun[]>([]);
  const [latestRun, setLatestRun] = useState<TestRun | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [runOutput, setRunOutput] = useState('');
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchResults = useCallback(async () => {
    try {
      const res = await fetch('/api/testing/results?limit=10');
      if (!res.ok) return;
      const data: TestRun[] = await res.json();
      setRuns(data);
      setLatestRun(data.length > 0 ? data[0] : null);
    } catch {
      // silently ignore fetch errors
    }
  }, []);

  const runTests = useCallback(async (section?: string) => {
    try {
      const body: Record<string, string> = {};
      if (section) body.section = section;

      const res = await fetch('/api/testing/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) return;

      setIsRunning(true);
      setRunOutput('');
    } catch {
      // silently ignore
    }
  }, []);

  // Poll status every 2s while running
  useEffect(() => {
    if (!isRunning) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(async () => {
      try {
        const res = await fetch('/api/testing/status');
        if (!res.ok) return;
        const data = await res.json();

        if (data.output) {
          setRunOutput(data.output);
        }

        if (data.status !== 'running') {
          setIsRunning(false);
          await fetchResults();
        }
      } catch {
        // silently ignore
      }
    }, 2000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isRunning, fetchResults]);

  // Fetch results on mount
  useEffect(() => {
    fetchResults().finally(() => setLoading(false));
  }, [fetchResults]);

  return { runs, latestRun, isRunning, runOutput, loading, runTests, fetchResults };
}
