# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm ci                 # install
npm run dev            # Astro dev server
npm run build          # static build into dist/
npm run preview        # serve dist/
npm run lint           # eslint (JS, TS, Astro)
npm run check          # astro check (type checking)
npm run format         # prettier --write (format:check to verify)
npm test               # vitest run
npx vitest run test/feedback.test.ts       # single test file
npx vitest run -t "name of test"           # single test by name
```

Full local verification sequence (from README): `format:check`, `lint`, `check`, `test`, `build`. Building requires a `.env` (copy `.env.example`) with the `PUBLIC_FIREBASE_*` and `PUBLIC_ADMIN_FIREBASE_EMAIL` values — `firebaseConfigFromEnvironment` throws if any are missing or if the project ID is not `lexigo-b2aee`.

## Architecture

Fully static Astro site for `tripletalk.app`, deployed to Cloudflare Pages (output `dist`, Node 22 at build time). There is no SSR, no custom API, no Firebase Admin SDK and no Node process in production. The README is in Polish; UI copy is Polish/English.

**Public pages** (`src/pages/`): `index.astro` (pl) and `en/index.astro` both render `components/LandingPage.astro` with a `language` prop. All landing copy and SEO strings live in `src/lib/landing-content.ts`, keyed by `pl`/`en` — edit text there, not in the component. `terms`, `privacy`, `support` contain both languages inline and switch client-side via `src/scripts/visitor-language.ts`, which reads the country from Cloudflare's `/cdn-cgi/trace` (cached in sessionStorage) and falls back to browser language / Europe/Warsaw timezone.

**Admin panel** (`/adminpanel`): `src/pages/adminpanel.astro` is static markup; all behavior is in `src/scripts/admin-panel.ts`, which auto-initializes only when `#admin-login-form` exists (so tests can import it without side effects). It uses the Firebase Web SDK directly from the browser:
- Login is mapped: the UI login `admin` signs in as `PUBLIC_ADMIN_FIREBASE_EMAIL`. Access requires the `admin: true` custom claim; real enforcement is in Firebase Security Rules, not this site.
- Data: Firestore `feedback` collection (list/paginate, status updates, delete incl. Storage attachments), statistics from `users` and `collectionGroup("lessons")`, AI cost/token aggregates from `collectionGroup("lexiAiUploads")`.
- Pure helpers (mapping, validation, summarizing, DOM rendering) are exported from `src/lib/feedback.ts` and `admin-panel.ts` and are what the vitest suites cover (`test/admin-ui.test.ts` runs in jsdom and checks XSS-safe rendering — render via DOM APIs/`textContent`, never `innerHTML` with data).
- Formatting uses `pl-PL` locale and `Europe/Warsaw` timezone; costs in USD.

`public/_headers` sets `no-store`, `noindex` and a strict CSP for `/adminpanel*` (`script-src 'self'`, `connect-src` limited to `*.googleapis.com`) — new external origins or inline scripts in the panel must be reflected there. `public/_redirects` provides the `/adminpanel` fallback.

**Firebase rules**: the actual Firestore/Storage rules live in the sibling repo `../tripletalk`. This repo only keeps patches in `firebase-rules/` (plus `storage.cors.json`). When the panel needs new data access, add a new `.patch` file there and document it in the README; never deploy rules or CORS from here — that is done manually after review (see README for `git apply --check` / `firebase deploy` commands).
