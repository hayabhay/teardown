---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "Grab — Teardown"
url: "https://grab.com"
company: Grab
industry: Transportation
description: "Southeast Asia ride-hailing, food delivery, and fintech superapp."
summary: "Grab's public infrastructure splits into two surfaces: a WordPress 6.4.7 marketing site (CloudFront CDN, FastCGI cache, Elementor Pro, 226 WP REST routes across 17 namespaces) and food.grab.com (NextJS SSR + Redux, Workbox service worker), both backed by internal services at portal.grab.com and p.grab.com behind rate-limited proxies. Auth runs through GrabID (internal OAuth) with httpOnly ALB cookies. Analytics is two-track: Grab's own Scribe Web SDK and MCD Gateway on every page, plus a GTM-fragmented ad stack across four containers."
date: 2026-04-07
time: "18:49"
contributor: hayabhay
model: sonnet-4.6
effort: high
stack:
  - WordPress
  - NextJS
  - CloudFront
  - Redux
  - Elementor Pro
  - OneTrust
trackers:
  - Google Analytics
  - Google Ads
  - Facebook Pixel
  - Twitter Pixel
  - Hotjar
  - Yahoo Advertising
  - Outbrain
  - Taboola
  - AppsFlyer
  - Oracle Eloqua
  - Audigent
  - DoubleClick
  - Grab Scribe SDK
  - GTM
tags:
  - superapp
  - southeast-asia
  - ride-hailing
  - food-delivery
  - fintech
  - wordpress
  - nextjs
  - consent-management
  - identity-graph
  - multi-market
headline: "Grab's food app ships a dev-environment auth URL (food.grab.dev:3000) and disabled reCAPTCHA to every user's browser in production."
findings:
  - "The production food app's runtimeConfig hardcodes APP_GRABID_PROXY_URL to food.grab.dev:3000 -- a development domain with live DNS -- in the __NEXT_DATA__ payload shipped to every visitor, one feature flag flip from routing auth traffic to a dev environment."
  - "The food ordering app runs with disableRecaptcha set to true in its Redux feature flags, relying entirely on proxy-layer rate limiting to gate unauthenticated flows including restaurant browsing and order placement."
  - "An unauthenticated WordPress endpoint at /wp-json/dss3/cities returns 509 cities with 89 unique service codes -- a queryable map of Grab's city-level product deployment across all eight markets."
  - "OneTrust is configured opt-out for Singapore, Indonesia, Malaysia, Vietnam, Myanmar, and Cambodia -- all four consent categories pre-enabled on first visit, firing Oracle Eloqua CRM cookies and Audigent's identity graph before any user interaction."
---

Grab operates one of Southeast Asia's largest superapps -- ride-hailing, food delivery, grocery, fintech, insurance -- across eight countries. The public-facing infrastructure splits into two distinct technical surfaces: a WordPress marketing site at www.grab.com and a NextJS food ordering app at food.grab.com, with internal backend services behind rate-limited proxies.

---

## Architecture

www.grab.com runs WordPress 6.4.7 with Elementor Pro (3.20.2) and a suite of custom plugins. Responses carry `x-fastcgi-cache: HIT` and `server: nginx`, confirming FastCGI caching in front of the WP process. CloudFront handles CDN (pop: SFO53-P1). The link header on every page response exposes the WordPress REST API root at `https://www.grab.com/wp-json/` -- 226 registered routes across 17 namespaces including custom Grab namespaces (`dss3`, `safetyapi`, `blogapi`, `blog-content`, `api`).

The NextJS surface covers food.grab.com and several marketing subpages (`/sg/grabunlimited/`, `/sg/sustainability/`, `/sg/attractions/`, `/sg/discover/`) using the build ID `pzYhStJV5nFwHJbaHCpLm`. The food app uses its own build ID (`n9h8ifzFXwy0MdA64sfdv`) with Redux state management and a Workbox 5.1.4 service worker scoped to the entire `https://food.grab.com/` origin. engineering.grab.com is GitHub Pages -- separate infrastructure entirely.

Auth runs through GrabID, Grab's internal OAuth service. Session state is managed via httpOnly AWS ALB cookies (`AWSALB`, `AWSALBCORS`). The food app's backend APIs are hosted at `portal.grab.com` (foodweb) and `p.grab.com` (passenger API, delivery platform) -- both return 502 when hit directly, indicating internal hosts not exposed to the public internet.

WordPress plugin versions are visible in asset query strings: Elementor 3.20.3, Elementor Pro 3.20.2, Instagram Feed 6.2.2, WP-Ulike 3.5.0 (an unusual "like button" plugin for a corporate superapp marketing site, suggesting the WP install may have started as a blog), TranslatePress 2.5.7. The admin AJAX endpoint is referenced in `window.ElementorProFrontendConfig` at `https://www.grab.com/sg/wp-admin/admin-ajax.php`. The frame-ancestors CSP allows `splytech.io` and `*.splytech.io` -- an internal vendor tool resolving to GCP (34.107.180.165), permitted to embed grab.com pages.

Grab has a public HackerOne program documented in `/.well-known/security.txt`.

Notable globals on the marketing site:
- `window.GrabWidgets.common.googleMapKey = "AIzaSyCgRrs0DnYlw1GOmr5iuZu5CCnM69hqZCQ"` -- Maps embed key (client-side, domain-restricted)
- `window.GrabWidgets.common.recaptchaKey = "6Le3PjIUAAAAAA6qH0HYORp6HKJhdxxH3f5iuA1e"` -- reCAPTCHA v2 site key
- Sentry DSN embedded in HTML: `https://030bb053976c42a3b266260f2b6ac1a3@sentry.io/2842162` (sampleRate: 0.05)

---

## API Surface

### WordPress REST -- Unauthenticated Endpoints

The custom `dss3/cities` endpoint returns 509 city records without authentication, each with a list of active Grab services and their internal service codes:

```
GET https://www.grab.com/wp-json/dss3/cities
200 OK, JSON array, 509 items
```

Each record contains a city `id` and a `services` array with `name` and `code` fields. 89 unique service codes are present, covering the full operational product map: `GC` (GrabCar), `GB` (GrabBike), `GrabFood`, `GrabExpress`, `GT` (GrabTaxi), `GrabBike-Emoto`, `GC_Cargo`, `GE_DD` (GrabExpress Dekat), `GE_IAS` (GrabExpress Instant), and 80 more. 36 of the 509 entries have empty service arrays. This is almost certainly an intentional endpoint for the driver/partner app to discover city availability, but it hands anyone a current map of Grab's operational footprint by product type at the city level.

Other unauthenticated endpoints: `/wp-json/safetyapi/type/0` and `/type/1` (safety content), `/wp-json/blogapi/` and `/wp-json/blog-content/` (blog), and standard `wp/v2` post type endpoints (`grabads_faq` -- 5 items, `grabinvest_faq` -- 10 items, `editorial`, `policy`, `contentonly`).

Correctly gated endpoints: Gravity Forms entries (`/wp-json/gf/v2/entries`, 401), Simple History admin audit log (`/wp-json/simple-history/v1/events`, 401), Redirection plugin redirects (`/wp-json/redirection/v1/redirect`, 401), WordPress user enumeration (403).

Three internal API routes are accessible but return errors without correct parameters:
- `/wp-json/api/hedwig/v1/email/unsubscribe` -- Grab's internal email service ("Hedwig") exposed via WP REST
- `/wp-json/api/v1/unban` -- unban API
- `/wp-json/api/v1/sf-form-submission` -- Salesforce form submission relay

The `/wp-json/api/poi/v1/nearby` endpoint returns `BAD_REQUEST` without parameters -- a Points of Interest proximity lookup that presumably accepts coordinate parameters.

### food.grab.com API Proxy

The food app proxies all backend requests through `https://food.grab.com/proxy/`. Direct calls to `/proxy/foodweb/guest/v2/restaurant/list` and `/proxy/foodweb/guest/v2/category` return 429 -- rate limiting is active on the proxy layer. AWS WAF Bot Control SDK is loaded on `/restaurants` and `/restaurant-detail` routes, adding bot detection on these high-value pages beyond the proxy rate limit.

### NextJS SSR Data in Page Props

Every NextJS page includes `__NEXT_DATA__` in the HTML with the page's SSR props. The `pageId` field in `pageProps.pageData` exposes the internal CMS record ID (`pageId: 206028` for the GrabUnlimited page, for example). The field name and sequential integer values allow enumeration of the CMS record space.

---

## Configuration Issues

### Dev Domain in Production

food.grab.com ships the following runtimeConfig in its `__NEXT_DATA__` on every page load:

```json
{
  "APP_GRABID_PROXY_URL": "https://food.grab.dev:3000/proxy/grabid",
  "APP_FOODWEB_API_BASE_URL": "https://portal.grab.com/foodweb",
  "APP_DELVPLATFORM_API_BASE_URL": "https://p.grab.com/delvplatformapi",
  "APP_FOODPAXAPI_BASE_URL": "https://p.grab.com/api/passenger"
}
```

`APP_GRABID_PROXY_URL` points to `food.grab.dev:3000` -- a development domain. `food.grab.dev` resolves to two real IP addresses (165.160.15.20, 165.160.13.20), but port 3000 is not publicly accessible (connection timeout). The companion feature flag `enableDevProxy: false` keeps this path dormant in production. The risk is conditional: if `enableDevProxy` were flipped to true via a config change or A/B test assignment, GrabID authentication requests from the food app would route to the dev environment rather than production.

### Go Template Placeholders in SSR State (Inferred)

The food app's `countryConfig` object in the Redux store, shipped to every SG user's browser via SSR, contains three fields with unrendered Go template placeholders:
- `grabliteSunsetRedirectLinkSG: "<nil>"`
- `grabliteSupportLink: "<nil>"`
- `orderingCities: "<no value>"`

This reveals the server-side rendering pipeline: a Go process generates the country configuration using Go's text/template package and injects it into the NextJS SSR context. The three fields have no values configured for SG in the template data, so the template rendered its zero-value strings instead of actual URLs or city lists. The "GrabLite sunset" reference points to a deprecated lightweight app version whose config structure remains in the template. These values were observed during live investigation and are marked as inferred.

### reCAPTCHA Disabled in Food App (Inferred)

The food app's Redux feature flags include `disableRecaptcha: true`. The food ordering flow -- restaurant browsing, order placement -- runs without bot challenge verification for unauthenticated sessions. Rate limiting at the proxy layer (429 responses) provides the primary gate against automated scraping or order flooding. The `enableGuestToken: true` flag confirms unauthenticated sessions are a supported access mode. These values were observed during live investigation and are marked as inferred.

### WordPress CORS

WordPress's REST API sets `Access-Control-Allow-Origin` to the static value `https://www.grab.com`, not reflecting arbitrary Origins. Requests with `Origin: https://evil.example.com` receive the static origin header with no `access-control-allow-credentials` header. The 226-route WP REST surface is broad, but the CORS configuration is not permissive.

---

## Surveillance & Consent Architecture

### Two-Tier Consent Model

Grab's OneTrust configuration (version 202304.1.0, domain ID `a3be3527-7455-48e0-ace6-557ddbd506d5`) defines two consent rule sets:

**Global Audience** ("Grab Template - Opt-out"): All countries not in the explicit consent set. This includes Singapore, Indonesia, Malaysia, Vietnam, Myanmar, and Cambodia -- Grab's six largest operating markets. All four OneTrust consent categories (C0001: Strictly Necessary, C0002: Performance, C0003: Functional, C0004: Targeting) are active on first page load with no user interaction. The `OptanonConsent` cookie is written as `groups=C0001:1,C0002:1,C0003:1,C0004:1` immediately.

**Explicit Consent Audience** ("Grab Template - Opt-in"): EU countries, plus Thailand and Philippines. Users in these countries see a consent banner and tracking is withheld until they interact. Philippines has no specific opt-in cookie law, but Grab has chosen to include it in the opt-in tier -- possibly a precautionary legal decision. Thailand's PDPA requires consent for non-essential data processing.

Google Consent Mode is not active (`GCEnable: false`).

### What Fires Without Consent (SG Users)

On a first visit to www.grab.com from Singapore, before any consent interaction:

- **Grab Scribe Web SDK** (`scribe-web-sdk.grab.com/scribe_bundle_v1.0.55.min.js`) -- first-party session analytics, eight calls to `mcd-gateway.grabtaxi.com/v2/web/track`
- **OneTrust** scripts (the CMP itself)
- **Three GTM containers** -- GTM-54DG5SF (v383), GTM-T5N427J (v47), GTM-KSQQ83R -- loaded pre-consent
- **Google Analytics** via `analytics.js`
- **Sentry** error tracking (5.12.4)

Via GTM after load (all consent categories pre-enabled):
- **Facebook Pixel** (702364719893092) -- `_fbp` cookie written
- **Twitter/X Pixel** -- `_twpid` cookie written
- **Google Ads Remarketing** -- `_gcl_au` cookie written (containers 701041036, 472893257)
- **GA4** (`analytics.google.com/g/collect`) -- `_ga`, `_gid` cookies written
- **Outbrain** (amplify.outbrain.com, wave.outbrain.com)
- **Taboola** (cdn.taboola.com, trc-events.taboola.com, account 1392081)
- **Yahoo Advertising** (s.yimg.com/wi/ytc.js, account 10022897)
- **AppsFlyer Web SDK** (websdk.appsflyer.com) -- banner attribution and deep link generation
- **Hotjar** (static.hotjar.com/c/hotjar-1532049.js, ID 1532049) -- session recording

Also observed in cookies without interaction: `hm_ElqSessionID` and `hm_ElqClientID` (**Oracle Eloqua** CRM) and `dicbo_id` (**Audigent** identity graph / data co-op). These fire because consent is pre-granted.

### food.grab.com Additions

The food app adds its own Facebook Pixel (ID 517824045640036, different from the main site's 702364719893092) and DoubleClick (DC-6254042). food.grab.com reportedly loads two simultaneous Hotjar instances -- ID 1532049 (same as main site) and ID 1740618 (unique to food app). Running two Hotjar session recorders simultaneously is redundant and suggests the food app's tracking setup was not coordinated with the main site's. This was observed during live investigation and is not confirmed in saved network captures.

### GTM Fragmentation

| Container | Version | Primary content |
|-----------|---------|----------------|
| GTM-54DG5SF | v383 | Facebook, LinkedIn Insight, Taboola, Hotjar, Twitter, YouTube |
| GTM-T5N427J | v47 | Google Ads only |
| GTM-KSQQ83R | unknown | Google Analytics |
| GTM-KMVG85X | v96 | food app -- Hotjar, Google Ads |

Three GTM containers on a single page (main site) is a common pattern at large organizations where product teams and marketing teams maintain separate container ownership. LinkedIn Insight tag (`snap.licdn.com/li.lms-analytics/insight.min.js`) is present in GTM-54DG5SF but did not fire during network captures -- likely conditional on page type or user state.

---

## Open Threads

**sg/discover/ appears in the NextJS sitemap but returns 404.** The `/_next/data/pzYhStJV5nFwHJbaHCpLm/locale_en/sg/discover.json` backing route returns 502 across five consecutive attempts. The sitemap lists this URL as a live page. This could be a decommissioned product section, a staged-but-unreleased feature, or a routing misconfiguration where the sitemap update and the page removal were not synchronized.

**`/wp-json/api/poi/v1/nearby`** accepts coordinate parameters (lat, lng presumably) and returns nearby Points of Interest. The parameter schema is not documented and was not fully probed. The endpoint could return driver-visible POI data if the request is formed correctly.

---

## Machine Briefing

### Access & Auth

www.grab.com: No auth required for public endpoints. CloudFront WAF is active -- requests without browser-like headers (User-Agent, Accept) may receive 403 or redirects. FastCGI cache means repeated GETs may return stale responses.

food.grab.com: Unauthenticated "guest token" access mode is supported (`enableGuestToken: true` in feature flags). Direct API calls to `/proxy/foodweb/*` are rate-limited. Authenticated sessions use GrabID OAuth; the food app proxies auth through `/proxy/authnv4/login`.

### Endpoints

**Open (no auth, no WAF issues):**

```
# Full city-service-code deployment map (509 cities, 89 service codes)
GET https://www.grab.com/wp-json/dss3/cities

# Safety content (type 0 = blog, type 1 = press)
GET https://www.grab.com/wp-json/safetyapi/type/0
GET https://www.grab.com/wp-json/safetyapi/type/1

# WordPress public post types
GET https://www.grab.com/wp-json/wp/v2/grabads_faq
GET https://www.grab.com/wp-json/wp/v2/grabinvest_faq
GET https://www.grab.com/wp-json/wp/v2/editorial
GET https://www.grab.com/wp-json/wp/v2/policy

# WordPress REST API discovery (all 226 routes)
GET https://www.grab.com/wp-json/

# NextJS SSR page data (runtimeConfig, pageId, CMS content)
GET https://www.grab.com/sg/grabunlimited/
# __NEXT_DATA__ in <script id="__NEXT_DATA__">

# food.grab.com SSR (full runtimeConfig with backend API URLs)
GET https://food.grab.com/sg/food/
# __NEXT_DATA__ in source
```

**Rate-limited (guest token flows):**

```
# Food category list (429 after threshold)
GET https://food.grab.com/proxy/foodweb/guest/v2/category
GET https://food.grab.com/proxy/foodweb/guest/v2/restaurant/list

# GrabID auth proxy
POST https://food.grab.com/proxy/authnv4/login
```

**Requires auth (properly gated):**

```
GET https://www.grab.com/wp-json/simple-history/v1/events    # 401
GET https://www.grab.com/wp-json/gf/v2/entries               # 401
GET https://www.grab.com/wp-json/redirection/v1/redirect     # 401
```

### Gotchas

- **Country path prefix required.** WordPress endpoints at `/wp-json/*` work from the bare domain, but page URLs require a country prefix (`/sg/`, `/id/`, `/ph/`, etc.). NextJS data routes also embed the country code.
- **Food app proxy rate limits.** Hitting `/proxy/foodweb/guest/v2/*` endpoints returns 429 quickly. Threshold not determined.
- **food.grab.dev:3000 resolves but is unreachable.** The runtimeConfig ships `APP_GRABID_PROXY_URL` pointing there; domain resolves to 165.160.15.20 and 165.160.13.20, but port 3000 times out. `enableDevProxy: false` keeps the path inactive.
- **CloudFront caching.** `x-fastcgi-cache: HIT` means some WP REST responses may be cached.
- **Two Sentry DSNs.** WP site: `030bb053976c42a3b266260f2b6ac1a3@sentry.io/2842162`. Food app: `24c952955d1a419da9d8b1aaceae1ecc@sentry.io/1429894`.
- **portal.grab.com and p.grab.com return 502** when accessed directly. Backend API hosts are not publicly reachable.
