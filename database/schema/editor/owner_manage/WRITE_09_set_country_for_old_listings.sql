-- OWNER ONLY. WRITES DATA. Give old listings (no country yet) a country in one go.
-- ONLY use this if you KNOW these listings are all in that country — the app deliberately
-- never guesses. Look at 08_listings_without_country first.
-- country: 2-letter ISO code in CAPITALS, e.g. 'PH', 'US', 'JP'.
-- To limit it to specific listings, uncomment the "and l.id in (...)" line.
update listings l
set country_code = 'PH'                      -- <-- change me
where l.country_code is null
  -- and l.id in ('PUT-LISTING-UUID-HERE')    -- <-- optional: only these listings
returning l.id, l.name, l.location, l.country_code;
