import { NextRequest, NextResponse } from 'next/server';
import { reportServerError } from '@/lib/report-error';

import { safeContentType, SAFE_FILE_HEADERS, isSafeExternalUrl } from '@/lib/safe-content';
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const imageUrl = searchParams.get('url');
  const customFilename = searchParams.get('filename') || `12labs_thumbnail_${Date.now()}.png`;

  if (!imageUrl) {
    return NextResponse.json({ error: 'Image URL is required' }, { status: 400 });
  }

  if (!isSafeExternalUrl(imageUrl)) {
    return NextResponse.json({ error: 'URL not allowed' }, { status: 400 });
  }

  try {
    const res = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      },
    });

    if (!res.ok) {
      return NextResponse.json({ error: `Failed to fetch image: ${res.statusText}` }, { status: res.status });
    }

    const contentType = res.headers.get('content-type') || 'image/png';
    if (!contentType.toLowerCase().startsWith('image/')) {
      return NextResponse.json({ error: 'Not an image' }, { status: 415 });
    }
    const buffer = await res.arrayBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        ...SAFE_FILE_HEADERS,
        'Content-Type': safeContentType(contentType),
        'Content-Disposition': `attachment; filename="${customFilename.replace(/[^a-zA-Z0-9._-]/g, '_')}"`,
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (error: any) {
        reportServerError('src/app/api/download-image/route.ts:34', error);
    console.error('Proxy image download error:', error);
    return NextResponse.json({ error: error.message || 'Download failed' }, { status: 500 });
  }
}
