# moments_

A calm, black-themed daily-life sharing website built with **React + Vite** and **Supabase** (Postgres + Storage + Realtime).

People with the link can post short notes, longer blog thoughts, photos, and videos, react with emojis, and reply inline—all synced live across browsers and devices without a login wall.

## Features

- **Drifting ASCII Sky + Shooting Meteors** (`src/components/LetterGlitch.jsx`): Pure `#000000` background with parallax drifting ASCII layers, ambient wave currents, cursor ripples, and shooting ASCII meteors.
- **Zero-Login Profiles & Avatars** (`src/components/ProfileModal.jsx`, `src/components/Avatar.jsx`): Choose an `@name`, upload an avatar (auto-cropped client-side to `256×256`), or fall back to a deterministic ASCII badge. Includes a copy/paste **device sync code** (`x-visitor-token`) to carry the same profile and post ownership between laptop and phone.
- **Simple Moment & Blog Composer** (`src/components/Composer.jsx`): Optional blog title, freeform text, and multi-file photo/video uploads or drag-and-drop (up to 50 MB per file).
- **Curated Emoji Reactions & Inline Flat Replies** (`src/components/MomentCard.jsx`):
  - React to moments with `♥`, `😂`, `🔥`, `🫂`, `👀`, or `✦`.
  - Compact inline preview of the latest 2 replies on each card, expandable to the full chronological thread and reply input.
- **Live Shared Feed with Ownership RLS** (`src/db.js`, `src/supabase.js`):
  - Backed by **Supabase Postgres** (`public.posts`, `public.profiles`, `public.post_comments`, `public.post_reactions`) and **Supabase Storage** (`moments-media`).
  - Live updates via **Supabase Realtime**.
  - SHA-256 visitor-token Row Level Security (`x-visitor-token`) ensures only owners can update their profile, toggle their own reactions, or delete their posts/comments.

## Environment Variables

Copy `.env.example` to `.env` (already configured locally):

```env
VITE_SUPABASE_URL=https://hkwgmyxkzskfgzehtlzb.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_QN6Ta_DjfNyMAky98obiXg_XK0SVS0s
```

When deploying to **Vercel**, add those same two variables under **Project Settings → Environment Variables**.

## Run Locally

```bash
cd moments
npm install
npm run dev
```
