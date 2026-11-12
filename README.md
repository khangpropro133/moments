# moments_

A calm, black-themed daily-life sharing website built with **React + Vite** and **Supabase** (Postgres + Storage + Realtime).

People with the link can post short notes, longer blog thoughts, photos, and videos—all synced live across browsers and devices.

## Features

- **Drifting ASCII Sky + Shooting Meteors** (`src/components/LetterGlitch.jsx`): Pure `#000000` background with parallax drifting ASCII layers, ambient wave currents, cursor ripples, and shooting ASCII meteors.
- **Simple Moment & Blog Composer** (`src/components/Composer.jsx`): Enter an `@name`, optionally add a blog title, write text, and attach or drag-and-drop photos and videos (up to 50 MB).
- **Live Shared Feed** (`src/db.js`, `src/supabase.js`):
  - Posts and shared likes stored in **Supabase Postgres** (`public.posts` & `public.post_likes`) with Row Level Security.
  - Photos and videos uploaded to **Supabase Storage** (`moments-media` public bucket).
  - Live updates via **Supabase Realtime**.
  - Ownership-protected deletion & unliking via SHA-256 visitor tokens (`x-visitor-token`)—no login screen needed, while preventing anyone else from deleting your posts.

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
