/**
 * /knowledge/[id] — Phase 154 Plan 02 detail server component.
 *
 * Reads the entry via `getKbEntry(id)` (Node-only) and passes plain JSON
 * to the `<KnowledgeDetail>` client component. Manual breadcrumb
 * (Pitfall 6) renders the real entry title instead of the auto-slug.
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { getKbEntry } from '@/lib/services/kb-index-cache';
import { KnowledgeDetail } from '@/components/knowledge/KnowledgeDetail';

export const dynamic = 'force-dynamic';

export default async function KnowledgeEntryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const entry = getKbEntry(id);
  if (!entry) notFound();

  const titleRaw = entry.frontmatter['title'];
  let title = id;
  if (typeof titleRaw === 'string') {
    title = titleRaw;
  } else if (titleRaw && typeof titleRaw === 'object' && !Array.isArray(titleRaw)) {
    const t = titleRaw as Record<string, unknown>;
    if (typeof t['es'] === 'string') title = t['es'] as string;
    else if (typeof t['en'] === 'string') title = t['en'] as string;
  }

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 lg:px-8 py-6">
      <nav className="flex items-center text-sm text-zinc-400 mb-6">
        <Link href="/" className="hover:text-zinc-50">
          Dashboard
        </Link>
        <ChevronRight className="w-4 h-4 mx-1.5" />
        <Link href="/knowledge" className="hover:text-zinc-50">
          Knowledge
        </Link>
        <ChevronRight className="w-4 h-4 mx-1.5" />
        <span className="text-zinc-50 truncate max-w-[380px]">{title}</span>
      </nav>
      <KnowledgeDetail entry={entry} title={title} />
    </div>
  );
}
