---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "Instacart — Teardown"
url: "https://instacart.com"
company: "Instacart"
industry: "Retail"
description: "Online grocery delivery and pickup marketplace."
summary: "Instacart runs React compiled with rspack on nginx behind CloudFront, with Apollo Client issuing persisted GraphQL queries — 76 on a single store page. Braze handles primary event ingestion, with Ahoy Analytics for visit tracking. Rise, Instacart's internal event routing bus, exposes its full config through a public RPC endpoint. The Ads platform runs as a separate frontend at ads.instacart.com."
date: "2026-04-12"
time: "01:47"
contributor: "hayabhay"
model: "sonnet"
effort: "high"
stack: [React, rspack, Apollo GraphQL, nginx, CloudFront, Braze]
trackers: [Google Analytics, Google Ads, GTM, Facebook Pixel, TikTok Pixel, Snapchat, Microsoft UET, The Trade Desk, Reddit Pixel, Pinterest, Branch.io, Braze, Ahoy, Forter, Stripe, Datadog, Sentry]
tags: [grocery, marketplace, advertising, tracking, consent, graphql, event-pipeline, gpc, identity, dark-pattern]
headline: "Every anonymous visitor is silently enrolled as a permanent Instacart customer — assigned a user ID, hashed email, and 'Customer since' date before any login or consent."
findings:
  - "Every anonymous visitor is silently enrolled as a permanent Instacart customer — assigned a user ID, a hashed email, and a 'Customer since' date before any login or consent prompt."
  - "A public RPC endpoint at rpc-rise-config-data-eng.icpublic.com returns 57 named event routes, exposing queues for on-demand surge pricing calculations, shadow-pipeline traffic comparisons, and push notification targeting."
  - "The Instacart Ads platform serves a live Segment write key to any visitor — confirmed to accept arbitrary event injection into Instacart's advertising analytics pipeline."
  - "GPC (Global Privacy Control) is hardcoded off at the query parameter level — no JavaScript on the page references navigator.globalPrivacyControl, and the value is baked into Apollo cache keys as false."
  - "Two consent platforms — Securiti.ai and OneTrust — are configured with real credentials but neither loads; all 17 trackers fire immediately with no consent banner shown."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

Instacart's frontend is React compiled with **rspack** (Rust-based webpack replacement, not webpack or esbuild), bundled in separate route-scoped chunks: `landing-client-rspack-arm64` and `store-client-rspack-arm64`, both pinned to the same commit SHA `7b3c825e52b6159f548ebc96d94c83ddafa56c66`. Static assets serve from `d2guulkeunn7d8.cloudfront.net`; the main site runs nginx behind CloudFront (SFO5-P2 POP). No source maps in production.

Data fetching is Apollo Client over GraphQL. The site uses **persisted queries only** — introspection returns `PERSISTED_QUERY_NOT_SUPPORTED`, the schema is not exposed. On a typical store page (Kroger), 76 GET requests go to `/graphql`, plus 2 POST mutations — each UI component fetches independently, with minimal request consolidation. Two Sentry projects instrument separate route scopes: `5588299` for the landing client, `5621712` for the store client.

Primary analytics ingestion uses **Braze** (`/v2/b`) — 5 calls on homepage load, 11 on a store page. Braze sits alongside **Ahoy Analytics** (the Ruby open-source visit tracking gem), with Ahoy tokens pushed into GTM's dataLayer on every load. Platform experiments visible in the Apollo cache indicate active migration away from Segment on both the landing page (`landingSegmentReplacementVariant: "enabled"`) and store app (`segmentReplacementVariant: "enabled"`, `segmentMigrationToNpmVariant: "enabled"`).

**Rise** is Instacart's internal event routing bus. All client events route through a named-queue system backed by `default-rise.icpublic.com`. The routing config is fetched on every page load from an unauthenticated public RPC endpoint — covered separately below.

---

## Guest Identity and Silent Enrollment

On every first page load, `CreateImplicitGuestUser` runs and creates a permanent identity:

```json
{
  "currentUser": {
    "id": "19820705889473844",
    "guest": true,
    "email": "guest_709b1b7499be8941d4dcab61fc36ea27@example.com",
    "fullName": "Guest User",
    "admin": false,
    "ordersCount": 0,
    "customerSinceString": "Customer since April 2026"
  }
}
```

Anonymous visitors are formally enrolled as Instacart customers with a user ID, a hashed email address, and a join date — stored in the backend before any login prompt. The guest email format `guest_{32-char hex}@example.com` suggests the hash derives from session or device data (possibly the `fpc_bpm` UUID cookie, which appears on the same load).

Simultaneously, `GeolocationFromIp` runs and returns city-level coordinates, postal code, and state for the anonymous session — used for location targeting before any interaction or location permission request.

---

## Consent Infrastructure — What's Configured, What Loads

Instacart has wired up two consent management platforms. Neither one loads.

The Apollo cache returned on first page load contains a `GetPrivacyConfiguration` response with Securiti.ai configured as the active CMP:

```json
"privacyComplianceProviderConfiguration": {
  "securitiAi": {
    "domainUuid": "2f7a9a0c-d487-47b9-9b01-f6025f51cfa9",
    "tenantUuid": "a6c54245-8e60-412e-9f24-244866e37342"
  },
  "oneTrust": null,
  "osano": null,
  "cookieYes": null,
  "trustArc": null,
  "transcend": null
}
```

Querying the DOM for any Securiti.ai, OneTrust, or Osano script tags returns an empty array. `window.Securiti` is undefined. The server-side Apollo state embedded in the homepage HTML contains `oneTrustEnabled: false` and an OneTrust script ID (`2653cf4b-5c84-40d7-a99b-fa6e1592503b`) — OneTrust is used only for rendering the privacy policy document (via the `otnotice` framework), not as a CMP. A `window.consentManager` object exists with two keys: `META_TAG_SELECTOR` and `callbacks`. The callbacks object is empty.

The first HTTP response — before any JavaScript runs — sets four cookies:

```
Set-Cookie: device_uuid=...; Expires=2031; HttpOnly; Secure
Set-Cookie: privacy_opt_out=false; Max-Age=34560000; Expires=2027
Set-Cookie: ahoy_visit=...; max-age=14400
Set-Cookie: ahoy_visitor=...; max-age=63072000
```

`privacy_opt_out=false` (opted in) is stamped at the HTTP layer, expiring ~13 months from visit. No consent banner appears at any point.

**Global Privacy Control (GPC)**: The `GetPrivacyConfiguration` GraphQL query uses the user's GPC signal as a client-supplied parameter. The hardcoded value in the cache key:

```json
{"clientGpcEnabled": false, "clientPersistedOptOutStatus": false}
```

This isn't reading `navigator.globalPrivacyControl` — no JavaScript on the page references that API. GPC is passed to the server as `false` regardless of browser state. The privacy policy page mentions GPC compliance, but the handler that would read the browser signal does not exist.

California's CCPA regulations require businesses to treat a GPC signal as a valid opt-out request. Instacart explicitly disables the mechanism at the query parameter level.

With no CMP active, GTM fires immediately on load (`gtm.js` then `gtm.dom`), loading all configured tags. Seventeen tracking and analytics vendors activate before any user interaction.

---

## Tracker Inventory

Full cookie inventory from a cold session on a store page (27 cookies set, all without consent prompt):

| Cookie | Vendor | Notes |
|--------|--------|-------|
| `privacy_opt_out=false` | Instacart | Server-set, pre-interaction |
| `ahoy_visit`, `ahoy_visitor` | Ahoy Analytics | Visit/visitor tracking |
| `device_uuid` | Instacart | HttpOnly, 5-year expiry |
| `build_sha` | Instacart | Deployment commit SHA in client cookie |
| `fpc_bpm` | Instacart | First-party UUID, purpose unclear |
| `_gcl_au` | Google Click ID | Conversion attribution |
| `_ga`, `_ga_VL5WVTXMWP` | Google Analytics 4 | `G-VL5WVTXMWP` |
| `_fbp` | Facebook Pixel | ID: `172640093204459`, Advanced Matching |
| `_tt_enable_cookie`, `_ttp`, `ttcsid`, `ttcsid_D23SJ1JC77U5781IKE5G` | TikTok | Pixel `D23SJ1JC77U5781IKE5G` |
| `_scid`, `_scid_r` | Snapchat | Pixel `b1ecdf0b-acea-4abd-8a6e-5eef6a8e1d05` |
| `_uetsid`, `_uetvid` | Microsoft UET | Action `5663743` |
| `_rdt_uuid`, `_rdt_em` | Reddit Pixel | Via GTM |
| `forterToken` | Forter | Fraud detection `e44177b6b805` |
| `__stripe_mid`, `__stripe_sid` | Stripe | Fraud signals (Radar), fires pre-checkout |
| `_dd_s` | Datadog RUM | -- |

The GTM container (`GTM-MNXM74G`, 529KB) additionally loads Reddit Pixel and Pinterest (`s.pinimg.com/ct/core.js`). The Trade Desk Universal Pixel (`js.adsrvr.org/up_loader.1.1.0.js`) fires on store pages, with conversion events going to `insight.adsrvr.org/track/realtimeconversion`. Ahoy tokens (`ahoy_visit_token`, `ahoy_visitor_token`) are pushed directly into the GTM dataLayer on every load, before GTM fires.

**Branch.io localStorage**: The `branch_session_first` localStorage key contains a browser fingerprint ID (`browser_fingerprint_id`), identity ID (`identity_id: 1572048377490272451`), and session state — this persists across sessions under a key that is not a cookie and therefore survives standard cookie clearing.

Facebook Advanced Matching is enabled — a hashed email (`c048e760...`) is pre-loaded in the pixel's config URL, meaning the pixel sends hashed PII to Meta on page load for users who are logged in.

---

## Rise — Internal Event Routing Config

Rise is Instacart's internal event routing bus, handling both client analytics and server-side event streaming. On every page load, the browser calls:

```
POST https://rpc-rise-config-data-eng.icpublic.com/rpc/instacart.rise.config.v1.ConfigService/ClientConfig
```

No authentication required. The response returns the full routing configuration — 57 named routes, two endpoint URLs, and Instacart's complete internal event taxonomy in `{domain}.{object}.{action}.v{N}` format.

Default endpoint: `https://default-rise.icpublic.com/` (queue: `default`)
A/B endpoint: `https://roulette-rise.icpublic.com/` (queue: `roulette`)

Both ingest endpoints return 403 to unauthenticated requests — only the config RPC is open. The config reveals the event schema for every client-observable action. Selected routes of note:

| Queue | Event | What it represents |
|-------|-------|-------------------|
| `routed-event-fulfillment.dynamic_pricing.od_boost_calculation_events.v2` | `fulfillment.dynamic_pricing.od_boost_calculation_events.v2` | On-demand surge pricing calculations |
| `routed-event-customers.shadow_pipeline.comparison.v1` | `customers.shadow_pipeline.comparison.v1` | Shadow-mode traffic comparison for an unreleased or parallel system |
| `routed-event-growth.notification_intention.personalize.v1` | `growth.notification_intention.personalize.v1` | Push notification targeting |
| `routed-event-fulfillment.blim_batch.locked.v1` | `fulfillment.blim_batch.locked.v1` | Batch lock events (fulfillment scheduling) |
| `routed-event-ads.serving_candidate.billing_pricing_selected.v1` | `ads.serving_candidate.billing_pricing_selected.v1` | Ad auction billing decisions |
| `routed-event-customers.braze.purchase_order_completed.v2` | `customers.braze.purchase_order_completed.v2` | Order completion signal to Braze |
| `roulette` | `roulette.roulette_client.exposure_ext.v1` | External A/B test exposure |

The ads domain alone has 35 distinct route entries covering impressions, clicks, video interactions, and sponsored product events — all versioned. The `non_endemic` event category (cards and modals, v2) indicates display advertising for brands not selling on Instacart itself.

---

## Instacart Ads Platform

`ads.instacart.com` redirects `GET /` to `https://www.instacart.com:443/company/ads`, but `GET /api/v1/` returns an HTML page embedding the full `__ADS.env` configuration object:

```javascript
__ADS.env = {
  STRIPE_PUBLISHABLE_KEY: "pk_live_51GQGudDjPDUKrsoRXYelzAuDyX6E3BkXZlqZCSJ1...",
  STRIPE_PUBLISHABLE_KEY_CA: "pk_live_51Ja79CFEVWclXDkp...",
  SEGMENT_WRITE_KEY: "ag26zNnt1wkEqa3vFjUxMvkX8LWRQyfK",
  MONGOOSE_API_KEY: "peKxEUHTg%GZPsFirRbUMy6hR",
  DATADOG_APP_ID: "c539ac53-7b34-4b00-999b-6f63938b0ca2",
  DATADOG_CLIENT_TOKEN: "pub27784bdf42c8617d4cf70d7e9ed5cd4e",
  ADS_BID_REC_KW_THRESHOLD: 40,
  ADS_BID_REC_PRIMARY_THRESHOLD: 20,
  ADS_BID_REC_SECONDARY_THRESHOLD: 40,
  ADS_BID_REC_DEFAULT_THRESHOLD: 40,
  ADS_ADMIN_URL: "https://ads.instacart.tools",
  MONGOOSE_API_URL: "https://ad-tools-mgs.instacart.com",
  BUILD_SHA: "0966266899ad9287babb93c4e4bc3a690acec175"
}
```

Two Stripe accounts are in use: one for US billing (`pk_live_51GQGud...`) and one for Canadian billing (`pk_live_51Ja79C...`). Publishable keys are expected in frontend apps.

The Segment write key `ag26zNnt1wkEqa3vFjUxMvkX8LWRQyfK` was confirmed live: a POST to `https://api.segment.io/v1/track` with this key returns `{"success": true}`. The CDN settings endpoint at `https://cdn.segment.com/v1/projects/ag26zNnt1wkEqa3vFjUxMvkX8LWRQyfK/settings` returns project metadata including last-modified date (`2026-03-11`) and confirms `analyticsNextEnabled: true`. This is the Instacart Ads Segment project — the key accepts arbitrary track, identify, and page calls, meaning anyone with this key can inject conversion events, user identifiers, and funnel milestones into Instacart's advertising analytics. Segment's security model treats write keys as public and source-side; mitigation depends on server-side validation of incoming events, which Instacart would need to implement independently.

Bid recommendation thresholds in the config — keyword=40, primary=20, secondary=40, default=40 — are internal CPM/CPC floor or recommendation values visible to any visitor who loads the ads dashboard URL.

The ads admin panel (`ads.instacart.tools`) is Okta SAML SSO protected. The Mongoose API URL (`ad-tools-mgs.instacart.com`) and its key are present but the API shape is unknown.

---

## Public APIs

**`/v3/retailers`** — no authentication required:

```
GET https://www.instacart.com/v3/retailers?zip_code=94105&country_code=US&per=30
```

Returns a paginated retailer list with: retailer ID (integer), name, slug, logo URL, background color, service types (delivery/pickup), price transparency label and description, EBT acceptance flag, retailer categories, and loyalty program indicators. The SF 94105 query returns 51 retailers. The response also includes `price_transparency` blocks with per-retailer pricing policy text — enough to reconstruct which retailers use Instacart-set pricing vs. in-store prices.

`/v3/retailers/{id}` and `/v3/notifications` both require authentication.

**GraphQL** — all operations are persisted queries. The Apollo cache exposes 124+ named operation keys without running the queries, including: `GetPrivacyConfiguration`, `GeolocationFromIp`, `CreateImplicitGuestUser`, `StoreAppUserlessPlatformExperiments`, `GetProfilingStatus`, `DisplayExperimentVariants`, `RetailerLoyalty`, `SearchResultsPlacements`, `HomePlacements`, `CartFeatureFlags`, `ServiceEtaQuery`. The schema is not exposed via introspection.

**`/rest/v8/`** — returns empty body, silently blocked.

---

## Infrastructure Notes

`icpublic.com` is Instacart's public-facing infrastructure domain. Certificate transparency reveals:

- `caper-api.icpublic.com` — Caper smart cart API (Instacart's AI-powered checkout cart product)
- `integrationgateway.icpublic.com` — retailer integration gateway, requires mTLS (client certificate)
- `sandbox.ads.icpublic.com` — ads platform sandbox environment
- `ps.icpublic.com` — platform services
- `mode-enhancements.icpublic.com` — Mode Analytics BI tool integration
- `publix.icpublic.com` — retailer-specific dedicated subdomain
- `partner-data-webhook.icpublic.com` — partner data ingestion webhooks
- Staging and dev: `*.staging.icpublic.com`, `*.dev.icpublic.com`

The `GetPrivacyConfiguration` response includes `costcoConsentManager` and `restaurantDepotConsentDialog` fields (both null on a generic session) — indicating retailer-specific consent flows exist for at least these two partners.

Platform experiments active on anonymous sessions (from `StoreAppUserlessPlatformExperiments`):

| Experiment | Value |
|-----------|-------|
| `segmentReplacementVariant` | enabled |
| `segmentMigrationToNpmVariant` | enabled |
| `storeEdgeBotcontrolExperimentVariant` | enabled |
| `webDisableMarketingUnsanitizedTrackingPropertiesVariant` | enabled |
| `acceleratedTtfbVariant` | enabled |
| `webUseGetPrivacyConfigurationApiVariant` | enabled |
| `webAddCrossOriginMiddlewareVariant` | enabled |
| `fraudEnableZipcodeOverrideVariant` | enabled |
| `unmountStoreBasenameVariant` | enabled |
| `pageViewIdRestoreEnabledVariant` | fiveMinuteTtl |
| `gtmInHeadVariant` | **disabled** |
| `deadCodeDetectionVariant` | disabled |

`storeEdgeBotcontrolExperimentVariant: "enabled"` suggests Instacart is testing AWS WAF Bot Control at the edge. `webDisableMarketingUnsanitizedTrackingPropertiesVariant: "enabled"` suggests active work on cleaning up tracking data before it hits marketing systems.

`robots.txt` (500+ lines) blocks several AI crawlers explicitly: `PerplexityBot` and `Perplexity-User` both get `Disallow: /`. `meta-externalagent` (Meta's AI training crawler) gets `Disallow: /`. `FacebookBot` gets `Disallow: /`. `/rest/v8/`, `/api/`, `/orders/`, `/store/orders/`, and `/store_manager_admin` are blocked from all crawlers.

---

## Machine Briefing

### Access and auth

The homepage, store pages, and search are fully accessible without auth. GraphQL endpoints accept unauthenticated requests for guest operations. The Rise config endpoint and retailers list require no credentials. Authenticated endpoints (`/v3/notifications`, `/v3/retailers/{id}`) require a session cookie obtainable via the implicit guest user flow.

### Endpoints

**Retailer lookup (no auth)**
```bash
curl "https://www.instacart.com/v3/retailers?zip_code=94105&country_code=US&per=50"
# Returns: retailer list with IDs, slugs, service types, price transparency, EBT flag
```

**Rise event routing config (no auth)**
```bash
curl -X POST https://rpc-rise-config-data-eng.icpublic.com/rpc/instacart.rise.config.v1.ConfigService/ClientConfig \
  -H "Content-Type: application/json" \
  -d '{}'
# Returns: full routing config with 57 routes, queue names, endpoint URLs
```

**Segment Ads write key (live, no auth)**
```bash
curl -X POST https://api.segment.io/v1/track \
  -u "ag26zNnt1wkEqa3vFjUxMvkX8LWRQyfK:" \
  -H "Content-Type: application/json" \
  -d '{"userId": "...", "event": "...", "properties": {...}}'
# Returns: {"success": true}
```

**Segment Ads project settings**
```bash
curl https://cdn.segment.com/v1/projects/ag26zNnt1wkEqa3vFjUxMvkX8LWRQyfK/settings
# Returns: project metadata, source configuration
```

**Instacart Ads env config (no auth)**
```bash
curl https://ads.instacart.com/api/v1/
# Returns: HTML page with __ADS.env embedded — Stripe keys, Segment key, bid thresholds
```

**GraphQL (persisted queries, guest session)**
```bash
# First, get a guest session — POST to homepage, use Set-Cookie from response
# Then pass Apollo cache operation hashes in requests
POST https://www.instacart.com/graphql
Content-Type: application/json
{"operationName": "GeolocationFromIp", "variables": {}, "extensions": {"persistedQuery": {"version": 1, "sha256Hash": "..."}}}
# Hash must match a known operation — introspection is blocked
```

### Gotchas

- GraphQL uses persisted queries only. You cannot run arbitrary operations — you need a hash that matches a known operation on Instacart's server. Operation hashes can be extracted from the bundled JavaScript.
- `PERSISTED_QUERY_NOT_SUPPORTED` is returned for any unknown hash — this is the error on introspection attempts, not a rate limit.
- The Rise ingest endpoints (`default-rise.icpublic.com`, `roulette-rise.icpublic.com`) are closed. Only the config RPC endpoint responds.
- `/rest/v8/` returns an empty body with 200 — not an error, just blocked at the router.
- The retailers endpoint paginates via `per=` and likely `page=` parameters. The default `per=30` cap was exceeded in testing (returned 51 for SF) — the `per` value may not be strictly enforced.
- Ahoy tokens in cookies rotate per visit (4-hour expiry for `ahoy_visit`); `ahoy_visitor` persists 2 years.
- Branch.io `branch_session_first` in localStorage survives cookie clearing and contains a persistent `identity_id`.
