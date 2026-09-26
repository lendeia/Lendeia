-- ==================================================================
-- FILE TYPE : NAMED SQL QUERIES
-- PURPOSE   :
--   Hand-written parameterized queries a real backend/API layer would run
--   against the `listings` table (e.g. via a query builder that resolves
--   these `-- name:` blocks, such as sqlc/pgtyped-style tooling).
-- CONNECTS TO :
--   Targets database/schema/listings.sql, gated by database/policies/listings.sql.
-- ==================================================================
-- name: GetActiveListings
select * from listings
where is_active = true
order by created_at desc;

-- name: GetListingsByCategory
select * from listings
where is_active = true and category = :category
order by created_at desc;

-- name: GetListingById
select * from listings where id = :id;

-- name: CreateListing
insert into listings (owner_id, name, brand, model, category, price_per_day, condition, description, location, primary_image_url)
values (:owner_id, :name, :brand, :model, :category, :price_per_day, :condition, :description, :location, :primary_image_url)
returning *;

-- name: UpdateListing
update listings
set name = coalesce(:name, name),
    price_per_day = coalesce(:price_per_day, price_per_day),
    description = coalesce(:description, description),
    updated_at = now()
where id = :id
returning *;

-- name: DeactivateListing
update listings set is_active = false, updated_at = now() where id = :id;
