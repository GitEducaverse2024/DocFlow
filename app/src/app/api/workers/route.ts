import { GET as catPawsGET, POST as catPawsPOST } from '../cat-paws/route';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  url.searchParams.set('mode', 'processor');
  const proxiedRequest = new Request(url.toString(), request);
  return catPawsGET(proxiedRequest);
}

export async function POST(request: Request) {
  return catPawsPOST(request);
}
