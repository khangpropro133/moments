import { createClient } from '@supabase/supabase-js';

const VISITOR_TOKEN_KEY = 'moments_visitor_token_v1';

function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function getVisitorToken() {
  let token = localStorage.getItem(VISITOR_TOKEN_KEY);
  if (!token || token.length < 32) {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    token = bytesToHex(bytes);
    localStorage.setItem(VISITOR_TOKEN_KEY, token);
  }
  return token;
}

let cachedTokenHashPromise = null;

export function getVisitorTokenHash() {
  if (!cachedTokenHashPromise) {
    const token = getVisitorToken();
    const encoded = new TextEncoder().encode(token);
    cachedTokenHashPromise = crypto.subtle
      .digest('SHA-256', encoded)
      .then((buf) => bytesToHex(new Uint8Array(buf)));
  }
  return cachedTokenHashPromise;
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(
  supabaseUrl && supabasePublishableKey
);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        headers: {
          'x-visitor-token': getVisitorToken(),
        },
      },
    })
  : null;
