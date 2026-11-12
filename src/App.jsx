import { useCallback, useEffect, useMemo, useState } from 'react';
import LetterGlitch from './components/LetterGlitch';
import Composer from './components/Composer';
import MomentCard from './components/MomentCard';
import {
  createMoment,
  deletePost,
  getAllPosts,
  subscribeToMoments,
  togglePostLike,
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
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [filter, setFilter] = useState('all');
  const [asciiPaused, setAsciiPaused] = useState(false);
  const [activeImage, setActiveImage] = useState(null);

  const refreshFeed = useCallback(async () => {
    try {
      const loaded = await getAllPosts();
      setPosts(loaded);
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
    const created = await createMoment(draft);
    setPosts((prev) => {
      if (prev.some((p) => p.id === created.id)) return prev;
      return [created, ...prev];
    });
    if (filter !== 'all') {
      setFilter('all');
    }
  }

  async function handleToggleLike(id) {
    const target = posts.find((p) => p.id === id);
    if (!target) return;

    const nextLiked = !target.liked;
    const optimistic = {
      ...target,
      liked: nextLiked,
      likes: Math.max(0, (target.likes || 0) + (nextLiked ? 1 : -1)),
    };

    setPosts((prev) => prev.map((p) => (p.id === id ? optimistic : p)));

    try {
      await togglePostLike(id, nextLiked);
    } catch (err) {
      console.error('Failed to update like:', err);
      refreshFeed();
    }
  }

  async function handleDelete(id) {
    const previous = posts;
    setPosts((prev) => prev.filter((p) => p.id !== id));
    try {
      await deletePost(id);
    } catch (err) {
      console.error('Failed to delete post:', err);
      setPosts(previous);
    }
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

          <button
            type="button"
            className="ascii-toggle"
            onClick={() => setAsciiPaused((p) => !p)}
            title="Toggle background ASCII animation"
          >
            ascii: {asciiPaused ? 'paused' : 'on'}
          </button>
        </header>

        <main className="main-feed">
          <section aria-label="Create a post">
            <Composer onPublish={handlePublish} />
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
                  onToggleLike={handleToggleLike}
                  onDelete={handleDelete}
                  onOpenImage={setActiveImage}
                />
              ))
            )}
          </section>
        </main>

        <footer className="site-footer">
          <span>live shared feed · moments</span>
        </footer>
      </div>

      <Lightbox image={activeImage} onClose={() => setActiveImage(null)} />
    </div>
  );
}
