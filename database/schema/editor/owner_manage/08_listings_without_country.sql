-- OWNER ONLY. READ-ONLY. Listings that don't say which country they are in yet
-- (everything created before the country feature). Their owners are asked to pick one
-- next time they edit the listing; until then the app shows the place name only,
-- with no country (it never guesses).
select l.id, l.name, l.location, u.email as owner_email, l.is_active, l.created_at
from listings l
join users u on u.id = l.owner_id
where l.country_code is null
order by l.is_active desc, l.created_at;
