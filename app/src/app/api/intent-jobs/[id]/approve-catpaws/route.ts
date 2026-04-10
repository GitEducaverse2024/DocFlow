import { NextResponse } from 'next/server';
import { resolveCatPawsForJob, type CatPawInput } from '@/lib/services/catpaw-approval';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  let body: { catpaws?: CatPawInput[] } = {};
  try {
    body = (await request.json()) as { catpaws?: CatPawInput[] };
  } catch {
    // empty body is acceptable — we fall back to cat_paws_needed in progress_message
  }

  try {
    const result = resolveCatPawsForJob(params.id, body.catpaws);
    return NextResponse.json({ ok: true, created: result.created });
  } catch (err) {
    const message = (err as Error).message;
    if (message === 'Job not found') {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
