import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

const PAGE_SIZE = 25;

const FILTERS = [
  { id: 'all', label: 'all' },
  { id: 'blog', label: 'blog / notes' },
  { id: 'photos', label: 'photos' },
  { id: 'videos', label: 'videos' },
];

function matchesFilter(post, filterId) {
  const media = post.media || [];
  if (filterId === 'photos') {
    return media.some((m) => m.kind === 'image');
  }
  if (filterId === 'videos') {
    return media.some((m) => m.kind === 'video');
  }
  if (filterId === 'blog') {
    return (
      Boolean(post.title) || (media.length === 0 && Boolean(post.content))
    );
  }
  return true;
}

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
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [asciiPaused, setAsciiPaused] = useState(false);
  const [activeImage, setActiveImage] = useState(null);
  const [profileOpen, setProfileOpen] = useState(false);

  const loadMoreRef = useRef(null);

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

  const filterCounts = useMemo(() => {
    const counts = { all: posts.length, blog: 0, photos: 0, videos: 0 };
    for (const post of posts) {
      if (matchesFilter(post, 'blog')) counts.blog += 1;
      if (matchesFilter(post, 'photos')) counts.photos += 1;
      if (matchesFilter(post, 'videos')) counts.videos += 1;
    }
    return counts;
  }, [posts]);

  const filteredPosts = useMemo(() => {
    return posts.filter((post) => matchesFilter(post, filter));
  }, [posts, filter]);

  const displayedPosts = useMemo(() => {
    return filteredPosts.slice(0, visibleCount);
  }, [filteredPosts, visibleCount]);

  const hasMore = visibleCount < filteredPosts.length;

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [filter]);

  useEffect(() => {
    if (!hasMore) return undefined;
    const node = loadMoreRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((prev) => prev + PAGE_SIZE);
        }
      },
      { rootMargin: '420px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, filteredPosts.length]);

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
                <span>{item.label}</span>
                {!loading && filterCounts[item.id] > 0 && (
                  <span className="filter-count">{filterCounts[item.id]}</span>
                )}
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
              <>
                {displayedPosts.map((post) => (
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
                ))}

                {hasMore && (
                  <div ref={loadMoreRef} className="load-more-wrap">
                    <button
                      type="button"
                      className="load-more-btn"
                      onClick={() =>
                        setVisibleCount((prev) => prev + PAGE_SIZE)
                      }
                    >
                      load more moments ({displayedPosts.length} /{' '}
                      {filteredPosts.length})
                    </button>
                  </div>
                )}
              </>
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
