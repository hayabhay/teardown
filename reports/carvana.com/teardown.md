---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "Carvana — Teardown"
url: "https://carvana.com"
company: "Carvana"
industry: "Retail"
description: "Online-only used car marketplace with home delivery."
summary: "Next.js shell at www.carvana.com orchestrating 7+ independent micro-frontends served from Fastly CDN subdomains, with all API traffic routing through apik.carvana.io. Backend spans .NET (core services, consent, pricing) and Python/FastAPI (AI chatbot via nosidelines.io vendor). Cloudflare WAF on the main domain with aggressive COEP/COOP/CORP headers. LaunchDarkly drives feature rollouts on the sell/trade flow; DataGrail manages consent."
date: "2026-04-14"
time: "05:46"
contributor: "hayabhay"
model: "sonnet-4.6"
effort: "high"
stack: ["Next.js", "Fastly CDN", "Cloudflare", ".NET", "Datadog RUM", "LaunchDarkly"]
trackers: ["Google Tag Manager", "Google Analytics 4", "Google Ads", "Facebook Pixel", "Snowplow", "Datadog RUM", "Spotify Audience Network", "Acuity AGKN", "Impact Radius", "Microsoft UET", "FullStory", "DataGrail", "Postie", "Horizon Next"]
tags: ["automotive", "micro-frontend", "api-exposure", "session-recording", "direct-mail", "feature-flags", "ai-content", "identity-resolution"]
headline: "The unauthenticated pricing API returns KBB value, MSRP, sale price, market adjustment, APR, and monthly payment for any vehicle ID and zip code — Carvana's full internal pricing model, enumerable across all 41,640 listed cars."
findings:
  - "FullStory session recording is active on /get-offer where users enter income and address details, but 9 of 30 element masks protecting those fields rely on styled-component hash selectors that silently stop matching after any CSS recompile."
  - "Delivery and distance APIs return all Carvana location IDs with distances from any zip code, trivially mapping their entire logistics hub network without authentication."
  - "The unauthenticated pricing API returns KBB value, MSRP, sale price, market adjustment, APR, and monthly payment for any vehicle ID and zip code — Carvana's full internal pricing model, enumerable across all 41,640 listed cars."
  - "LaunchDarkly client SDK key in browser JS returns 13 sell/trade feature flags including gated rollouts for a new payment system and an unreleased 'CAM' product."
  - "Postie, a direct mail retargeting platform that resolves anonymous visitors to postal addresses, loads on the homepage — enabling physical mailers to browsers who never shared their address."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

Carvana is an online-only used car marketplace — no dealers, no lots, home delivery across most of the U.S. The site handles browsing, financing pre-qualification, vehicle appraisal/trade-in, and purchase entirely in the browser, which puts a lot of sensitive flow through a single web surface.

## Architecture

`www.carvana.com` is a Next.js SSR shell that generates almost no first-party requests of its own. Every real request routes to subdomains:

- `apik.carvana.io` — API gateway for all first-party data
- `analytics.carvana.io` — A/B test bucketing and clickstream
- `assets.fastly.carvana.io` — MFE JavaScript bundles
- `static.fastly.carvana.io` — MFE manifests and secondary bundles
- `spinnerdata.carvana.io` — 360° vehicle imagery and feature data
- `vexgateway.fastly.carvana.io` — VEX (Vehicle Experience) 3D tiles and interior panoramas

The site runs at least 7 named micro-frontends, each self-contained and separately deployed:

| MFE | Host |
|-----|------|
| Car search/listing (merchui) | `assets.fastly.carvana.io/merchui/` |
| Header | `static.fastly.carvana.io/header-module/` |
| Appraisal refresh UI | `static.fastly.carvana.io/carvana-appraisal-refresh-ui/` |
| Financing/Qualify UI | `static.fastly.carvana.io/carvana-quali-ui/` |
| Soft credit pull modal | `static.fastly.carvana.io/softpull-modal-module/` |
| Lead capture | `static.fastly.carvana.io/lead-capture-module/` |
| Chat UI | `storage.googleapis.com/chat-ui-ngcp-prod/` |

Each MFE polls its own `assets-manifest.json` on every page load to self-update independently of the main shell. The main Next.js shell and the merch MFE have distinct build IDs — `42e5f2469e7976f521ba52e61806084d341537bc` and `4136622bcf8352dcea1a958b20e7b19186783764` respectively — both full 40-character SHA1 hashes, meaning deployment is tied directly to Git commits.

On a vehicle detail page, `www.carvana.com` generates zero first-party API calls. The page count was 96 requests across 11 third-party domains. On the homepage, it was 65 requests: 1 first-party (a Cloudflare challenge script), 64 third-party. The cars listing page: 95 requests, 0 first-party.

**Backend stack:** Two distinct backends are confirmed by error message signatures. Core services (consent, pricing, headers) run on .NET — a POST to `/core/consent-api/api/v1/consent/disclosures` with an empty body returns the .NET type name `Carvana.Consent.Contracts.Consent.ConsentDisclosureRequest` via Newtonsoft.Json. The AI vehicle chatbot runs on Python/FastAPI via a third-party vendor (see below).

**Cloudflare WAF** is active — curl requests to `carvana.com` return `cf-mitigated: challenge`. Response headers set aggressive cross-origin isolation: `cross-origin-embedder-policy: require-corp`, `cross-origin-opener-policy: same-origin`, `cross-origin-resource-policy: same-origin`. Permissions Policy blocks accelerometer, camera, geolocation, gyroscope, payment, clipboard, and a full list of other browser APIs.

**robots.txt** disallows `/firefly` and `/serenity` (both return 404 — purpose unknown), `/promotion-rules/*` (suggesting a promotional pricing rules engine), `/post-sale-dashboard`, `/search/getspinnerdatalarge` (a large-format 360° dataset endpoint), `/search/vehiclehistoryreport` (vehicle history report access via search route), and all of `/search/*`, `/browse/*`, `/cars/filters*`. Yandex and Baiduspider are fully blocked (`Disallow: /`).

## Open API Surface

Five data endpoints return substantive information without authentication:

### Pricing API

`POST https://apik.carvana.io/merch/search/api/v2/pricing`

Accepts `vehicleIds` (array) and `zip5`. Returns for each vehicle:

```json
{
  "kbbValue": 22200,
  "msrp": 26340,
  "incentivizedPrice": 23590,
  "marketAdjustment": -2750,
  "apr": 6.99,
  "monthlyPayment": 391,
  "termInMonths": 84,
  "estimatedTaxesAndFees": 2279,
  "financeInfo": {
    "isUsingSampleTerms": true
  }
}
```

`isUsingSampleTerms: true` indicates these are pre-authentication sample estimates, not personalized loan quotes. That said, the full pricing model — KBB reference value, MSRP, Carvana's sale price, the market adjustment dollar value, estimated APR, and monthly payment — is accessible for any vehicle ID without a session. Vehicle IDs appear in page URLs. With 41,640 cars in active inventory (observed in `merch.totalMatchedInventory` on the /cars page), a complete pricing snapshot of the full Carvana catalog is derivable. The `marketAdjustment: -2750` for a $26k MSRP vehicle indicates dynamic market-based pricing rather than fixed margins.

### Logistics Network APIs

`GET https://apik.carvana.io/merch/carvanamerchcontextapi/api/v3/delivery?zip5={zip}`
`GET https://apik.carvana.io/merch/carvanamerchcontextapi/api/v3/distance?zip5={zip}`

The delivery endpoint returns all Carvana location IDs with delivery windows for a given zip — for SF (94105), 55 locations show 0-day availability, 1 shows 42 days. The distance endpoint returns miles from every Carvana location to the queried zip. Querying a handful of zip codes across the country lets you triangulate each location ID's geography — combined, these endpoints fully map Carvana's logistics hub network without authentication. Over 180 location IDs were returned in the delivery response.

### Discount / Promo API

`GET https://apik.carvana.io/core/discount/api/v1/discount`

Returns:
```json
{
  "content": {
    "userId": null,
    "purchaseId": null,
    "discounts": [],
    "excludedPromotionalStates": ["AK", "HI", "TX", "UT"]
  }
}
```

No auth required. AK and HI reflect delivery limitations. TX exclusion aligns with Texas's strict dealership licensing framework — Carvana has had regulatory friction in TX. The UT exclusion is not explained by the available data.

### Vehicle Data (spinnerdata.carvana.io)

`GET https://spinnerdata.carvana.io/spinnerdata/{stockNumber}/spinnerData.json`

No auth. Returns per-vehicle:
- AI-generated feature narratives by category
- `car.headline` — auto-generated positive tagline (e.g., "Say a big yes to this one!")
- `imperfections` — all documented damage with photo URLs, zone descriptions (e.g., "Trunk — exterior scratch"), and timestamps
- 360° image paths and 3D pose data

The imperfection records are raw condition notes, not marketing copy. They include the full photographic evidence Carvana's inspection team captured, accessible by stock number.

### AI Chatbot (nosidelines.io)

`POST https://descartes-external.ngcp.prod.nosidelines.io/vehicle-questions/`

No auth. Accepts:
```json
{
  "correlation_id": "",
  "kbb_vehicle_id": "",
  "vehicle_id": "",
  "year": "",
  "make": "",
  "model": "",
  "trim": "",
  "page": ""
}
```

Returns AI-generated suggested questions for the VDP's `WhyBuy` and `OwnerReviews` sections. `question.id` fields are UUIDs used to retrieve answers. The endpoint runs on a third-party vendor's infrastructure — "nosidelines" in the subdomain is the vendor name, "descartes" is the internal service name. The `kbb_vehicle_id` field confirms Carvana uses KBB vehicle IDs internally as a cross-reference alongside their own IDs.

The full request schema was obtained through Pydantic validation errors — sending a malformed request returns the complete field list with types and constraints. NGCP appears to be Carvana's internal name for their Next Generation Customer Platform, based on both the subdomain and the GCS bucket `chat-ui-ngcp-prod` serving the chat UI assets.

## LaunchDarkly Feature Flags

The sell/trade flow loads LaunchDarkly with client SDK key `661d78ce08ca52101c6d90bd` (visible in browser JS). The evalx endpoint returns 13 flags for the `stc-home` context (STC = Sell To Carvana):

| Flag | Value |
|------|-------|
| `release-new-payment-eligibility` | `false` — payment eligibility system still gated |
| `release-hub-gated-access` | `false` — STC hub rollout in progress |
| `release-cam-snow` | `false` — "CAM" feature disabled |
| `release-cam-hide-title` | `false` — related CAM UI change also gated |
| `release-legacy-wsys-components` | `true` — legacy WSYS components still active |
| `release-auto-verify` | `true` — auto-verification live |
| `release-require-charging-cable-confirmation-page` | `true` — EV charging cable confirmation step active |
| `release-customer-vehicle-summaries` | `true` — vehicle summaries feature live |
| `release-absolute-value-mileage-threshold` | `true` |
| `release-switch-to-stc-vehicle-description` | `true` |
| `offer-api-turnstile-mode` | `"enabled"` — Cloudflare Turnstile on offer API |
| `appraisal-ui-turnstile` | `true` — Turnstile on appraisal UI |
| `hubDocumentUploadModalConfirmClose` | `true` |

The `release-cam-snow` and `release-cam-hide-title` flags reference a "CAM" product not visible in the live UI. Both are gated off. `release-hub-gated-access: false` suggests the STC hub experience is still being selectively rolled out. `release-new-payment-eligibility: false` indicates a payment system overhaul is staged but not live.

The LaunchDarkly context object used for flag evaluation is: `{"kind":"user","key":"stc-home","bcid":"<browserCookieId>"}`. Anyone with the SDK key can query the evalx endpoint directly and get the full flag state.

## FullStory on the Appraisal Flow

FullStory (org ID `6SG8F`) fires on `/get-offer`, the page where users enter VIN, mileage, and vehicle details for an appraisal offer. Network confirmed: `edge.fullstory.com/s/settings/6SG8F/v1/web => 200` and `rs.fullstory.com/rec/page => 202`.

Carvana's FullStory configuration defines 30 ElementBlocks and 91 NamedElementBlocks to mask sensitive fields from session recordings. The well-anchored rules cover: all credit card fields (via `autocomplete` attributes), password inputs, SSN/co-SSN (`input[name="ssn"]`), DOB (`#dob`), and phone number — using stable selectors that survive redeployment.

The problem is in 9 specific ElementBlocks that protect address and income fields in the loan application flow. These use either deep DOM path chains or styled-component CSS hash selectors — long, path-dependent chains like:

```
div.jcYmPG.personal-details-next-styles__RegistrationAddressCityStateZip-sc-3u1poi-26
```

The hash `jcYmPG` is generated at CSS-in-JS compile time from the component's content and position in the bundle. Any change to styled-components ordering or content regenerates these hashes. When that happens, the FullStory element block rule no longer matches the target element, and the field records verbatim.

The fields covered by fragile selectors are: income input, registration address street (two variants), registration address apartment/unit, and city/state/zip. These are the exact fields a user enters when completing a loan or account registration in the appraisal flow — the same flow where FullStory is active.

The contrast with the other 91 NamedElementBlocks is notable: those use semantic attributes (`autocomplete`, `type=password`, `name="ssn"`, `data-testid`) that survive any CSS recompile. The fragile selectors appear to have been written against specific rendered output rather than stable attributes — a pattern that works until the next deploy changes component order.

## Tracking & Surveillance

14 confirmed trackers across the site:

**Analytics and session:**
1. **Google Tag Manager** (`GTM-PCCP2G`) — container running all Google tags
2. **Google Analytics 4** (`G-YGPT2P3T9Z`)
3. **Datadog RUM** — 32-49 calls per page, every user interaction captured; session replay capability
4. **Snowplow** via `t.getletterpress.com` — 4 parallel collectors (nf0, nf1, letterpress, mycljcoll); `_sp_id.6b94` user ID cookie
5. **FullStory** (org `6SG8F`) — session recording on sell/trade flow

**Ad and identity:**
6. **Google Ads / Remarketing** (conversion ID `928301978`)
7. **Facebook Pixel** (ID `2178741032440639`) — `_fbp` cookie; Advanced Matching via `hme=` parameter sends a hashed email to Meta when Carvana has the user's email on record, enabling audience matching without a new form submission
8. **Microsoft UET / Bing Ads** — `bat.bing.com`; `_uetsid` and `_uetvid` cookies
9. **Spotify Audience Network** — config ID `f616167ee261473684db60d401be3001`; fires on homepage, sell page, and VDP
10. **Impact Radius** — `ire` global; `IR_gbd` and `IR_12225` cookies; default affiliate partner ID is `1` (Carvana itself)
11. **Acuity Data / AGKN** — `aa.agkn.com/adscores/g.pixel` fires on every captured page (homepage, sell, get-offer, vehicle) without a consent gate observed in network traffic

**Cross-site identity and direct mail:**
12. **Horizon Next** (`c.hrzn-nxt.com`) — Horizon Media's cross-site identity and audience platform. The script loads on the homepage and initializes via `GlobalSnowplowNamespace` — the same Snowplow bootstrap pattern Carvana uses for its own collectors at `t.getletterpress.com`. Two distinct tracking systems sharing the same initialization framework under one namespace. Network calls to `c.hrzn-nxt.com` were not observed in captured traffic — the tracker loaded but may not have fired during the session window.
13. **Postie** (`scripts.postie.com/jcieptyg`) — direct mail retargeting platform that uses identity resolution to match site visitors to postal addresses and send physical mailers to non-converting visitors. Script loads on the homepage via an inline bootstrap loader using the variable name `letterpress`, which creates naming proximity with Carvana's own Snowplow instance but routes to a separate domain. No Postie network calls were observed in captured traffic — the script loaded asynchronously and may require user interaction or a session threshold to trigger.
14. **DataGrail** (`api.consentjs.datagrail.io`) — consent management platform; `datagrail_consent_id` cookie set on first visit

**Pre-consent behavior:** Before any consent banner interaction, the following are set: `BrowserCookieId` (internal anonymous ID), `CVCurrentCity`, `CVCurrentState`, `CVCurrentZip`, `CVCurrentSource=ipaddress` (IP geolocation with `CVCurrentAccuracyRadius=5`), `_ga`, `_gcl_au`, `_fbp`, `_sp_id.6b94`, `_uetsid`, `_uetvid`, and the AGKN pixel fires.

The `hasOptedOutofThirdPartyDataSharing` cookie stores consent state as unencrypted JSON (`{"hasOptedOutofThirdPartyDataSharing":false,"uid":null,"source":"browser"}`) in a non-HttpOnly cookie. It's client-side readable and writable.

**TCPA consent** is tracked in localStorage: `cvna-consent-Tcpa`, `cvna-consent-CreateAccount`, `cvna-consent-Esign`. Whether these are enforced server-side on form submission is not confirmed from client-side observation alone.

**A/B experiments** are stored in cookies and `window['@carvana/experiment']` with hooks `useExperimentBucket` and `useSetExperimentBucket`. Five active experiments observed on first load:
- `car-merch-ui-factory-upgrades` — treatment
- `car-merch-ui-home-reskin` — treatment
- `car-merch-ui-new-cars-loyalty-incentives-rendered` — treatment
- `car-merch-ui-quali-factory-upgrades` — survey bucket
- `car-merch-ui-quali-home-carvanads` — control

The `quali-` prefix identifies experiments running in the Qualify (financing pre-qualification) flow.

## The AI Layer

Two distinct AI content systems run on the VDP:

**spinnerData narratives:** Each vehicle's `spinnerData.json` (served from `spinnerdata.carvana.io`) includes AI-generated feature descriptions per category and a `car.headline` tagline. These are uniformly positive in tone. The same endpoint also surfaces the raw imperfection data — all documented scratches, dents, and wear zones with photos — making the AI-positive framing and the unvarnished condition record sit in the same JSON response.

**nosidelines chatbot:** The AI chatbot at `descartes-external.ngcp.prod.nosidelines.io/vehicle-questions/` generates suggested questions shown in the VDP's WhyBuy and OwnerReviews sections. The endpoint accepts KBB vehicle ID, Carvana vehicle ID, make/model/trim/year, and a page context parameter. The vendor uses both Carvana's internal vehicle ID and the KBB ID, confirming dual ID usage internally.

## Machine Briefing

Carvana runs Cloudflare WAF on `www.carvana.com` — curl to the main domain returns a 403 challenge. All usable endpoints are on `apik.carvana.io` and associated subdomains, which do not block programmatic access.

### Access & Auth

Most data endpoints work without authentication. Vehicle IDs appear in page URLs (`/vehicle/{id}`). Stock numbers appear in URL slugs and are referenced in VDP HTML. A browser session (Playwright or similar) gets cookie-based geolocation assignment but is not required for the API calls below.

### Endpoints

**Open (no auth, no session required)**

```bash
# Pricing for one or more vehicles
curl -s -X POST https://apik.carvana.io/merch/search/api/v2/pricing \
  -H 'Content-Type: application/json' \
  -d '{"vehicleIds":["VEHICLE_ID"],"zip5":"94105"}'

# All delivery location IDs and windows for a zip
curl -s "https://apik.carvana.io/merch/carvanamerchcontextapi/api/v3/delivery?zip5=94105"

# Distances from all Carvana locations to a zip
curl -s "https://apik.carvana.io/merch/carvanamerchcontextapi/api/v3/distance?zip5=94105"

# Promotional state exclusions
curl -s "https://apik.carvana.io/core/discount/api/v1/discount"

# Vehicle 360 data, imperfections, and AI narratives
curl -s "https://spinnerdata.carvana.io/spinnerdata/{STOCK_NUMBER}/spinnerData.json"

# NHTSA recall data for a vehicle
curl -s "https://apik.carvana.io/merch/vehicledetails/api/v1/recall?vehicleId={VEHICLE_ID}"

# Navigation config
curl -s "https://apik.carvana.io/core/headerapi/api/v2/header"

# Customer reviews from CMS
curl -s "https://apik.carvana.io/stc/cms/api/customer-reviews"
```

**AI chatbot (no auth, third-party infra)**

```bash
curl -s -X POST https://descartes-external.ngcp.prod.nosidelines.io/vehicle-questions/ \
  -H 'Content-Type: application/json' \
  -d '{
    "correlation_id": "test-123",
    "kbb_vehicle_id": "KBB_ID",
    "vehicle_id": "CARVANA_ID",
    "year": "2022",
    "make": "Honda",
    "model": "CR-V",
    "trim": "EX",
    "page": "WhyBuy"
  }'
```

**LaunchDarkly flags (sell/trade context)**

```bash
# Evaluate all sell/trade flags (SDK key in browser JS)
curl -s "https://app.launchdarkly.com/sdk/evalx/661d78ce08ca52101c6d90bd/contexts/eyJraW5kIjoidXNlciIsImtleSI6InN0Yy1ob21lIn0="
# Context is base64 of: {"kind":"user","key":"stc-home"}
```

**Requires ClientId header**

```bash
# Soonest availability (returns 403 without ClientId)
curl -s -X POST https://apik.carvana.io/merch/buffering/api/v1/soonestavailabilitybulk \
  -H 'ClientId: home_ui' \
  -H 'Content-Type: application/json' \
  -d '{"vehicleIds":["VEHICLE_ID"]}'
```

**Requires auth (returns Forbidden)**

```bash
# Factory upgrades — "Unknown requester" error
curl -s "https://apik.carvana.io/merch/merchui/api/factoryupgrades/v1/get?vehicleId={VEHICLE_ID}"
```

### Gotchas

- `www.carvana.com` is WAF-protected — use `apik.carvana.io` directly for API calls
- Vehicle IDs in the pricing API are the same IDs in VDP URLs: `carvana.com/vehicle/{year}-{make}-{model}-{id}`
- Stock numbers (for spinnerdata) differ from vehicle IDs — extract from VDP page HTML
- `isUsingSampleTerms: true` in pricing responses = pre-auth estimates, not final quotes
- The delivery and distance APIs return location IDs (not human-readable names) — correlate against multiple zips to triangulate physical locations
- LaunchDarkly context base64 encoding: standard base64 of a JSON object with `kind` and `key` fields
- `apik.carvana.io` endpoints return CORS headers permitting cross-origin requests from browser contexts
