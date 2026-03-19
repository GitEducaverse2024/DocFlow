import { GET as catPawsGET, POST as catPawsPOST } from '../cat-paws/route';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return catPawsGET(request);
}

export async function POST(request: Request) {
  return catPawsPOST(request);
}
