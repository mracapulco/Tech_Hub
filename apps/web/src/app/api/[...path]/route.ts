import type { NextRequest } from 'next/server'
export const runtime = 'nodejs'

const TARGET_BASE = process.env.INTERNAL_API_URL || 'http://api:3000';

async function forward(req: NextRequest, ctx: { params: { path: string[] } }) {
  const path = (ctx.params?.path || []).join('/');
  const qs = req.nextUrl.search || '';
  const url = `${TARGET_BASE}/${path}${qs}`;
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => {
    if (k.toLowerCase() === 'host') return;
    headers[k] = v;
  });
  const init: RequestInit = { method: req.method, headers };
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const ct = req.headers.get('content-type') || '';
    if (ct.includes('application/json') || ct.includes('text/')) {
      init.body = await req.text();
    } else {
      const ab = await req.arrayBuffer();
      init.body = Buffer.from(ab);
    }
  }
  const res = await fetch(url, init);
  return new Response(res.body, { status: res.status, headers: res.headers });
}

export async function GET(req: NextRequest, ctx: any) { return forward(req, ctx); }
export async function POST(req: NextRequest, ctx: any) { return forward(req, ctx); }
export async function PUT(req: NextRequest, ctx: any) { return forward(req, ctx); }
export async function DELETE(req: NextRequest, ctx: any) { return forward(req, ctx); }
