import { GET as cpGET, PATCH as cpPATCH, DELETE as cpDEL } from '../../cat-paws/[id]/route';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return cpGET(request, context);
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return cpPATCH(request, context);
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  return cpDEL(request, context);
}
