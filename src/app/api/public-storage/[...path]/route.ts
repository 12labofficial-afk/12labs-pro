
import { NextRequest, NextResponse } from 'next/server';
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { r2Client, R2_BUCKET } from '@/lib/r2';

/**
 * 🔓 CLOUDFLARE R2 PUBLIC STORAGE PROXY
 * ----------------------------------------------------
 * Serves public assets strictly from Cloudflare R2 storage bucket.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  
  if (!path || path.length === 0) {
    return new NextResponse('Invalid Public Node', { status: 400 });
  }

  const rawPath = path.join('/').replace(/^\/+/, '');
  if (rawPath.startsWith('secure/') || rawPath === 'secure') {
    return new NextResponse('Private asset.', { status: 404 });
  }

  // Candidates for R2 key lookup
  const candidateKeys: string[] = [
    rawPath,
    `public/${rawPath}`,
    `public/${rawPath.replace(/^(public|secure)\//, '')}`,
  ];

  const uniqueKeys = Array.from(new Set(candidateKeys.map(k => k.replace(/\/+/g, '/').replace(/^\//, '')))).filter(Boolean);

  if (R2_BUCKET) {
    for (const objectKey of uniqueKeys) {
      try {
        const command = new GetObjectCommand({
          Bucket: R2_BUCKET,
          Key: objectKey,
        });

        const response = await r2Client.send(command);

        if (response.Body) {
          const stream = response.Body as any;
          const readable = new ReadableStream({
            async start(controller) {
              for await (const chunk of stream) controller.enqueue(chunk);
              controller.close();
            },
            cancel() { if (stream.destroy) stream.destroy(); }
          });

          return new NextResponse(readable, {
            headers: {
              'Content-Type': response.ContentType || 'audio/wav',
              'Cache-Control': 'public, max-age=86400',
              'Access-Control-Allow-Origin': '*',
              ...(response.ContentLength ? { 'Content-Length': response.ContentLength.toString() } : {}),
            },
          });
        }
      } catch (error: any) {
        // Continue to next candidate key
      }
    }
  }

  return new NextResponse('Public Asset Not Found in Storage Hub.', { status: 404 });
}
