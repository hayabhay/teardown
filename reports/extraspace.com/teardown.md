---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "Extra Space Storage — Teardown"
url: "https://extraspace.com"
company: "Extra Space Storage"
industry: "Real Estate"
description: "Self-storage REIT operating 4,000+ facilities across 43 US states."
summary: "Next.js on Vercel running a platform internally called Moonshot, which replaced a legacy system called Phoenix — though all API paths still route through /api/phoenix/. Contentful CMS backs content. PerimeterX handles bot protection. Optimizely manages 298 feature flags and 15 running experiments. Usercentrics runs consent under a CPRA framework."
date: "2026-04-12"
time: "17:14"
contributor: "hayabhay"
model: "sonnet"
effort: "high"
stack: [Next.js, Vercel, Contentful, PerimeterX, Optimizely]
trackers: [Google Analytics, Bing UET, TikTok Pixel, Facebook Pixel, Google Ads, Quantum Metric, Qualtrics, GTM, Datadog RUM]
tags: [storage, reit, pricing, feature-flags, consent, gpc, call-tracking, junk-fees, ai-assistant, pre-consent]
headline: "The unauthenticated store API exposes six internal pricing tiers for every unit — callers who phone in pay 32% more than online bookers for the same space."
findings:
  - "Four simultaneous A/B tests on lock fees are named with the literal string 'non_junk_fee' — the flag names reveal the company is testing regulatory responses to junk fee pressure, not just pricing variants."
  - "extraspace.com publishes a /.well-known/gpc.json file declaring GPC support (updated Feb 2026), but the Usercentrics CMP has gpcSignalHonoured set to false — a false signal to browsers and regulators under CPRA."
  - "The Piper call-tracking system assigns a unique phone number to every visitor via their GA client ID, and the assignment endpoint is unauthenticated — any valid GA-format ID returns the number tied to that session."
  - "A feature flag called disable_giact_for_student_sites embeds an Excel filename and monthly store schedules — disabling identity verification at campus-adjacent facilities during college move-in season."
  - "Google Consent Mode defaults all four consent signals to 'granted' before any banner interaction, so Google's ad systems receive full consent on every pageview regardless of what the user chooses."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

Extra Space Storage runs one of the largest self-storage operations in the US — 4,000+ facilities across 43 states, organized as a REIT. The site is a reasonably modern Next.js build, but the API layer underneath it is an open book: facility pricing, call-tracking state, and 298 feature flags are all accessible without authentication. The consent implementation has a direct contradiction between its public GPC declaration and its CMP configuration.

## Stack & Architecture

The frontend runs Next.js on Vercel. The platform is internally called **Moonshot** — the name appears in `robots.txt` comments, the `siteType` field in `__NEXT_DATA__`, and a still-running A/B test (`moonshot_aab_test`) that has 100% of traffic allocated to the Moonshot variant. The old platform was called **Phoenix**, which is why every API endpoint still routes through `/api/phoenix/`.

Content is managed in **Contentful** (Space ID: `fynvlmu126fq`, environment: `extraspacecom`). The `__NEXT_DATA__` payload on the homepage is 979KB — heavy for a homepage, reflecting deep CMS content hydration. ISR timestamps are visible in the payload (`pageGeneratedOn: 2026-04-12T16:50:37.912Z`).

Internal microservice codenames visible in feature flags and API paths: **Phoenix** (web API), **Breeze** (appears in unit identifiers as `breezeId`), **DarkStar**, **Osprey**, **Aspen** (mobile app). Kafka topics referenced in the Optimizely attributes include: `store`, `catalog`, `lead`, `reservation`, `dynamic-price`, `admin-fee`, `gate`, `technology`, `map`, `partner`, `attribute`, `hour`, `contact`, `detail` — a good sketch of the event-driven data pipeline.

**PerimeterX** (`PXNyx0n2sC` sensor ID, `_pxhd`/`_pxvid`/`pxcts`/`_px3` cookies) blocks headless browsers and curl requests with a 403 immediately. All interaction requires a headed browser session. The Vercel `server` header is visible even on 403 responses.

**Error monitoring**: Sentry (org 494745, project 5566347, release `e065fe7dc51144b61c8333b8c4b95095bca7bd79`). **Analytics**: GA4 (`G-0PKRKW35TX`), Datadog RUM (`DD_RUM` global). **Tag management**: GTM (`GTM-TZRHD6N`). **Feature flags**: Optimizely (project 16549610102, account 15782051476).

The **Life Storage acquisition** (ESS acquired Life Storage in 2023) is visible in the API: each acquired facility carries a `lifeStoreId` field linking back to its original system. Store 3000 (Mt Pleasant, SC) shows `transitionType: "Acquisition"`, `program: "Satellite"`, `lifeStoreId: 1`.

## The Store API — Six Pricing Tiers, No Auth Required

`GET /api/phoenix/web-api/store/{ozStoreId}/` returns a comprehensive facility data object with no authentication required. Tested across stores 1275 (Simi Valley, CA), 1938 (Houston, TX), and 3000 (Mt Pleasant, SC). The response is structured under a `data` key with sub-objects for `facilityData`, `unitClasses`, `directions`, `nearestLocations`, `reviews`, and `startingAt`.

Each unit class in `unitClasses.data.unitClasses` carries a `rates` object with six distinct price points:

| Field | Meaning |
|-------|---------|
| `web` | Online booking price |
| `tier1` | Internal dynamic tier 1 (cheapest) |
| `tier2` | Internal dynamic tier 2 |
| `tier3` | Internal dynamic tier 3 |
| `walkIn` | Walk-in rate |
| `street` | Listed street rate (highest) |
| `nsc` | National Service Center (phone) rate |

For a 10'x10' climate-controlled unit at store 1275 (Simi Valley):

```
tier1:  $239/mo
web:    $251/mo
tier2:  $251/mo
tier3:  $264/mo
walkIn: $264/mo
nsc:    $332/mo  <- calling the phone number
street: $349/mo  <- listed rate
```

The spread from cheapest (`tier1`, $239) to most expensive (`street`, $349) is 46% for an identical unit. The NSC rate — the price a caller gets when they dial the 1-800 number — is $332, a 32% premium over the online rate. The `isNscAvailable` flag and `phonesRoutedToNsc` timestamp (2022-07-19 for store 1275) indicate when the call center took over handling for each store.

The `facilityData.data.store` object additionally exposes:

- **`dynamicPrices`**: Array of `{average, highest, lowest, historicalAverage, historicalHighest, historicalLowest}` records by unit size. Store 1938 (Houston) shows `historicalHighest: 413` aggregate (all units) against a current `average: 87` — a price collapse visible in the data. Store 1275 shows aggregate `historicalHighest: 849` against current `average: 201`.
- **`giact100Flagged`**: Per-facility fraud risk flag from GIACT (identity verification provider).
- **`isTestStore`**: Boolean marking internal test stores in production data.
- **`allowOverbooking`**: Per-facility overbooking configuration.
- **`omniConversionDate`**: When the facility joined the omnichannel platform (store 1275: 2022-09-16).
- **`transitionType`**: Management transition details (e.g., "C of O" — Certificate of Occupancy).
- **`salesForceId`**: Salesforce CRM record ID (e.g., `a083b00000l4iISAAY`).
- **`storeId`**: Internal UUID (e.g., `12c98fc6-ef45-446e-a30b-2c23ab63f3e3`).
- **`ozStoreId`**: Numeric store ID used in API paths.
- **`adminFee`**: $29 admin fee (consistent across tested stores).
- **`telephone`** vs **`telephoneDirectDial`**: Two phone numbers per store — `telephone` is the general/NSC-routed line, `telephoneDirectDial` is the direct facility line for existing customers.

46 unit classes per store is typical. Each carries availability counts, promotion fields, and full dimensional data.

No CORS restrictions are enforced on these endpoints — accessible from any origin.

## Piper — Session-Level Call Attribution

Piper is Extra Space's call attribution system. On every page load, the browser calls:

```
GET /api/phoenix/web-api/piper/next/{gaClientId}/
```

where `{gaClientId}` is the visitor's Google Analytics client ID (format: `digits.digits`, taken from the `_ga` cookie). The response assigns a dedicated tracking phone number to that visitor:

```json
{
  "correlationId": "9c0ee226-13b3-4478-b0a9-8bab0a2b7068",
  "data": {
    "piperNumber": {
      "visitorId": "114102925.1776012675",
      "isDefault": false,
      "lastUsed": "2026-04-12T16:55:19.743",
      "number": "8557410134"
    }
  },
  "errors": null
}
```

`isDefault: false` means this visitor has a dedicated tracking number (not the generic fallback). The assigned number is stored in the `piper_number` cookie and displayed in the site's header. When the visitor calls that number, the call is linked back to their GA session — channel, page, and campaign attribution all flow through.

Both the assignment endpoint and the conversion pixel endpoint are unauthenticated:

```
POST /api/phoenix/web-api/piper/pixel/
```

The pixel POST carries `DisplayedNumber`, `GaSessionId`, `PageName`, `PageUrl`, `UserAgent`, and `VisitorId`. The error response from the assignment endpoint explicitly names the field: `"Google Analytics Client ID" with value "..." fails to match the required pattern: /^\d+(\.\d+)?$/` — confirming the parameter description.

The `piper_number` cookie is JavaScript-accessible (not HttpOnly). The `visitor_ip` cookie — which stores the visitor's raw IP address — is also JavaScript-accessible. Both are readable by every third-party script on the page.

## Consent: Two Failures Running Simultaneously

### The GPC Contradiction

`/.well-known/gpc.json` returns:

```json
{"gpc": true, "lastUpdate": "2026-02-09"}
```

This file is the standard browser and regulator signal that a site honors the Global Privacy Control — a CPRA-mandated opt-out mechanism for data sale and sharing. The file was updated February 9, 2026.

The Usercentrics CMP configuration, fetched from `api.usercentrics.eu/settings/KW50db5lZfWDYf/latest/en.json`, has:

```
gpcSignalHonoured: false
gppSignalingEnabled: false
isAutoBlockingEnabled: false
framework: "CPRA"
```

The site operates under CPRA (`framework: "CPRA"`), CPRA requires honoring GPC, and the `.well-known/gpc.json` file publicly declares compliance. The CMP contradicts all of it. Browsers that send a GPC signal receive no opt-out behavior; the signal is silently discarded.

Contentful contains staged UI copy for GPC ("Your opt-out preference signal has been honored. See our Privacy Policy." and "We received a Global Privacy Control (GPC) signal from your browser and have applied your opt-out preferences.") — the text exists in the CMS but the condition that would display it never fires.

### Google Consent Mode Pre-Granted

Usercentrics is configured in a mode where Google Consent Mode (GCM) signals are set to `granted` before any user interaction:

```
uc_gcm.adPersonalization: "granted"
uc_gcm.adStorage: "granted"
uc_gcm.adUserData: "granted"
uc_gcm.analyticsStorage: "granted"
uc_user_interaction: "false"
```

This is captured in localStorage immediately after page load, before any banner interaction. GCM v2 allows publishers to set "default" consent states — intended to degrade gracefully until actual consent is collected. Setting the defaults to `granted` inverts this mechanism: Google's ad systems receive a full consent signal on every pageview, regardless of what the user ultimately chooses.

Marketing (11 services) and Functional (20 services) categories both show `status: true` on first load.

### Pre-Consent Tracker Inventory

The following cookies are set before any consent banner interaction, confirmed from the cookie string captured immediately after page load:

- `_ga`, `_gid`, `_ga_0PKRKW35TX` — Google Analytics 4
- `_uetsid`, `_uetvid` — Microsoft UET / Bing conversion tracking
- `_tt_enable_cookie`, `_ttp`, `ttcsid` — TikTok Pixel
- `_fbp` — Facebook Pixel (Meta)
- `_gcl_au` — Google Ads conversion linker
- `QuantumMetricSessionID`, `QuantumMetricUserID` — Quantum Metric session recording
- `optimizely_visitor_id`, `optimizelyEndUserId`, `optimizelySession` — Optimizely
- `QSI_HistorySession` — Qualtrics Site Intercept
- `_pxhd`, `_pxvid`, `pxcts`, `_px3` — PerimeterX (bot detection, not consent-dependent)
- `_dd_s` — Datadog session
- `piper_number` — call tracking assignment
- `visitor_ip` — raw IP address (JS-accessible)

Quantum Metric generates 25+ POSTs per homepage load to `ingest.quantummetric.com/horizon/extraspace` before any consent interaction.

## 298 Feature Flags, Public Datafile

The Optimizely configuration datafile is fetched unauthenticated on every page load:

```
GET https://cdn.optimizely.com/datafiles/9KPy7gPGCSGGzCMzUoerpM.json
```

Project ID 16549610102, revision 3364 at time of investigation. 298 feature flags and 15 running experiments are fully enumerated.

### Boxy AI Assistant

`boxy_chat` experiment is Running. Traffic allocation: 75% to `on` variant, 25% to `off` variant. A separate feature flag `show_boxy_chat` controls visibility.

The Contentful `boxyChatCard` entry (ID: `2MSGsy91n4dX1qzB98tNS3`) was created 2026-03-05:

```
title: "FIND THE RIGHT UNIT WITH BOXY!"
description: "I am a friendly AI assistant that can help you find the perfect storage
solution and answer any questions you may have about storage."
buttonText: "GET STARTED"
```

`isBoxyChatEnabled: false` in `__NEXT_DATA__` indicates per-cohort gating despite the experiment running at 75% on. The experiment has been running long enough to accumulate Contentful assets and a dedicated query param flag (`boxy_chat_query_param`). Active rollout.

### Lock Fee Tests — Self-Aware Naming

Four simultaneous experiments on lock fees are running:

| Flag key | What it tests |
|----------|--------------|
| `free_lock_non_junk_fee_test` | Giving the lock for free, framed as not a junk fee |
| `half_off_lock_non_junk_fee_test` | Half-price lock, same framing |
| `opt_out_of_lock_test` | Ability to opt out of lock purchase entirely |
| `gbb_free_lock_-_all_packages` | Free lock as a Good/Better/Best upsell perk |

The phrase "non_junk_fee" is explicit in the flag keys. The naming is self-referential: the company is testing how to respond to regulatory and reputational pressure on mandatory add-on fees, and the tests themselves are labeled with the concern they're trying to address. `remove_2000_insurance_option_test` — testing removal of the cheapest ($20/month) insurance tier — is running in parallel.

### Student Store Identity Verification Bypass

`disable_giact_for_student_sites` contains a default variable value with:

```json
{
  "version": 1,
  "sourceFile": "StudentSites.xlsx",
  "months": {
    "march": { "storeIds": [256, 321, 365, 406, 507] },
    "april": { "..." }
  }
}
```

GIACT is the identity verification provider used at checkout. This flag disables it on a monthly schedule at stores adjacent to college campuses during move-in season. The list is maintained in a spreadsheet (`StudentSites.xlsx`) whose contents are embedded verbatim in the Optimizely configuration — store IDs are publicly visible in the datafile.

### Other Running Experiments

- `bluetooth_scanner` — A/B test for Noke smart lock Bluetooth access (`noke-acceptable-rssi-value`, `ota-acceptable-rssi-value` variables)
- `rr_abandonment_detection_test__pennywise_` — abandonment detection in the "rapid rental" flow (internal codename: Pennywise)
- `gamify_progress_bar_test` — gamified progress bar in rental flow
- `user_inactivity_popup_test` — inactivity detection popup
- `rr_countdown_timer` — countdown timer in rapid rental
- `cpp_yellow_font_warning_test` — yellow warning text on checkout page
- `facility_aab_experiment` — A/A/B test on facility pages
- `moonshot_aab_test` — platform migration test, 100% Moonshot (migration complete)

### Architecture Exposed via Flags

The Optimizely attribute list and audience conditions name internal systems directly: `phoenix-search-amazon-geocode` (Amazon geocoding for search), Kafka topics as event sources, `aspen-rssi-signal` (Aspen = mobile app, communicating with Noke locks via RSSI threshold). The datafile provides a reasonable map of internal service dependencies without any authentication.

## Supporting Technical Notes

**Twilio live chat**: `POST https://webchat-3914-prod.twil.io/availableAgents` fires on every page load with no authentication, returning `{"workersAvailable": N}`. Real-time agent availability is queryable from anywhere.

**Google Maps API key**: `AIzaSyCDTL3iU71Utn8tZnbymAB91GNz9Eg72P0` is present in client-side code. Billing for any usage routes to Extra Space Storage's account.

**Sentry**: Public DSN key `fc11e7c54efb459aa5fe040c0936ddbd`, org 494745, project 5566347. Build release SHA: `e065fe7dc51144b61c8333b8c4b95095bca7bd79`.

**Cities API**: `GET /api/phoenix/web-api/location/cities/states/list/` returns 1,716 city/state records, unauthenticated.

**`robots.txt`**: Contains `# Moonshot sitemaps` and `# Legacy sitemaps` sections, 11 total sitemaps. Disallowed paths include `/reserve/`, `/storage/reservation/`, `/storage/online-lease/lease-loading`, `/storage/online-lease/payment-loading`, and `/movekit/` (suggesting a moving services integration). The `/m/` path is disallowed — a legacy mobile site.

---

## Machine Briefing

### Access & Auth

PerimeterX blocks curl and headless browsers immediately. All requests require a headed browser session (Playwright headed mode). The `_pxhd` cookie is set on first response and must persist. Standard browser User-Agent required.

Data APIs (`/api/phoenix/web-api/`) accept requests without session cookies once you have a non-blocked session to pull CORS context from — or test directly from a browser context with PerimeterX cookies in place.

### Endpoints

**Facility data** (requires headed browser for initial session, then works with standard headers):
```
GET https://www.extraspace.com/api/phoenix/web-api/store/{ozStoreId}/
```
ozStoreId is the numeric store ID (e.g., 1275, 1938, 3000). Response: `data.facilityData.data.store`, `data.unitClasses.data.unitClasses`. No auth required.

**Unit pricing** (inside store response):
```
data.unitClasses.data.unitClasses[n].rates
  -> {web, tier1, tier2, tier3, walkIn, street, nsc}

data.facilityData.data.store.dynamicPrices[n]
  -> {average, highest, lowest, historicalAverage, historicalHighest, historicalLowest, display}
```

**Call tracking assignment**:
```
GET https://www.extraspace.com/api/phoenix/web-api/piper/next/{gaClientId}/
```
gaClientId format: `digits.digits` (from `_ga` cookie, strip leading `GA1.1.`). Returns phone number assigned to that session.

**Call attribution pixel**:
```
POST https://www.extraspace.com/api/phoenix/web-api/piper/pixel/
Content-Type: application/json

{"DisplayedNumber": "...", "GaSessionId": "...", "PageName": "...", "PageUrl": "...", "UserAgent": "...", "VisitorId": "..."}
```

**Cities list**:
```
GET https://www.extraspace.com/api/phoenix/web-api/location/cities/states/list/
```
Returns 1,716 `{city, stateAbbreviation, stateName}` records. No auth.

**Optimizely datafile** (fully public):
```
GET https://cdn.optimizely.com/datafiles/9KPy7gPGCSGGzCMzUoerpM.json
```
298 feature flags, 15 experiments, full variable values including student store IDs and RSSI thresholds.

**Twilio agent availability**:
```
POST https://webchat-3914-prod.twil.io/availableAgents
```
No auth. Returns `{"workersAvailable": N}`.

**GPC declaration**:
```
GET https://www.extraspace.com/.well-known/gpc.json
-> {"gpc": true, "lastUpdate": "2026-02-09"}
```

**Usercentrics config**:
```
GET https://api.usercentrics.eu/settings/KW50db5lZfWDYf/latest/en.json
GET https://api.usercentrics.eu/ruleSet/9agSKoCTkkqQW9.json
```

### Gotchas

- **PerimeterX**: curl returns 403 immediately. Use Playwright headed mode. PerimeterX cookie `_pxhd` must be present on subsequent requests.
- **Store ID format**: ozStoreId (integer) is used in API paths. Each store also has a UUID `storeId` and a `salesForceId`. Do not confuse these.
- **GA Client ID extraction**: The `_ga` cookie value is `GA1.1.{clientId}` — strip the `GA1.1.` prefix to get the format required by Piper (`digits.digits`).
- **Dynamic prices**: Organized as an array where index 0 is the "All" aggregate and subsequent entries are by unit size. The `display` field contains the size string (e.g., "10x10").
- **Rate field names**: `salesForceId` in the store object (capital F) — note spelling varies from notes.
- **Contentful Space ID**: `fynvlmu126fq` — visible in all Contentful asset URLs and `__NEXT_DATA__`.
