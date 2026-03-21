"use client";

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { FlaskConical, Play, Loader2 } from 'lucide-react';
import { useTestRunner } from '@/hooks/use-test-runner';
import { useLogViewer } from '@/hooks/use-log-viewer';
import { TestSummaryBar } from '@/components/testing/test-summary-bar';
import { TestSectionList } from '@/components/testing/test-section-list';
import { TestRunHistory } from '@/components/testing/test-run-history';
import { TestAiGenerator } from '@/components/testing/test-ai-generator';
import { LogFilters } from '@/components/testing/log-filters';
import { LogViewer } from '@/components/testing/log-viewer';

type TabId = 'results' | 'history' | 'logs';

const tabs: Array<{ id: TabId; labelKey: string }> = [
  { id: 'results', labelKey: 'tabs.results' },
  { id: 'history', labelKey: 'tabs.history' },
  { id: 'logs', labelKey: 'tabs.logs' },
];

export default function TestingPage() {
  const t = useTranslations('testing');
  const [activeTab, setActiveTab] = useState<TabId>('results');
  const { runs, latestRun, isRunning, loading, runTests } = useTestRunner();
  const {
    entries: logEntries,
    level: logLevel,
    source: logSource,
    search: logSearch,
    loading: logLoading,
    autoRefresh,
    setLevel: setLogLevel,
    setSource: setLogSource,
    setSearch: setLogSearch,
    setAutoRefresh,
    downloadLogs,
  } = useLogViewer();

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-violet-600/20 rounded-lg">
          <FlaskConical className="w-6 h-6 text-violet-400" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-zinc-50">{t('title')}</h1>
          <p className="text-sm text-zinc-400">
            {t('description')}
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <TestAiGenerator />
          <button
            onClick={() => runTests()}
            disabled={isRunning}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 text-white font-medium hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isRunning ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            {t('runAll')}
          </button>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-6 border-b border-zinc-800">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`pb-3 px-1 text-sm font-medium transition-colors border-b-2 ${
              activeTab === tab.id
                ? 'border-violet-500 text-violet-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'results' && (
          <div id="results-tab" className="space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
              </div>
            ) : (
              <>
                <TestSummaryBar latestRun={latestRun} isRunning={isRunning} />
                <TestSectionList
                  latestRun={latestRun}
                  isRunning={isRunning}
                  onRunSection={(s) => runTests(s)}
                />
              </>
            )}
          </div>
        )}
        {activeTab === 'history' && (
          <div id="history-tab">
            <TestRunHistory runs={runs} />
          </div>
        )}
        {activeTab === 'logs' && (
          <div id="logs-tab" className="space-y-4">
            <LogFilters
              level={logLevel}
              source={logSource}
              search={logSearch}
              autoRefresh={autoRefresh}
              onLevelChange={setLogLevel}
              onSourceChange={setLogSource}
              onSearchChange={setLogSearch}
              onAutoRefreshChange={setAutoRefresh}
              onDownload={downloadLogs}
            />
            <LogViewer entries={logEntries} loading={logLoading} />
          </div>
        )}
      </div>
    </div>
  );
}
