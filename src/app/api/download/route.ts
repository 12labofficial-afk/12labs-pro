import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { r2Client, R2_BUCKET } from "@/lib/r2";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rawUrl = searchParams.get("url");
  const filename = searchParams.get("filename") || "12labs_audio.mp3";

  const isInline = searchParams.get("inline") === "1";

  if (!rawUrl) {
    return new NextResponse("Missing url parameter", { status: 400 });
  }

  let buffer: Buffer | null = null;
  let contentType = "audio/mpeg";

  let candidateKeys: string[] = [];
  const urlStr = rawUrl.trim();
  if (/^https?:\/\//i.test(urlStr)) {
    try {
      const hostname = new URL(urlStr).hostname.toLowerCase();
      if (!['storage.12labs.in', 'res.cloudinary.com'].includes(hostname)) {
        return new NextResponse('External download host is not allowed.', { status: 403 });
      }
    } catch {
      return new NextResponse('Invalid download URL.', { status: 400 });
    }
  }

  // Determine content type by file extension if possible
  if (urlStr.endsWith('.wav')) contentType = 'audio/wav';
  else if (urlStr.endsWith('.ogg')) contentType = 'audio/ogg';
  else if (urlStr.endsWith('.m4a') || urlStr.endsWith('.mp4')) contentType = 'audio/mp4';
  else contentType = 'audio/mpeg';

  if (urlStr.startsWith("pub://")) {
    const raw = urlStr.replace("pub://", "").replace(/^\/+/, "");
    candidateKeys.push(`public/${raw}`, raw, `public/music/public/library/${raw}`, `music/public/library/${raw}`);
  } else if (urlStr.startsWith("gcs://")) {
    const raw = urlStr.replace("gcs://", "").replace(/^\/+/, "");
    candidateKeys.push(`secure/${raw}`, raw, `secure/music/vault/${raw}`, `music/vault/${raw}`);
  } else {
    try {
      const parsedUrl = new URL(urlStr, "https://dummy.local");
      let pathStr = parsedUrl.pathname.replace(/^\/+/, "");
      pathStr = pathStr.replace(/^api\/public-storage\//, "").replace(/^api\/storage\//, "");
      candidateKeys.push(pathStr, `public/${pathStr}`, `secure/${pathStr}`, `temp/${pathStr}`, pathStr.replace(/^(public|secure|temp)\//, ""));
    } catch (e) {
      const rawPath = urlStr.replace(/^\/+/, "").replace(/^api\/public-storage\//, "").replace(/^api\/storage\//, "");
      candidateKeys.push(rawPath, `public/${rawPath}`, `secure/${rawPath}`, `temp/${rawPath}`);
    }
  }

  candidateKeys = Array.from(new Set(candidateKeys.map((k) => k.replace(/\/+/g, "/").replace(/^\//, "")))).filter(Boolean);

  if (R2_BUCKET) {
    for (const key of candidateKeys) {
      try {
        const getCommand = new GetObjectCommand({
          Bucket: R2_BUCKET,
          Key: key,
        });
        const res = await r2Client.send(getCommand);
        if (res.Body) {
          const chunks: any[] = [];
          for await (const chunk of res.Body as any) {
            chunks.push(chunk);
          }
          buffer = Buffer.concat(chunks);
          if (res.ContentType) contentType = res.ContentType;
          break;
        }
      } catch (err) {
        // Continue searching keys
      }
    }
  }

  if (!buffer) {
    try {
      let targetUrl = urlStr;
      if (targetUrl.startsWith("gcs://")) {
        targetUrl = `https://storage.12labs.in/${targetUrl.replace("gcs://", "")}`;
      } else if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
        targetUrl = `https://storage.12labs.in/${targetUrl.replace(/^\/+/, "")}`;
      }

      const res = await fetch(targetUrl);
      if (res.ok) {
        const arrayBuf = await res.arrayBuffer();
        buffer = Buffer.from(arrayBuf);
        const ct = res.headers.get("content-type");
        if (ct) contentType = ct;
      }
    } catch (err) {
      console.error("[Download API Fetch Error]:", err);
    }
  }

  if (!buffer || buffer.length === 0) {
    return new NextResponse("File not found", { status: 404 });
  }

  const disposition = isInline ? "inline" : `attachment; filename="${encodeURIComponent(filename)}"`;

  const responseHeaders = new Headers({
    "Content-Type": contentType,
    "Content-Disposition": disposition,
    "Content-Length": buffer.length.toString(),
    "Cache-Control": "public, max-age=86400",
    "Access-Control-Allow-Origin": "*",
    "Accept-Ranges": "bytes",
  });

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: responseHeaders,
  });
}
