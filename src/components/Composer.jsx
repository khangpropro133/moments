import { useEffect, useRef, useState } from 'react';

const AUTHOR_STORAGE_KEY = 'moments_author_name';

function PreviewAttachment({ item, onRemove }) {
  const [url, setUrl] = useState('');

  useEffect(() => {
    const objectUrl = URL.createObjectURL(item.file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [item.file]);

  return (
    <div className="attachment-preview">
      {url &&
        (item.kind === 'video' ? (
          <video src={url} muted playsInline preload="metadata" />
        ) : (
          <img src={url} alt={item.file.name} />
        ))}
      <span className="attachment-badge">
        {item.kind === 'video' ? 'video' : 'photo'}
      </span>
      <button
        type="button"
        className="attachment-remove"
        onClick={() => onRemove(item.id)}
        aria-label={`Remove ${item.file.name}`}
      >
        ×
      </button>
    </div>
  );
}

export default function Composer({ onPublish }) {
  const [author, setAuthor] = useState(
    () => localStorage.getItem(AUTHOR_STORAGE_KEY) || ''
  );
  const [showTitle, setShowTitle] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const fileInputRef = useRef(null);

  function addFiles(fileList) {
    setError('');
    const incoming = Array.from(fileList || []);
    if (!incoming.length) return;

    const accepted = [];
    for (const file of incoming) {
      const isImage = file.type.startsWith('image/');
      const isVideo = file.type.startsWith('video/');
      if (!isImage && !isVideo) {
        setError('Only image and video files are supported.');
        continue;
      }
      accepted.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        kind: isVideo ? 'video' : 'image',
        file,
      });
    }

    if (accepted.length) {
      setAttachments((prev) => [...prev, ...accepted].slice(0, 6));
    }
  }

  function handleRemoveAttachment(id) {
    setAttachments((prev) => prev.filter((item) => item.id !== id));
  }

  function handleDrop(e) {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer?.files?.length) {
      addFiles(e.dataTransfer.files);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmedContent = content.trim();
    const trimmedTitle = showTitle ? title.trim() : '';
    const cleanAuthor =
      author.trim().replace(/^@+/, '').slice(0, 40) || 'anonymous';

    if (!trimmedContent && !trimmedTitle && attachments.length === 0) {
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      if (author.trim()) {
        localStorage.setItem(AUTHOR_STORAGE_KEY, cleanAuthor);
      }

      await onPublish({
        author: cleanAuthor,
        title: trimmedTitle,
        content: trimmedContent,
        attachments,
      });

      setTitle('');
      setShowTitle(false);
      setContent('');
      setAttachments([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      console.error(err);
      setError(err?.message || 'Could not publish your moment. Please retry.');
    } finally {
      setIsSubmitting(false);
    }
  }

  const canPost =
    !isSubmitting &&
    (content.trim().length > 0 ||
      (showTitle && title.trim().length > 0) ||
      attachments.length > 0);

  return (
    <form
      className={`composer-card ${isDragging ? 'is-dragging' : ''}`}
      onSubmit={handleSubmit}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      <div className="composer-top">
        <label className="author-input-wrap">
          <span className="mono-prefix">@</span>
          <input
            type="text"
            className="author-input"
            placeholder="your-name"
            maxLength={28}
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
          />
        </label>

        <button
          type="button"
          className={`ghost-toggle ${showTitle ? 'is-active' : ''}`}
          onClick={() => setShowTitle((v) => !v)}
        >
          {showTitle ? '− title' : '+ blog title'}
        </button>
      </div>

      {showTitle && (
        <input
          type="text"
          className="title-input"
          placeholder="Blog title..."
          maxLength={120}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      )}

      <textarea
        className="composer-textarea"
        rows={3}
        placeholder="Share a moment, a thought from today, a photo, or a short clip..."
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />

      {attachments.length > 0 && (
        <div className="attachment-strip">
          {attachments.map((item) => (
            <PreviewAttachment
              key={item.id}
              item={item}
              onRemove={handleRemoveAttachment}
            />
          ))}
        </div>
      )}

      {error && <p className="composer-error">{error}</p>}

      <div className="composer-footer">
        <div className="composer-actions">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            hidden
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            className="attach-btn"
            disabled={isSubmitting}
            onClick={() => fileInputRef.current?.click()}
          >
            + photo / video
          </button>
          <span className="composer-hint">or drop files</span>
        </div>

        <button type="submit" className="post-btn" disabled={!canPost}>
          {isSubmitting
            ? attachments.length > 0
              ? 'uploading...'
              : 'posting...'
            : 'post'}
        </button>
      </div>
    </form>
  );
}
