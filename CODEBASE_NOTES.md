# Codebase notes (read this first)

This file documents what changed when the codebase was annotated, so it's
easy to tell "original app logic" apart from "notes added for clarity."
**No runtime logic was changed** in any `.jsx`/`.js` file — only comments
were added — except for the new, separate Supabase files listed below,
which are inert until wired in.

## 1. File headers

Every source file (`.js`, `.jsx`, `.sql`) now starts with a comment block:

```
// FILE TYPE : ...
// PURPOSE   : ...
// CONNECTS TO : ...
```

`FILE TYPE` tells you at a glance whether a file is a mock backend
function, a React page/component/layout, a state store, shared
code, or a Supabase schema/policy/query file. `CONNECTS TO` tells you
which other files call it or are called by it, so you can trace data
flow (e.g. `Details.jsx` -> `useRentals()` -> `rentalsStore.jsx` ->
`backend/rentals/createRental.js`) without grepping.

## 2. Section banners inside "merged" files

Several files bundle more than one logical unit (a page component plus
one or more modal/sub-components it only uses internally, or a hook plus
the component that uses it). Rather than splitting these into more files
(which the task asked to avoid), each logical unit now has a one-line
banner comment marking where it starts, e.g.:

```
// ---- SECTION: sub-component (modal) — edit an existing listing ----
```

Files with these banners: `Dashboard.jsx`, `Login.jsx`, `Profile.jsx`,
`ListEquipment.jsx`, `Browse.jsx`, `Map/MapPage.jsx`, `Navbar.jsx`.

## 3. New: Supabase anonymous-auth backend (not yet wired in)

Two new files under `backend/supabase/`:

- **`client.js`** — creates one shared Supabase client (reads
  `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` from env vars — see
  `.env.example`). Requires `npm install @supabase/supabase-js`.
- **`anonymousAuth.js`** — `ensureAnonymousSession()`. This is
  intentionally scoped to Supabase's **anonymous auth** only (no real
  email/password or OAuth login was implemented, as requested). It:
  1. Reuses an existing browser session if one exists (Supabase persists
     the anonymous session in `localStorage`), and only calls
     `supabase.auth.signInAnonymously()` when there truly is none —
     this is the main reason a device never accumulates more than one
     anonymous user.
  2. Upserts matching rows into the `users`/`profiles` tables using
     `onConflict + ignoreDuplicates`, so even if it were ever called
     twice for the same user, the database's primary key makes a
     duplicate row structurally impossible (not just unlikely).

Neither file is imported by any existing page or store yet — dropping
them in causes **zero behavior change**. `state/auth/authStore.jsx` has
a comment block at the bottom sketching the ~5-line change that would
call `ensureAnonymousSession()` on mount to actually turn it on.

## 4. New: stricter listing rules (SQL, not yet applied to a live DB)

Two new migration files under `database/schema/`:

- **`anonymous_auth.sql`** — makes `users.email` nullable (anonymous
  users have none) while keeping it unique whenever it IS set, and
  points `users.id` at Supabase's real `auth.users(id)`.
- **`stricter_listing_rules.sql`** — moves several rules that today only
  live in `ListEquipment.jsx`'s client-side validation into real,
  unbypassable database constraints/triggers:
  - at least 3 photos (`photo_urls` array, was previously just a single
    `primary_image_url`)
  - name (3–120 chars) and description (≥20 chars) length checks
  - category/condition restricted to known allowed values
  - a sane price ceiling
  - non-empty location
  - **per-plan active-listing caps** (7 / 10 / 30 for free / standard /
    featured), enforced with a trigger — mirrors the `PLANS` limits in
    `ListEquipment.jsx`, but now can't be bypassed by calling the API
    directly
  - a duplicate-listing guard: the same owner can't have two *active*
    listings with the same name+brand+model at once

These are additive `alter table` migrations — run them after the
existing files in `database/schema/`.

## 5. `.env.example`

Added at the project root — copy to `.env` and fill in your Supabase
project's URL/anon key before wiring up `backend/supabase/*`.
