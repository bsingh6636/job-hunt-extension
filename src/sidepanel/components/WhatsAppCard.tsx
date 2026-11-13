import { useState } from 'react';
import { whatsappRepo } from '@shared/storage';
import { POST_STATUSES, type PostStatus, type WhatsAppPost } from '@shared/types';
import { experienceLabel } from '@shared/utils/jobtext';
import { formatPhone, normalizePhone, whatsappLink } from '@shared/utils/phone';
import { copyText, formatDate, whatsappToText } from '../lib/export';
import { useDebounced, useFlash } from '../lib/hooks';

interface Props {
  post: WhatsAppPost;
}

export function WhatsAppCard({ post }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState(post.notes ?? '');
  const [flash, setFlash] = useFlash();

  const saveNotes = useDebounced((value: string) => {
    void whatsappRepo.put({ ...post, notes: value });
  }, 500);

  const setStatus = (status: PostStatus) => void whatsappRepo.put({ ...post, status });
  const remove = () => void whatsappRepo.remove(post.id);
  const copy = async (text: string, what: string) => {
    await copyText(text);
    setFlash(`Copied ${what}`);
  };

  const otherChats = Array.from(new Set(post.sightings.map((s) => s.chat))).filter((c) => c !== post.chat);
  const seenTitle = post.sightings.map((s) => `${s.chat} · ${s.sender}${s.postedAt ? ` · ${formatDate(s.postedAt)}` : ''}`).join('\n');
  // Show the sender's number only when the name is not already that number.
  const senderPhone = post.sender.phone && post.sender.phone !== normalizePhone(post.sender.name) ? post.sender.phone : undefined;

  return (
    <div className={post.excludedBy.length ? 'card excluded' : 'card'}>
      <div className="title">
        {post.chat}
        {otherChats.length > 0 && (
          <span className="muted small" title={seenTitle}>
            {' '}
            · also in {otherChats.length} other group{otherChats.length > 1 ? 's' : ''}
          </span>
        )}
      </div>
      <div className="muted small">
        {post.sender.name}
        {senderPhone && ` (${formatPhone(senderPhone)})`}
        {post.sender.phone && (
          <>
            {' '}
            <a href={whatsappLink(post.sender.phone)} target="_blank" rel="noreferrer" title="Open a WhatsApp chat with the sender">
              message sender
            </a>
          </>
        )}
        {' · '}
        {post.postedAt ? formatDate(post.postedAt) : 'date unknown'}
        {post.sightings.length > 1 && (
          <span title={seenTitle}>
            {' · '}seen {post.sightings.length}×
          </span>
        )}
      </div>

      <div className="chips">
        {post.experience && (
          <span className="chip exp" title="Experience the post asks for">
            exp {experienceLabel(post.experience)}
          </span>
        )}
        {post.matchedKeywords.map((k) => (
          <span key={k} className="chip">
            {k}
          </span>
        ))}
        {post.excludedBy.map((k) => (
          <span key={`x-${k}`} className="chip warn" title="matches an exclude keyword">
            not: {k}
          </span>
        ))}
      </div>

      {post.emails.length > 0 && (
        <div className="chips">
          {post.emails.map((e) => (
            <span key={e} className="chip email" title="click to copy" onClick={() => void copy(e, 'email')}>
              {e}
            </span>
          ))}
          {post.emails[0] && (
            <a className="btn" href={`mailto:${post.emails[0]}?subject=${encodeURIComponent('Application')}`} target="_blank" rel="noreferrer">
              Email
            </a>
          )}
        </div>
      )}

      {post.phones.length > 0 && (
        <div className="chips">
          {post.phones.map((p) => (
            <span key={p} className="chip email" title="click to copy" onClick={() => void copy(p, 'phone')}>
              {formatPhone(p)}{' '}
              <a href={whatsappLink(p)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} title="Open a WhatsApp chat">
                chat
              </a>
            </span>
          ))}
        </div>
      )}

      <div className={expanded ? 'post-text' : 'post-text clamped'}>{post.text}</div>
      {post.text.length > 300 && (
        <button className="link" onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'show less' : 'show more'}
        </button>
      )}

      {post.links.length > 0 && (
        <details open>
          <summary>{post.links.length} link(s)</summary>
          <div className="links">
            {post.links.map((l) => (
              <a key={l} href={l} target="_blank" rel="noreferrer" title={l}>
                {l}
              </a>
            ))}
          </div>
        </details>
      )}

      <div className="row">
        <select value={post.status} onChange={(e) => setStatus(e.target.value as PostStatus)} style={{ width: 'auto' }}>
          {POST_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button onClick={() => void copy(whatsappToText(post), 'all details')}>Copy all</button>
        <button onClick={() => void copy(post.text, 'text')}>Copy text</button>
        <button className="danger" onClick={remove}>
          Delete
        </button>
        {flash && <span className="success small">{flash}</span>}
      </div>
      <textarea
        rows={1}
        placeholder="Notes (who you contacted, what they said...)"
        value={notes}
        onChange={(e) => {
          setNotes(e.target.value);
          saveNotes(e.target.value);
        }}
      />
    </div>
  );
}
