import { NextResponse } from 'next/server';
import { getAllKnowledgeAreas } from '@/lib/knowledge-tree';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const areas = getAllKnowledgeAreas();

    const tree = areas.map((area) => {
      const counts = {
        tools: area.tools?.length ?? 0,
        concepts: area.concepts?.length ?? 0,
        howto: area.howto?.length ?? 0,
        dont: area.dont?.length ?? 0,
        common_errors: area.common_errors?.length ?? 0,
        endpoints: area.endpoints?.length ?? 0,
        sources: area.sources?.length ?? 0,
      };

      const totalSections = 7;
      const filledSections = Object.values(counts).filter((c) => c > 0).length;
      const completeness = Math.round((filledSections / totalSections) * 100) / 100;

      return {
        id: area.id,
        name: area.name,
        path: area.path,
        updated_at: area.updated_at,
        counts,
        completeness,
      };
    });

    return NextResponse.json({ areas: tree });
  } catch (error) {
    logger.error('Failed to get knowledge tree', { error });
    return NextResponse.json({ error: 'Failed to load knowledge tree' }, { status: 500 });
  }
}
