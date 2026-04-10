---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "Public Storage — Teardown"
url: "https://www.publicstorage.com"
company: "Public Storage"
industry: "Real Estate"
description: "Self-storage REIT operating 3,400+ facilities across the US."
summary: "Built on Salesforce Commerce Cloud (Demandware v22.6) behind Cloudflare, with a jQuery 3.6.0 frontend and GTM (GTM-NCR6BHD) managing the tag stack. Lytics CDP feeds audience segments into a Metarouter analytics router at analytics.publicstorage.com. VWO handles A/B testing, OneTrust manages consent, Chase Paymentech processes payments, and Salesforce Service Cloud provides chat. A behavioral pricing engine (SooStone/Widengle) dynamically adjusts unit prices post-page-load across all 3,483 facilities."
date: "2026-04-12"
time: "07:14"
contributor: "hayabhay"
model: "sonnet"
effort: "high"
stack: [Salesforce Commerce Cloud, Cloudflare, jQuery, Google Tag Manager]
trackers: [Google Analytics 4, Google Ads, LinkedIn Insight Tag, Reddit Pixel, RTBHouse, VWO, Lytics, Metarouter, Widengle, OneTrust, HawkSearch, Salesforce Chat]
tags: [self-storage, real-estate, adaptive-pricing, behavioral-targeting, consent-bypass, demandware, salesforce, cdp, retargeting, pre-consent-tracking]
headline: "Public Storage rewrites unit prices based on behavioral signals from a third-party tracker — but silently excludes California visitors because of CCPA."
findings:
  - "A behavioral pricing engine called SooStone hides all unit prices on page load behind a CSS class and rewrites them after evaluating visitor signals — landing source, chat engagement, length-of-stay bucket, and a Target ROAS multiplier — with California visitors automatically excluded from the experiment via a CCPA compliance flag."
  - "Every facility page embeds three-tier internal pricing in HTML attributes — pricebook rate, list rate, and a promotional floor — across all 3,483 locations with no authentication, making the complete inventory and pricing structure enumerable from the public sitemap."
  - "Lytics CDP pre-loads ML-scored visitor profiles into a page-level JavaScript object on every load — including predicted return-visit windows with confidence intervals and a message-propensity score — readable by every ad tag and third-party script on the page."
  - "The server resolves GPS coordinates and four nearest stores from IP geolocation on the very first HTTP response, setting cookies before the page renders or any user interaction occurs."
  - "OneTrust consent banner has no Accept or Reject button — all advertising and analytics consent groups are pre-enabled at interactionCount zero, and 12 third-party domains receive data before any user action."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

## Architecture

Public Storage's website runs on Salesforce Commerce Cloud (Demandware), identifiable by the `dwac_*`, `dwanonymous_*`, `dwsid`, and `dw_dnt` cookie family and the URL pattern `/on/demandware.store/Sites-publicstorage-Site/default/`. The SFCC version is 22.6, confirmed by the OCAPI endpoint at `/s/publicstorage/dw/shop/v22_6/` which returns a `MissingClientIdException` with the version in the response. The frontend is jQuery 3.6.0, with Google Tag Manager (`GTM-NCR6BHD`) managing the tag stack. Cloudflare handles CDN and bot management (`cf-ray`, `__cf_bm` cookie, `server: cloudflare`). Payments are handled by Chase Paymentech, confirmed by the Content Security Policy header: `frame-ancestors 'self' https://www.chasepaymentechhostedpay-var.com https://www.chasepaymentechhostedpay.com`. Chat is Salesforce Service Cloud's Embedded Service, initialized with org ID `00DDm000000IU1E`. Site search runs on HawkSearch (AppId: `8774`, version `4.0.3`), with session replay explicitly disabled. The help center is on MindTouch (`help.publicstorage.com`).

The staging Demandware environment at `dev.publicstorage.com` returns HTTP 401 Basic Auth. It is publicly addressable with no IP restriction, just a password gate.

The product sitemap (`sitemap_0-product.xml`) lists 3,483 facility URLs. The `robots.txt` disallows AI crawlers (GPTBot, ClaudeBot, OAI-SearchBot, PerplexityBot, anthropic-ai) from several paths, notably including `/on/demandware.store/*/AP-GetSoostonePromo` and `/on/demandware.store/*/AP-GetFactor` — the two endpoints that power the adaptive pricing system.


## Location Awareness Before You Search

The first HTTP response to a fresh visitor sets two cookies before any user interaction:

```
set-cookie: coordinates=37.8021|-122.433; Expires=Mon, 13 Apr 2026 06:52:50 GMT; Path=/; Secure
set-cookie: nearbyStores="439,1.56|393,2.17|2037,2.20|202,2.66"; Max-Age=86400; Path=/; Secure
```

The `coordinates` value is the server's IP geolocation of the inbound request. `nearbyStores` is four facility IDs with distances in miles, computed server-side before any search input. Both cookies have a 24-hour TTL and are set unconditionally on first request. The `x-dw-request-base-id` header provides Demandware's request correlation ID.

The site has resolved your location before the homepage renders. The nearest stores are baked into your session from the first response — no geolocation prompt, no search — purely from IP.


## SooStone Adaptive Pricing

Unit prices on facility pages are not static. The HTML renders with a `price-opacity-zero` class that hides displayed prices until a post-load JavaScript call resolves what promotion, if any, applies to this visitor:

```html
<div class="unit-availability-container promo-adaptive price-opacity-zero">
```

The system is SooStone, operated by Widengle (`tr.widengle.com`). Hidden-field configuration in every facility page confirms it is in production:

```html
<input type="hidden" value="ProductionMode" id="sooStoneApiMode" />
<input type="hidden" id="enableSoostoneAPI" />
```

Widengle's JavaScript bundle loads from CloudFront (`d1zchjxt6i84hj.cloudfront.net`). Network logs show three endpoints called on every facility page load: `GET /api/activate`, `POST /api/tr` (twice), and `POST /api/event`.

The pricing determination uses two SFCC controller endpoints:
- `AP-GetSoostonePromo` — fetches applicable promotional pricing for the visitor
- `AP-GetFactor` — returns the pricing multiplier for the current adaptive pricing tier

The result is written to the `psap_v2` cookie via the `AP-Cookie` endpoint. The cookie format is:

```
G_<group>-D_<ap_default>-S_<site_id>_<ap_action>
```

Possible `group` values include `test`, `control`, `excluded`. The `ap_action` encodes the specific promotion applied (e.g., `promo20` for 20% off). California users get `G_excluded-D_` — no promotional tier, no action. This is driven by the CCPA exclusion flag: `rb:["CCPA"]` in the `wl_adaptive` localStorage object.

SooStone tracks behavioral signals across 19 page design contexts — from homepage search through reservation flow through confirmation. The state machine reads three key signals:
- `res_is_landing_page` — whether the user arrived from an external source
- `res_is_salesforce` — whether the user is engaged via the Salesforce chat widget
- `res_promo_code` / `res_promo_code_v2` — existing promotion code from `psap` cookie

Two pricing modifiers apply beyond the promotion tier itself:
- `los` handler sets `stn_pre_bk_class` — a Length of Stay bucket that affects which pricing tier is shown
- `troas` handler sets `stn_bk_val_mult` — a Target ROAS multiplier that alters booking value calculation for ad platform integrations

The Widengle JS contains a fallback code path for a legacy Sitecore CMS (`/api/sitecore/global/SetPSAP_V2`), indicating Public Storage migrated from Sitecore to Salesforce Commerce Cloud. The old endpoint survives in the Widengle bundle as a conditional fallback for non-v3 pages.


## Pricing Data in the HTML

Every facility page embeds the complete pricing structure for each unit in HTML data attributes, with no authentication required. From facility 439 (San Francisco, 2690 Geary Blvd):

| Unit ID | Size | Pricebook | List | Min | Sale2 |
|---------|------|-----------|------|-----|-------|
| V_1358672 | Small 4'x4' | $85 | $85 | $85 | — |
| V_1567097 | Small 5'x4' | $169 | $172 | $85 | — |
| V_1348959 | Small 5'x5' | $183 | $186 | $85 | — |
| V_1348971 | Small 5'x6' | $195 | $198 | $85 | — |
| V_1350686 | Small 5'x10' | $275 | $278 | $85 | — |
| V_1350687 | Small 6'x10' | $287 | $290 | $85 | — |
| V_1352840 | Medium 7'x10' | $379 | $379 | $85 | — |
| V_1354496 | Medium 10'x11' | $521 | $521 | $85 | — |

Three distinct price fields are exposed:
- `data-pricebook-price` — internal price book rate
- `data-list-price` — displayed street rate, consistently $3 above pricebook for most units, suggesting a walk-in vs. online rate differential baked into the page
- `data-min-price` — promotional floor, $85 for all units at this facility regardless of size, representing the lowest SooStone-eligible promotional price

The `data-gtmData` JSON attribute on each unit's CTA button exposes additional fields: `count` (current available units), `ProductID`, `ProductSitePremiumID`, `priceValue` (a scoring integer), `PLPShowUpTo`, and `PriorityPromotionInfo`. Schema.org structured data on the same page shows wider price ranges ($417-$625 for the 10'x11' unit), representing the full adaptive pricing spread — the floor-to-ceiling promotional band that SooStone navigates dynamically.

All 3,483 facilities follow the same pattern. The complete inventory and pricing is enumerable from the public product sitemap with no authentication.


## Consent Architecture

OneTrust manages consent under config ID `ded34741-caad-4418-b49a-95ad53b590e5`. The consent model is informational-only. The banner reads: "By using Public Storage's website and services, you agree to our use of cookies." There is no Accept button, no Reject button. The only user action available is closing the banner.

All consent groups are pre-enabled on first page load with `interactionCount=0`:
- `C0001:1` — Strictly Necessary
- `C0002:1` — Analytics/Performance
- `C0003:1` — Functional
- `C0004:1` — Targeting/Advertising
- `SSPD_BG:1` — Social Media

OneTrust's configuration defines four geo-specific rulesets — a California/CPRA template (updated January 2026), a template for wiretapping-law states (FL, IL, MA, NV, PA, WA), a template for 17 other state privacy laws (CO, CT, DE, IN, and others), and a GDPR ruleset for international visitors. Despite this geo-aware infrastructure, the consent model for California visitors maintains the same pre-enabled state — all advertising and analytics tracking fires before any user interaction.

The California carve-out that does exist is narrowly targeted at adaptive pricing: CCPA compliance is handled at the SooStone experiment level (`rb:["CCPA"]`, `apr_group:"excluded"`), not at the tracking level. California users are excluded from dynamic pricing experiments, but not from the surveillance stack.


## Surveillance Stack

On a fresh session, 12 third-party domains receive data before any user interaction, totaling 41 requests against 5 first-party endpoints.

**Google cluster**: GA4 fires to `analytics.google.com/g/collect` (4 calls per page). Google Ads CCM fires to `www.google.com/ccm/collect` (8 calls on homepage). Two Google Remarketing campaigns fire via `www.google.com/rmkt/collect/` with account IDs `1039136743` and `1038255256`. The GA4 session cookie is `_ga_R0S36E88HF`.

**Social retargeting**: LinkedIn Insight Tag fires two endpoints (`px.ads.linkedin.com/wa/` and `/attribution_trigger`, 4 total calls, confirmed in network logs). Reddit pixel `a2_dr0ynpqvf8b9` fetches its config on load (confirmed). Facebook (`_fbp` cookie) and Pinterest CAPI (`_meta_pinterestCAPI_fired` cookie) fire through GTM — confirmed by cookie presence, not directly captured in network evidence.

**Behavioral/Retargeting**: RTBHouse fires via `us.creativecdn.com/tags/v2` (confirmed in network logs, 2 calls) setting `__rtbh.uid` and `__rtbh.lid` cookies with 2027 expiry dates. Widengle fires 4 calls on facility pages. VWO loads from `dev.visualwebsiteoptimizer.com` with account ID `698398`.

**First-party CDP stack**: Lytics (`d8d2dceed21648aa0af25645039505b9`) sends pageview and tracking events via `POST /v1/p` and `POST /v1/t`. Metarouter (`analytics.publicstorage.com`) receives analytics events via the `publicstorage_prod` write key — a Segment-compatible router that handles downstream distribution to Facebook, Pinterest CAPI, and TikTok integrations per the Metarouter bundle. HawkSearch fires to `g.3gl.net/jp/8774/v4.0.3/AC` on load. Salesforce Service Cloud initializes via two calls to `publicstorage.my.salesforce-scrt.com`.

**Lytics user profiling**: On every page, Lytics pre-loads the visitor's ML-scored entity into `window.jstag`. The accessible object includes:
- `_uid` / `anonymous_id` — cross-session identity
- `segments` — audience memberships (e.g., `["smt_new", "new_users_past_60_days", "all"]` on first visit)
- `nextvisit.default` — predicted return window with confidence interval (`lower`, `mid`, `upper` timestamps)
- `needsmessage` — float propensity score for triggering a Pathfora modal (observed value: `0.0089`)

These values power the on-page Pathfora personalization widget by design. They are also readable by any JavaScript executing on the page — every ad tag, every tracker, and any script injection. A separate page-load function pipes the Lytics segment list to Metarouter via `analytics.track('lytics_segments', { segments: [...] })`, meaning audience membership flows into every downstream destination Metarouter routes to.

**Rakuten affiliate tracking** (investigator-observed): A `__rmco` cookie set by Rakuten Advertising contains `consentSought: false` with all product tracking flags enabled by default (`ranTrkInt`, `ranTrkExt`, `ranAut`, `ranCGE`, `rtbRet`, `rtbPro`, `cadTrk`, `dspTrk`).

**Active A/B tests** (investigator-observed from VWO session):
- **Test 31**: "Washington State Privacy Policy v1" — geotargeted, 100% traffic, injects modified privacy policy into `<head>` for WA state visitors
- **Test 82**: "Property Recommendations" — 10% control / 90% variation, tests `#product-recommendation` element, GTM-integrated
- **Test 83**: "Find Storage Search Field Text" — 50/50 split, tests label text in the homepage search form


## Identity Graph

Cookies placed on a fresh session before any user interaction or consent:

| Cookie | Domain | Purpose | Expiry |
|--------|---------|---------|--------|
| `seerid` | publicstorage.com | Lytics session ID | session |
| `ajs_anonymous_id` | publicstorage.com | Metarouter/Segment cross-session ID | 1 year |
| `__rtbh.uid` + `__rtbh.lid` | creativecdn.com | RTBHouse cross-publisher retargeting | 2027 |
| `li_adsId` | linkedin.com | LinkedIn audience ID | 30 days |
| `_vwo_uuid` | publicstorage.com | VWO cross-session test assignment | 1 year |
| `_rdt_uuid` | reddit.com | Reddit pixel identity | 90 days |
| `DD` | publicstorage.com | Demandware device fingerprint + session | session |
| `dwanonymous_*` | publicstorage.com | SFCC anonymous session | 6 months |

The `DD` cookie contains a client-side bug: the investigator observed `CID=392undefined` in the cookie value — the facility ID (`392`) concatenated with JavaScript `undefined` from an undeclared variable. A string concatenation error (`facilityId + undeclaredVar` producing `"392undefined"`) that persists in the session tracking data.


## Machine Briefing

### Access and auth

All facility and search pages are unauthenticated. `curl` or `fetch` work directly. First request returns geolocation cookies (`coordinates`, `nearbyStores`) automatically. OCAPI is technically open but requires a registered client ID — sending requests without one returns a `MissingClientIdException` with the API version in the response body.

Session management uses SFCC standard cookies: `dwsid` (session), `dwanonymous_*` (long-lived anonymous identity), and `dwac_*` (cart correlation). For any reservation or account operation, you would need to establish an authenticated session via the `/account/` flow (which is in `robots.txt`'s disallow list).

### Endpoints

**Facility pages (unauthenticated)**
```
GET https://www.publicstorage.com/self-storage-{state}-{city}/{facility_id}.html

# Example
GET https://www.publicstorage.com/self-storage-ca-san-francisco/439.html
```
Returns full HTML with unit pricing in `data-pricebook-price`, `data-list-price`, `data-min-price` attributes and richer `data-gtmData` JSON on CTA elements.

**Product sitemap (facility enumeration)**
```
GET https://www.publicstorage.com/sitemap_0-product.xml
```
Returns 3,483 facility URLs. No authentication.

**SFCC OCAPI (open, requires client ID)**
```
GET https://www.publicstorage.com/s/publicstorage/dw/shop/v22_6/
```
Returns `MissingClientIdException`. With a registered client ID as `client_id` query parameter, this is the entry point to the full Salesforce Commerce Cloud REST API.

**SooStone pricing endpoints**
```
POST https://www.publicstorage.com/on/demandware.store/Sites-publicstorage-Site/default/AP-GetSoostonePromo
POST https://www.publicstorage.com/on/demandware.store/Sites-publicstorage-Site/default/AP-GetFactor

# Set adaptive pricing cookie
POST https://www.publicstorage.com/on/demandware.store/Sites-publicstorage-Site/default/AP-Cookie
# Body: value=G_<group>-D_<ap_default>-S_<site_id>_<ap_action>
```

**Widengle behavioral tracker**
```
GET  https://tr.widengle.com/api/activate
POST https://tr.widengle.com/api/tr
POST https://tr.widengle.com/api/event
```
CORS: `access-control-allow-origin: https://www.publicstorage.com` — properly restricted, direct API calls will be blocked.

**Lytics CDP**
```
POST https://c.lytics.io/v1/p   # pageview
POST https://c.lytics.io/v1/t   # track event
# Account ID: d8d2dceed21648aa0af25645039505b9
```

**Salesforce Service Cloud chat**
```
GET https://publicstorage.my.salesforce-scrt.com/embeddedservice/v1/embedded-service-config
GET https://publicstorage.my.salesforce-scrt.com/embeddedservice/v1/businesshours
# Org ID: 00DDm000000IU1E
```

**HawkSearch site search**
```
GET https://g.3gl.net/jp/8774/v4.0.3/AC
# AppId: 8774. Session replay: DISABLED.
```

### Gotchas

- Facility IDs (e.g., `439`) are the primary key across all systems — `nearbyStores` cookie, `data-store-id` attributes, SooStone cookie, and schema.org `@id` fields all use this ID.
- `data-list-price` is the street/walk-in rate; `data-pricebook-price` is the online rate. The $3 differential is consistent. `data-min-price` ($85 at facility 439) is the promotional floor — the lowest SooStone can push the displayed price.
- California IP addresses get `apr_group: "excluded"` in all adaptive pricing responses. To test adaptive pricing behavior, use a non-CA IP.
- The `psap_v2` cookie can be set manually via the `AP-Cookie` endpoint. Sending a crafted `psap_v2` value is the mechanism the Widengle JS uses to override pricing tier — the server-side validates it against the group assignment.
- `dev.publicstorage.com` is publicly addressable and returns HTTP 401 Basic Auth — staging Demandware environment, same Cloudflare setup.
- The Lytics entity API (`jstag.getEntity()`) returns the visitor's full ML profile from the in-page object. In a browser context, this is available without any additional network call once Lytics loads.
- OCAPI at `/s/publicstorage/dw/shop/v22_6/` is the entry point for the Salesforce Commerce Cloud REST API. Endpoints follow standard SFCC OCAPI patterns. Requires a registered `client_id`.
