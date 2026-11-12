import { useCallback, useEffect, useMemo, useState } from 'react';
import LetterGlitch from './components/LetterGlitch';
import Composer from './components/Composer';
import MomentCard from './components/MomentCard';
import Avatar from './components/Avatar';
import ProfileModal from './components/ProfileModal';
import {
  addComment,
  createMoment,
  deleteComment,
  deletePost,
  getFeedBundle,
  subscribeToMoments,
  togglePostReaction,
} from './db';

function Lightbox({ image, onClose }) {
  useEffect(() => {
    if (!image?.url) return undefined;

    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [image, onClose]);

  if (!image?.url) return null;

  return (
    <div
      className="lightbox-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
      onClick={onClose}
    >
      <button
        type="button"
        className="lightbox-close"
        onClick={onClose}
        aria-label="Close image preview"
      >
        esc ×
      </button>
      <img
        src={image.url}
        alt={image.name}
        className="lightbox-image"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

const FILTERS = [
  { id: 'all', label: 'all' },
  { id: 'blog', label: 'blog / notes' },
  { id: 'photos', label: 'photos' },
  { id: 'videos', label: 'videos' },
];

export default function App() {
  const [posts, setPosts] = useState([]);
  const [myProfile, setMyProfile] = useState({
    visitorHash: '',
    displayName: '',
    avatarUrl: '',
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [filter, setFilter] = useState('all');
  const [asciiPaused, setAsciiPaused] = useState(false);
  const [activeImage, setActiveImage] = useState(null);
  const [profileOpen, setProfileOpen] = useState(false);

  const refreshFeed = useCallback(async () => {
    try {
      const bundle = await getFeedBundle();
      setPosts(bundle.posts);
      setMyProfile(bundle.myProfile);
      setLoadError('');
    } catch (err) {
      console.error('Failed to load moments:', err);
      setLoadError(err?.message || 'Failed to connect to shared feed.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshFeed();
    const unsubscribe = subscribeToMoments(() => {
      refreshFeed();
    });
    return () => {
      unsubscribe();
    };
  }, [refreshFeed]);

  async function handlePublish(draft) {
    const created = await createMoment({
      ...draft,
      currentAvatarUrl: myProfile.avatarUrl,
    });
    if (draft.author && draft.author !== 'anonymous') {
      setMyProfile((prev) => ({ ...prev, displayName: draft.author }));
    }
    setPosts((prev) => {
      if (prev.some((p) => p.id === created.id)) return prev;
      return [created, ...prev];
    });
    if (filter !== 'all') {
      setFilter('all');
    }
  }

  async function handleToggleReaction(postId, emoji) {
    const target = posts.find((p) => p.id === postId);
    if (!target) return;

    const currentEntry = (target.reactions || []).find(
      (r) => r.emoji === emoji
    );
    const shouldReact = !currentEntry?.reacted;

    setPosts((prev) =>
      prev.map((p) => {
        if (p.id !== postId) return p;
        return {
          ...p,
          reactions: (p.reactions || []).map((r) =>
            r.emoji === emoji
              ? {
                  ...r,
                  reacted: shouldReact,
                  count: Math.max(0, r.count + (shouldReact ? 1 : -1)),
                }
              : r
          ),
        };
      })
    );

    try {
      await togglePostReaction(postId, emoji, shouldReact);
    } catch (err) {
      console.error('Failed to toggle reaction:', err);
      refreshFeed();
    }
  }

  async function handleAddComment({ postId, author, content }) {
    const created = await addComment({
      postId,
      author,
      content,
      currentAvatarUrl: myProfile.avatarUrl,
    });
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id !== postId) return p;
        if (p.comments.some((c) => c.id === created.id)) return p;
        return {
          ...p,
          comments: [...p.comments, created],
        };
      })
    );
  }

  async function handleDeleteComment(postId, commentId) {
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? { ...p, comments: p.comments.filter((c) => c.id !== commentId) }
          : p
      )
    );
    try {
      await deleteComment(commentId);
    } catch (err) {
      console.error('Failed to delete comment:', err);
      refreshFeed();
    }
  }

  async function handleDeletePost(id) {
    const previous = posts;
    setPosts((prev) => prev.filter((p) => p.id !== id));
    try {
      await deletePost(id);
    } catch (err) {
      console.error('Failed to delete post:', err);
      setPosts(previous);
    }
  }

  function handleProfileSaved(saved) {
    setMyProfile(saved);
    refreshFeed();
  }

  const filteredPosts = useMemo(() => {
    return posts.filter((post) => {
      const media = post.media || [];
      if (filter === 'photos') {
        return media.some((m) => m.kind === 'image');
      }
      if (filter === 'videos') {
        return media.some((m) => m.kind === 'video');
      }
      if (filter === 'blog') {
        return (
          Boolean(post.title) || (media.length === 0 && Boolean(post.content))
        );
      }
      return true;
    });
  }, [posts, filter]);

  return (
    <div className="page-root">
      <LetterGlitch paused={asciiPaused} />

      <div className="content-shell">
        <header className="site-header">
          <div className="brand-group">
            <a href="./" className="brand-title">
              moments<span className="brand-cursor">_</span>
            </a>
            <p className="brand-subtitle">
              a quiet shared log for daily life, photos &amp; clips
            </p>
          </div>

          <div className="header-controls">
            <button
              type="button"
              className="profile-trigger-btn"
              onClick={() => setProfileOpen(true)}
              title="Edit your avatar & @name"
            >
              <Avatar
                name={myProfile.displayName || 'you'}
                avatarUrl={myProfile.avatarUrl}
                hash={myProfile.visitorHash}
                size={20}
              />
              <span>
                {myProfile.displayName
                  ? `@${myProfile.displayName}`
                  : 'profile'}
              </span>
            </button>

            <button
              type="button"
              className="ascii-toggle"
              onClick={() => setAsciiPaused((p) => !p)}
              title="Toggle background ASCII animation"
            >
              ascii: {asciiPaused ? 'paused' : 'on'}
            </button>
          </div>
        </header>

        <main className="main-feed">
          <section aria-label="Create a post">
            <Composer
              profile={myProfile}
              onOpenProfile={() => setProfileOpen(true)}
              onPublish={handlePublish}
            />
          </section>

          <nav className="filter-bar" aria-label="Filter moments">
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`filter-pill ${
                  filter === item.id ? 'is-active' : ''
                }`}
                onClick={() => setFilter(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <section className="feed-list" aria-label="Shared moments">
            {loading ? (
              <p className="empty-state">connecting to shared feed...</p>
            ) : loadError ? (
              <div className="empty-state">
                <p>{loadError}</p>
              </div>
            ) : filteredPosts.length === 0 ? (
              <div className="empty-state">
                <p>no moments here yet.</p>
                <span>
                  write a thought or drop a photo/video above to share the first
                  one.
                </span>
              </div>
            ) : (
              filteredPosts.map((post) => (
                <MomentCard
                  key={post.id}
                  post={post}
                  myProfile={myProfile}
                  onToggleReaction={handleToggleReaction}
                  onAddComment={handleAddComment}
                  onDeleteComment={handleDeleteComment}
                  onDelete={handleDeletePost}
                  onOpenImage={setActiveImage}
                  onOpenProfile={() => setProfileOpen(true)}
                />
              ))
            )}
          </section>
        </main>

        <footer className="site-footer">
          <span>live shared feed · moments v0.2</span>
        </footer>
      </div>

      <ProfileModal
        open={profileOpen}
        profile={myProfile}
        onClose={() => setProfileOpen(false)}
        onProfileSaved={handleProfileSaved}
        onTokenSynced={refreshFeed}
      />

      <Lightbox image={activeImage} onClose={() => setActiveImage(null)} />
    </div>
  );
}
