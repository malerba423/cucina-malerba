import { env } from './env.js';

export type Email = { to: string; subject: string; text: string; html: string };

/**
 * Sends through Resend when RESEND_API_KEY is set. Without it (local dev),
 * prints the email to the terminal, so sign-in links can be clicked from there.
 */
export async function sendEmail(email: Email): Promise<void> {
  if (!env.resendApiKey) {
    console.log(`\n──── email (not sent: no RESEND_API_KEY) ────\nTo: ${email.to}\nSubject: ${email.subject}\n\n${email.text}\n────────────────────────────────────────────\n`);
    return;
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.emailFrom, to: [email.to], subject: email.subject, text: email.text, html: email.html }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Resend refused the email (${res.status}): ${detail.slice(0, 300)}`);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** A plain, readable email with one button. */
export function linkEmail(opts: { heading: string; intro: string; button: string; url: string; footer: string }) {
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f5f6f1;font-family:Inter,Helvetica,Arial,sans-serif;color:#1e2a2f">
<div style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #d5dad1;border-top:4px solid #b23a28;border-radius:0 0 12px 12px;padding:24px">
<p style="margin:0 0 4px;font-weight:800;font-size:18px;color:#1f3d2b">cucina malerba<span style="color:#b23a28">.</span></p>
<h1 style="margin:16px 0 8px;font-size:22px;color:#1f3d2b">${escapeHtml(opts.heading)}</h1>
<p style="margin:0 0 20px;line-height:1.5">${escapeHtml(opts.intro)}</p>
<p style="margin:0 0 20px"><a href="${escapeHtml(opts.url)}" style="display:inline-block;background:#b23a28;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:99px">${escapeHtml(opts.button)}</a></p>
<p style="margin:0 0 8px;font-size:13px;color:#4a5752">Or paste this link into your browser:<br><span style="word-break:break-all">${escapeHtml(opts.url)}</span></p>
<p style="margin:16px 0 0;font-size:13px;color:#4a5752">${escapeHtml(opts.footer)}</p>
</div></body></html>`;
  const text = `${opts.heading}\n\n${opts.intro}\n\n${opts.button}: ${opts.url}\n\n${opts.footer}`;
  return { html, text };
}
