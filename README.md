# Renta — project structure

This repo is split into four independent layers:

- **frontend/** — pure UI (pages, components, layouts). Talks only to `state/`, never to `backend/` directly.
- **state/** — frontend state (React Context + hooks). Each domain (`listings`, `rentals`, `auth`, `profile`) exposes a `*Store.js` provider/hook pair and calls into `backend/`.
- **backend/** — backend logic, currently **mock async functions** that resolve after a short delay and return data shaped like real API responses. Swap the bodies for real `fetch()` calls to your API once one exists — the state layer won't need to change.
- **database/** — SQL only: `schema/` (tables), `queries/` (named queries the backend would run), `policies/` (row-level security, Postgres/Supabase style).
- **shared/** — code genuinely used by more than one layer: design tokens + mock data (`constants`), JSDoc `types`, and `validation` helpers.

## Wiring

`main.jsx` mounts `frontend/App.jsx`, which wraps the page router in the four state providers
(`AuthProvider` → `ProfileProvider` → `ListingsProvider` → `RentalsProvider`) so any page can
call `useListings()`, `useRentals()`, `useAuth()`, or `useProfile()`.

## Notes

- No real server or database is connected — `backend/*` functions are mocks that mimic
  network latency and return realistic shapes. Replacing them with real API calls should
  require no changes in `frontend/` or most of `state/`.
- The database SQL assumes Postgres with `auth.uid()` available (Supabase-style RLS). Adjust
  for a different auth/session mechanism if needed.
