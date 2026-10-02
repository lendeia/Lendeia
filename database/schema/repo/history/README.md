# history/ — the 59 old patch files, grouped by topic

Reference only. NEVER re-run on your live database (it's already applied).
The number in each filename is the tested run order across ALL folders (so 07 runs before 14, even though they sit in different folders).

## Folders

- **accounts/**  (7 files): 05 anonymous_auth, 06 profile_trust_fields, 15 people_search, 32 require_real_account, 50 scheduled_account_deletion, 51 phone_sharing_and_presence, 52 guest_can_see_public_profiles
- **admin/**  (6 files): 44 help_support_requests, 45 owner_role_and_admin_access, 46 admin_permissions_foundation, 47 trust_safety_account_status, 48 support_attachments, 49 admin_remove_listing
- **core/**  (4 files): 01 users, 02 listings, 03 profiles, 04 rentals
- **devices/**  (3 files): 29 device_wide_rental_cap, 55 device_account_binding, 56 fix_device_limit_no_delete
- **listings/**  (11 files): 07 stricter_listing_rules, 08 self_rental_and_fields, 09 cleanup_available_now, 10 add_equipment_category, 11 update_categories, 12 allow_free_listings, 13 fix_pro_photo_limit, 23 listing_lifecycle, 24 fix_plan_limit_on_deactivate, 25 relist_listing_rpc, 58 public_store_shows_delisted
- **messaging/**  (3 files): 18 messaging, 39 fix_conversation_participants_recursion, 40 messaging_photos_block_report
- **notifications/**  (2 files): 19 limits_delisting_notifications, 57 allow_clear_notifications
- **rentals/**  (9 files): 16 rental_status_transitions, 21 add_completed_at, 22 rental_date_pricing, 26 confirm_item_received, 27 real_returned_status, 30 track_who_cancelled, 33 block_rental_requests_on_delisted, 34 rental_item_snapshot, 38 fix_renter_listing_visibility
- **reviews/**  (7 files): 17 reviews_and_ratings, 20 two_way_category_reviews, 28 allow_review_on_returned, 35 fix_listing_reviews_visibility, 36 preserve_reviews_on_listing_delete, 37 listing_reviews_and_grants, 59 shop_reviews_sync
- **security/**  (2 files): 14 CRITICAL_enable_rls_on_users, 31 CRITICAL_lock_rental_price_fields
- **storage/**  (3 files): 41 listing_photos_storage, 42 avatar_storage, 43 storage_file_limits
- **subscription/**  (2 files): 53 account_subscription, 54 protect_subscription_plan

## Full run order

01  core/users
02  core/listings
03  core/profiles
04  core/rentals
05  accounts/anonymous_auth
06  accounts/profile_trust_fields
07  listings/stricter_listing_rules
08  listings/self_rental_and_fields
09  listings/cleanup_available_now
10  listings/add_equipment_category
11  listings/update_categories
12  listings/allow_free_listings
13  listings/fix_pro_photo_limit
14  security/CRITICAL_enable_rls_on_users
15  accounts/people_search
16  rentals/rental_status_transitions
17  reviews/reviews_and_ratings
18  messaging/messaging
19  notifications/limits_delisting_notifications
20  reviews/two_way_category_reviews
21  rentals/add_completed_at
22  rentals/rental_date_pricing
23  listings/listing_lifecycle
24  listings/fix_plan_limit_on_deactivate
25  listings/relist_listing_rpc
26  rentals/confirm_item_received
27  rentals/real_returned_status
28  reviews/allow_review_on_returned
29  devices/device_wide_rental_cap
30  rentals/track_who_cancelled
31  security/CRITICAL_lock_rental_price_fields
32  accounts/require_real_account
33  rentals/block_rental_requests_on_delisted
34  rentals/rental_item_snapshot
35  reviews/fix_listing_reviews_visibility
36  reviews/preserve_reviews_on_listing_delete
37  reviews/listing_reviews_and_grants
38  rentals/fix_renter_listing_visibility
39  messaging/fix_conversation_participants_recursion
40  messaging/messaging_photos_block_report
41  storage/listing_photos_storage
42  storage/avatar_storage
43  storage/storage_file_limits
44  admin/help_support_requests
45  admin/owner_role_and_admin_access
46  admin/admin_permissions_foundation
47  admin/trust_safety_account_status
48  admin/support_attachments
49  admin/admin_remove_listing
50  accounts/scheduled_account_deletion
51  accounts/phone_sharing_and_presence
52  accounts/guest_can_see_public_profiles
53  subscription/account_subscription
54  subscription/protect_subscription_plan
55  devices/device_account_binding
56  devices/fix_device_limit_no_delete
57  notifications/allow_clear_notifications
58  listings/public_store_shows_delisted
59  reviews/shop_reviews_sync

archive/ = 2 superseded files (device limit), not needed to reach the final state.
