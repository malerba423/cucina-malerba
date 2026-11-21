import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import zlib from 'node:zlib';
import type { Readable } from 'node:stream';

// Fetches a page or image for the importer. Links come from people, so this
// refuses anything that isn't the public internet: on Cloud Run the metadata
// server (169.254.169.254) hands out the app's access token, and localhost is
// the app itself. The address is checked at connect time (in the DNS lookup),
// so a name can't pass the check and then point somewhere private, and every
// redirect goes through the same check.

const blocked = new net.BlockList();
for (const [addr, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) {
  blocked.addSubnet(addr, prefix, 'ipv4');
}
for (const [addr, prefix] of [
  ['::', 128], ['::1', 128], ['64:ff9b::', 96], ['64:ff9b:1::', 48], ['100::', 64], ['2001::', 23], ['2001:db8::', 32],
  ['fc00::', 7], ['fe80::', 10], ['fec0::', 10], ['ff00::', 8],
] as const) {
  blocked.addSubnet(addr, prefix, 'ipv6');
}

/** True for addresses on the public internet. */
export function isPublicAddress(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) return !blocked.check(ip, 'ipv4');
  if (family === 6) {
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip); // IPv4 written as IPv6
    if (mapped) return isPublicAddress(mapped[1]);
    if (/^::ffff:/i.test(ip)) return false;
    return !blocked.check(ip, 'ipv6');
  }
  return false;
}

export class FetchError extends Error {
  constructor(
    message: string,
    readonly kind: 'blocked' | 'status' | 'timeout' | 'too-big' | 'type' | 'network',
    readonly status?: number,
  ) {
    super(message);
  }
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void;

function guardedLookup(hostname: string, options: dns.LookupOptions, callback: LookupCallback) {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, '');
    const list = addresses as dns.LookupAddress[];
    if (!list.length || list.some((a) => !isPublicAddress(a.address))) {
      return callback(Object.assign(new Error('blocked address'), { code: 'EBLOCKED' }), '');
    }
    if (options.all) callback(null, list);
    else callback(null, list[0].address, list[0].family);
  });
}

export type Fetched = { url: string; status: number; contentType: string; body: Buffer; truncated: boolean };

export type FetchOptions = {
  accept: string;
  maxBytes: number;
  /** Keep the first maxBytes instead of failing (fine for HTML: the recipe data is usually near the top). */
  truncate?: boolean;
  timeoutMs?: number;
  maxRedirects?: number;
};

const USER_AGENT = 'Mozilla/5.0 (compatible; CucinaMalerba/1.0; +https://kitchen.jmalerba.dev) recipe-import';

export function checkUrl(raw: string | URL): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new FetchError("That isn't a web address.", 'type');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new FetchError('Only http and https links can be imported.', 'blocked');
  if (url.username || url.password) throw new FetchError("Links with a password in them can't be imported.", 'blocked');
  if (url.port && url.port !== '80' && url.port !== '443') throw new FetchError("That link uses an unusual port, so it can't be imported.", 'blocked');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host) && !isPublicAddress(host)) throw new FetchError("That address isn't on the public internet.", 'blocked');
  if (/(^|\.)(localhost|internal|local|localdomain)$/i.test(host)) throw new FetchError("That address isn't on the public internet.", 'blocked');
  return url;
}

export async function safeFetch(raw: string | URL, opts: FetchOptions): Promise<Fetched> {
  const deadline = Date.now() + (opts.timeoutMs ?? 10_000);
  let url = checkUrl(raw);
  for (let hop = 0; hop <= (opts.maxRedirects ?? 5); hop++) {
    const res = await requestOnce(url, opts, deadline);
    if ('redirect' in res) {
      url = checkUrl(new URL(res.redirect, url));
      continue;
    }
    return res;
  }
  throw new FetchError('That link redirected too many times.', 'network');
}

function requestOnce(url: URL, opts: FetchOptions, deadline: number): Promise<Fetched | { redirect: string }> {
  return new Promise((resolve, reject) => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return reject(new FetchError('That site took too long to answer.', 'timeout'));

    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(
      url,
      {
        method: 'GET',
        lookup: guardedLookup as unknown as net.LookupFunction,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: opts.accept,
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          return resolve({ redirect: res.headers.location });
        }
        if (status < 200 || status >= 300) {
          res.resume();
          return reject(new FetchError(`The site answered ${status}.`, 'status', status));
        }

        const encoding = String(res.headers['content-encoding'] ?? '').toLowerCase();
        let stream: Readable = res;
        if (encoding === 'gzip' || encoding === 'x-gzip') stream = res.pipe(zlib.createGunzip());
        else if (encoding === 'deflate') stream = res.pipe(zlib.createInflate());
        else if (encoding === 'br') stream = res.pipe(zlib.createBrotliDecompress());

        const chunks: Buffer[] = [];
        let size = 0;
        let done = false;
        const finish = (truncated: boolean) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          resolve({
            url: url.href,
            status,
            contentType: String(res.headers['content-type'] ?? '').toLowerCase(),
            body: Buffer.concat(chunks),
            truncated,
          });
        };
        stream.on('data', (chunk: Buffer) => {
          if (done) return;
          size += chunk.length;
          if (size > opts.maxBytes) {
            if (opts.truncate) {
              chunks.push(chunk.subarray(0, chunk.length - (size - opts.maxBytes)));
              req.destroy();
              finish(true);
            } else {
              done = true;
              clearTimeout(timer);
              req.destroy();
              reject(new FetchError('That file is too big to import.', 'too-big'));
            }
            return;
          }
          chunks.push(chunk);
        });
        stream.on('end', () => finish(false));
        stream.on('error', (err) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          reject(err instanceof FetchError ? err : new FetchError("Couldn't read the page.", 'network'));
        });
      },
    );

    const timer = setTimeout(() => req.destroy(new FetchError('That site took too long to answer.', 'timeout')), remaining);
    req.on('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      if (err instanceof FetchError) return reject(err);
      if (err.code === 'EBLOCKED') return reject(new FetchError("That address isn't on the public internet.", 'blocked'));
      if (err.code === 'ENOTFOUND' || err.code === 'EAI_AGAIN') return reject(new FetchError("Couldn't find that site. Check the link.", 'network'));
      reject(new FetchError("Couldn't reach that site.", 'network'));
    });
    req.end();
  });
}

/** Decodes an HTML page using the charset it declares (UTF-8 if none). */
export function decodeHtml(page: Fetched): string {
  const declared =
    /charset=([\w-]+)/i.exec(page.contentType)?.[1] ??
    /<meta[^>]+charset=["']?([\w-]+)/i.exec(page.body.subarray(0, 2048).toString('latin1'))?.[1] ??
    'utf-8';
  try {
    return new TextDecoder(declared.toLowerCase()).decode(page.body);
  } catch {
    return new TextDecoder('utf-8').decode(page.body);
  }
}
