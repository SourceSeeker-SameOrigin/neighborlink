# 核心与扩展集合索引

在开发环境的云开发控制台进入「数据库」，逐个选择下表集合，在「索引管理」中添加索引。字段顺序按表填写；未注明倒序的均为升序。索引名称可直接使用表中名称。每个唯一索引创建后确认状态可用，再启动对应写接口。

| 集合 | 索引名称 | 字段顺序 | 唯一 |
| --- | --- | --- | --- |
| users | openid_unique | openid 升序 | 是 |
| users | community_building_unit_room | communityId 升序、buildingId 升序、unit 升序、room 升序 | 否 |
| users | saved_address_lookup | addresses.communityId 升序、addresses.buildingId 升序、addresses.unit 升序、addresses.room 升序 | 否 |
| users | phone | phone 升序 | 否 |
| orders | orderNo_unique | orderNo 升序 | 是 |
| orders | community_status_created | communityId 升序、status 升序、createdAt 倒序 | 否 |
| orders | user_created | userOpenid 升序、createdAt 倒序 | 否 |
| orders | provider_status | providerOpenid 升序、status 升序 | 否 |
| orders | seller_kind_created | sellerOpenid 升序、kind 升序、createdAt 倒序 | 否 |
| orders | service_created | serviceCode 升序、createdAt 升序 | 否 |
| providers | openid_unique | openid 升序 | 是 |
| providers | community_status_duty | communityId 升序、status 升序、onDuty 升序 | 否 |
| providers | referralCode_unique | referralCode 升序 | 是 |
| communities | locationGeo_geo | `locationGeo` 地理位置索引 | 否 |
| buildings | shortCode_unique | shortCode 升序 | 是 |
| buildings | community | communityId 升序 | 否 |
| memberships | user_status | userOpenid 升序、status 升序 | 否 |
| memberships | community_plan_status_end | communityId 升序、planCode 升序、status 升序、endAt 升序 | 否 |
| ledger | community_created | communityId 升序、createdAt 升序 | 否 |
| ledger | provider_settled | providerId 升序、settled.provider 升序 | 否 |
| ledger | seller_settled | sellerOpenid 升序、settled.seller 升序 | 否 |
| settlements | community_created | communityId 升序、createdAt 倒序 | 否 |
| settlements | provider_period | providerId 升序、period.from 升序、period.to 升序 | 否 |
| settlements | seller_period | sellerOpenid 升序、period.from 升序、period.to 升序 | 否 |
| payouts | payee_created | payeeOpenid 升序、createdAt 倒序 | 否 |
| payouts | payee_type_created_id | payeeOpenid 升序、payeeType 升序、createdAt 倒序、_id 倒序（QA215 待云端核对） | 否 |
| payouts | state_id | state 升序、_id 升序 | 否 |
| payouts | community_created | communityId 升序、createdAt 倒序 | 否 |
| payouts | createdAt | createdAt 倒序 | 否 |
| events | community_status_start | communityIds 升序、status 升序、startAt 升序 | 否 |
| events | community_status_hidden_start | communityIds 升序、status 升序、moderationHidden 升序、startAt 升序 | 否 |
| events | status_end | status 升序、endAt 升序 | 否 |
| signups | event_status_created | eventId 升序、status 升序、createdAt 升序 | 否 |
| signups | event_status_id | eventId 升序、status 升序、_id 升序 | 否 |
| signups | openid_created | openid 升序、createdAt 倒序 | 否 |
| signups | checkinCode_unique | checkinCode 升序 | 是 |
| eventCancelJobs | status_created | status 升序、createdAt 升序 | 否 |
| eventCancelTasks | job_status_created | jobId 升序、status 升序、createdAt 升序 | 否 |
| eventCancelTasks | job_status_next | jobId 升序、status 升序、nextAt 升序 | 否 |
| eventCancelTasks | job_status_lease | jobId 升序、status 升序、leaseUntil 升序 | 否 |
| reports | status_created | status 升序、createdAt 倒序 | 否 |
| reports | target_created | targetType 升序、targetId 升序、createdAt 倒序 | 否 |
| mediaChecks | status_created | status 升序、createdAt 升序 | 否 |
| conversations | member_lastAt | members 升序、lastAt 倒序 | 否 |
| conversations | member_lastAt_id | members 升序、lastAt 倒序、_id 倒序 | 否 |
| conversations | type_closeAt | type 升序、closedAt 升序、closeAt 升序 | 否 |
| messages | conversation_id | convId 升序、_id 升序 | 否 |
| messages | conversation_id_desc | convId 升序、_id 倒序 | 否 |
| visits | parent_date_seq | parentOrderId 升序、date 升序、seq 升序 | 否 |
| secrets | order_unique | orderId 升序 | 是 |
| posts | feed | communityId 升序、scope 升序、type 升序、status 升序、expireAt 升序、createdAt 倒序 | 否 |
| posts | type_status_expireAt | type 升序、status 升序、expireAt 升序 | 否 |
| comments | post_status_created | postId 升序、status 升序、createdAt 升序 | 否 |
| comments | post_status_created_id | postId 升序、status 升序、createdAt 升序、_id 升序（QA216 待云端核对） | 否 |
| couponTemplates | status_issueMode | status 升序、issueMode 升序 | 否 |
| coupons | user_status_expiry | openid 升序、status 升序、validTo 升序 | 否 |
| coupons | user_created | openid 升序、createdAt 倒序 | 否 |
| coupons | user_created_id | openid 升序、createdAt 倒序、_id 倒序（QA76 分页，开发云已回读确认） | 否 |
| coupons | manual_request | templateId 升序、manualRequestId 升序、_id 升序 | 否 |
| pointsLedger | user_created | openid 升序、createdAt 倒序 | 否 |
| idleItems | feed | communityId 升序、scope 升序、status 升序、createdAt 倒序 | 否 |
| idleItems | seller_created | sellerOpenid 升序、communityId 升序、createdAt 倒序 | 否 |
| ads | home_banner_active | status 升序、slot 升序、communityIds 升序、startAt 升序、endAt 升序 | 否 |
| ads | slot_active_start_id | status 升序、slot 升序、communityIds 升序、startAt 升序、endAt 升序、_id 升序（QA218 待云端核对） | 否 |
| notices | community_status_pinned_created | communityId 升序、status 升序、pinnedAt 倒序、createdAt 倒序 | 否 |
| notices | community_status_pinned_created_id | communityId 升序、status 升序、pinnedAt 倒序、createdAt 倒序、_id 倒序（QA218 待云端核对） | 否 |
| events | community_at_type | communityId 升序、at 升序、type 升序 | 否 |

| orders | merchant_kind_created | merchantId 升序、kind 升序、createdAt 倒序 | 否 |
| ledger | merchant_settled | merchantId 升序、settled.merchant 升序 | 否 |
| settlements | merchant_period | merchantId 升序、period.from 升序、period.to 升序 | 否 |
| merchants | status_created | status 升序、createdAt 倒序 | 否 |
| merchants | community_status_name | communityIds 升序、status 升序、name 升序 | 否 |
| merchantServices | merchant_status_title | merchantId 升序、status 升序、title 升序 | 否 |
| merchantServices | merchant_created_id | merchantId 升序、createdAt 倒序、_id 倒序（QA130 本人服务分页，开发云尚待核验/创建） | 否 |
| orders | community_service_status_completed | communityId 升序、serviceCode 升序、status 升序、completedAt 升序 | 否 |
| deliveryBatches | community_status_created | communityId 升序、status 升序、createdAt 倒序 | 否 |
| deliveryBatches | community_station_created | communityId 升序、stationCode 升序、createdAt 倒序 | 否 |
| deliveryBatches | community_station_status_completed | communityId 升序、stationCode 升序、status 升序、completedAt 升序 | 否 |
| deliveryBatches | provider_status_created | providerId 升序、status 升序、createdAt 倒序 | 否 |
| stationApplications | status_created | status 升序、createdAt 倒序 | 否 |
| stationApplications | user_openid_unique | userOpenid 升序 | 是 |
默认 `_id` 索引由数据库提供，无需重复创建。创建唯一索引失败时先检查重复数据；不要删除现有业务记录来强行通过。验收时逐项核对索引字段、顺序及唯一属性。

2026-11-07 用户确认：`pointsLedger` 的 `user_created` 与原 `openid_created` 字段和顺序完全相同，仅保留 `user_created`，不重复创建等价索引。
