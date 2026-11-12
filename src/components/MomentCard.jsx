import { useEffect, useState } from 'react';

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
  onToggleLike,
  onDelete,
  onOpenImage,
}) {
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isLongText = (post.content || '').length > 520;
  const displayedText =
    isLongText && !expanded
      ? `${post.content.slice(0, 520).trimEnd()}…`
      : post.content;

  const mediaList = post.media || [];

  return (
    <article className="moment-card">
      <header className="moment-header">
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
        <button
          type="button"
          className={`like-btn ${post.liked ? 'is-liked' : ''}`}
          onClick={() => onToggleLike(post.id)}
          aria-pressed={Boolean(post.liked)}
        >
          <span aria-hidden="true">{post.liked ? '♥' : '♡'}</span>
          <span>{post.likes || 0}</span>
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
      </footer>
    </article>
  );
}
