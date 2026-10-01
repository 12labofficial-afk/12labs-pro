import { NextRequest, NextResponse } from 'next/server';
import { reportServerError } from '@/lib/report-error';

import { safeContentType, SAFE_FILE_HEADERS, isSafeExternalUrl } from '@/lib/safe-content';
import { memoryLimit, clientIp, tooManyRequests } from '@/lib/rate-limit';
/**
 * Secure Cloud Storage Proxy
 * Strictly uses the 'cloud-bot' token for fetching assets.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  // Per-instance IP throttle: these proxy media bytes, so no DB write per hit.
  if (!memoryLimit(`cdn:${clientIp(request.headers)}`, 600, 60)) return tooManyRequests(60);
  const { fileId } = await params;
  
  if (!fileId || fileId === 'undefined' || fileId === 'null') {
    return new NextResponse('Invalid File ID provided.', { status: 400 });
  }

  // Strictly use the cloud-bot for file retrieval
  const token = process.env['cloud-bot'] || process.env.CLOUD_BOT;

  if (!token) {
    return new NextResponse('Storage service token not configured.', { status: 500 });
  }

  try {
    const cleanId = fileId.replace('tg://', '');
    const fileInfoRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${cleanId}`, {
      next: { revalidate: 3600 } 
    });

    if (!fileInfoRes.ok) {
        return new NextResponse('Node connectivity error.', { status: 502 });
    }

    const fileInfo = await fileInfoRes.json().catch(() => ({ ok: false }));
    if (!fileInfo.ok || !fileInfo.result?.file_path) {
        return new NextResponse('Resource not found in cloud vault.', { status: 404 });
    }

    const filePath = fileInfo.result.file_path;
    const fileUrl = `https://api.telegram.org/file/bot${token}/${filePath}`;

    const response = await fetch(fileUrl);
    
    if (!response.ok) {
        return new NextResponse('Binary stream failed.', { status: 502 });
    }

    const blob = await response.blob();
    const contentType = response.headers.get('Content-Type') || 'application/octet-stream';

    return new NextResponse(blob, {
      headers: {
        ...SAFE_FILE_HEADERS,
        'Content-Type': safeContentType(contentType),
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Disposition': `inline`,
      },
    });
  } catch (error: any) {
        reportServerError('src/app/api/cdn/[fileId]/route.ts:58', error);
    console.error(`[CDN Proxy] Retrieval error:`, error.message);
    return new NextResponse('Internal node error.', { status: 500 });
  }
}
