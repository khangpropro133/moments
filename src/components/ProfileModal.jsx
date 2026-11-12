import { useEffect, useRef, useState } from 'react';
import Avatar from './Avatar';
import { cropAndUploadAvatar, saveMyProfile } from '../db';
import { getVisitorToken, setVisitorToken } from '../supabase';

export default function ProfileModal({
  open,
  profile,
  onClose,
  onProfileSaved,
  onTokenSynced,
}) {
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showSync, setShowSync] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pasteCode, setPasteCode] = useState('');
  const [error, setError] = useState('');

  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    setDisplayName(profile?.displayName || '');
    setAvatarUrl(profile?.avatarUrl || '');
    setError('');
    setCopied(false);
    setPasteCode('');

    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, profile, onClose]);

  if (!open) return null;

  async function handleAvatarSelect(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setUploadingAvatar(true);
    setError('');
    try {
      const uploadedUrl = await cropAndUploadAvatar(file);
      setAvatarUrl(uploadedUrl);
    } catch (err) {
      console.error(err);
      setError(err?.message || 'Could not upload avatar.');
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const saved = await saveMyProfile({
        displayName: displayName.trim() || 'anonymous',
        avatarUrl,
      });
      onProfileSaved(saved);
      onClose();
    } catch (err) {
      console.error(err);
      setError(err?.message || 'Could not save profile.');
    } finally {
      setSaving(false);
    }
  }

  async function handleCopySyncCode() {
    try {
      await navigator.clipboard.writeText(getVisitorToken());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Clipboard copy failed—select and copy manually.');
    }
  }

  async function handleApplySyncCode() {
    setError('');
    try {
      setVisitorToken(pasteCode);
      await onTokenSynced();
      onClose();
    } catch (err) {
      setError(err?.message || 'Invalid sync code.');
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-modal-title"
      onClick={onClose}
    >
      <div className="profile-modal" onClick={(e) => e.stopPropagation()}>
        <div className="profile-modal-header">
          <h2 id="profile-modal-title">your profile</h2>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close profile dialog"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSave} className="profile-form">
          <div className="profile-avatar-row">
            <button
              type="button"
              className="avatar-upload-trigger"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingAvatar}
              title="Click to upload avatar"
            >
              <Avatar
                name={displayName || 'you'}
                avatarUrl={avatarUrl}
                hash={profile?.visitorHash}
                size={56}
              />
            </button>

            <div className="profile-avatar-controls">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={handleAvatarSelect}
              />
              <div className="profile-avatar-btns">
                <button
                  type="button"
                  className="attach-btn"
                  disabled={uploadingAvatar}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploadingAvatar ? 'cropping...' : 'upload avatar'}
                </button>
                {avatarUrl && (
                  <button
                    type="button"
                    className="ghost-toggle"
                    onClick={() => setAvatarUrl('')}
                  >
                    use ascii badge
                  </button>
                )}
              </div>
              <span className="profile-hint">
                auto-cropped to 256×256 · updates your posts &amp; replies
              </span>
            </div>
          </div>

          <label className="profile-field">
            <span className="profile-label">display handle</span>
            <div className="profile-input-box">
              <span className="mono-prefix">@</span>
              <input
                type="text"
                maxLength={28}
                placeholder="your-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
          </label>

          {error && <p className="composer-error">{error}</p>}

          <div className="profile-save-row">
            <button
              type="button"
              className="ghost-toggle"
              onClick={() => setShowSync((v) => !v)}
            >
              {showSync ? '− hide sync code' : '+ sync across phone / laptop'}
            </button>

            <button
              type="submit"
              className="post-btn"
              disabled={saving || uploadingAvatar}
            >
              {saving ? 'saving...' : 'save'}
            </button>
          </div>
        </form>

        {showSync && (
          <div className="sync-section">
            <p className="sync-caption">
              Copy your secret browser code to use the same avatar, @name, and
              post ownership on another device:
            </p>
            <button
              type="button"
              className="attach-btn sync-copy-btn"
              onClick={handleCopySyncCode}
            >
              {copied ? '✓ copied sync code' : 'copy my sync code'}
            </button>

            <div className="sync-paste-row">
              <input
                type="text"
                className="sync-input"
                placeholder="Or paste code from another device..."
                value={pasteCode}
                onChange={(e) => setPasteCode(e.target.value)}
              />
              <button
                type="button"
                className="attach-btn"
                disabled={!pasteCode.trim()}
                onClick={handleApplySyncCode}
              >
                apply
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
