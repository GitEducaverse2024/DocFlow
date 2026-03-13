"use client";

import { useState } from 'react';
import { FlaskConical } from 'lucide-react';

type TabId = 'results' | 'history' | 'logs';

const tabs: Array<{ id: TabId; label: string }> = [
  { id: 'results', label: 'Resultados' },
  { id: 'history', label: 'Historial' },
  { id: 'logs', label: 'Logs' },
];

export default function TestingPage() {
  const [activeTab, setActiveTab] = useState<TabId>('results');

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-violet-600/20 rounded-lg">
          <FlaskConical className="w-6 h-6 text-violet-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-zinc-50">Testing</h1>
          <p className="text-sm text-zinc-400">
            Panel de pruebas y logs de la aplicacion
          </p>
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
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'results' && (
          <div id="results-tab" className="text-zinc-400">
            Resultados content placeholder
          </div>
        )}
        {activeTab === 'history' && (
          <div id="history-tab" className="text-zinc-400">
            Historial content placeholder
          </div>
        )}
        {activeTab === 'logs' && (
          <div id="logs-tab" className="text-zinc-400">
            Logs content placeholder
          </div>
        )}
      </div>
    </div>
  );
}
