# Country / location + always-visible phone — what changed

## DEPLOY IN THIS ORDER (important)
1. Backup (Supabase dashboard -> Database -> Backups).
2. Run `database/schema/repo/supabase/migrations/20261003000500_country_and_public_phone.sql` in the SQL Editor
   (ideally on a staging project first). **The new app code reads `country_code` and calls `get_user_phone`;
   if you deploy the code first, sign-in errors out.**
3. Deploy the app code (Vercel).
4. Sign in, open Profile -> Edit, set your country (button "Use my current location" fills it).
5. Old listings have no country yet: owners are asked to pick one when they edit; or you can look at
   `editor/owner_manage/08_listings_without_country` and, only if you are sure, use `WRITE_09_set_country_for_old_listings`.

## What users see now
- **Country picker** (Philippines, United States, Japan first, then every country A-Z): Profile, New listing, Edit listing.
- **Listing cards** always show the place with its country — `Los Angeles, California, United States` — and the
  distance is shown next to it (before, the distance REPLACED the place, which is why your screenshot only said "573.4 km").
- **Item page**: same full place, plus an orange "This item is in <country>, not in your country" notice when the
  item is in another country than the viewer (viewer country = profile country, else detected from their location).
- **Cards** get a small "Abroad" badge in that case.
- **Browse**: a country filter appears automatically once listings exist in 2+ countries.
- **Map popup / Dashboard / Saved**: show the full place with country.
- **Auto-fill**: "Use my current location" (Profile and New listing) looks up the city AND country of where you really are;
  dropping a pin on the map in the listing form sets the country of the pin. Nothing asks for location by itself — it only
  happens when someone presses the button (same rule your app already followed).
- **New listings must have a country** (form + database rule). Old listings stay as they are, with no invented country.

## Phone number
- The "Share my contact number / Stop sharing" switch is **gone** from Messages and Receipt.
- **Store page**: new "Store info" box (shops) / "Customer info" box (everyone else) with the place and the phone number,
  always shown if the person added one. The number is a tap-to-call link.
- Messages and Receipt show the other person's number whenever they have one.
- Who can see it (enforced by the database function `get_user_phone`, not just the screen):
  signed-in real accounts only — not guests, not signed-out visitors, not banned/suspended accounts, and not anyone
  blocked in either direction. Banned/suspended/pending-deletion people's numbers are never shown.
- Help and Legal wording updated to say this.
- The old `set_phone_shared` / `get_shared_phone` database functions are left in place, unused.

## Files changed
New:   shared/countries.js, shared/geocode.js, frontend/components/CountrySelect.jsx,
       database/schema/repo/supabase/migrations/20261003000500_country_and_public_phone.sql,
       database/schema/repo/supabase/tests/country_phone_test.sql,
       database/schema/editor/owner_manage/08_listings_without_country.sql, WRITE_09_set_country_for_old_listings.sql
Edited: ListingCard, Details, Browse, Profile, ListEquipment, Dashboard (edit modal), MapPage, OwnerStore, Messages, Receipt,
        Help, Legal, LocationPicker, locationStore, backend/supabase/{listings,savedListings,profile,users,anonymousAuth}.js,
        database/schema/repo/supabase/proposed/20261003000400_protect_private_user_columns.sql (+ its test: country_code is public)

## Tested
- App builds (`vite build`). Country/location helpers: 22 checks. Reverse-geocode parsing: 7 checks (mocked responses).
- ListingCard rendered with real props: place + country + distance together; "Abroad" only when viewer country differs and is known;
  legacy listing shows no invented country.
- Database (scratch copy of your schema): 40+ checks in country_phone_test.sql — country format, new-listing rule, old listings still
  editable, phone matrix (self / other / none / banned / blocked / guest / signed-out), plus a deliberate break of each rule is caught.
  All three test files (country_phone, private_columns, admin_functions) pass TOGETHER with the privacy fix applied.
- NOT tested: a real browser click-through, the live Supabase project, real GPS / BigDataCloud responses.

## Heads-up (not changed here)
- A phone number is now visible to every signed-in real account. That is what you asked for, but it means anyone can
  sign up and collect numbers. Only add a number you are fine showing. If scraping becomes a problem, the easy tightening is
  "only people who have a rental or a chat with you" — one change inside get_user_phone.
- Applying the privacy fix (proposed/20261003000400…) later also needs the app to stop reading its OWN private columns with
  a plain select. These two spots do that today: backend/supabase/profile.js getMyProfileDetails() and
  backend/supabase/anonymousAuth.js (the users select with auth_provider / account_status / status_reason ...). Switch both to
  rpc('get_my_profile') at that time. Other people's phone no longer needs a column grant, because the app uses get_user_phone().
