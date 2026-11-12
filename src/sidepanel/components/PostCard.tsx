import { useState } from 'react';
import { postsRepo } from '@shared/storage';
import { POST_STATUSES, type ExtractedPost, type PostStatus } from '@shared/types';
import { copyText, formatDate, postToText } from '../lib/export';
import { useDebounced, useFlash } from '../lib/hooks';

interface Props {
  post: ExtractedPost;
}

export function PostCard({ post }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState(post.notes ?? '');
  const [flash, setFlash] = useFlash();

  const saveNotes = useDebounced((value: string) => {
    void postsRepo.put({ ...post, notes: value });
  }, 500);

  const setStatus = (status: PostStatus) => void postsRepo.put({ ...post, status });
  const remove = () => void postsRepo.remove(post.id);
  const copy = async (text: string, what: string) => {
    await copyText(text);
    setFlash(`Copied ${what}`);
  };

  const mailto = (email: string) => {
    const subject = encodeURIComponent('Application');
    return `mailto:${email}?subject=${subject}`;
  };

  return (
    <div className={post.excludedBy.length ? 'card excluded' : 'card'}>
      <div className="title">
        {post.author.profileUrl ? (
          <a href={post.author.profileUrl} target="_blank" rel="noreferrer">
            {post.author.name || 'Unknown author'}
          </a>
        ) : (
          post.author.name || 'Unknown author'
        )}
      </div>
      {post.author.headline && <div className="muted small">{post.author.headline}</div>}
      <div className="muted small">
        {post.postedAt ? `${post.postedAtApprox ? '~' : ''}${formatDate(post.postedAt)}` : 'date unknown'}
        {post.postedAtLabel ? ` (${post.postedAtLabel})` : ''}
        {' · '}
        <a href={post.url} target="_blank" rel="noreferrer" title={post.urlKind && post.urlKind !== 'post' ? "The page did not expose a link to this post itself" : undefined}>
          {post.urlKind === 'author-activity' ? "author's posts" : post.urlKind === 'search' ? 'source page' : 'open post'}
        </a>
      </div>

      {(post.matchedKeywords.length > 0 || post.excludedBy.length > 0) && (
        <div className="chips">
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
      )}

      {post.emails.length > 0 && (
        <div className="chips">
          {post.emails.map((e) => (
            <span key={e} className="chip email" title="click to copy" onClick={() => void copy(e, 'email')}>
              {e}
            </span>
          ))}
          {post.emails[0] && (
            <a className="btn" href={mailto(post.emails[0])} target="_blank" rel="noreferrer">
              Email
            </a>
          )}
        </div>
      )}

      <div className={expanded ? 'post-text' : 'post-text clamped'}>{post.text || '(no text captured)'}</div>
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
        <button onClick={() => void copy(postToText(post), 'all details')}>Copy all</button>
        <button onClick={() => void copy(post.text, 'text')}>Copy text</button>
        <button className="danger" onClick={remove}>
          Delete
        </button>
        {flash && <span className="success small">{flash}</span>}
      </div>
      <textarea
        rows={1}
        placeholder="Notes (who you emailed, what they said...)"
        value={notes}
        onChange={(e) => {
          setNotes(e.target.value);
          saveNotes(e.target.value);
        }}
      />
    </div>
  );
}
