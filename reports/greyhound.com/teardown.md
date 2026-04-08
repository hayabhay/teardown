---
# agents: machine-friendly instructions in "## Machine Briefing"
title: Greyhound — Teardown
url: "https://www.greyhound.com"
company: Greyhound
industry: Transportation
description: "Long-distance intercity bus service operating across North America."
summary: "Greyhound runs entirely on FlixBus infrastructure — Drupal CMS at cdn-cf.cms.flixbus.com, FlixBus Honeycomb design system, a shared PHP booking monolith (fxt.monolith.shop) at shop.greyhound.com, and a trip tracker served from wimr-ui.gis.flix.tech. All content is delivered via CloudFront; help.greyhound.com sits separately on Salesforce Experience Cloud behind Akamai. The search widget is a standalone React app with its JavaScript source map publicly accessible, exposing 656 TypeScript source files."
date: 2026-04-07
time: "08:15"
contributor: hayabhay
model: sonnet-4.6
effort: high
stack:
  - Drupal
  - React
  - CloudFront
  - FlixBus Honeycomb
  - Snowplow
  - Braze
  - Salesforce Experience Cloud
trackers:
  - Google Analytics
  - Google Ads
  - DoubleClick
  - Facebook Pixel
  - TikTok Ads
  - Bing Ads
  - Microsoft Clarity
  - Snowplow
  - Adtriba
  - Sojern
  - AWIN
  - Impact Radius
  - Xandr
  - twiago
  - Snapchat
  - Braze
  - Ravelin
  - Formbricks
tags:
  - transportation
  - bus
  - acquisition-artifact
  - consent-bypass
  - tracking
  - a-b-testing
  - open-api
  - source-maps
  - flixbus
  - cross-brand-leak
headline: "Greyhound's consent manager is configured to skip US visitors entirely — all 21 ad trackers auto-grant on first load, and the GPC 'do not sell' signal is explicitly disabled in the settings file."
findings:
  - "Usercentrics is configured with displayOnlyForEU: true and gpcSignalHonoured: false — all 21 tracking vendors fire immediately on first page load for every US visitor, with consent auto-granted via an onNonEURegion action that never shows a banner."
  - "A shared Formbricks CRO environment loaded on greyhound.com exposes 235 action classes and 7 live surveys for FlixBus brands across Netherlands, Belgium, UK, India, and Mexico — no brand isolation between Greyhound and the rest of the FlixBus portfolio."
  - "Every search on greyhound.com silently fires a Booking.com tracking pixel (c360/v1/track) — an undisclosed hotel cross-sell partnership embedded in the primary bus search flow."
  - "The unauthenticated FlixBus search API returns exact seat counts, per-ride pricing, platform fee breakdowns, and operator identity for every route — exposing live inventory for both the FlixBus and Greyhound operators from a single endpoint."
  - "The search widget's JavaScript source map is publicly accessible on CloudFront, exposing 656 TypeScript files including feature flag definitions, URL-based flag overrides, and brand configuration for greyhound, flixbus, and kamil_koc."
---

## Architecture

Greyhound is FlixBus. Not a partnership, not a white-label — the same monolith. FlixBus acquired Greyhound Lines from FirstGroup in October 2021, and this teardown shows the technical migration is complete: every layer of greyhound.com is a FlixBus system wearing Greyhound's colors.

The CMS is Drupal, hosted at `cdn-cf.cms.flixbus.com` and served through CloudFront. The design system is FlixBus Honeycomb — version 15.3.3 on the main site, version 12.0.2 on the trip tracker (a two-major-version gap between subsystems). The booking engine at `shop.greyhound.com` runs the FlixBus PHP monolith, tagged `fxt.monolith.shop` in CSP headers. The trip tracker at `/track` is served from `wimr-ui.gis.flix.tech`, a separate FlixBus GIS service.

The TLS certificate is shared with all FlixBus country domains — greyhound.com sits on the same cert as flixbus.com and its European and Latin American variants. Help lives on a different planet entirely: `help.greyhound.com` routes through Akamai to Salesforce Experience Cloud.

Response headers on `www.greyhound.com`: `cache-control: public, max-age=300`, served from CloudFront (SFO PoP observed), no HSTS, no CSP. The shop subdomain is more locked down: `x-frame-options: SAMEORIGIN`, CSP with `report-uri` pointing to DataDog (public RUM key `pub6395d5bd2f2b5751fdf3784e50845d1b`, service `fxt.monolith.shop`).

Subdomain map:
- `www.greyhound.com` — CMS + CloudFront
- `shop.greyhound.com` — booking monolith + CloudFront
- `shop.greyhound.com.mx` — Mexico booking
- `es.greyhound.com` — Spanish-language variant
- `help.greyhound.com` — Salesforce Experience Cloud + Akamai

---

## Consent Architecture — The US Bypass

Greyhound uses Usercentrics (settings ID `wfj7w1jmNugSsu`, ruleset `DkhDssQkpLpteU`) for consent management. The configuration is explicit about what it does:

```json
"displayOnlyForEU": true,
"gpcSignalHonoured": false
```

`displayOnlyForEU: true` means the consent banner is never shown to US visitors. No banner, no choice, no interaction. The `uc_user_interaction` cookie confirms it: `"false"` on first load for US traffic.

What happens instead is visible in the dataLayer. Google Consent Mode initializes with all categories denied:

```json
{"ad_user_data": "denied", "ad_personalization": "denied", "ad_storage": "denied", "analytics_storage": "denied", "wait_for_update": 2000}
```

Then, within the 2-second `wait_for_update` window, an `onNonEURegion` action fires and flips everything to granted:

```json
{"ad_personalization": "granted", "ad_storage": "granted", "ad_user_data": "granted", "analytics_storage": "granted"}
```

The `consent_status` dataLayer event fires with `action: "onNonEURegion"`, `type: "explicit"`, and every vendor set to `true`. All 21 tracking vendors are auto-granted without any user interaction:

**Marketing:** Facebook Pixel, Google Ads, DoubleClick, TikTok Advertising, Bing Ads Retargeting, Snapchat, Sojern, AWIN, Impact Radius, Xandr, twiago

**Analytics:** Google Analytics, Microsoft Clarity, Snowplow, Adtriba, Formbricks

**Essential (classified):** Usercentrics itself, Google Tag Manager, Ravelin Mobile SDK, AWS WAF

**Functional:** YouTube Video

The `gpcSignalHonoured: false` setting means that even browsers sending the Global Privacy Control signal — a legal mechanism under the CCPA to communicate "do not sell or share my personal information" — are ignored. The Usercentrics config includes a CCPA module (`ccpa.isActive: true`, `ccpa.region: "ALL"`) with opt-out language, but the consent banner that would surface it never renders for US visitors.

The `ads_data_redaction` flag is explicitly set to `false` in the dataLayer, confirming that ad data is not redacted even in the consent-denied initial state.

---

## Search Architecture

The search widget is a standalone React app (internally called "search mask"), embedded via `<script>` tag with its own manifest. Two config endpoints initialize it:

**`/search-config/search-mask`** — returns brand UUID (`5f59428d-c840-44be-bd9e-2e1175e06779`), theme (`neptune`), autocomplete and recommendation API URLs, and a CloudFront viewer country code. No authentication.

**`/search-config/search-results`** — returns all search API endpoints, cart URLs, currency, and a `partnerAuthKey` field: `"X7M2Z4Q9A5F8L1K3W6T0B9Y2H8R3N6C1"`. This key is served to every page visitor via the search results config. Feature flags are passed as URL query parameters during search navigation — `features[feature.enable_distribusion]=1`, `features[feature.station_search]=0` — visible to any network observer.

### The Search API

The search API at `global.api.flixbus.com/search/service/v4/search` requires no authentication and returns full inventory data. A BOS-to-NYC query returns 51 route results with:

- **Exact seat availability:** `available.seats: 36`, `capacity: "high"`
- **Granular pricing:** `total: 35.99`, `original: 35.99`, `total_with_platform_fee: 39.98`
- **Platform fee:** `$3.99` flat, not currently A/B tested (`ab_test_flag: null`)
- **Operator identity:** `flixus` (FlixBus Inc., Dallas TX) and `grey` (Greyhound Lines, Dallas TX)

The CORS policy on `global.api.flixbus.com` reflects any origin with `access-control-allow-credentials: true` — meaning any website can query this API and read the response with cookies attached.

### Exposed Source Map

The search widget's JavaScript source map is publicly accessible on CloudFront (`d3k6pebee3cv6.cloudfront.net/search-mask/current/main.920e98fd.js.map`). It contains 656 TypeScript source files — the complete frontend source of the search widget.

Inside `src/config/features.ts`, four feature flags are defined:
- `feature.enable_distribusion` (default: `true`) — toggleable via cookie `search_distribusion=1`
- `feature.station_search` (default: `false`) — toggleable via cookie `webc_station_search=1`
- `feature.station_search_recommendation` (default: `false`) — cookie `webc_station_search=2`
- `feature.train_cities_only` (default: `false`)

Any feature flag can also be overridden via URL: `?features[feature.name]=1`.

Brand constants in the source list three brands sharing this codebase: `greyhound`, `flixbus`, and `kamil_koc` (a Turkish bus company FlixBus acquired). Products include `bike_slot` with a max of 5 bikes per bus.

---

## A/B Testing and Experiment Infrastructure

Ten A/B tests fire in the dataLayer on homepage load, all sourced from `cat` (catalog):

| Test ID | Variant | Notes |
|---------|---------|-------|
| `dipla_phx_add_another_trip` | 1 | Cross-brand (`dipla` prefix) |
| `dipla_phx_show_cart` | 1 | Cross-brand |
| `webc_fxp_2057` | 1 | Active experiment |
| `webc_search_booking_redirect` | 1 | Search redirect logic |
| `webc_search_canary` | 0 (off) | Canary deployment gate |
| `webc_search_dense_results_filter` | 1 | Dense results UI |
| `webc_search_engine_cond_window` | 0 (off) | Conditional search window |
| `webc_search_nyan_bike_capacity` | 0 (off) | "Nyan" — bikes on buses |
| `webc_search_seat_types_in_pricing` | 1 | Seat type pricing display |
| `webc_search_sell_delay_rides` | 0 (off) | Selling discounted delayed rides |

The `dipla_` prefix appears on tests that run across brands (dipla = display platform). The `webc_` prefix denotes web client experiments. `webc_search_sell_delay_rides` is an unreleased feature for selling rides that are running behind schedule at a discount — currently disabled.

### Experiment Override Mechanism

The experiment system uses `cc_override_*` cookies to force variant assignments. Setting `cc_override_webc_search_canary=1` would route a visitor into the canary deployment. These overrides route through `app-experiments.cro.flix.tech/fxp.js`, which currently returns a 500 server error — the override mechanism is documented in the code but the endpoint is broken.

Two upcoming experiments (`webc_fxp_2053`, `webc_fxp_2054`) are staged with empty variant arrays — placeholders in the experiment pipeline awaiting activation.

---

## The Booking.com Cross-Sell

When a visitor clicks Search on greyhound.com, the site navigates to `shop.greyhound.com/search` for bus results. Simultaneously, a Booking.com tracking pixel fires: `POST www.booking.com/c360/v1/track` — observed twice in the search results network capture.

This is a hotel cross-sell embedded in the primary search action. The user searches for a bus; Booking.com gets the search signal. There is no disclosure on the search page that this data sharing occurs. The integration is in the search results page, not a separate "hotels" tab or opt-in flow.

---

## Snowplow and Braze Identity Stitching

Snowplow is the behavioral analytics backbone. The collector endpoint is deliberately obscured: `/flux/cujo/com.coconut.island/strawberry` — a path that looks nothing like an analytics endpoint. It serves a 1x1 GIF pixel with wildcard CORS (`access-control-allow-origin: *`).

The `sp` cookie (Snowplow session) is set cross-subdomain, meaning `www.greyhound.com` and `shop.greyhound.com` share the same Snowplow identity. Three window globals expose the Braze integration:

- `window.sendSnowplowUserToBraze()` — pipes the Snowplow user ID to Braze
- `window.sanitizeBrazeCards` — sanitizes content cards from Braze
- `window.emitBrazeContentCardsReadyEvent` — fires when Braze cards are loaded

Braze SDK key `2810d9ef-cb21-43c3-bd34-da13f87b38bb` is inline in the homepage HTML. The base URL is `sdk.fra-02.braze.eu` — an EU data center serving a US bus company. Braze powers "Featured Connections" dynamic content cards on bus route pages.

The identity flow: Snowplow assigns a session ID, that ID is passed to Braze via `sendSnowplowUserToBraze()`, and Braze uses it to personalize content cards. The cross-subdomain `sp` cookie ties browsing behavior on the marketing site to booking behavior on the shop.

---

## Formbricks CRO — Cross-Brand Exposure

The Formbricks survey platform at `surveys.cro.flix.tech` is loaded on greyhound.com with environment ID `clmp83bcg0001q737d5ciqrya`. This single environment serves the entire FlixBus portfolio with no brand isolation.

**235 action classes** are exposed, including 12 Greyhound-specific entries:

`fxp1075_gh_v1`, `fxp1075_gh_v2`, `fxp1075_gh_original`, `fxp1542_gh_v1`, `fxp1542_gh_v2`, `fxp1542_gh_v3`, `fxp1618_gh`, `fxp1649_GH_departure`, `fxp1649_GH_arrival`, `Booking Sucess GH` (sic), `Booking Success GH MX`, `help GH`

The remaining 223 action classes belong to FlixBus, FlixTrain, and regional brands across Europe, India, and Latin America. Every visitor to greyhound.com receives the full configuration for all brands.

**7 live surveys** (all `inProgress`):

1. Channel Preference — Netherlands
2. Channel Preference — Belgium
3. Policy Pages (generic)
4. UK Airport Shuttle page
5. IT Airport Shuttle page
6. Trustpilot review UK V4 (Trustpilot API integration)
7. India & COM MMB Recruiting

None of these surveys target Greyhound visitors. They are Netherlands channel research, Belgian channel research, UK Trustpilot solicitation, Italian and UK airport shuttle feedback, and Indian recruiting — all leaked to greyhound.com through the shared environment.

A second, isolated Formbricks environment (`cm14xd8f402kfkbajgimr4xpy`) runs on the trip tracker with focused action classes for ride tracking workflows — evidence that brand isolation is possible, just not implemented for the main CRO environment.

---

## Trip Tracker — Brand Bleed

The `/track` page is a React SPA served from `wimr-ui.gis.flix.tech`. Its HTML links to Honeycomb v12.0.2, two major versions behind the main site's v15.3.3. The page title, set dynamically by the SPA at runtime, reads "Current travel information | FlixBus" — the FlixBus brand name displayed on a greyhound.com subdomain.

ConfigCat (SDK key `mP3cCCtyiE-MyHLq-X09Tg`, EU region) manages two feature flags for the tracker:
- `ride_status_explainer` — off by default, conditionally enabled based on a hashed language value
- `ride_tracking_animation` — on globally

The robots.txt blocks `/track/ride/` and `/track/station/` from crawlers, but the tracker page itself is publicly accessible.

---

## Machine Briefing

**Access and auth:** Most read endpoints work without authentication. No bot protection observed on `www.greyhound.com` or the FlixBus API. AWS WAF is present on `shop.greyhound.com` (token endpoint at `5562597c477f.c1439e2f.us-west-1.token.awswaf.com`). Standard browser user-agent is sufficient.

### Open Endpoints

```bash
# Search API — full inventory, pricing, seat counts, no auth
GET https://global.api.flixbus.com/search/service/v4/search?search_by=cities&currency=USD&departure_city=<uuid>&arrival_city=<uuid>&departure_date=<DD.MM.YYYY>&products=%7B%22adult%22%3A1%7D&search_uuid=<uuid>

# City autocomplete
GET https://global.api.flixbus.com/search/autocomplete/cities?q=<query>&lang=en&country=us&flixbus_cities_only=true

# City details and routes
GET https://global.api.flixbus.com/search/service/cities/details?locale=en_US&from_city_id=<uuid>

# CMS cities and reachable routes
GET https://global.api.flixbus.com/cms/cities?locale=en_US&country=US
GET https://global.api.flixbus.com/cms/cities/<uuid>/reachable?locale=en_US&limit=10

# Search mask config (brand UUID, theme, endpoints)
GET https://shop.greyhound.com/search-config/search-mask

# Search results config (contains partnerAuthKey)
GET https://shop.greyhound.com/search-config/search-results

# Formbricks CRO environment (all FlixBus brands, 235 action classes, 7 surveys)
GET https://surveys.cro.flix.tech/api/v1/client/<env-id>/environment

# Formbricks trip tracker environment
GET https://surveys.cro.flix.tech/api/v1/client/cm14xd8f402kfkbajgimr4xpy/environment

# ConfigCat feature flags (trip tracker)
GET https://cdn-eu.configcat.com/configuration-files/mP3cCCtyiE-MyHLq-X09Tg/config_v6.json

# Usercentrics settings
GET https://api.usercentrics.eu/settings/wfj7w1jmNugSsu/latest/en.json

# Usercentrics ruleset
GET https://api.usercentrics.eu/ruleSet/DkhDssQkpLpteU.json

# CMS GraphQL (introspection blocked, operational queries work)
GET https://api.cms.flixbus.com/gql?query=<query>

# Rebooking user state (returns {} unauthenticated)
GET https://shop.greyhound.com/api/rebooking/user
```

### Gotchas

- `global.api.flixbus.com` CORS reflects any origin with credentials — works from any domain via browser `fetch()`
- Search API city IDs are UUIDs, not human-readable — use the autocomplete endpoint first to resolve city names to IDs
- The Snowplow collector path `/flux/cujo/com.coconut.island/strawberry` is intentionally obfuscated
- Feature flags can be toggled via URL parameters (`?features[feature.name]=1`) or cookies (`search_distribusion=1`)
- `cc_override_*` cookies are the A/B test override mechanism, but the experiment endpoint (`app-experiments.cro.flix.tech/fxp.js`) currently returns 500
- The trip tracker page title is set dynamically by the React SPA — static HTML has no `<title>` tag
- GTM container: `GTM-QFH9M`
- DataDog RUM key in CSP: `pub6395d5bd2f2b5751fdf3784e50845d1b` (browser-side public key, not a secret)
- Braze SDK: EU data center (`sdk.fra-02.braze.eu`) for a US-only service
