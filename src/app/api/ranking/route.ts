import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    ok: true,
    data: {
      date: new Date().toISOString().slice(0, 10),
      platform: 'all',
      source: 'external',
      works: [],
    },
  });
}
