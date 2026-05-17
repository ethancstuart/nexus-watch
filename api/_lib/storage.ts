/**
 * Vercel Blob wrapper with sane defaults for NexusWatch use cases.
 *
 * Used by:
 *   - api/cron/audio-brief.ts → uploads daily mp3 podcast audio
 *   - api/cron/export-parquet.ts → uploads the >50MB CII snapshot parquet
 *
 * If BLOB_READ_WRITE_TOKEN is unset (local dev without provisioned Blob),
 * upload() returns a stub URL so the calling cron can short-circuit without
 * crashing. Cron callers should check `result.stub === true` and skip writes.
 *
 * 2026-05 tier-up Phase 0.
 */

import { put, head, del, type PutCommandOptions } from '@vercel/blob';

export interface UploadOptions {
  contentType?: string;
  /** Seconds. Defaults to 1 hour for audio, 1 day for parquet. */
  cacheMaxAge?: number;
  /** addRandomSuffix in @vercel/blob terms. False = stable path. */
  stableUrl?: boolean;
}

export interface UploadResult {
  url: string;
  pathname: string;
  contentType: string;
  size: number;
  stub: boolean;
}

const HAS_TOKEN = Boolean(process.env.BLOB_READ_WRITE_TOKEN);

function defaultContentType(pathname: string): string {
  if (pathname.endsWith('.mp3')) return 'audio/mpeg';
  if (pathname.endsWith('.parquet')) return 'application/vnd.apache.parquet';
  if (pathname.endsWith('.json')) return 'application/json';
  if (pathname.endsWith('.xml')) return 'application/xml';
  return 'application/octet-stream';
}

function defaultMaxAge(pathname: string): number {
  if (pathname.endsWith('.mp3')) return 3600; // 1h — let podcast clients refetch metadata
  if (pathname.endsWith('.parquet')) return 86400; // 24h — nightly bake
  return 300;
}

export async function uploadBlob(
  pathname: string,
  body: Buffer | string,
  opts: UploadOptions = {},
): Promise<UploadResult> {
  const contentType = opts.contentType ?? defaultContentType(pathname);
  const cacheMaxAge = opts.cacheMaxAge ?? defaultMaxAge(pathname);
  const size = typeof body === 'string' ? Buffer.byteLength(body) : body.length;

  if (!HAS_TOKEN) {
    return {
      url: `stub://blob/${pathname}`,
      pathname,
      contentType,
      size,
      stub: true,
    };
  }

  const putOpts: PutCommandOptions = {
    access: 'public',
    contentType,
    cacheControlMaxAge: cacheMaxAge,
    addRandomSuffix: opts.stableUrl === false,
  };

  const result = await put(pathname, body, putOpts);
  return {
    url: result.url,
    pathname: result.pathname,
    contentType,
    size,
    stub: false,
  };
}

export async function blobExists(pathname: string): Promise<boolean> {
  if (!HAS_TOKEN) return false;
  try {
    await head(pathname);
    return true;
  } catch {
    return false;
  }
}

export async function deleteBlob(url: string): Promise<void> {
  if (!HAS_TOKEN) return;
  await del(url);
}

export function blobEnabled(): boolean {
  return HAS_TOKEN;
}
