import { isVideo, linkLabel, splitLinks } from '../../shared/links';

/** Recipe text with any web addresses turned into links (opening in a new tab). */
export function Linkified({ text }: { text: string }) {
  return (
    <>
      {splitLinks(text).map((part, i) =>
        typeof part === 'string' ? (
          <span key={i}>{part}</span>
        ) : (
          <a key={i} href={part.url} target="_blank" rel="noopener noreferrer nofollow" className="text-link" title={part.url}>
            {isVideo(part.url) && <span aria-hidden="true">▶ </span>}
            {part.label}
          </a>
        ),
      )}
    </>
  );
}

/** Step text with addresses shortened to their labels, for places that can't hold a link (the cook-mode step list). */
export function withLinkLabels(text: string): string {
  return splitLinks(text)
    .map((part) => (typeof part === 'string' ? part : part.label))
    .join('');
}

type RecipeLink = { id: number; title: string | null; url: string };

/** A recipe's helpful links: technique videos, how-tos. */
export function HelpfulLinks({ links, heading = 'Helpful links', className }: { links: RecipeLink[]; heading?: string; className?: string }) {
  if (!links.length) return null;
  return (
    <div className={['helpful-links', className].filter(Boolean).join(' ')}>
      <h2 className="label">{heading}</h2>
      <ul>
        {links.map((l) => (
          <li key={l.id}>
            <a href={l.url} target="_blank" rel="noopener noreferrer nofollow" title={l.url}>
              <span className="helpful-icon" aria-hidden="true">
                {isVideo(l.url) ? '▶' : '↗'}
              </span>
              <span>
                {l.title || linkLabel(l.url)}
                {l.title && <span className="helpful-host small muted"> {hostOf(l.url)}</span>}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
