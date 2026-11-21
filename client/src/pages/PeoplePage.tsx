import { useState, type FormEvent } from 'react';
import { ROLE_LABELS, ROLES, type PeopleAdminResponse, type Role } from '../../../shared/auth';
import { send, useApi } from '../api';
import { useAuth } from '../auth';
import { initials, longDate } from '../format';
import { Link } from '../router';
import { NotFoundPage } from './NotFoundPage';

const ROLE_ORDER: Role[] = [...ROLES].reverse(); // owner first in menus

export function PeoplePage() {
  const { user, ready } = useAuth();
  const [version, setVersion] = useState(0);
  const people = useApi<PeopleAdminResponse>(`/api/admin/people?v=${version}`);
  const reload = () => setVersion((v) => v + 1);

  if (!ready) return null;
  if (!user || user.role !== 'owner') return <NotFoundPage />;

  const data = 'data' in people ? people.data : undefined;

  return (
    <main className="people-page">
      <section className="people-main">
        <div>
          <h1>Who can add recipes</h1>
          <p className="muted">
            Anyone can browse and cook. Only the people below can add or change recipes. They sign in with a link emailed to
            them, so there are no passwords. Once you add someone they can sign in at <strong>/signin</strong> with that email;
            sending the invite just tells them it's ready.
          </p>
        </div>

        <InviteForm onInvited={reload} />

        {people.status === 'error' && <p className="notice notice-warn">Couldn't load people: {people.message}</p>}

        {data && (
          <ul className="people-list">
            {data.users.map((u) => (
              <PersonRow key={`u${u.id}`} person={u} onChanged={reload} />
            ))}
            {data.invites.map((i) => (
              <InviteRow key={`i${i.id}`} invite={i} onChanged={reload} />
            ))}
          </ul>
        )}
      </section>

      <aside className="people-aside">
        <section className="explain ruled-green">
          <h2>Everyone (no sign-in)</h2>
          <ul>
            <li>Browse, search and filter</li>
            <li>Cook mode, scaling, units</li>
            <li>Print a recipe card</li>
            <li>Shopping list, saved on their own device</li>
          </ul>
        </section>
        <section className="explain ruled">
          <h2>Signed-in family also</h2>
          <ul>
            <li>Import or write recipes</li>
            <li>
              Edit recipes: <strong>{ROLE_LABELS.contributor.toLowerCase()}</strong> or <strong>{ROLE_LABELS.editor.toLowerCase()}</strong>
            </li>
            <li>Add their own tweaks, log "made it"</li>
            <li>Collections and meal plans</li>
          </ul>
        </section>
        <p className="notice small">Every recipe shows who added it. Remove someone and their recipes stay, credited to them.</p>
        <Reparse />
        <Link to="/" className="small">
          ← Back to recipes
        </Link>
      </aside>
    </main>
  );
}

function InviteForm({ onInvited }: { onInvited: () => void }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('contributor');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const result = await send('/api/admin/invites', 'POST', { email, name, role });
    setBusy(false);
    if (result.ok) {
      setMessage({ kind: 'ok', text: `Added ${name}. Send the invite from their row when you're ready.` });
      setEmail('');
      setName('');
      onInvited();
    } else {
      setMessage({ kind: 'error', text: result.error });
    }
  };

  return (
    <form className="invite-form" onSubmit={submit}>
      <label className="field">
        <span className="label">Name</span>
        <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Mom" maxLength={60} />
      </label>
      <label className="field grow">
        <span className="label">Email</span>
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="mom@example.com" />
      </label>
      <label className="field">
        <span className="label">Can</span>
        <select className="select" value={role} onChange={(e) => setRole(e.target.value as Role)}>
          {ROLE_ORDER.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className="button button-primary" disabled={busy}>
        {busy ? 'Adding…' : 'Add'}
      </button>
      {message && (
        <p className={`notice small full ${message.kind === 'error' ? 'notice-warn' : ''}`} role={message.kind === 'error' ? 'alert' : 'status'}>
          {message.text}
        </p>
      )}
    </form>
  );
}

function PersonRow({ person, onChanged }: { person: PeopleAdminResponse['users'][number]; onChanged: () => void }) {
  const [error, setError] = useState<string | null>(null);

  const changeRole = async (role: Role) => {
    setError(null);
    const r = await send(`/api/admin/users/${person.id}`, 'PATCH', { role });
    if (!r.ok) setError(r.error);
    onChanged();
  };
  const rename = async () => {
    const name = window.prompt('Name, the way the family says it', person.name);
    if (!name || name.trim() === person.name) return;
    const r = await send(`/api/admin/users/${person.id}`, 'PATCH', { name });
    if (!r.ok) setError(r.error);
    onChanged();
  };
  const remove = async () => {
    if (!window.confirm(`Remove ${person.name}? They won't be able to sign in. Their recipes stay.`)) return;
    const r = await send(`/api/admin/users/${person.id}`, 'DELETE');
    if (!r.ok) setError(r.error);
    onChanged();
  };

  return (
    <li className="person-row">
      <span className="avatar" aria-hidden="true">
        {initials(person.name)}
      </span>
      <div className="person-info">
        <strong>
          {person.name}
          {person.isYou ? ' (you)' : ''}
        </strong>
        <span className="small muted">
          {person.email} · {person.recipeCount} {person.recipeCount === 1 ? 'recipe' : 'recipes'} ·{' '}
          {person.lastSeenAt ? `last here ${longDate(person.lastSeenAt)}` : 'not signed in yet'}
        </span>
        {error && (
          <span className="small warn-text" role="alert">
            {error}
          </span>
        )}
      </div>
      <label className="visually-hidden" htmlFor={`role-${person.id}`}>
        Role for {person.name}
      </label>
      <select id={`role-${person.id}`} className="select" value={person.role} onChange={(e) => changeRole(e.target.value as Role)}>
        {ROLE_ORDER.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r]}
          </option>
        ))}
      </select>
      <button type="button" className="text-button" onClick={rename}>
        Rename
      </button>
      {!person.isYou && (
        <button type="button" className="text-button" onClick={remove}>
          Remove
        </button>
      )}
    </li>
  );
}

function InviteRow({ invite, onChanged }: { invite: PeopleAdminResponse['invites'][number]; onChanged: () => void }) {
  const [note, setNote] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const sent = invite.lastSentAt != null;

  const sendInvite = async () => {
    setSending(true);
    const r = await send(`/api/admin/invites/${invite.id}/send`, 'POST');
    setSending(false);
    setNote(r.ok ? `Invite emailed to ${invite.email}.` : r.error);
    if (r.ok) onChanged();
  };
  const remove = async () => {
    if (!window.confirm(`Remove ${invite.name} (${invite.email})? They won't be able to sign in.`)) return;
    await send(`/api/admin/invites/${invite.id}`, 'DELETE');
    onChanged();
  };

  return (
    <li className="person-row pending">
      <span className="avatar avatar-pending" aria-hidden="true">
        ?
      </span>
      <div className="person-info">
        <strong>{invite.name}</strong>
        <span className="small muted">
          {invite.email} · {sent ? `invite sent ${longDate(invite.lastSentAt!)}` : 'not invited yet'} · hasn't signed in
        </span>
        {note && <span className="small muted">{note}</span>}
      </div>
      <span className="pill mono">
        {sent ? 'INVITED' : 'ADDED'} · {ROLE_LABELS[invite.role].toUpperCase()}
      </span>
      <button type="button" className={sent ? 'text-button' : 'button button-small'} onClick={sendInvite} disabled={sending}>
        {sending ? 'Sending…' : sent ? 'Send again' : 'Send invite'}
      </button>
      <button type="button" className="text-button" onClick={remove}>
        Remove
      </button>
    </li>
  );
}

/** Owner tool: re-read every recipe with the latest parsing rules. */
function Reparse() {
  const [state, setState] = useState<{ busy: boolean; text: string | null }>({ busy: false, text: null });
  const run = async () => {
    setState({ busy: true, text: null });
    const r = await send<{ ingredients: number; ingredientsChanged: number; steps: number; stepsChanged: number }>('/api/admin/reparse', 'POST');
    setState({
      busy: false,
      text: r.ok
        ? `Done. ${r.data.ingredientsChanged} of ${r.data.ingredients} ingredient lines and ${r.data.stepsChanged} of ${r.data.steps} step timers were updated.`
        : r.error,
    });
  };
  return (
    <section className="explain ruled">
      <h2>Maintenance</h2>
      <p className="small muted">
        When the way amounts are read improves (like “1-3/4 cups”), older recipes keep the old reading until they're saved again. This
        re-reads them all at once. The text people typed doesn't change, and exact gram weights stay.
      </p>
      <button type="button" className="button button-small" onClick={run} disabled={state.busy}>
        {state.busy ? 'Re-reading…' : 'Re-read all recipes'}
      </button>
      {state.text && (
        <p className="small" role="status">
          {state.text}
        </p>
      )}
    </section>
  );
}
