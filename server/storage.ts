// Where recipe photos live.
//   GCS_BUCKET set (Cloud Run): a public Google Cloud Storage bucket.
//   not set (local dev):         the .uploads/ folder, served at /media.
// Talks to Cloud Storage's JSON API directly, signing in with the Cloud Run
// service account's token from the metadata server, so no extra packages.
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from './env.js';

export const LOCAL_UPLOAD_DIR = path.resolve('.uploads');
export const LOCAL_MEDIA_PATH = '/media';

export function publicPrefix(): string {
  return env.gcsBucket ? `https://storage.googleapis.com/${env.gcsBucket}/` : `${LOCAL_MEDIA_PATH}/`;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const res = await fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token', {
    headers: { 'Metadata-Flavor': 'Google' },
  });
  if (!res.ok) throw new Error(`Couldn't get a Google access token (${res.status})`);
  const body = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return cachedToken.value;
}

/** Stores bytes under `key` (e.g. "recipes/abc.webp") and returns the public URL. */
export async function putObject(key: string, data: Buffer, contentType: string): Promise<string> {
  if (!env.gcsBucket) {
    const file = path.join(LOCAL_UPLOAD_DIR, key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, data);
    return `${LOCAL_MEDIA_PATH}/${key}`;
  }

  // Multipart upload: metadata (incl. long caching: keys are never reused) + the bytes.
  const boundary = `cucina${Math.random().toString(36).slice(2)}`;
  const metadata = JSON.stringify({ name: key, contentType, cacheControl: 'public, max-age=31536000, immutable' });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`),
    data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const res = await fetch(`https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(env.gcsBucket)}/o?uploadType=multipart`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!res.ok) throw new Error(`Cloud Storage upload failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  return `${publicPrefix()}${key}`;
}

/** Deletes an object by its public URL. Ignores URLs that aren't ours and files already gone. */
export async function deleteByUrl(url: string | null | undefined): Promise<void> {
  if (!url || !url.startsWith(publicPrefix())) return;
  const key = url.slice(publicPrefix().length);
  if (!/^recipes\/[A-Za-z0-9_-]+\.(webp|jpg|png)$/.test(key)) return;
  try {
    if (!env.gcsBucket) {
      await unlink(path.join(LOCAL_UPLOAD_DIR, key));
      return;
    }
    const res = await fetch(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(env.gcsBucket)}/o/${encodeURIComponent(key)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${await accessToken()}` },
    });
    if (!res.ok && res.status !== 404) console.error(`photo delete failed (${res.status})`);
  } catch (err) {
    console.error('photo delete failed', err);
  }
}
