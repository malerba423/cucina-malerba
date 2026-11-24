import { useState } from 'react';

// How to send a recipe here without copying links: Android's share sheet
// (once the site is on the home screen), an iPhone Shortcut, or a bookmark.
export function ShareHelp() {
  const origin = window.location.origin;
  const bookmarklet = `javascript:location.href='${origin}/import?url='+encodeURIComponent(location.href)`;
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(bookmarklet);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // select the text by hand instead
    }
  };

  return (
    <section className="share-help">
      <h2>Import straight from your phone</h2>

      <details>
        <summary>Android</summary>
        <ol>
          <li>
            Open this site in Chrome, tap the <strong>⋮</strong> menu, then <strong>Add to home screen</strong> (or <strong>Install app</strong>).
          </li>
          <li>
            In Instagram, TikTok, YouTube or a browser, tap <strong>Share</strong> and pick <strong>Cookbook</strong>. The link opens here and starts
            importing.
          </li>
        </ol>
      </details>

      <details>
        <summary>iPhone</summary>
        <p className="small muted">Safari can't add web apps to the share sheet, so a one-time Shortcut does it:</p>
        <ol>
          <li>
            Open the <strong>Shortcuts</strong> app, tap <strong>+</strong>, and name it <strong>Cookbook</strong>.
          </li>
          <li>
            Tap the <strong>ⓘ</strong> (or the shortcut's name → Details) and turn on <strong>Show in Share Sheet</strong>. Set it to receive{' '}
            <strong>URLs</strong> and <strong>Text</strong>.
          </li>
          <li>
            Add the action <strong>URL Encode</strong> (it encodes the Shortcut Input).
          </li>
          <li>
            Add <strong>Open URLs</strong> and set it to <code>{origin}/import?url=</code> followed by the <strong>URL Encoded Text</strong> variable.
          </li>
          <li>
            Done. In Instagram or Safari tap <strong>Share</strong> → <strong>Cookbook</strong>.
          </li>
        </ol>
        <p className="small muted">
          Also handy: in Safari tap <strong>Share</strong> → <strong>Add to Home Screen</strong> for an app icon.
        </p>
      </details>

      <details>
        <summary>Computer (bookmark button)</summary>
        <p className="small muted">
          Make a new bookmark, paste this as its address, and name it “Save to Cookbook”. On any recipe page, click it.
        </p>
        <div className="bookmarklet">
          <code>{bookmarklet}</code>
          <button type="button" className="button button-small" onClick={copy}>
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </details>
    </section>
  );
}
