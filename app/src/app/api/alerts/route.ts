import { NextRequest, NextResponse } from 'next/server';
import { AlertService } from '@/lib/services/alert-service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const pendingOnly = searchParams.get('pending') === 'true';
    const alerts = AlertService.getAlerts(pendingOnly);
    return NextResponse.json({ alerts });
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to fetch alerts', details: String(err) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (body.action === 'acknowledge_all') {
      AlertService.acknowledgeAll();
      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { error: 'Unknown action' },
      { status: 400 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to process alert action', details: String(err) },
      { status: 500 }
    );
  }
}
