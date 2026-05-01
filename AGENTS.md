# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Commands

```bash
# Start dev server (opens QR code for Expo Go)
npx expo start

# Start targeting a specific platform
npx expo start --android
npx expo start --ios
npx expo start --web
```

There are no lint or test scripts configured. TypeScript type checking can be run via:
```bash
npx tsc --noEmit
```

## Environment

Requires a `.env` file at the root with:
```
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

## Architecture

**LAFMS** (Lost and Found Management System) is a React Native / Expo app for De La Salle Lipa (DLSL). It uses **Expo Router** (file-based routing) with **Supabase** as the backend.

### Routing & Auth Flow

`app/_layout.tsx` is the root layout. It:
1. Fetches the Supabase session on mount and subscribes to auth changes.
2. Queries the `users` table for the authenticated user's `role` (`'student'` | `'admin'`).
3. Redirects to the correct route group based on role, or to `/(auth)/login` if unauthenticated.

Three route groups exist:
- `(auth)/` — login, register (unauthenticated)
- `(student)/` — tab navigator for students
- `(admin)/` — tab navigator for admins

`app/index.tsx` is a splash screen that auto-navigates to `/(auth)/login` after 2.5 seconds.

### Student Flow

Tabs: Home → Found Items browser → Post (FAB) → Activity → Profile

Key student screens:
- `post.tsx` — report a lost item
- `found.tsx` — browse found items
- `activity.tsx` — track status of the student's lost item reports; badge shows items in `possible_match` or `ready_for_claiming` status

### Admin Flow

Tabs: Dashboard → Found Items → Matching → Claims → Archive → Settings

Key admin screens:
- `found-items.tsx` — manage submitted found reports; badge = `found_reports` with `status='pending_review'`
- `matching.tsx` — match found items to lost reports; badge = `lost_items` in `searching` or `possible_match`
- `claims.tsx` — approve/reject claims; badge = `claims` with `status='proof_submitted'`
- `notifications.tsx` — accessible via deep link / `href: null` (hidden from tab bar)

### Database Tables (Supabase)

- `users` — `id`, `role` (`student` | `admin`)
- `lost_items` — `user_id`, `status` (`searching`, `possible_match`, `ready_for_claiming`, ...)
- `found_reports` — `status` (`pending_review`, ...)
- `claims` — `status` (`proof_submitted`, ...)

### Theming

`lib/ThemeContext.tsx` provides a `ThemeProvider` wrapping the entire app. Use the `useTheme()` hook to get `{ colors, isDark, toggle }`. Light/dark color palettes are defined as `LightColors` / `DarkColors`. Theme preference is persisted in `AsyncStorage` under the key `'theme'`.

`constants/theme.ts` exports `Colors` (light palette only), `Spacing`, and `Radius` — used in layouts that don't need dynamic theming.

### Supabase Client

`lib/supabase.ts` exports a single `supabase` client configured with `AsyncStorage` for session persistence. Import it wherever DB/auth access is needed.
