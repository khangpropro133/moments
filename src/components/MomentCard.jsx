import { useEffect, useRef, useState } from 'react';
import Avatar from './Avatar';
import { AUTHOR_STORAGE_KEY, REACTION_OPTIONS } from '../db';

function formatRelativeTime(timestamp) {
  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSec < 45) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;

  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function MediaTile({ item, single, onOpenImage }) {
  const [blobUrl, setBlobUrl] = useState('');

  useEffect(() => {
    if (item?.url || !item?.blob) return undefined;
    const objectUrl = URL.createObjectURL(item.blob);
    setBlobUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [item]);

  const resolvedUrl = item?.url || blobUrl;
  if (!resolvedUrl) return null;

  if (item.kind === 'video') {
    return (
      <div className={`media-frame ${single ? 'is-single' : ''}`}>
        <video
          src={resolvedUrl}
          controls
          playsInline
          preload="metadata"
          className="moment-video"
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      className={`media-frame media-image-btn ${single ? 'is-single' : ''}`}
      onClick={() =>
        onOpenImage({
          url: resolvedUrl,
          name: item.name || 'Moment photo',
        })
      }
      aria-label="View full size image"
    >
      <img
        src={resolvedUrl}
        alt={item.name || 'Shared moment'}
        loading="lazy"
        className="moment-image"
      />
    </button>
  );
}

export default function MomentCard({
  post,
  myProfile,
  onToggleReaction,
  onAddComment,
  onDeleteComment,
  onDelete,
  onOpenImage,
  onOpenProfile,
}) {
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [replyError, setReplyError] = useState('');

  const replyInputRef = useRef(null);
  const pickerWrapRef = useRef(null);

  useEffect(() => {
    if (!pickerOpen) return undefined;
    function handleOutsideClick(e) {
      if (!pickerWrapRef.current?.contains(e.target)) {
        setPickerOpen(false);
      }
    }
    window.addEventListener('mousedown', handleOutsideClick);
    return () => window.removeEventListener('mousedown', handleOutsideClick);
  }, [pickerOpen]);

  const isLongText = (post.content || '').length > 520;
  const displayedText =
    isLongText && !expanded
      ? `${post.content.slice(0, 520).trimEnd()}…`
      : post.content;

  const mediaList = post.media || [];
  const reactions = post.reactions || [];
  const activeReactions = reactions.filter((r) => r.count > 0);
  const comments = post.comments || [];

  // Show latest 2 comments as compact preview when collapsed, or all when expanded
  const visibleComments = commentsOpen ? comments : comments.slice(-2);
  const hiddenCount = Math.max(0, comments.length - visibleComments.length);

  function handleOpenReply() {
    setCommentsOpen((prev) => {
      const next = !prev;
      if (next) {
        setTimeout(() => replyInputRef.current?.focus(), 20);
      }
      return next;
    });
  }

  async function handleReplySubmit(e) {
    e.preventDefault();
    const trimmed = replyText.trim();
    if (!trimmed || sendingReply) return;

    const currentName =
      myProfile?.displayName ||
      localStorage.getItem(AUTHOR_STORAGE_KEY) ||
      'anonymous';

    setSendingReply(true);
    setReplyError('');
    try {
      await onAddComment({
        postId: post.id,
        author: currentName,
        content: trimmed,
      });
      setReplyText('');
    } catch (err) {
      console.error(err);
      setReplyError(err?.message || 'Could not post reply.');
    } finally {
      setSendingReply(false);
    }
  }

  return (
    <article className="moment-card">
      <header className="moment-header">
        <Avatar
          name={post.author}
          avatarUrl={post.avatarUrl}
          hash={post.authorHash}
          size={28}
        />
        <span className="moment-author">@{post.author || 'anonymous'}</span>
        <span className="moment-dot" aria-hidden="true">
          ·
        </span>
        <time
          className="moment-time"
          dateTime={new Date(post.createdAt).toISOString()}
          title={new Date(post.createdAt).toLocaleString()}
        >
          {formatRelativeTime(post.createdAt)}
        </time>
      </header>

      {post.title && <h2 className="moment-title">{post.title}</h2>}

      {displayedText && (
        <div className="moment-body">
          {displayedText.split('\n').map((line, index) =>
            line.trim() === '' ? (
              <div key={index} className="paragraph-spacer" />
            ) : (
              <p key={index}>{line}</p>
            )
          )}
          {isLongText && (
            <button
              type="button"
              className="read-more-btn"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? 'show less' : 'read more'}
            </button>
          )}
        </div>
      )}

      {mediaList.length > 0 && (
        <div
          className={`moment-media-grid ${
            mediaList.length === 1 ? 'grid-one' : 'grid-multi'
          }`}
        >
          {mediaList.map((item, idx) => (
            <MediaTile
              key={item.id || item.url || idx}
              item={item}
              single={mediaList.length === 1}
              onOpenImage={onOpenImage}
            />
          ))}
        </div>
      )}

      <footer className="moment-footer">
        <div className="reaction-bar" ref={pickerWrapRef}>
          {activeReactions.length === 0 ? (
            <button
              type="button"
              className="reaction-pill is-empty-heart"
              onClick={() => onToggleReaction(post.id, '♥')}
              title="React with ♥"
            >
              <span>♡</span>
            </button>
          ) : (
            activeReactions.map((r) => (
              <button
                key={r.emoji}
                type="button"
                className={`reaction-pill ${r.reacted ? 'is-reacted' : ''}`}
                onClick={() => onToggleReaction(post.id, r.emoji)}
                aria-pressed={r.reacted}
              >
                <span>{r.emoji}</span>
                <span className="reaction-count">{r.count}</span>
              </button>
            ))
          )}

          <div className="reaction-picker-anchor">
            <button
              type="button"
              className={`reaction-add-btn ${pickerOpen ? 'is-open' : ''}`}
              onClick={() => setPickerOpen((v) => !v)}
              aria-label="Add reaction"
              title="Add reaction"
            >
              +
            </button>

            {pickerOpen && (
              <div className="reaction-popover" role="menu">
                {REACTION_OPTIONS.map((emoji) => {
                  const found = reactions.find((r) => r.emoji === emoji);
                  const active = Boolean(found?.reacted);
                  return (
                    <button
                      key={emoji}
                      type="button"
                      className={`popover-emoji-btn ${
                        active ? 'is-reacted' : ''
                      }`}
                      onClick={() => {
                        onToggleReaction(post.id, emoji);
                        setPickerOpen(false);
                      }}
                    >
                      {emoji}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="card-right-actions">
          <button
            type="button"
            className={`reply-toggle-btn ${commentsOpen ? 'is-active' : ''}`}
            onClick={handleOpenReply}
          >
            {comments.length > 0 ? `💬 ${comments.length}` : 'reply'}
          </button>

          {post.isMine && (
            <div className="delete-control">
              {confirmDelete ? (
                <>
                  <button
                    type="button"
                    className="confirm-delete-btn"
                    onClick={() => onDelete(post.id)}
                  >
                    delete?
                  </button>
                  <button
                    type="button"
                    className="cancel-delete-btn"
                    onClick={() => setConfirmDelete(false)}
                  >
                    cancel
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="subtle-delete-btn"
                  onClick={() => setConfirmDelete(true)}
                >
                  remove
                </button>
              )}
            </div>
          )}
        </div>
      </footer>

      {(visibleComments.length > 0 || commentsOpen) && (
        <div className="comments-section">
          {hiddenCount > 0 && !commentsOpen && (
            <button
              type="button"
              className="view-more-comments-btn"
              onClick={() => {
                setCommentsOpen(true);
                setTimeout(() => replyInputRef.current?.focus(), 20);
              }}
            >
              view all {comments.length} replies
            </button>
          )}

          {visibleComments.length > 0 && (
            <ul className="comments-list">
              {visibleComments.map((c) => (
                <li key={c.id} className="comment-item">
                  <Avatar
                    name={c.author}
                    avatarUrl={c.avatarUrl}
                    hash={c.authorHash}
                    size={20}
                    className="comment-avatar"
                  />
                  <div className="comment-main">
                    <span className="comment-author">@{c.author}</span>
                    <span className="comment-text">{c.content}</span>
                    <span className="comment-time">
                      {formatRelativeTime(c.createdAt)}
                    </span>
                  </div>
                  {c.canDelete && (
                    <button
                      type="button"
                      className="comment-delete-btn"
                      onClick={() => onDeleteComment(post.id, c.id)}
                      aria-label="Delete reply"
                      title="Delete reply"
                    >
                      ×
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {!commentsOpen && comments.length > 0 && (
            <button
              type="button"
              className="inline-reply-prompt"
              onClick={() => {
                setCommentsOpen(true);
                setTimeout(() => replyInputRef.current?.focus(), 20);
              }}
            >
              + write a reply...
            </button>
          )}

          {commentsOpen && (
            <form className="comment-form" onSubmit={handleReplySubmit}>
              <button
                type="button"
                className="composer-avatar-btn"
                onClick={onOpenProfile}
                title="Edit your @name & avatar"
              >
                <Avatar
                  name={myProfile?.displayName || 'you'}
                  avatarUrl={myProfile?.avatarUrl}
                  hash={myProfile?.visitorHash}
                  size={22}
                />
              </button>
              <input
                ref={replyInputRef}
                type="text"
                className="comment-input"
                maxLength={1000}
                placeholder={`Reply as @${
                  myProfile?.displayName ||
                  localStorage.getItem(AUTHOR_STORAGE_KEY) ||
                  'anonymous'
                }...`}
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
              />
              <button
                type="submit"
                className="comment-send-btn"
                disabled={!replyText.trim() || sendingReply}
              >
                {sendingReply ? '...' : 'send'}
              </button>
            </form>
          )}

          {replyError && <p className="composer-error">{replyError}</p>}
        </div>
      )}
    </article>
  );
}
