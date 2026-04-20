/**
 * /knowledge — Phase 154 Plan 02 server component entry.
 *
 * Reads `_index.json` via the Node-only `kb-index-cache.getKbIndex()`,
 * passes plain JSON to client components. `dynamic = 'force-dynamic'`
 * per MEMORY.md mandate + Pitfall 4 (avoid static prerender of the KB
 * which Phase 153 hooks mutate at runtime).
 */
import { BookOpen } from 'lucide-react';
import { getKbIndex } from '@/lib/services/kb-index-cache';
import { PageHeader } from '@/components/layout/page-header';
import { KnowledgeCountsBar } from '@/components/knowledge/KnowledgeCountsBar';
import { KnowledgeTimeline } from '@/components/knowledge/KnowledgeTimeline';
import { KnowledgeTable } from '@/components/knowledge/KnowledgeTable';

export const dynamic = 'force-dynamic';

export default async function KnowledgePage() {
  const index = getKbIndex();
  if (!index) {
    return (
      <div className="p-8 max-w-7xl mx-auto">
        <PageHeader
          title="Knowledge Base"
          description="KB no disponible"
          icon={<BookOpen className="w-8 h-8" />}
        />
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-12 text-center">
          <BookOpen className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
          <p className="text-zinc-400">
            El Knowledge Base no está disponible. Ejecuta{' '}
            <code className="text-violet-300">
              scripts/kb-sync.cjs --full-rebuild --source db
            </code>{' '}
            para poblarlo.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Knowledge Base"
        description={`${index.entry_count} recursos en el KB`}
        icon={<BookOpen className="w-8 h-8" />}
      />
      <KnowledgeCountsBar counts={index.header.counts} />
      <KnowledgeTimeline changes={index.header.last_changes} />
      <KnowledgeTable entries={index.entries} />
    </div>
  );
}
