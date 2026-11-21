// Kept apart from storage.ts so it can be tested without server settings.

/** Recognises real image bytes, whatever the browser claimed. */
export function sniffImage(data: Buffer): { ext: 'webp' | 'jpg' | 'png'; contentType: string } | null {
  if (data.length > 12 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP') return { ext: 'webp', contentType: 'image/webp' };
  if (data.length > 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return { ext: 'jpg', contentType: 'image/jpeg' };
  if (data.length > 8 && data.toString('hex', 0, 8) === '89504e470d0a1a0a') return { ext: 'png', contentType: 'image/png' };
  return null;
}
