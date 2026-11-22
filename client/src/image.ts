// Shrinks a photo in the browser before upload: phones send 1–2 MB instead of
// 5–12 MB, and the server never has to process images. Respects the photo's
// rotation (EXIF), and drops its location data, since the image is re-encoded.

export const MAX_PHOTO_PX = 1600;

export async function resizePhoto(file: Blob, maxSize = MAX_PHOTO_PX, quality = 0.82): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error("This browser can't open that photo. Try a JPEG or PNG.");
  }
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error("Couldn't process that photo");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const encode = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  const webp = await encode('image/webp');
  if (webp && webp.type === 'image/webp') return webp;
  const jpeg = await encode('image/jpeg'); // browsers that can't write WebP
  if (!jpeg) throw new Error("Couldn't process that photo");
  return jpeg;
}

export async function uploadPhoto(blob: Blob): Promise<string> {
  const res = await fetch('/api/uploads/photo', { method: 'POST', headers: { 'Content-Type': blob.type }, body: blob });
  const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !body.url) throw new Error(body.error ?? `Upload failed (${res.status})`);
  return body.url;
}

