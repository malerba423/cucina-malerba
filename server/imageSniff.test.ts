import { describe, expect, it } from 'vitest';
import { sniffImage } from './imageSniff.js';

describe('sniffImage', () => {
  it('recognises WebP, JPEG and PNG by their bytes', () => {
    expect(sniffImage(Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'binary'))?.ext).toBe('webp');
    expect(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))?.ext).toBe('jpg');
    expect(sniffImage(Buffer.from('89504e470d0a1a0a0000', 'hex'))?.ext).toBe('png');
  });
  it('refuses anything else, even if it claims to be an image', () => {
    expect(sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
    expect(sniffImage(Buffer.from('GIF89a'))).toBeNull();
  });
});
