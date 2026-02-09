import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get('url');

  if (!url) {
    return NextResponse.json({ ok: false, error: 'Missing query param: url' }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid url' }, { status: 400 });
  }

  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return NextResponse.json({ ok: false, error: 'Unsupported protocol' }, { status: 400 });
  }

  const upstream = await fetch(target.toString(), {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      Referer: 'https://comic.naver.com/',
      Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
    },
    cache: 'force-cache',
  });

  if (!upstream.ok) {
    return NextResponse.json(
      { ok: false, error: `Upstream error: ${upstream.status}` },
      { status: upstream.status },
    );
  }

  const contentType = upstream.headers.get('content-type') ?? 'image/jpeg';
  const body = upstream.body;
  if (!body) {
    return NextResponse.json({ ok: false, error: 'Empty upstream body' }, { status: 502 });
  }

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
    },
  });
}
