import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { checkUrl, isPublicAddress, safeFetch } from './safeFetch.js';

describe('isPublicAddress', () => {
  it('allows the public internet', () => {
    expect(isPublicAddress('93.184.216.34')).toBe(true);
    expect(isPublicAddress('2606:2800:220:1:248:1893:25c8:1946')).toBe(true);
  });
  it('refuses private, local and metadata addresses', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.10', '169.254.169.254', '100.100.1.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:7f00:1']) {
      expect(isPublicAddress(ip)).toBe(false);
    }
  });
});

describe('checkUrl', () => {
  const refuses = (url: string) => {
    let threw = false;
    try {
      checkUrl(url);
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  };
  it('refuses links that could reach inside', () => {
    refuses('http://169.254.169.254/computeMetadata/v1/');
    refuses('http://metadata.google.internal/');
    refuses('http://2130706433/'); // 127.0.0.1 written as a number
    refuses('http://[::1]/');
    refuses('http://localhost:8080/');
    refuses('https://example.com:8443/');
    refuses('https://user:pw@example.com/');
    refuses('file:///etc/passwd');
  });
  it('allows ordinary links', () => {
    expect(checkUrl('https://www.example.com/recipe?id=1').hostname).toBe('www.example.com');
  });
});

describe('safeFetch', () => {
  it('refuses a server on this machine', async () => {
    // Even a running local server (which would redirect to the metadata server) is never contacted.
    const server = http.createServer((_req, res) => res.writeHead(302, { Location: 'http://169.254.169.254/' }).end());
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const { port } = server.address() as AddressInfo;
    let message = '';
    try {
      await safeFetch(`http://127.0.0.1:${port}/`, { accept: 'text/html', maxBytes: 1000 });
    } catch (err) {
      message = (err as Error).message;
    }
    server.close();
    expect(message).toMatch(/public internet|unusual port/);
  });
});
