---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "Denny's — Teardown"
url: "https://dennys.com"
company: "Denny's"
industry: "Hospitality"
description: "American diner chain serving breakfast and comfort food 24/7"
summary: "dennys.com runs Drupal 11 on Acquia for content pages, with an Angular SPA embedded for ordering flows powered by NomNom Networks (now Olo). The ordering app is a Capacitor hybrid — the same codebase compiles to iOS, Android, and web, shipping every platform's secrets in one JS bundle. Cloudflare and Varnish handle CDN and caching. Punchh manages loyalty auth; Datatrans and Olo Checkout handle payment tokenization."
date: "2026-04-12"
time: "06:55"
contributor: "hayabhay"
model: "sonnet-4.6"
effort: "high"
stack: [Drupal 11, Angular, NomNom, Cloudflare, Acquia, Capacitor]
trackers: [FullStory, Glassbox, Google Analytics, mParticle, Braze, Optimizely, Firebase, Azure Application Insights, OneTrust]
tags: [ordering-api, session-recording, consent-bypass, exposed-secret, open-api, drupal, hybrid-app, feature-flags, loyalty, pci]
headline: "Denny's production JavaScript ships a Facebook OAuth app secret alongside dev API URLs, sandbox payment endpoints, and full configs for 15 third-party services."
findings:
  - "The production JS bundle contains the Facebook OAuth client secret (facebookSecret) in plain text — a server-side credential that allows generating app access tokens and calling the Graph API on behalf of Denny's Facebook app."
  - "The NomNom ordering API requires zero authentication and sets Access-Control-Allow-Origin: * — one unauthenticated curl returns all 1,246 restaurant locations with phone numbers, GPS coordinates, real-time open/closed status, delivery fees, and supported payment types."
  - "A public dev API at nomnom-dev-api.dennys.com exposes unreleased feature flags and a staged blackout modal for a rewards platform migration titled 'The ALL New Denny's Rewards' — complete with service-unavailability messaging and launch CTAs."
  - "Two session recorders — FullStory and Glassbox — run simultaneously, and the OneTrust consent callback is literally an empty function, so toggling consent preferences changes nothing about what gets recorded."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

dennys.com serves two distinct technical surfaces from a single domain. The marketing and content layer is Drupal 11, hosted on Acquia's cloud infrastructure (`dennys.prod.acquia-sites.com`). The ordering, menu, and location flows are an Angular single-page application powered by NomNom Networks — NomNom was acquired by Olo, and the API hostname reflects the transition in progress (`nomnom-prod-api.dennys.com`). The two surfaces are stitched together: Drupal serves the shell, and the Angular SPA loads within it. Cloudflare provides CDN and bot protection; Varnish handles caching upstream.

The Angular ordering codebase is a Capacitor hybrid — the same source compiles to iOS (`com.dennys.mobile`), Android (`com.dennys.mobile`), and web. The JS bundle running in the browser contains Cordova/Capacitor plugin references, iOS/Android-specific code paths, and separate Braze API keys for each platform. This matters because the web bundle carries every mobile secret the app uses.

## The Config Block

The ordering SPA's main JS bundle (`main.3bb457d55de205f1.js`) includes a large JSON block parsed inline at startup. It contains the full production configuration for every third-party service the platform depends on — and one server-side credential that has no business being there.

**Facebook App Secret.** The production config includes:

```json
"facebookAppId": "1337073813468463",
"facebookSecret": "bf89181a4d4c33d8da4b6fab8e4dcad5"
```

`facebookSecret` is the OAuth client secret for the Facebook app. This is a server-side credential — it's used to generate app access tokens, validate signed requests, and authorize server-to-server Graph API calls. It should never appear in client code. Any visitor to dennys.com can read it from the page source. With the app ID and secret together, it's possible to generate app access tokens and call the Graph API on behalf of the app.

Beyond the secret, the config block is a complete service dependency map:

| Service | Key / Value |
|---------|-------------|
| Firebase | `apiKey: AIzaSyClqQ98rEXkRJQ1rq7Fv9JXY08xhvCxRXo`, project `dennys-9a5af` |
| Google Maps | `AIzaSyD8NEf_r4udthNORg56TfhNDOrp91nZyvc` |
| Braze web | `da84a85a-5d69-4899-8fec-87255945b5ca` |
| Braze iOS | `de189de9-1ea3-4fb0-8054-4a085d55353d` |
| Braze Android | `8ee498fc-b92e-4bd5-9e48-f935914d864f` |
| AWS Cognito | pool `us-east-1_mvKJs400M`, client `2a54p237989t9vrsgt68bfrgqo` |
| Punchh (loyalty) | client ID `a3c406d0...166a3f0c` |
| OLO Checkout | brand access ID `F9tsq6BEAAPiFt8zGm7OkOOaVNZmnXJg` |
| Datatrans (PCI Proxy) | merchant ID `3000018177` |
| mParticle web | `us2-50ef143cc79ca54091c6c1f781eab1f2` |
| mParticle iOS | `us2-2b7a9e35e71ee34a94accdb1e8a3a677` |
| mParticle Android | `us2-0c2f4bc6439f2e46a60532cccd71edf7` |
| Cloudflare Turnstile | `0x4AAAAAAA0IAybETvzsqoD4` |
| Glassbox | app ID `39d36758-1ff8-42c2-b682-9e5c5062b2d8` |

Most of these are client-side SDK keys designed to be public — Firebase API keys, Google Maps keys, Braze SDK keys, and Turnstile site keys all authenticate against per-domain or per-project rules server-side. The Datatrans merchant ID and OLO brand access ID are semi-public identifiers for payment tokenization flows. The Cognito pool ID and client ID together allow unauthenticated identity pool calls if the pool permits them. The Facebook App Secret is the exception: it is a server-side secret, not a client-side key.

**Prod and dev configs in the same bundle.** Adjacent to the production config in the same JS file is a dev/local config block:

```json
"apiBaseUrl": "https://nomnom-dev-api.dennys.com",
"merchantIdentifier": "merchant.com.dennys.prelive",
"pciProxyJs": "https://pay.sandbox.datatrans.com/...",
"pciProxyMerchantId": "1100016502",
"oloCheckoutJs": "https://olocdnsandbox.s3.amazonaws.com/...",
"oloCheckoutBrandAccessId": "KUQqh3UI5baaaSjHN7rjzu6Z08OMQaPw",
"tagManagerIds": ["GTM-PBDZ23N"],
"punchhEndpoint": "https://sandbox.punchh.com/..."
```

The runtime selects between them based on environment detection, but both ship in every bundle delivered to every browser. The dev references — dev API hostname, sandbox payment URLs, dev GTM container — expose the full non-production topology.

Additional config details: `hiddenLocationExtRefs: ["999"]` filters a specific location from search results. Apple Pay merchant IDs are `merchant.com.dennys.prod` (production) and `merchant.com.dennys.prelive` (dev). Braze SMS subscription group: `925f68b0-9187-4413-a2a0-dc4277e9f7fd`.

## The NomNom API

The NomNom ordering API (`https://nomnom-prod-api.dennys.com`) has no authentication on read endpoints and sets `Access-Control-Allow-Origin: *` — any website or client can call it cross-origin without credentials.

**Restaurants.** A single unauthenticated request returns all 1,246 Denny's locations:

```
GET https://nomnom-prod-api.dennys.com/restaurants/near?lat=37.77&long=-122.41&radius=5000
```

Each restaurant record includes: ID, name, full address, phone number, GPS coordinates, timezone, `iscurrentlyopen` (real-time status), `candeliver`, `canpickup`, delivery fee, minimum order amounts, supported payment types, curbside support, and custom fields for curbside vehicle make/model/color. The `extref` field maps to the internal location reference code. At time of collection, approximately 1,100 of 1,246 locations were open.

**Menu.** Restaurant-specific menu, also unauthenticated:

```
GET https://nomnom-prod-api.dennys.com/restaurants/36847/menu
```

Returns 18 categories and 122 products. Each product includes: ID, name, chain product ID, cost, base and max calories, description, image URLs, availability windows, handoff mode restrictions, and slug. Modifier groups and options are nested within each product.

**Feature flags and content modals:**

```
GET https://nomnom-prod-api.dennys.com/content/type/DennysFeature/list
GET https://nomnom-prod-api.dennys.com/content/type/DennysContentModal/list
GET https://nomnom-prod-api.dennys.com/content/type/DennysOption/list
```

`DennysOption` returns internal config values including `Opt-In_Modal_Version: "1"` and `Logger:LogLevel: "warn"`.

Auth-required endpoints return 401 correctly: `/users/getbillingaccounts`, `/users/contactinfo`.

No rate limiting was observed across sequential requests; response times were consistent at ~0.7-0.9 seconds.

### The Dev API

`https://nomnom-dev-api.dennys.com` is publicly accessible with the same zero-auth, open-CORS policy as production. It hosts 9 restaurant records, all clearly test entries — including "Denny's Austin Test" with telephone `(212) 555-1234` and `extref: 99998`.

The dev `DennysFeature` list exposes unreleased feature flags:

| Flag | Status | Created |
|------|--------|---------|
| `pre-blackout-modal` | disabled | 2025-07-17 |
| `autologout` | disabled | 2025-05-22 |
| `temporary_promo` | enabled | 2025-11-13 |
| `Opt-In_Modal_Version` | enabled | 2026-01-21 |
| `asdf` | enabled | 2025-05-22 |

The `asdf` entry is a test flag left in the dev environment. The `autologout` flag suggests a forced session expiration feature not yet deployed to production.

The dev `DennysContentModal` endpoint returns staged content for a rewards platform migration. The "blackout" modal reads:

> **Big Things Cooking!** — The ALL New Denny's Rewards
>
> While we prepare your exciting new rewards experience, access to your Denny's account will be temporarily unavailable.
>
> [Start Order]

This modal was created 2025-07-23 and last updated 2025-08-15. The `stylingVars: "blackout"` field triggers a specific visual treatment. The `pre-blackout-modal` feature flag was created two weeks earlier, suggesting the rewards relaunch was originally slated for summer/fall 2025 and has been deferred.

## Surveillance

### Consent That Does Nothing

dennys.com runs OneTrust (domain UUID `3a3c2b8f-6524-42aa-a275-068d07f56cb7`) as its consent management platform. OneTrust detects visitor jurisdiction via geolocation — at time of investigation this returned US/California, placing the session under CCPA. The consent cookie observed was:

```
OptanonConsent=groups=C0001:1,SSPD_BG:0,C0002:0,C0004:0
```

Only strictly necessary cookies (C0001) enabled, with analytics, targeting, and functional categories explicitly off.

The consent UI is wired to `OptanonWrapper` — a callback function that OneTrust calls when consent preferences change. On dennys.com:

```javascript
function OptanonWrapper(){}
```

The function is empty. Consent preference changes have no downstream effect. No trackers are gated, blocked, or signaled. The consent banner is UI without implementation.

### FullStory

FullStory (org `o-236GB6-na1`) fires immediately on homepage load, before any interaction with the consent banner. Network logs show `POST /rec/page` and `POST /rec/bundle/v2` to `rs.fullstory.com` during initial page load. Two session recording cookies are set pre-consent: `fs_lua` and `fs_uid`.

The FullStory configuration includes element-level recording rules: input fields, password fields, credit card autocomplete fields, and elements with `.fs-exclude` are blocked from capture. Elements with `.fs-unmask` are explicitly unmasked. This is a configured deployment — but the empty OptanonWrapper means it runs regardless of what the user selects in the consent banner.

### Glassbox

A second session recorder runs alongside FullStory. Glassbox is configured in the Angular app config:

```json
"glassbox": {
  "enabled": true,
  "scriptUrl": "https://cdn.gbqofs.com/dennys/u/detector-dom.min.js",
  "reportUri": "https://report.dennys.gbqofs.io",
  "appId": "39d36758-1ff8-42c2-b682-9e5c5062b2d8"
}
```

Glassbox focuses on the ordering flows — it was not observed firing on static content pages (Drupal side), while FullStory fires on both. The two recorders capture overlapping but not identical surfaces. Neither is gated by consent.

### mParticle

mParticle (web key `us2-50ef143cc79ca54091c6c1f781eab1f2`) fires `POST /v1/identify` to `identity.mparticle.com` on every menu/ordering page load. This is the cross-device identity resolution call — it sends available identifying signals to resolve a unified user profile across devices. Following identification, events are batched and sent to `jssdks.mparticle.com` at 10-second intervals.

### Braze

Braze (`sdk.iad-07.braze.com`) handles CRM and push messaging, firing on menu page loads. SMS subscription group ID: `925f68b0-9187-4413-a2a0-dc4277e9f7fd`.

### Optimizely

Optimizely (project `6665206621798400`, account `12600010354`) fires on menu and order pages. The event vocabulary reveals the A/B testing surface:

| Event | Description |
|-------|-------------|
| `dennys_purchase_pickup` | Pickup conversion |
| `dennys_purchase_delivery` | Delivery conversion |
| `dennys_purchase_any` | Any purchase conversion |
| `dennys_menu_add_to_cart` | Cart additions |
| `dennys_begin_checkout` | Checkout starts |
| `scrolling_nav_click` | Navigation interaction |
| `_rpx__pdp_views` | Product page views |

The full purchase funnel — from menu browsing through channel-split conversions — is instrumented as Optimizely events.

### Firebase

Firebase (project `dennys-9a5af`) fires Remote Config and Installations calls on menu/order pages. Firebase Analytics is explicitly disabled in config (`enableFirebaseAnalytics: false`), but Remote Config and Installations requests still fire.

### Azure Application Insights

On the `/locations` page only, Azure Application Insights fires telemetry to `eastus-1.in.applicationinsights.azure.com`. Instrumentation key: `f4af3705-0a09-41ce-8067-10edcf8f2db3`. This is the only page where Application Insights appears — it does not load on the Angular ordering flows.

### Google Analytics

Google Analytics fires via GTM (`GTM-MT93R3Z`) on menu, order, and locations pages. Not present on the homepage.

## Infrastructure Signals

Response headers leak internal configuration:

- `X-Powered-By: Express` — Node.js Express sits between Cloudflare and Drupal
- `x-generator: Drupal 11` — CMS version advertised in every response
- `x-ah-environment: prod` — Acquia environment identifier
- `x-nomnom-encoding: utf8` — NomNom middleware fingerprint
- `X-BNTS-TEST: PROD-DRUP` — internal test header, value suggests a routing system distinguishing production Drupal from other environments
- `via: varnish` — Varnish cache layer

**HSTS.** `strict-transport-security: max-age=1000` on `www.dennys.com` and `es.dennys.com`. One thousand seconds is approximately 17 minutes — orders of magnitude below the recommended minimum of 31,536,000 (one year). The `includeSubDomains` directive is absent. Browsers will not cache the HSTS policy across sessions.

**Backend hostname.** 404 error pages reveal `dennys.prod.acquia-sites.com` as the Acquia backend. That hostname responds directly with `401 Basic Auth` (`WWW-Authenticate: Basic realm="Hello!"`). The URL is discoverable without scanning.

**Sitemaps.** The main sitemap covers 203 URLs across news, blog, and promotional pages. Notable slugs: `/jensen-huang-dennys-story-his-favorite-order-how-make-it`, `/nvidiafreecoffeeterms`, `/rewards-matrix`, `/den`, `/afterlife`. The ordering sitemap covers 6 canonical URLs for the Angular SPA.

## Machine Briefing

### Access and Auth

The NomNom ordering API has no authentication on read endpoints. All requests below work with a plain `curl` or `fetch`. The Drupal content layer requires no auth for public pages. User account endpoints (`/users/*`) correctly return 401 without a session token.

The Angular SPA authenticates via Punchh OAuth2. The Punchh authorize endpoint is `https://api2.punchh.com/oauth/authorize` with client ID `a3c406d0e0d7ba094cb754cd689a2fdbc275821fa39ce7b1ca2d1706166a3f0c`.

### Endpoints

**NomNom Production API** — `https://nomnom-prod-api.dennys.com` — no auth, `CORS: *`

```bash
# All restaurants (1,246 locations)
curl "https://nomnom-prod-api.dennys.com/restaurants/near?lat=37.77&long=-122.41&radius=5000"

# Single restaurant with full config
curl "https://nomnom-prod-api.dennys.com/restaurants/36847"

# Restaurant menu (18 categories, 122 products)
curl "https://nomnom-prod-api.dennys.com/restaurants/36847/menu"

# Allergy/food safety disclaimers
curl "https://nomnom-prod-api.dennys.com/restaurants/36847/disclaimers"

# Live feature flags
curl "https://nomnom-prod-api.dennys.com/content/type/DennysFeature/list"

# Live content modals
curl "https://nomnom-prod-api.dennys.com/content/type/DennysContentModal/list"

# System config values
curl "https://nomnom-prod-api.dennys.com/content/type/DennysOption/list"
```

**NomNom Dev API** — `https://nomnom-dev-api.dennys.com` — no auth, `CORS: *`

```bash
# Dev feature flags (includes unreleased flags)
curl "https://nomnom-dev-api.dennys.com/content/type/DennysFeature/list"

# Staged content modals (rewards migration blackout modal)
curl "https://nomnom-dev-api.dennys.com/content/type/DennysContentModal/list"

# Dev restaurant records (9 test entries)
curl "https://nomnom-dev-api.dennys.com/restaurants/near?lat=37.77&long=-122.41&radius=5000"
```

**Drupal Content**

```bash
# Sitemap index
curl "https://www.dennys.com/sitemap_index.xml"

# robots.txt
curl "https://www.dennys.com/robots.txt"
```

### Gotchas

- The `restaurants/near` endpoint returns up to the radius-based limit. A radius of 5,000 miles from a central US coordinate returns all 1,246 locations in one response.
- No pagination observed on restaurant or content endpoints.
- No rate limiting observed — sequential requests return consistent 200s at ~0.7-0.9 seconds.
- The restaurant `id` in the NomNom API (e.g., `36847`) is the internal NomNom restaurant ID, not the publicly displayed store number.
- Cloudflare Turnstile (`0x4AAAAAAA0IAybETvzsqoD4`) is only injected on checkout flows, not on read endpoints.
- `drupalSettings.nomnom.baseUrl` is `https://nomnom-prod-api.dennys.com`; the JS app config uses `https://nomnom-prod.dennys.com` as `apiBaseUrl`. Both resolve to the same NomNom infrastructure.
- GTM container `GTM-MT93R3Z` is production; `GTM-PBDZ23N` is dev — both are in the bundle.
