import {
  getVisitorTokenHash,
  isSupabaseConfigured,
  supabase,
} from './supabase';

const MEDIA_BUCKET = 'moments-media';
const MAX_MEDIA_BYTES = 50 * 1024 * 1024; // 50 MB Supabase free tier limit

function sanitizeExtension(file) {
  const fromName = (file.name || '').split('.').pop()?.toLowerCase() || '';
  const clean = fromName.replace(/[^a-z0-9]/g, '');
  if (clean && clean.length <= 6) return clean;
  if (file.type.startsWith('video/')) return 'mp4';
  return 'jpg';
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
    const uid =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
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

function hydratePosts(rawPosts, rawLikes, myHash) {
  const likesByPost = new Map();
  const likedByMe = new Set();

  for (const row of rawLikes || []) {
    likesByPost.set(row.post_id, (likesByPost.get(row.post_id) || 0) + 1);
    if (row.visitor_hash === myHash) {
      likedByMe.add(row.post_id);
    }
  }

  return (rawPosts || []).map((row) => ({
    id: row.id,
    author: row.author || 'anonymous',
    title: row.title || '',
    content: row.content || '',
    media: Array.isArray(row.media) ? row.media : [],
    likes: likesByPost.get(row.id) || 0,
    liked: likedByMe.has(row.id),
    isMine: row.author_token_hash === myHash,
    createdAt: new Date(row.created_at).getTime(),
  }));
}

export async function getAllPosts() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase environment variables are not configured.');
  }

  const [myHash, postsRes, likesRes] = await Promise.all([
    getVisitorTokenHash(),
    supabase
      .from('posts')
      .select(
        'id, author, title, content, media, author_token_hash, created_at'
      )
      .order('created_at', { ascending: false })
      .limit(100),
    supabase.from('post_likes').select('post_id, visitor_hash'),
  ]);

  if (postsRes.error) {
    throw new Error(postsRes.error.message);
  }
  if (likesRes.error) {
    throw new Error(likesRes.error.message);
  }

  return hydratePosts(postsRes.data, likesRes.data, myHash);
}

export async function createMoment({ author, title, content, attachments }) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase environment variables are not configured.');
  }

  const [myHash, uploadedMedia] = await Promise.all([
    getVisitorTokenHash(),
    uploadMediaFiles(attachments),
  ]);

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
    title: data.title,
    content: data.content,
    media: Array.isArray(data.media) ? data.media : [],
    likes: 0,
    liked: false,
    isMine: true,
    createdAt: new Date(data.created_at).getTime(),
  };
}

export async function togglePostLike(postId, shouldLike) {
  if (!isSupabaseConfigured || !supabase) return;
  const myHash = await getVisitorTokenHash();

  if (shouldLike) {
    const { error } = await supabase.from('post_likes').insert({
      post_id: postId,
      visitor_hash: myHash,
    });
    // Ignore duplicate key if already liked
    if (error && error.code !== '23505') {
      throw new Error(error.message);
    }
  } else {
    const { error } = await supabase
      .from('post_likes')
      .delete()
      .eq('post_id', postId)
      .eq('visitor_hash', myHash);

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

  const channel = supabase
    .channel('moments-realtime-feed')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'posts' },
      () => onRefresh()
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'post_likes' },
      () => onRefresh()
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
