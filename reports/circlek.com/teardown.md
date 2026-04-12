---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "Circle K — Teardown"
url: "https://circlek.com"
company: "Circle K"
industry: Retail
description: "Convenience store and gas station chain with 7,000+ US locations."
summary: "Drupal 10 on CloudFront CDN serves the main site and Inner Circle loyalty subdomain; a separate Next.js app handles EasyPay fuel payments. A single GTM container manages all tracking across the franchise network — 19 GA4 properties, 8 Facebook pixels, and 6 Google Ads accounts — with Cookiebot as the stated consent manager. The CMP and the tag manager are architecturally disconnected: none of the 26 GA4 tags in the container have a consent gate."
date: "2026-04-12"
time: "20:32"
contributor: "hayabhay"
model: "sonnet"
effort: "medium"
stack: [Drupal 10, Next.js, CloudFront, GTM, Cookiebot]
trackers: [Google Analytics 4, Google Ads, Google Campaign Manager, Facebook Pixel, Hotjar, Qualtrics, AppsFlyer, Microsoft Clarity, Sentry, Mapbox]
tags: [convenience-store, consent-bypass, session-replay, franchise-analytics, appsflyer, pre-consent-tracking, purchase-conversion-misfire, loyalty-program, drupal, gas-station]
headline: "A Google Ads purchase conversion tag fires on every page load — looking up a nearby gas station counts as a completed purchase in their ad platform."
findings:
  - "A Google Ads tag typed bttype=purchase fires on every page view site-wide, including four purchase conversion events on the store locator alone — inflating conversion metrics every time someone looks up a gas station."
  - "AppsFlyer's mobile app attribution SDK runs on the website, writing a session token to sessionStorage before consent to bridge web visits to Inner Circle app installs and in-app purchases."
  - "19 GA4 properties, 8 Facebook pixels, and 6 Google Ads accounts feed through a single GTM container — franchise-scale analytics multiplexing with cross-domain session stitching to the contest, loyalty, payment, and parent company sites."
  - "The active Hotjar session recording instance has no consent gate while an older, correctly gated instance sits unused — a migration that dropped consent enforcement."
  - "All 26 GA4 tag blocks in the GTM container fire unconditionally regardless of Cookiebot state — the consent variables exist in the container but are wired to nothing."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

Circle K runs a Drupal 10 site behind CloudFront with a Cookiebot consent banner on every page. The banner works exactly as designed — it appears, accepts user input, and stores that input in a cookie. The problem is that nothing in the GTM container reads that stored input before firing trackers. The consent layer and the tag execution layer are architecturally disconnected.

## Architecture

The main site (`www.circlek.com`) is Drupal 10, confirmed by the `x-generator: Drupal 10` response header. Nginx/1.18.0 handles the origin. CloudFront sits in front (`x-amz-cf-pop: SFO53-P9`, `via: CloudFront`). Pages are server-rendered — no SPA framework, no client-side routing.

Three subdomains extend the main property:

| Subdomain | Stack | Purpose |
|-----------|-------|---------|
| `inner-circle.circlek.com` | Drupal 10 | Loyalty enrollment |
| `easy-pay.circlek.com` | Next.js | Fuel payment app |
| `springwin25.circlek.com` | Unknown | Seasonal contest |

The loyalty subdomain is a separate Drupal 10 instance running the same tracker suite as the main site. The EasyPay subdomain is a Next.js app served through CloudFront (`x-powered-by: Next.js`, `x-nextjs-cache: HIT`).

**Cross-domain session stitching** is configured in the primary GA4 tag (`G-GLDZDNH90T`). The `ep.linkerDomains` parameter ties together four properties: `springwin25.circlek.com` (contest), `inner-circle.circlek.com` (loyalty), `easy-pay.circlek.com` (fuel payment), and `www.couche-tard.com` (Alimentation Couche-Tard, the Canadian parent company). A user browsing the main site can have their GA4 session ID passed to the parent company's domain.

**CORS**: The `access-control-allow-origin` header is scoped to `https://cloud.brandmaster.com` — BrandMaster is a brand asset management platform, likely used for franchise digital asset management from Circle K's corporate account.

**CSP**: Declared but largely symbolic. `default-src * data: 'unsafe-inline' https: blob:` with `unsafe-eval` allows effectively any third-party script. The named allowlist (`*.hotjar.com`, `*.qualtrics.com`, `*.couche-tard.com`, `cloud.brandmaster.com`) is present but the wildcard `*` in `default-src` renders it meaningless.

**API surface**: Drupal JSON:API (`/jsonapi/`) and REST API (`/node/1?_format=json`) both return 404 — neither is enabled on the production instance. Admin panel (`/admin/`) returns 403. The login page (`/user/login`) returns 200. Two legacy PHP endpoints appear in `robots.txt` as disallowed: `/stores_new.php` and `/stores_master.php` — both return 404, indicating a migration to the current Drupal store finder.

## The Purchase Conversion Tag

Every page load on circlek.com fires a Google Ads conversion tag typed as `bttype=purchase`.

The specific tag is `AW-315353858`, conversion label `YBe3CIbe95EYEILWr5YB`. The complete request on the homepage:

```
POST /pagead/conversion/315353858/
  ?en=conversion
  &url=https://www.circlek.com
  &bttype=purchase
  &value=0
  &label=YBe3CIbe95EYEILWr5YB
  &npa=1
```

`bttype=purchase` is the Google Ads conversion type for purchase events. `value=0` means the reported purchase value is zero. This fires twice on the homepage.

On the store locator page, it fires four times — two instances of label `YBe3CIbe95EYEILWr5YB` and two of a second label `K3HcCJH495EYEILWr5YB`. Both carry `bttype=purchase`, `value=0`:

```
POST /pagead/conversion/315353858/
  ?url=https://www.circlek.com/store-locator
  &label=K3HcCJH495EYEILWr5YB
  &bttype=purchase
  &value=0
  &us_privacy=1YNY
```

In Google Ads, purchase conversions drive Smart Bidding optimization. Google's bidding algorithms increase ad spend when they observe purchase signals. A purchase conversion tag firing on every page view — including the act of looking up a nearby gas station — injects noise into every campaign using this account's conversion data. Whether this is intentional (treating store visit intent as a conversion signal) or a misconfiguration, the tag type chosen is specifically `purchase`, not a softer signal type like `page_view` or `store_visit`.

## Tracking Infrastructure

The GTM container (`GTM-NZF4NRH`) operates at franchise scale. Across the 38 custom HTML tags and 26 GA4 tag blocks:

**Google Analytics 4 — 19 properties**:
`G-GLDZDNH90T`, `G-4NY463VXHT`, `G-KHJ0TL3CJ5`, `G-Z05C5EH3MF`, `G-7GWKBRCEE5`, `G-DWC7HSJE30`, `G-4Q80LP825Z`, `G-QMEY7YS8HY`, `G-GHRPHS9GH4`, `G-PFLLZBWS4S`, `G-98QMXTS3HH`, `G-FQPKNM0SM5`, `G-N7E75BQ0JV`, `G-QS5RT37J0M`, `G-FXKRCYX7G8`, `G-BKM0PP5487`, `G-XWYJ62R285`, `G-D74ZBNLW68`, `G-KDR9MGGLME`

Nineteen GA4 properties on a single site is not misconfiguration — it's deliberate multiplexing. Alimentation Couche-Tard operates Circle K, Holiday Stationstores, Mac's, Corner Store, Kangaroo Express, and On the Run banners across the US and Canada. A per-brand or per-region GA4 property in a shared GTM container is the standard enterprise approach for this structure. Which ID maps to which brand or region is not determinable from the outside.

**Google Ads — 6 accounts**: `AW-315353858`, `AW-10859756260`, `AW-11038266868`, `AW-10873583864`, `AW-753703829`, `AW-16976620210`

**Facebook Pixels — 8 IDs**: `1320257254805918`, `106110046761508`, `1474655242631392`, `231148698219444`, `504676577377640`, `4793124360751156`, `705502110440415`, `1383706899305946`. Facebook pixel tags in the container do have consent-check code (a `marketing` condition) before them, but since the consent variable isn't populated from a real user decision, the condition evaluates against an unset state.

**DC Floodlight**: `DC-10286879`. No consent gate. Fires pre-consent.

**Hotjar — 2 site IDs**:
- `2026983` — has a `consent` field gated on `analytics_storage`
- `5341914` — no consent gate, `scriptSource: "gtm"` (this is the active deployment)

The two Hotjar configurations represent a migration artifact: an older ID with correct consent gating and the replacement ID without it. The active session recording instance runs without consent.

**Qualtrics Site Intercept**: Zone ID `ZN_5v60J5O98NQGpP8`. Three configured intercepts visible in the targeting API response:
- "PROD B2B: Overall Site Experience" (`SI_eEW2KRMAnYp0FRc`)
- "MOBILE Inner Circle Enrollment Abandonment" (`SI_3r8ZDr8N6iXC6RE`)
- "PROD B2C: DESKTOP Inner Circle Enrollment Abandonment" (`SI_eEW2KRMAnYp0FRc`)

The enrollment abandonment intercepts reveal what Circle K is actively watching for: users who start loyalty enrollment but don't complete it. The Qualtrics targeting endpoint fires before consent, sending session and behavioral context to Qualtrics servers before the user has interacted with the consent banner.

**Qualtrics DXA**: The feature flags response (`FeatureFlags.DX.GoogleDataLayer: true`) confirms Qualtrics Digital Experience Analytics is configured to read from GTM's `dataLayer`. DXA is a session replay and heatmap product. Between Hotjar (no consent gate) and Qualtrics DXA (reading the dataLayer), session behavior is captured by two parallel replay systems.

**Microsoft Clarity**: Referenced in the GTM container with conditional logic ("Clarity not loaded yet - consent call skipped"). Whether the condition actually gates firing was not observed in network captures.

**Sentry**: DSN `f34e32ad31af6c72ca31ebe66578e0a2` at `o1297331.ingest.sentry.io`. The `_sentryDebugIds` global maps debug IDs to Hotjar's JavaScript source — Hotjar's JS is Sentry-instrumented for error tracking.

**Mapbox**: Store locator uses Mapbox (`api.mapbox.com`, `events.mapbox.com`), generating 16 requests on the store locator page.

## AppsFlyer — Mobile Attribution on the Web

AppsFlyer is deployed as a first-class SDK on circlek.com, not as a pixel or tag. The SDK globals `AppsFlyerSdkObject`, `AF`, and `AF_SDK` are initialized on every page, and `AF_BANNERS_SESSION_ID` is written to `sessionStorage` before consent interaction.

AppsFlyer's Web-to-App product generates a deterministic session token during a web visit that can be passed to the mobile app at install time. When a user later installs the Inner Circle app and opens it, the app SDK reads the deferred deep link (which carries the web session token) and reports back to AppsFlyer. This attributes the app install to the web campaign that drove the visit.

The practical effect: browsing circlek.com — even without logging in, clicking an ad, or interacting with the Inner Circle program — creates an attribution anchor that can be matched to a later app install. This is the design of the product, not an anomaly. What's notable is the absence of a consent gate — the session token is written before the user has made any choice about tracking.

## The Consent Theater

Cookiebot (by Usercentrics) is deployed via a direct `<script>` tag with domain UUID `d51b2bed-91b4-439f-ab4a-df44514e34df`. Before any user interaction, `CookieConsent.consented` is `false`, `CookieConsent.marketing` is `false`, and `CookieConsent.statistics` is `false`. This is the correct initial state for a pre-consent session.

None of it matters.

The GTM container holds 26 GA4 tag objects. Inspecting each one in the container JSON: zero have a `consent` field. The GA4 tags are bare `__googtag` function objects with only `vtp_tagId` (the measurement ID) and optional `vtp_configSettingsTable`. No firing condition references `analytics_storage`, `ConsentStatistics`, or any CookieConsent variable.

The network evidence confirms this directly. On a fresh homepage load, before any interaction with the consent banner:

- `www.google-analytics.com/g/collect` fires for `G-4NY463VXHT` and `G-GLDZDNH90T`
- `pagead2.googlesyndication.com/ccm/collect` fires for all 5 observable Google Ads accounts
- `pagead2.googlesyndication.com/ccm/collect` fires for Floodlight `DC-10286879`
- `siteintercept.qualtrics.com` fires for Zone `ZN_5v60J5O98NQGpP8`
- `pagead2.googlesyndication.com/pagead/conversion/315353858/` fires with `bttype=purchase`

All of the above execute before Cookiebot has finished loading its own config from `consentcdn.cookiebot.com`.

**Google Consent Mode v2** is running in "basic mode." Every network call carries `gcs=G100` — the encoded signal meaning ad_storage=denied, analytics_storage=denied, ad_user_data=denied — and `npa=1` (no personalized ads). This looks correct on the surface. What `gcs=G100` actually means in basic mode: Google receives the data, marks it as "unmodeled," and uses statistical modeling to fill gaps. The data still flows to Google — Consent Mode v2 affects how Google uses it in ad modeling, not whether it's collected.

The GTM container does contain `ConsentPreferences`, `ConsentStatistics`, `ConsentMarketing`, and `ConsentMarketingAdUserData` as custom variables — these are defined and available. They're just not wired to any tag's firing condition. The consent variables exist in the container but serve no enforcement function.

**Cookiebot widget disabled**: The Cookiebot config response shows `widget.enabled: false`. The consent re-access widget — the persistent floating icon that normally lets users revisit their choices — is turned off. Users who want to change their consent after the initial interaction have no UI affordance to do so.

## Session Replay and Privacy Signals

**Hotjar (site ID 5341914)** records sessions without a consent gate. The Sentry debug ID mapping confirms this is the active Hotjar instance — its JS source is instrumented. A second Hotjar ID (`2026983`) has correct consent gating on `analytics_storage` but is not the currently deployed instance.

**Qualtrics DXA** overlaps with Hotjar. With `DX.GoogleDataLayer: true`, Qualtrics is reading behavioral events from the GTM dataLayer as they happen — including any `dataLayer.push()` events fired by other tags.

**GPC**: Circle K's privacy policy (effective January 1, 2024) contains no mention of Global Privacy Control. The California section references "do not track" practices but only discloses them rather than committing to honor the signal. Under California's CPRA, websites must treat a GPC signal as an opt-out of sale/sharing of personal information as of January 2023. The `__uspapi` stub is present in the page, and the CCPA string `us_privacy=1YNY` appears in Google Ads calls on the store locator — indicating the CCPA module records that no opt-out has been received, but the mechanism for accepting a GPC signal as an opt-out is not implemented.

## Inner Circle Enrollment

The `inner-circle.circlek.com` subdomain runs the loyalty program enrollment flow. Phone number is the first field collected — before email. Phone-first enrollment minimizes friction at the highest-yield step: once a phone number is captured, SMS marketing can proceed regardless of whether the user completes the rest of the form. The same pre-consent tracker suite (GA4, Google Ads, Qualtrics, Hotjar) runs on the enrollment subdomain. The Qualtrics "MOBILE Inner Circle Enrollment Abandonment" and "PROD B2C: DESKTOP Inner Circle Enrollment Abandonment" intercepts are actively watching for drop-offs in this flow.

## Robots.txt Artifacts

Seven Guy Fieri "Flavortown Kitchen" nutrition PDFs are listed as disallowed in `robots.txt` at paths like `/HSS/Nutrition/flavortown/Mac n Cheese Burger with Jalapeno American Cheese.pdf`. All seven return 404 — the content was removed but `robots.txt` was not updated. The items: Cheeseburger Burrito, Fajita Inspired Smoked Chicken Sausage with Cheese, Candy Chaos Cookies Dough (Mini), Sweet Heat Fried Chicken and Waffle, Denver Omelet on a Cheddar Bun, All-American Breakfast Burrito, and Mac n Cheese Burger with Jalapeno American Cheese. A terminated brand partnership whose ghost lives on in the crawl directives.

## Machine Briefing

**Access and auth**: The main site is fully public — no authentication required for any of the endpoints below. The Drupal REST API and JSON:API are disabled (both return 404). Store locator is rendered server-side. No useful unauthenticated API surface on the main Drupal instance.

**GTM Container** (all tracking tags, consent config, variable definitions):
```
GET https://www.googletagmanager.com/gtm.js?id=GTM-NZF4NRH
```

**Cookiebot consent config** (UUID, widget settings, language):
```
GET https://consentcdn.cookiebot.com/consentconfig/d51b2bed-91b4-439f-ab4a-df44514e34df/settings.json
```

**Qualtrics targeting** (intercept decisions, feature flags, zone config):
```
POST https://siteintercept.qualtrics.com/WRSiteInterceptEngine/Targeting.php?Q_ZoneID=ZN_5v60J5O98NQGpP8&Q_CLIENTVERSION=2.46.0&Q_CLIENTTYPE=web
Content-Type: application/x-www-form-urlencoded
Body: (empty or with geo context)
```
Returns JSON with `Intercepts`, `ClientSideIntercepts`, `FeatureFlags`, and `RequestData`. No auth required. The `brandID` in the response is `circlekbx` and brand datacenter is `yul1.qualtrics.com`.

**Mapbox (store locator)**:
```
GET https://api.mapbox.com/geocoding/v5/mapbox.places/{query}.json?access_token={token}&...
GET https://api.mapbox.com/styles/v1/{user}/{style_id}/tiles/...
```
The Mapbox access token is embedded in the store locator page source. Mapbox public tokens are restricted by URL referrer in the Mapbox dashboard — they work from the browser on circlek.com but may reject requests from other origins.

**Sentry org**:
```
Organization: o1297331
Endpoint: https://o1297331.ingest.sentry.io
DSN key: f34e32ad31af6c72ca31ebe66578e0a2
```

**Subdomains**:
- `https://inner-circle.circlek.com` — Drupal 10 loyalty enrollment, same tracker suite
- `https://easy-pay.circlek.com` — Next.js fuel payment app
- `https://springwin25.circlek.com` — Seasonal contest, timed out on direct fetch

**Gotchas**:
- Drupal JSON:API and REST API are both disabled (404). No node/entity endpoints.
- The store locator renders server-side. No client-accessible store search API was found on the Drupal instance. Store lookup likely happens through the Mapbox geocoding API combined with a server-rendered results page.
- `robots.txt` disallows `/search/` — Drupal's built-in search is disabled or redirected.
- The Cookiebot UUID is public and constant — the consent config endpoint is unauthenticated and returns the same response for any caller.
- GA4 cross-domain linker is configured: requests from circlek.com to `inner-circle.circlek.com`, `easy-pay.circlek.com`, `springwin25.circlek.com`, and `www.couche-tard.com` will have session parameters appended to outbound links.
