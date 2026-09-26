-- ==================================================================
-- FILE TYPE : NAMED SQL QUERIES
-- PURPOSE   :
--   Hand-written parameterized queries against `rentals`.
-- CONNECTS TO :
--   Targets database/schema/rentals.sql, gated by database/policies/rentals.sql.
-- ==================================================================
-- name: GetRentalsForOwner
select r.*
from rentals r
join listings l on l.id = r.listing_id
where l.owner_id = :owner_id
order by r.created_at desc;

-- name: GetRentalsForRenter
select * from rentals where renter_id = :renter_id order by created_at desc;

-- name: CreateRental
insert into rentals (listing_id, renter_id, start_date, end_date, price_per_day, status)
values (:listing_id, :renter_id, :start_date, :end_date, :price_per_day, 'Pending')
returning *;

-- name: SetRentalStatus
update rentals set status = :status, updated_at = now() where id = :id
returning *;
