# Lendeia SQL — organized

Number = order the files were originally meant to run (dependency order, worked out from which file references which). Folder = topic.

**Everything here is already applied to your live database. This is for tidying/reference — don't re-run it all.**

## Flags

- `remove_device_account_limit` and `fix_device_limit_retry` are **superseded** by `fix_device_limit_no_delete` (the latest in the device chain). Move to Archive.
- `cleanup_available_now`, `add_equipment_category`, `allow_free_listings`, `fix_pro_photo_limit`: small patches to listings rules; keep, but they could be merged into one `listings_rules` snippet.
- `shop_reviews_sync` says to run AFTER every other file, so it stays last.

## Folders

### 00_core
- 01 `users`
- 02 `profiles`
- 03 `listings`
- 04 `rentals`

### 01_accounts
- 05 `anonymous_auth`
- 06 `profile_trust_fields`
- 15 `guest_can_see_public_profiles`
- 16 `people_search`
- 32 `require_real_account`
- 51 `scheduled_account_deletion`
- 52 `phone_sharing_and_presence`

### 02_security
- 14 `CRITICAL_enable_rls_on_users`
- 31 `CRITICAL_lock_rental_price_fields`

### 03_listings
- 07 `stricter_listing_rules`
- 08 `self_rental_and_fields`
- 09 `cleanup_available_now`
- 10 `add_equipment_category`
- 11 `update_categories`
- 12 `allow_free_listings`
- 13 `fix_pro_photo_limit`
- 23 `listing_lifecycle`
- 24 `fix_plan_limit_on_deactivate`
- 25 `relist_listing_rpc`
- 60 `public_store_shows_delisted`

### 04_rentals
- 17 `rental_status_transitions`
- 21 `add_completed_at`
- 22 `rental_date_pricing`
- 26 `confirm_item_received`
- 27 `real_returned_status`
- 30 `track_who_cancelled`
- 33 `block_rental_requests_on_delisted`
- 34 `rental_item_snapshot`
- 39 `fix_renter_listing_visibility`

### 05_notifications
- 19 `limits_delisting_notifications`
- 59 `allow_clear_notifications`

### 06_devices
- 29 `device_wide_rental_cap`
- 55 `device_account_binding`
- 56 `remove_device_account_limit`
- 57 `fix_device_limit_retry`
- 58 `fix_device_limit_no_delete`

### 07_reviews
- 18 `reviews_and_ratings`
- 20 `two_way_category_reviews`
- 28 `allow_review_on_returned`
- 35 `fix_listing_reviews_visibility`
- 36 `preserve_reviews_on_listing_delete`
- 37 `listing_reviews_and_grants`
- 61 `shop_reviews_sync`

### 08_messaging
- 38 `messaging`
- 40 `fix_conversation_participants_recursion`
- 41 `messaging_photos_block_report`

### 09_storage
- 42 `listing_photos_storage`
- 43 `avatar_storage`
- 44 `storage_file_limits`

### 10_support_admin
- 45 `help_support_requests`
- 46 `owner_role_and_admin_access`
- 47 `admin_permissions_foundation`
- 48 `trust_safety_account_status`
- 49 `support_attachments`
- 50 `admin_remove_listing`

### 11_subscription
- 53 `account_subscription`
- 54 `protect_subscription_plan`
