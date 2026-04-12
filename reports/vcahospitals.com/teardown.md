---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "VCA Animal Hospitals — Teardown"
url: "https://vcahospitals.com"
company: "VCA Animal Hospitals"
industry: "Healthcare"
description: "National veterinary hospital chain with 1,000+ locations, owned by Mars Petcare."
summary: "ASP.NET MVC on Azure behind Cloudflare CDN and WAF, with Sitecore CMS managing content. Enterprise search via Coveo indexes 122k+ documents across master and web Sitecore databases. Google Tag Manager with a server-side proxy on Google Cloud Run routes analytics events server-to-server. Commerce runs through a Coveo-powered shop with payconex.net for payment capture and Vetsource for prescription pharmacy fulfillment."
date: "2026-04-12"
time: "20:45"
contributor: "hayabhay"
model: "sonnet"
effort: "high"
stack: [ASP.NET, Sitecore, Cloudflare, Coveo, Google Tag Manager]
trackers: [Google Analytics, Google Ads, DV360, Facebook Pixel, TikTok Pixel, Microsoft Clarity, StackAdapt, Simpli.fi, Teads, Nextdoor Ads, Reddit Pixel, Bing Ads, New Relic, OneTrust, iovox, eqads]
tags: [healthcare, veterinary, pre-consent-tracking, identity-resolution, session-recording, programmatic-ads, coveo, sitecore, feature-flags, subscription]
headline: "An anonymous token from /coveo/rest/token queries VCA's full 122k-document production index — including prescription drug catalog, per-hospital distribution restrictions, and inventory state."
findings:
  - "Anonymous visitors get a Coveo search JWT from /coveo/rest/token that queries 122,334 production documents — product catalog includes prescription status, backorder state, sale flags, and a per-hospital exclusion list showing which locations cannot sell each product."
  - "Logged-in patients' CRM contact ID is pushed to GTM's dataLayer on every page, flowing directly to Meta, TikTok, StackAdapt, Google, and Bing — enabling cross-platform ad targeting on veterinary patient identity without any additional user action."
  - "Two separate Microsoft Clarity session recording tags run simultaneously on hospital pages, generating 9 POST requests to clarity.ms on the homepage alone — every visit is recorded twice."
  - "A server-side GTM proxy on Google Cloud Run routes GA4 events server-to-server in parallel with direct analytics.google.com calls, bypassing browser-based ad blockers for users who explicitly installed them."
  - "Feature flag names leak in every unauthenticated API error response — IsPaymentFailureFF and a FeatureFlags field are returned in the JSON body of every 401."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

## Architecture

VCA Animal Hospitals runs a multi-layer stack behind a single domain. The backend is ASP.NET MVC on Azure, identifiable from the `ASP.NET_SessionId` cookie and `x-azure-ref` response headers. The CMS is Sitecore — confirmed by URL structure, the Webpack bundle at `/Content-2/js/vca-scripts-us.js`, and the Coveo org ID (`vcaveterinarycentersofamericaproductionlbktxg48`) which includes references to `master` and `web` Sitecore databases in its indexed sources. Cloudflare sits in front as CDN and WAF; most API endpoints return 504 gateway timeouts when hit directly.

Enterprise search runs on Coveo. The JS bundle contains 78 references to Coveo APIs, and the site exposes a token endpoint at `/coveo/rest/token` that issues anonymous JWTs for query execution against the production search index.

The shop (1,037 URLs in the sitemap) is powered by the same Coveo index. Payment capture for the shop and CareClub subscription goes through payconex.net (`https://www.secure.payconex.net` in the CSP). Prescription and medication orders hand off to Vetsource, a veterinary pharmacy fulfillment partner, via `/api/orders/UpdateOrderPaymentToVetsource`.

Additional layers: accessiBe widget for accessibility compliance (`cdn.acsbapp.com`), iovox for phone call tracking (in CSP), and a Google Maps API integration on location-based pages (`AIzaSyCcqT2t1s_YbGglYVcXn3oyG6WDk3hif8o` in JS, likely domain-restricted). The robots.txt lists four sitemaps: corporate (1,278 URLs including hospitals, careclub, and `/acquisitions`), hospitals, kyp (know-your-pet content), and shop.

---

## Consent Architecture and Pre-Consent Tracking

VCA uses OneTrust (tenant `382655f3-0222-41d6-8964-5c2f9c1ee5ff`) for consent management. The configuration has a single consent rule named "VCA Hospitals" that covers all 211 countries globally — the rule is flagged `Default: True` and `Global: True`, meaning it applies to every visitor regardless of jurisdiction.

The rule's consent type is `GDPR`, but the implementation defaults all consent groups to enabled. On first page load with zero user interaction, the `OptanonConsent` cookie is written with `interactionCount=0` and `groups=1:1,2:1,3:1,4:1` — all four groups (1=Strictly Necessary, 2=Performance, 3=Functional, 4=Targeting) enabled. OneTrust fires the `OneTrustGroupsUpdated` GTM event immediately on load (event ID 86 in the GTM sequence), which unblocks every advertising and analytics tag simultaneously.

The net effect: all trackers fire on the first page load before the consent banner is displayed or acknowledged. The banner provides Accept/Reject buttons, but by the time it renders, the tracking has already happened.

Two additional signals confirm the opt-in default posture. First, `IsGPPEnabled: False` — Global Privacy Platform signals are disabled, meaning the site does not process or honor GPP strings from privacy-enabled browsers. Second, `GCEnable: True` — Google Consent Mode is enabled, but with all consent signals defaulting to granted rather than denied.

California visitors are geolocated via `geolocation.onetrust.com/cookieconsentpub/v1/geo/location` before the rule is applied. Despite being in a CCPA-regulated state, they receive the same GDPR-typed rule with opt-in defaults rather than a CCPA-specific opt-out flow.

---

## The Tracker Stack

Across five page types (homepage, hospital finder, emergency care, CareClub, appointment booking), the network baseline is consistent: 38-63 total requests, 1 first-party, 14-15 third-party domains, with zero consent interaction required.

**Identity and Analytics**

Google Analytics 4 runs three separate properties: G-9V187TWY4G, G-F533FQFV93, and a masked G-00000 (observed in session cookies, likely an internal or test property). All send events via both direct `analytics.google.com` POST and the server-side proxy. Google Tag Manager container GTM-PGK9DQ orchestrates everything.

Legacy Universal Analytics is still active — the `__utmz` cookie, from the GA.js era pre-2012, is still being written. This cookie was supposed to be fully deprecated when Universal Analytics sunset in 2023.

Google Ads conversion tracking fires via AW-17067499243, with `/pagead/conversion/10940215339/` and `/pagead/viewthroughconversion/10940215339/` in the network logs. Google Campaign Manager 360 (DV360) runs on DC-16301836, firing `POST /ccm/collect` four times per page and a DoubleClick retargeting pixel at `ad.doubleclick.net/activity;src=16301836;type=ret01;cat=land01`.

**Server-Side GTM Proxy**

`server-side-tagging-kprfcptyga-uc.a.run.app` (where `kprfcptyga` is the GTM server container ID) runs as a Google Cloud Run service. It appears on every page with `GET /g/collect => 200` three times per page, running in parallel with direct `analytics.google.com` and `www.google-analytics.com` requests. The proxy accepts browser-sent events and forwards them server-to-server. Users with ad blockers that filter `analytics.google.com` still have their sessions tracked through this proxy.

**Social Pixels**

- Facebook/Meta pixel: 1882044785414940 (`_fbp` cookie)
- TikTok pixel: D34SKURC77U5SFKTAC00 (`_ttp`, `_tt_enable_cookie`, `ttcsid`, `ttcsid_D34SKURC77U5SFKTAC00` cookies)
- Reddit pixel: a2_gvk9aqsp9854 (`_rdt_uuid` cookie, `pixel-config.reddit.com` network call)
- Nextdoor ads: 74d0af77-9388-4ee9-807e-145721290e23 (`ndp_session_id` cookie, `ads.nextdoor.com` network call)
- Microsoft Bing Ads UET: 4030889 (`_uetsid`, `_uetvid` cookies)

**Programmatic DSPs**

- StackAdapt: `tags.srv.stackadapt.com/saq_pxl` and `/js_tracking` on every page
- Simpli.fi: `tag.simpli.fi/sifitag/7d5b03c0-ae0d-0135-402e-067f653fa718` + `i.simpli.fi/p?cid=75071` (behavioral and geo-targeted retargeting)
- Teads: `p.teads.tv/teads-fellow.js` (video ad network)
- eqads.com: `ads2.eqads.com/pt?js=1&adv=13650&cid=1366` (programmatic network)

**Session Recording**

Microsoft Clarity runs two separate tag instances simultaneously on hospital pages: `q7twhifqm5` and `k5y3d0i5vn`. On the homepage alone, Clarity generates 9 POST requests to `b.clarity.ms/collect`. Two simultaneous instances of session recording means every session is captured twice — likely an artifact of hospital-specific and corporate-level tags both firing, but the duplication is unambiguous in the network traces.

**Observability**

New Relic Browser Agent (license key `NRJS-44585c5de0cd3ad077b`) fires to `bam.nr-data.net` with 5-7 requests per page: RUM data, events, JS errors, and browser blob storage. The `NRBA_SESSION` key is written to localStorage.

**Call Tracking**

iovox appears in the CSP (`*.iovox.com`) but is not observed in baseline page load network traces — it is likely injected by GTM on phone number interactions or page-specific conditions.

**Consent Management**

OneTrust (`cdn.cookielaw.org`) loads 4 endpoints per page: the tenant config, the geo rule, and two UI asset files (`otFlat.json`, `otPcTab.json`).

---

## Identity Resolution

Several identity mechanisms layer on top of each other.

Four versions of `sa-user-id` are set simultaneously as both cookies and localStorage entries: `sa-user-id`, `sa-user-id-v2`, `sa-user-id-v3`, `sa-user-id-v4`. The `sa-` prefix is consistent with StackAdapt's analytics identity library, which maintains multiple ID formats for interoperability with different DSPs and bidding systems. (Inferred -- vendor attribution not confirmed in evidence.) The v1-v4 progression suggests distinct encoding schemes, allowing the ID to be passed to platforms with different ID format requirements without transformation.

Microsoft UET cookies (`_uetsid`, `_uetvid`) are stored in both cookies and localStorage alongside the `sa-user-id` tokens.

For logged-in users, VCA pushes the patient's CRM contact ID into every page's GTM dataLayer via `user.contactid`. When populated, this value flows automatically to all GTM tags that read the dataLayer: GA4, Meta pixel, TikTok pixel, StackAdapt, Bing Ads UET, and any others configured to consume dataLayer variables. This enables cross-platform identity matching on veterinary patients -- the same contact ID can be used to build Custom Audiences on Meta and TikTok, match to Bing's identity graph, and fuel StackAdapt's behavioral targeting, all without additional instrumentation.

The dataLayer on hospital pages carries a full per-location context:

```json
{
  "hospital-au": "857",
  "hospital-type": "GP",
  "region-id": "SC05",
  "group-id": "SC",
  "appt-tool": "book",
  "offer-variant": "free first exam",
  "myvca-enabled": "true",
  "ccde-enabled": "false"
}
```

`hospital-au` is the internal hospital identifier (857 for 29 Palms, 966 for Advanced Vet Care Center CA). `appt-tool` indicates whether online booking is enabled (`"book"`) or contact-only (`"contact"`) for that location. `offer-variant: "free first exam"` is the promotional assignment, written to the `APOfferSubmission` cookie (set to `0` on first load) to track offer completion state. `myvca-enabled` and `ccde-enabled` are per-hospital feature flags: on corporate pages both are `false`; on hospital-specific pages, `myvca-enabled` flips to `true`, enabling the patient portal integration for that location.

GPU information is stored in localStorage as `gpuInfo` with vendor and renderer strings (`{"vendor":"Google Inc.","renderer":"ANGLE (Google, Vulkan 1.3.0 ...)"}`). GPU vendor and renderer strings are stable across sessions and, combined with other signals, can contribute to a persistent device fingerprint. The New Relic Browser Agent is the most likely source -- this is common in RUM implementations for device capability profiling. (Inferred -- not directly confirmed from saved evidence.)

---

## Coveo Search Index

`/coveo/rest/token` returns a valid JWT for anonymous users without authentication:

```json
{
  "organization": "vcaveterinarycentersofamericaproductionlbktxg48",
  "userIds": [{"type": "User", "name": "anonymous", "provider": "Email Security Provider"}],
  "roles": ["queryExecutor"],
  "iss": "SearchApi"
}
```

This token grants read access to the production Coveo organization. A request to `platform.cloud.coveo.com` with this token returns a total document count of 122,334 across three sources:

- `Coveo_master_index - prd.vcahospitals.com` -- 63,828 documents (Sitecore master/editorial database)
- `Coveo_web_index - prd.vcahospitals.com` -- 54,954 documents (Sitecore web/published database)
- `VCA Master Prod` -- 3,552 documents

The dual Sitecore database indexing (`master` and `web`) confirms the CMS architecture: content flows from Sitecore master (editorial staging) to web (published), and both are indexed in the anonymously accessible search. The `master` source -- containing draft and editorial content -- is present alongside published content.

The product catalog is fully queryable. Each product document includes:

- `listprice` -- publicly listed price (e.g., $25.38 for Simparica Trio, $21.06 for Revolution Plus)
- `practiceprices` -- per-hospital pricing structure keyed by `PracticeId` and `VariantId`. For anonymous users, practice-specific prices are `0.0`; the field is populated but zeros out. These may be populated for authenticated sessions.
- `disallowedhospitalids` -- hospitals that cannot sell the product, as a semicolon-delimited list of IDs (e.g., `[187];[351];[705];[709];[746];[953];[4040];[6009]` for Simparica Trio)
- `prescriptionrequired` -- `"Yes"` for prescription products
- `backordered` -- boolean inventory status
- `promotionmessage` -- e.g., `"Promos Available"`
- `onsaleproduct` -- e.g., `"On Sale"`

The `disallowedhospitalids` field is notable: it is a per-product hospital exclusion list, exposing VCA's internal distribution restrictions. Combined with the hospital IDs from the dataLayer, this maps which products are available at which locations -- information that is otherwise only visible to logged-in users browsing each hospital's shop.

---

## API Surface

**Emergency Care Virtual Queue**

Three endpoints support public-facing emergency queue management, all accessible without authentication:

- `GET /ec-api/get-virtual-wait-time` -- returns `{"Data":null,"StatusCode":0}` on corporate pages
- `GET /urgentcare-api/get-virtual-wait-time?id={hospitalId}` -- returns full wait time response: `waitingTimeInMinutes`, `isOpen`, `minWaitTime`, `maxWaitTime`, `clientSignup` flag
- `GET /ec-api/virtualline/issuetypes` -- emergency issue type catalog (returns `{"Data":null}` without hospital context)
- `POST /ec-api/virtualline/waitlistqueuerequest` -- join virtual queue

Public access is by design for emergency patient intake. The urgentcare API requires a hospital ID in the query string; the corporate API requires a hospital context configured in the CMS.

**NCA Lead Generation**

`/api/NCA/GetOfferHospitals` accepts unauthenticated bounding box queries:

```
GET /api/NCA/GetOfferHospitals?MinLat=&MaxLat=&MinLong=&MaxLong=
```

With valid coordinates, this returns hospitals in a geographic area offering the "free first exam" promotion. The NCA system collects: `NCAFirstName`, `NCALastName`, `NCAEmail`, `NCAPhoneNum`, `NCAZip`. Form submission flows through `/api/NCA/SubmitNCAForm` into `/api/NCA/UpdateLeadTable` (CRM write). Offer submission goes through `/api/NCA/SubmitOfferForm`.

**CareClub Payment Flow**

CareClub is VCA's wellness subscription plan. Payment capture runs through:

```
POST /api/careclub/initpaycapture  ->  payconex.net tokenization
POST /api/careclub/savecard
POST /api/careclub/renew
```

**Feature Flag Leakage**

All API endpoints return a consistent error schema for unauthorized requests:

```json
{
  "Success": false,
  "Data": null,
  "ErrorCode": null,
  "ErrorMessage": "Not Authorized",
  "RedirectUrl": null,
  "IsPaymentFailureFF": false,
  "FeatureFlags": null
}
```

`IsPaymentFailureFF` is a live feature flag state returned to unauthenticated callers. Two additional flag names are in the JS bundle: `IsOHPaymentFailureFF` and `IsUpdatePaymentMethodForPaymentFailureOrderStatusFF`. The `FeatureFlags` field is null when unauthenticated -- the structure suggests it populates with additional flags for authenticated sessions.

**Shop**

The shop page triggers Cloudflare Turnstile challenges (13 challenge-platform requests observed). Product browsing works, but add-to-cart and checkout require authentication. Cart endpoint at `/api/cart` returns the same feature flag schema for unauthenticated requests.

**Acquisitions**

`/acquisitions` and `/acquisitions/thank-you` are listed in the corporate sitemap -- M&A landing pages for veterinary practices considering selling to VCA (a Mars Petcare subsidiary). The `APOfferSubmission` cookie tracks acquisition offer form submissions alongside the new client acquisition offers.

---

## Security Posture

**In place:** HSTS with `includeSubDomains` and `preload`. `x-content-type-options: nosniff`, `x-frame-options: SAMEORIGIN`, `referrer-policy: strict-origin`. Cloudflare WAF protecting the origin. Auth enforced for all patient data APIs (`/api/account`, `/api/cart`, `/api/orders`). Turnstile bot detection on the shop.

**Notable gaps:**

- CSP is present but rendered largely ineffective by `unsafe-eval` and `unsafe-inline` in the `default-src` directive.
- `permissions-policy: geolocation=*` allows all origins to request geolocation -- overly broad for a site where only Google Maps legitimately needs location.
- Google Maps API key `AIzaSyCcqT2t1s_YbGglYVcXn3oyG6WDk3hif8o` is embedded in the JS bundle. Likely restricted to the `vcahospitals.com` domain via the API console, but the key itself is exposed.
- Feature flag names in unauthenticated API error bodies are not sensitive on their own, but they signal internal implementation details.
- Coveo anonymous token issuance is a design choice enabling site search without login, but the same token grants access to 122k+ production documents including prescription product catalog and hospital distribution rules.

---

## Machine Briefing

**Access & auth**

Most content pages and all product search work without any session. The shop, emergency widget, and find-a-hospital use public endpoints. Patient data (`/api/account`, `/api/cart`, `/api/orders`) requires an authenticated `ASP.NET_SessionId` cookie via login at `/login`. Cloudflare WAF blocks direct API probing on some endpoints; the shop page triggers Turnstile bot challenges.

**Endpoints**

Open (no auth required):

```
# Coveo anonymous token
GET https://vcahospitals.com/coveo/rest/token
# Returns JWT for platform.cloud.coveo.com queries

# Coveo search (use token from above)
POST https://platform.cloud.coveo.com/rest/search/v2
Authorization: Bearer {jwt_from_above}
Content-Type: application/json
{"q": "*", "numberOfResults": 10, "firstResult": 0}
# 122,334 total documents, includes product catalog

# OneTrust consent config
GET https://cdn.cookielaw.org/consent/382655f3-0222-41d6-8964-5c2f9c1ee5ff/{rule_id}/en.json

# OneTrust geo
GET https://geolocation.onetrust.com/cookieconsentpub/v1/geo/location

# NCA hospital lookup (requires valid campaign context to return data)
GET https://vcahospitals.com/api/NCA/GetOfferHospitals?MinLat=37.7&MaxLat=37.8&MinLong=-122.5&MaxLong=-122.3

# Emergency wait time by hospital ID
GET https://vcahospitals.com/urgentcare-api/get-virtual-wait-time?id={hospitalId}
# hospitalId 857 = 29 Palms, 966 = Advanced Vet Care Center CA

# Emergency virtual queue issue types (needs hospital context)
GET https://vcahospitals.com/ec-api/virtualline/issuetypes

# Generic wait time (corporate pages)
GET https://vcahospitals.com/ec-api/get-virtual-wait-time
```

Auth-required (returns feature flag schema on 401):

```
GET https://vcahospitals.com/api/cart
GET https://vcahospitals.com/api/account
GET https://vcahospitals.com/api/orders
POST https://vcahospitals.com/api/careclub/initpaycapture
POST https://vcahospitals.com/api/NCA/SubmitNCAForm
# body: NCAFirstName, NCALastName, NCAEmail, NCAPhoneNum, NCAZip
```

**Gotchas**

- The Coveo token is short-lived (~24 hours based on JWT iat/exp fields). Fetch fresh before each session.
- `/api/NCA/GetOfferHospitals` returns "No hospitals found" for most bounding boxes -- the endpoint requires an active promotional campaign context on the CMS side.
- The shop triggers Cloudflare Turnstile on load -- automated browsers will need to handle challenge flows.
- `practiceprices` in Coveo product results has the per-hospital price structure but all values are `0.0` for anonymous tokens; list prices are accurate.
- `IsPaymentFailureFF` appears in every error JSON response as a boolean -- not a real gate, just a leaked flag name.
- Two GA4 endpoints fire simultaneously: `analytics.google.com` and the server-side proxy `server-side-tagging-kprfcptyga-uc.a.run.app`. If testing outbound analytics, both will receive calls.
