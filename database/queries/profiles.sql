-- ==================================================================
-- FILE TYPE : NAMED SQL QUERIES
-- PURPOSE   :
--   Hand-written parameterized queries against `profiles` and `saved_listings`.
-- CONNECTS TO :
--   Targets database/schema/profiles.sql, gated by database/policies/profiles.sql.
-- ==================================================================
-- name: GetProfile
select p.*, u.name, u.email, u.avatar_url
from profiles p
join users u on u.id = p.user_id
where p.user_id = :user_id;

-- name: UpsertProfile
insert into profiles (user_id, rating, review_count, rental_history_count)
values (:user_id, :rating, :review_count, :rental_history_count)
on conflict (user_id) do update
set rating = excluded.rating,
    review_count = excluded.review_count,
    rental_history_count = excluded.rental_history_count,
    updated_at = now();

-- name: GetSavedListings
select l.*
from saved_listings s
join listings l on l.id = s.listing_id
where s.user_id = :user_id;

-- name: SaveListing
insert into saved_listings (user_id, listing_id) values (:user_id, :listing_id)
on conflict do nothing;

-- name: UnsaveListing
delete from saved_listings where user_id = :user_id and listing_id = :listing_id;
