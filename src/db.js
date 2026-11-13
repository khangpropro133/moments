import {
  getVisitorTokenHash,
  isSupabaseConfigured,
  supabase,
} from './supabase';

const MEDIA_BUCKET = 'moments-media';
const MAX_MEDIA_BYTES = 50 * 1024 * 1024; // 50 MB
export const AUTHOR_STORAGE_KEY = 'moments_author_name';
export const REACTION_OPTIONS = ['♥', '😂', '🔥', '🫂', '👀', '✦'];

function sanitizeExtension(file) {
  const fromName = (file.name || '').split('.').pop()?.toLowerCase() || '';
  const clean = fromName.replace(/[^a-z0-9]/g, '');
  if (clean && clean.length <= 6) return clean;
  if (file.type.startsWith('video/')) return 'mp4';
  return 'jpg';
}

function makeUid() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

async function uploadMediaFiles(attachments = []) {
  if (!attachments.length) return [];

  for (const item of attachments) {
    if (item.file.size > MAX_MEDIA_BYTES) {
      throw new Error(
        `"${item.file.name}" exceeds the 50 MB file size limit.`
      );
    }
  }

  const uploaded = [];
  for (const item of attachments) {
    const ext = sanitizeExtension(item.file);
    const uid = makeUid();
    const storagePath = `posts/${Date.now()}-${uid}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(MEDIA_BUCKET)
      .upload(storagePath, item.file, {
        contentType: item.file.type || 'application/octet-stream',
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    const { data: urlData } = supabase.storage
      .from(MEDIA_BUCKET)
      .getPublicUrl(storagePath);

    uploaded.push({
      id: item.id || uid,
      kind: item.kind,
      mimeType: item.file.type,
      name: item.file.name,
      url: urlData.publicUrl,
      storagePath,
    });
  }

  return uploaded;
}

/**
 * Center-crops an image file to 256x256 on canvas and uploads to avatars/ folder.
 */
export async function cropAndUploadAvatar(file) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase environment variables are not configured.');
  }
  if (!file || !file.type.startsWith('image/')) {
    throw new Error('Please choose an image file for your avatar.');
  }

  const bitmapUrl = URL.createObjectURL(file);
  let blob;

  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not read image file.'));
      el.src = bitmapUrl;
    });

    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    const minSide = Math.min(img.naturalWidth || img.width, img.naturalHeight || img.height);
    const sx = ((img.naturalWidth || img.width) - minSide) / 2;
    const sy = ((img.naturalHeight || img.height) - minSide) / 2;

    ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);

    blob = await new Promise((resolve) => {
      canvas.toBlob(
        (b) => {
          if (b) {
            resolve(b);
          } else {
            canvas.toBlob((fallback) => resolve(fallback), 'image/jpeg', 0.88);
          }
        },
        'image/webp',
        0.86
      );
    });
  } finally {
    URL.revokeObjectURL(bitmapUrl);
  }

  if (!blob) {
    throw new Error('Failed to process avatar image.');
  }

  const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
  const storagePath = `avatars/${Date.now()}-${makeUid()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(storagePath, blob, {
      contentType: blob.type,
      cacheControl: '86400',
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`Avatar upload failed: ${uploadError.message}`);
  }

  const { data: urlData } = supabase.storage
    .from(MEDIA_BUCKET)
    .getPublicUrl(storagePath);

  return urlData.publicUrl;
}

export async function saveMyProfile({ displayName, avatarUrl }) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase environment variables are not configured.');
  }

  const myHash = await getVisitorTokenHash();
  const cleanName =
    (displayName || '').trim().replace(/^@+/, '').slice(0, 40) || 'anonymous';
  const cleanAvatar = (avatarUrl || '').trim();

  const { data, error } = await supabase
    .from('profiles')
    .upsert(
      {
        visitor_hash: myHash,
        display_name: cleanName,
        avatar_url: cleanAvatar,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'visitor_hash' }
    )
    .select('visitor_hash, display_name, avatar_url')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  localStorage.setItem(AUTHOR_STORAGE_KEY, data.display_name);

  return {
    visitorHash: data.visitor_hash,
    displayName: data.display_name,
    avatarUrl: data.avatar_url || '',
  };
}

function hydrateFeed({
  rawPosts,
  rawProfiles,
  rawComments,
  rawReactions,
  myHash,
}) {
  const profileMap = new Map();
  for (const p of rawProfiles || []) {
    profileMap.set(p.visitor_hash, {
      displayName: p.display_name || '',
      avatarUrl: p.avatar_url || '',
    });
  }

  const postOwnerMap = new Map();
  for (const row of rawPosts || []) {
    postOwnerMap.set(row.id, row.author_token_hash);
  }

  // Group reactions per post
  const reactionsByPost = new Map();
  for (const r of rawReactions || []) {
    if (!reactionsByPost.has(r.post_id)) {
      reactionsByPost.set(r.post_id, new Map());
    }
    const emojiMap = reactionsByPost.get(r.post_id);
    if (!emojiMap.has(r.reaction)) {
      emojiMap.set(r.reaction, { count: 0, reacted: false });
    }
    const entry = emojiMap.get(r.reaction);
    entry.count += 1;
    if (r.visitor_hash === myHash) {
      entry.reacted = true;
    }
  }

  // Group comments per post
  const commentsByPost = new Map();
  for (const c of rawComments || []) {
    if (!commentsByPost.has(c.post_id)) {
      commentsByPost.set(c.post_id, []);
    }
    const cProf = profileMap.get(c.author_token_hash);
    const postOwnerHash = postOwnerMap.get(c.post_id);

    commentsByPost.get(c.post_id).push({
      id: c.id,
      postId: c.post_id,
      author: cProf?.displayName || c.author || 'anonymous',
      avatarUrl: cProf?.avatarUrl || '',
      authorHash: c.author_token_hash,
      content: c.content || '',
      createdAt: new Date(c.created_at).getTime(),
      canDelete:
        c.author_token_hash === myHash || postOwnerHash === myHash,
    });
  }

  const posts = (rawPosts || []).map((row) => {
    const prof = profileMap.get(row.author_token_hash);
    const emojiMap = reactionsByPost.get(row.id) || new Map();

    const reactions = REACTION_OPTIONS.map((emoji) => {
      const info = emojiMap.get(emoji) || { count: 0, reacted: false };
      return {
        emoji,
        count: info.count,
        reacted: info.reacted,
      };
    });

    return {
      id: row.id,
      author: prof?.displayName || row.author || 'anonymous',
      avatarUrl: prof?.avatarUrl || '',
      authorHash: row.author_token_hash,
      title: row.title || '',
      content: row.content || '',
      media: Array.isArray(row.media) ? row.media : [],
      reactions,
      comments: commentsByPost.get(row.id) || [],
      isMine: row.author_token_hash === myHash,
      createdAt: new Date(row.created_at).getTime(),
    };
  });

  const myStoredProfile = profileMap.get(myHash);
  const localAuthor = localStorage.getItem(AUTHOR_STORAGE_KEY) || '';
  if (myStoredProfile?.displayName) {
    localStorage.setItem(AUTHOR_STORAGE_KEY, myStoredProfile.displayName);
  }

  const myProfile = {
    visitorHash: myHash,
    displayName: myStoredProfile?.displayName || localAuthor || '',
    avatarUrl: myStoredProfile?.avatarUrl || '',
  };

  return { posts, myProfile };
}

async function fetchAllRows(buildQuery, pageSize = 1000, maxRows = 5000) {
  const all = [];
  let from = 0;

  while (from < maxRows) {
    const to = from + pageSize - 1;
    const { data, error } = await buildQuery().range(from, to);
    if (error) throw new Error(error.message);
    const batch = data || [];
    all.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }

  return all;
}

export async function getFeedBundle() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase environment variables are not configured.');
  }

  const [myHash, rawPosts, rawProfiles, rawComments, rawReactions] =
    await Promise.all([
      getVisitorTokenHash(),
      fetchAllRows(
        () =>
          supabase
            .from('posts')
            .select(
              'id, author, title, content, media, author_token_hash, created_at'
            )
            .order('created_at', { ascending: false }),
        500,
        1000
      ),
      fetchAllRows(
        () =>
          supabase
            .from('profiles')
            .select('visitor_hash, display_name, avatar_url'),
        1000,
        3000
      ),
      fetchAllRows(
        () =>
          supabase
            .from('post_comments')
            .select(
              'id, post_id, author, content, author_token_hash, created_at'
            )
            .order('created_at', { ascending: true }),
        1000,
        5000
      ),
      fetchAllRows(
        () =>
          supabase
            .from('post_reactions')
            .select('post_id, visitor_hash, reaction'),
        1000,
        10000
      ),
    ]);

  return hydrateFeed({
    rawPosts,
    rawProfiles,
    rawComments,
    rawReactions,
    myHash,
  });
}

export async function createMoment({
  author,
  title,
  content,
  attachments,
  currentAvatarUrl = '',
}) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase environment variables are not configured.');
  }

  const [myHash, uploadedMedia] = await Promise.all([
    getVisitorTokenHash(),
    uploadMediaFiles(attachments),
  ]);

  if (author && author !== 'anonymous') {
    await supabase.from('profiles').upsert(
      {
        visitor_hash: myHash,
        display_name: author,
        avatar_url: currentAvatarUrl || '',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'visitor_hash' }
    );
  }

  const { data, error } = await supabase
    .from('posts')
    .insert({
      author,
      title,
      content,
      media: uploadedMedia,
      author_token_hash: myHash,
    })
    .select('id, author, title, content, media, author_token_hash, created_at')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return {
    id: data.id,
    author: data.author,
    avatarUrl: currentAvatarUrl || '',
    authorHash: myHash,
    title: data.title,
    content: data.content,
    media: Array.isArray(data.media) ? data.media : [],
    reactions: REACTION_OPTIONS.map((emoji) => ({
      emoji,
      count: 0,
      reacted: false,
    })),
    comments: [],
    isMine: true,
    createdAt: new Date(data.created_at).getTime(),
  };
}

export async function addComment({
  postId,
  author,
  content,
  currentAvatarUrl = '',
}) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase environment variables are not configured.');
  }

  const myHash = await getVisitorTokenHash();
  const cleanAuthor =
    (author || '').trim().replace(/^@+/, '').slice(0, 40) || 'anonymous';
  const cleanContent = (content || '').trim();

  if (!cleanContent) {
    throw new Error('Comment cannot be empty.');
  }

  if (cleanAuthor !== 'anonymous') {
    await supabase.from('profiles').upsert(
      {
        visitor_hash: myHash,
        display_name: cleanAuthor,
        avatar_url: currentAvatarUrl || '',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'visitor_hash' }
    );
  }

  const { data, error } = await supabase
    .from('post_comments')
    .insert({
      post_id: postId,
      author: cleanAuthor,
      content: cleanContent,
      author_token_hash: myHash,
    })
    .select('id, post_id, author, content, author_token_hash, created_at')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return {
    id: data.id,
    postId: data.post_id,
    author: cleanAuthor,
    avatarUrl: currentAvatarUrl || '',
    authorHash: myHash,
    content: data.content,
    createdAt: new Date(data.created_at).getTime(),
    canDelete: true,
  };
}

export async function deleteComment(commentId) {
  if (!isSupabaseConfigured || !supabase) return;
  const { error } = await supabase
    .from('post_comments')
    .delete()
    .eq('id', commentId);
  if (error) {
    throw new Error(error.message);
  }
}

export async function togglePostReaction(postId, emoji, shouldReact) {
  if (!isSupabaseConfigured || !supabase) return;
  const myHash = await getVisitorTokenHash();

  if (shouldReact) {
    const { error } = await supabase.from('post_reactions').insert({
      post_id: postId,
      visitor_hash: myHash,
      reaction: emoji,
    });
    if (error && error.code !== '23505') {
      throw new Error(error.message);
    }
  } else {
    const { error } = await supabase
      .from('post_reactions')
      .delete()
      .eq('post_id', postId)
      .eq('visitor_hash', myHash)
      .eq('reaction', emoji);

    if (error) {
      throw new Error(error.message);
    }
  }
}

export async function deletePost(postId) {
  if (!isSupabaseConfigured || !supabase) return;
  const { error } = await supabase.from('posts').delete().eq('id', postId);
  if (error) {
    throw new Error(error.message);
  }
}

export function subscribeToMoments(onRefresh) {
  if (!isSupabaseConfigured || !supabase) {
    return () => {};
  }

  let debounceTimer = null;
  const scheduleRefresh = () => {
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => {
      onRefresh();
    }, 120);
  };

  const channel = supabase
    .channel('moments-realtime-v2')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'posts' },
      scheduleRefresh
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'profiles' },
      scheduleRefresh
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'post_comments' },
      scheduleRefresh
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'post_reactions' },
      scheduleRefresh
    )
    .subscribe();

  return () => {
    window.clearTimeout(debounceTimer);
    supabase.removeChannel(channel);
  };
}
