import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { securityHeaders } from './securityHeaders.js';

describe('securityHeaders', () => {
  it('marks every response noindex and calls next()', () => {
    const headers = new Map<string, string>();
    const res = {
      setHeader: (name: string, value: string) => {
        headers.set(name, value);
      },
    } as unknown as Response;
    const next = vi.fn();

    securityHeaders({} as Request, res, next);

    expect(headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
    expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(next).toHaveBeenCalledOnce();
  });
});
