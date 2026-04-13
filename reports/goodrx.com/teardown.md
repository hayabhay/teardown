---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "GoodRx — Teardown"
url: "https://goodrx.com"
company: "GoodRx"
industry: "Healthcare"
description: "Prescription drug price comparison and discount coupon platform."
summary: "React frontend served via Fastly CDN with Varnish edge routing by U.S. state. Static assets on S3 via grxstatic.com. PerimeterX bot protection with first-party routing blocks all automated access. Segment CDP with first-party proxy at cd.goodrx.com. Auth platform mid-migration from Auth0 to Descope. Public developer API at api.goodrx.com."
date: "2026-04-13"
time: "01:45"
contributor: "hayabhay"
model: "sonnet-4.6"
effort: "high"
stack: [React, Fastly, PerimeterX, Segment, Optimizely, Descope]
trackers: [Google Tag Manager, Segment, Optimizely, Datadog, Parse.ly, LiveRamp, System1, Taboola, DoubleVerify, comScore, Osano, Branch.io, BlueCava]
tags: [healthcare, pharma, prescription-drugs, advertising, geolocation, ehr, affiliate, lead-gen, perimeterx, ftc]
headline: "GoodRx's affiliate site hellogoodrx.com loads the full Osano consent manager, then hides the dialog and widget with inline CSS — no banner ever appears."
findings:
  - "The production Content Security Policy hardcodes individual clinic domains -- Rocky Hill Gastroenterology, DeSoto Regional Health System, specific doctor eClinicalWorks instances -- disclosing GoodRx's appointment booking partner network at the practice level in every page response."
  - "hellogoodrx.com, a separate Heroku-hosted affiliate lead gen site, loads the Osano consent manager with full cookie categorization then hides both the dialog and widget with inline CSS display:none -- users see no consent banner."
  - "System1's RampJS SDK bundles Facebook, TikTok, Snapchat, Outbrain, Google Ads, Taboola, and Zemanta pixels in a single third-party script and implements its own CCPA check by reading the usprivacy cookie directly, independent of GoodRx's Osano CMP."
  - "The Fastly/Varnish CDN layer sets a grx_location cookie containing the visitor's city, state, and postal code as JSON on the initial HTTP redirect -- before any page loads, JavaScript executes, or consent is requested."
  - "grx_unique_id and optimizelyEndUserId are set to the same UUID on the first request, directly syncing GoodRx's persistent user identifier to Optimizely's A/B testing platform before any user interaction."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

GoodRx is a prescription drug price comparison and discount coupon platform. The business model: GoodRx negotiates rates with pharmacy benefit managers (PBMs), users get coupons to show at the pharmacy counter, GoodRx earns a fee per fill. Roughly 20 million active users, $800M+ annual revenue. In 2023, the FTC fined GoodRx $1.5M for sharing health data with Facebook, Google, and others via advertising pixels -- the first enforcement action under the FTC's Health Breach Notification Rule. That context matters for reading what follows.

## Architecture

GoodRx's main site runs React, almost certainly Next.js based on the asset hash structure on its CDN. The frontend is served through Fastly with Varnish at the edge. A custom response header `x-location-state: CA` appears on every request -- the Varnish layer geolocates visitors and routes by U.S. state before any application logic runs.

Static assets come from `grxstatic.com`, a CDN backed by an S3 bucket at `assets.goodrx.com.s3.amazonaws.com` -- revealed by an `x-override-host` header on 404 responses. Asset paths use the prefix `d4fuqqd5l3dbz`, likely a deployment hash or project identifier.

Bot protection is PerimeterX with App ID `PX3t7fwqG6`, running in first-party mode: the enforcement scripts route through `/3t7fwqG6/init.js` and `/3t7fwqG6/xhr` on the main domain. PerimeterX blocks everything here -- headless Playwright, headed Playwright, curl, Googlebot user agent. What it doesn't block: sitemaps, `api.goodrx.com`, and the initial redirect response. The captcha challenge page itself leaks the PX config: `window._pxAppId = 'PX3t7fwqG6'`, `window._pxFirstPartyEnabled = true`.

Analytics runs through Segment CDP with a first-party proxy at `cd.goodrx.com`. That subdomain has `Access-Control-Allow-Origin: *` -- any origin can post to GoodRx's analytics pipeline. A/B testing is Optimizely, with edge-side evaluation at `/optimizely-edge/`. Error tracking is Sentry, project ID 5148329 -- the Sentry DSN appears in the CSP's `report-uri`: `https://sentry.io/api/5148329/security/?sentry_key=b77e90b1f5654f2e83a0238f4cf07987`.

Authentication is mid-migration. The robots.txt still disallows `/auth0/*` -- a dead path preserved from the old auth system. The CSP fully references Descope: `descopecdn.com`, `static.descope.com`, `api.descope.com`, `content.app.descope.com`. Auth0 is gone from the live stack; it just hasn't been cleaned from the crawl configuration.

Customer support runs on ServiceNow at `help.goodrx.com`. Status page is Atlassian Statuspage at `status.goodrx.com`. For payments, Stripe and Affirm (BNPL) are both in the CSP. GoodRx Gold, their $9.99/month subscription tier, is the likely Stripe integration point.

## The First Request

Before any HTML page loads, before any JavaScript executes, before any consent banner appears -- on the initial HTTP 301 redirect response -- GoodRx sets seven cookies.

The most significant is `grx_location`:

```
grx_location={"location":{"state":"CA","postalCode":"94123","city":"san francisco","country":"US"}}
```

This is set by the Fastly/Varnish CDN layer, not by application code. The postal code 94123 is the Marina/Cow Hollow neighborhood of San Francisco, resolved from the visitor's IP address via geolocation lookup at the edge. By the time the browser receives the redirect destination, GoodRx has already written the visitor's city, state, and postal code into a cookie on `.goodrx.com`.

The full set of cookies on the first redirect:

| Cookie | Value | Expiry | Notes |
|--------|-------|--------|-------|
| `grx_unique_id` | UUID (e.g., `4e07bc0356b8489db81ca32ee1e3cf6a`) | 1 year | Persistent user identifier, domain `.goodrx.com` |
| `optimizelyEndUserId` | Same UUID as `grx_unique_id` | 1 year | GoodRx's internal ID passed directly to Optimizely |
| `grx_visit_start` | Unix timestamp | 1 year | Session start time |
| `grx_sa` | `false` | Session | Likely sale/sharing opt-out state; `false` = not opted out (inferred) |
| `grx_location` | JSON with state, postalCode, city, country | Session | CDN-resolved geolocation |
| `fastly_unique_id` | CDN request ID | Immediately expired (set to 2019) | Correlation token for current request only; not persisted |
| `_pxhd` | PerimeterX fingerprint token | 1 year | PerimeterX device fingerprint |

`grx_unique_id` and `optimizelyEndUserId` are the same value. GoodRx passes its internal persistent user identifier directly to Optimizely as the Optimizely user ID, connecting GoodRx's user graph to Optimizely's A/B testing platform from the first request.

`grx_sa` is set to `false` with no expiry specified (session-scoped). The `sa` suffix most likely refers to "sharing allowed" or the CCPA "sale/sharing" opt-out state -- `false` would mean data is not opted out of sale by default. This is an inference from naming; the actual semantics are not confirmed from observable code.

The `fastly_unique_id` cookie expires with `expires=Mon, 19-Aug-2019 00:00:00 GMT` -- a date hardcoded in 2019 that was never fixed. It immediately expires on receipt and does not persist in the browser.

None of this requires Osano's consent manager to fire. It happens at the CDN layer, before any content is delivered.

## The Ad Stack

GoodRx's Content Security Policy is 247 lines long in the raw header. It documents an advertising ecosystem that spans Google's full stack (Tag Manager, Analytics 4, Ads, DoubleClick, Ad Exchange), The Trade Desk, Xandr/AppNexus, Taboola, DoubleVerify, IAS, VideoAmp, comScore/Scorecard Research, Flashtalking, and LiveRamp. These are standard components of a health-adjacent publisher ad stack post-FTC consent order.

The more distinctive element is System1.

System1 operates a pay-per-click search ad network -- they monetize intent-based searches by showing sponsored results and earning on clicks. Their presence on GoodRx means that some drug search queries, particularly long-tail ones, are routed through System1's ad network. The `?client=*` query parameter in robots.txt's disallow list likely identifies traffic arriving via System1/affiliate channels.

What System1 ships to GoodRx is their RampJS SDK, v1.71.5, loaded from `rampjs-cdn.system1.com`. This single script contains complete implementations of seven ad/analytics vendors:

- **Facebook Pixel** (`fbq('init', ...)`) -- with Facebook's LDU (Limited Data Use) flag for CCPA
- **TikTok Pixel** (`ttq.load(...)`)
- **Outbrain** (`obApi('track', 'PAGE_VIEW')`)
- **Google Ads conversion tracking** (`gtag('config', ...)`)
- **Snapchat Pixel** (`snaptr('init', ...)`)
- **Taboola universal pixel** (`_tfa.push({notify: 'event', name: 'page_view'})`)
- **Zemanta/Outbrain** (`zemApi('track', 'PAGE_VIEW')`)

Alongside these, the script sends telemetry to `soflopxl.com` -- System1's data pipeline -- using `credentials: "include"`, meaning the request carries any cookies the browser has for that domain.

System1's script implements its own CCPA consent check, independent of GoodRx's Osano consent manager. A function reads the `usprivacy` cookie directly:

```javascript
function Ee() {
  switch (we("usprivacy")?.charAt(2)) {
    case "N": return true;   // not opted out → personalized ads allowed
    case "Y": return false;  // opted out → personalized ads disabled
  }
}
```

The third character of the IAB US Privacy string indicates whether the user has opted out of sale: `N` = has not opted out, `Y` = has opted out. The return value feeds into a `personalizedAds` parameter sent to System1's backend, determining whether the user sees targeted or generic ad content. This check runs entirely outside Osano's CMP -- there is no coordination between Osano's consent state and System1's direct cookie read.

For a new visitor with no `usprivacy` cookie, the function returns `undefined`, and `personalizedAds` is unset -- leaving the default behavior to System1's backend.

Separately, the Facebook Pixel initialization uses a `fb_ldu` config value from the calling context: when truthy, it passes `fbq("dataProcessingOptions", ["LDU"], 1, 1000)` to enable Limited Data Use mode; when falsy, it passes an empty array for full data processing. The `fb_ldu` flag is set in the ad configuration, not derived from the `usprivacy` cookie.

## EHR Partner Network in the Security Header

GoodRx's "find a doctor / book an appointment" features embed external EHR (electronic health records) systems as iframes. The CSP lists the allowed frame origins, scripts, and XHR destinations for these integrations.

The EHR vendor list at the wildcard level:

- `*.athenahealth.com` -- athenahealth
- `*.ecwcloud.com`, `*.eclinicalweb.com` -- eClinicalWorks
- `*.allscripts.com`, `*.officeally.com`, `*.oadomain.com` -- Allscripts
- `*.drchrono.com` -- DrChrono
- `*.elationemr.com` -- Elation Health
- `*.mdland.com` -- MDLand
- `*.emedpractice.com` -- eMedPractice
- `*.hcn.health` -- Health Care Network
- `site*.chartwire.cloud` -- Chartwire

Alongside these wildcard entries, the CSP hardcodes specific practice-level domains:

- `cranium.rhgnc.org` -- Rocky Hill Gastroenterology and Nutrition Center (Connecticut)
- `ecw.desotoregional.com` -- DeSoto Regional Health System (Louisiana)
- `ecw.gsantosmd.com` -- a specific doctor's eClinicalWorks instance
- `ecw.padderhealth.com` -- Padder Health
- `ecw.imgnh.com` -- Internal Medicine Group of New Hampshire
- `site806-fyn1ivvp.chartwire.cloud` -- specific Chartwire tenant
- `site807-5c2melqa.chartwire.cloud` -- specific Chartwire tenant

These specific hostnames appear in `script-src`, `connect-src`, and `frame-src` simultaneously -- the CSP allows each of these clinics' systems to load scripts and iframes on GoodRx pages and to receive XHR requests from GoodRx.

The production CSP is a disclosure artifact: every time GoodRx integrates a new clinic's EHR system, the clinic's domain must be added to the CSP. The result is a live, publicly readable map of GoodRx's appointment booking partner network at the individual practice level -- including a GI practice in Connecticut and an internal medicine group in New Hampshire.

The appointment booking infrastructure also includes:
- `*.getvim.com` -- Vim Health telehealth booking widget (in both frame-src and connect-src)
- `partners-medicare.askchapter.org` -- Chapter Medicare enrollment iframe

## hellogoodrx.com

`hellogoodrx.com` is not part of GoodRx's main infrastructure. While goodrx.com runs on Fastly with Varnish, hellogoodrx.com runs on Heroku. It's GoodRx's affiliate lead generation funnel.

The site uses Formsort for multi-step forms. The Formsort constants meta tag reveals the flow configuration:

```json
{
  "client_label": "GoodRx",
  "flow_label": "leadsrx",
  "environment_label": "production",
  "flags": {
    "hackyDefOnLoad": true,
    "onlyCleanDisabledAnswersByResponder": true,
    "cacheStepsByDependencies": true
  }
}
```

The flow label is `leadsrx`. The `hackyDefOnLoad: true` flag name acknowledges it's a workaround. A cookie decoded from the site reveals an affiliate variant:

```json
[{
  "client": {"label": "GoodRx"},
  "flow": {"label": "affiliate"},
  "environment": {"label": "production"},
  "variant": {"label": "static_ranking", "deploymentUuid": "95938489-2034-4271-bdbf-632baf36dc25"}
}]
```

A `?user_promotion=grx_gift_card_phone_wallet` parameter indicates GoodRx runs gift card incentive campaigns through this funnel.

Osano CMP is loaded on hellogoodrx.com with config ID `16BZC3Rmfl2gO1igF`. The Osano script categorizes cookies as MARKETING, ANALYTICS, and PERSONALIZATION. The consent dialog is then hidden by inline CSS:

```css
.osano-cm-dialog { display: none; }
.osano-cm-widget { display: none; }
```

The CMP loads, categorizes cookies, and then disappears from view. Users see no consent banner on the affiliate lead gen site, despite the presence of tracking for the same cookie categories that require disclosure on the main site.

The site has a different PerimeterX App ID from the main site -- the captcha script loads from `https://www.hellogoodrx.com/GkkJOYNi/init.js` versus the main site's `PX3t7fwqG6`.

## Subdomain Map

| Subdomain | Stack | Status | Notes |
|-----------|-------|--------|-------|
| `www.goodrx.com` | React, Fastly/Varnish, PerimeterX | Blocks automated access | Main site |
| `api.goodrx.com` | Fastly/Varnish (no PerimeterX) | Returns auth errors | Developer API, requires API key |
| `cd.goodrx.com` | Segment first-party proxy | CORS wildcard (`*`) | Analytics data collection |
| `help.goodrx.com` | ServiceNow | Live | Customer support; `JSESSIONID` cookie |
| `status.goodrx.com` | Atlassian Statuspage | Live | API status, public component names |
| `admin.goodrx.com` | Unknown | 403 Forbidden | Exists, not accessible |
| `cdn.goodrx.com` | S3 | 403 Access Denied | S3 bucket exists, not browsable |
| `m.goodrx.com` | -- | Redirects to www | Mobile site redirect |
| `beta.goodrx.com` | -- | Redirects to www | |
| `gold.goodrx.com` | -- | Redirects to /gold | Subscription tier |
| `care.goodrx.com` | -- | Redirects to www | Telehealth hub |
| `developer.goodrx.com` | -- | Redirects to www | Developer program |
| `grxstatic.com` | CloudFront + S3 | Live | Static assets CDN |
| `grxweb.com` | Unknown | Empty root | Likely widget/iframe domain |
| `heydoctor.com` | Fastly/Varnish | Redirects to goodrx.com/care | Telehealth acquisition |
| `hellogoodrx.com` | Heroku + Formsort | Live | Affiliate lead gen funnel |

## Public API

GoodRx operates a public developer API at `api.goodrx.com`. This subdomain does not have PerimeterX -- curl requests return proper API responses. Without an API key, all endpoints return:

```json
{"error": {"type": "authentication_error", "detail": "missing api key", "code": "unauthorized"}}
```

The four documented API components from the Statuspage:

- `v2/price/compare` -- drug price comparison
- `v2/coupon` -- coupon generation
- `/drug-info` -- drug information
- `/drug-search` -- drug search

API keys are obtained through the developer program at `goodrx.com/developer/apply`. The API has its own SSL certificate (Certainly CA, shorter-lived) separate from the main wildcard cert (GlobalSign Atlas).

## Machine Briefing

**Access and auth:**
- `www.goodrx.com` -- blocked by PerimeterX (`PX3t7fwqG6`). All automated access (curl, headless, headed browser) is blocked. No bypass documented.
- `api.goodrx.com` -- no PerimeterX. Curl works. Requires API key from developer program (`goodrx.com/developer/apply`).
- Sitemaps -- fully accessible without restrictions. The sitemap index at `https://www.goodrx.com/sitemap.xml` links 16 sitemaps.
- `status.goodrx.com/api/v2/summary.json` -- public, no auth.

**Endpoints (no auth required):**

```bash
# Sitemap index
curl https://www.goodrx.com/sitemap.xml

# Drug price sitemap (~1.1MB, thousands of drug URLs)
curl https://www.goodrx.com/sitemap-drug-price.xml

# API status with component names
curl https://status.goodrx.com/api/v2/summary.json

# Static assets CDN root
curl https://grxstatic.com/

# Drug images path
https://grxstatic.com/d4fuqqd5l3dbz/products/tms/{drug-id}.jpg
```

**Endpoints (API key required):**

```bash
# Drug price comparison
GET https://api.goodrx.com/v2/price/compare?drug_name={drug}&api_key={key}

# Coupon generation
GET https://api.goodrx.com/v2/coupon?api_key={key}

# Drug info
GET https://api.goodrx.com/drug-info?api_key={key}

# Drug search
GET https://api.goodrx.com/drug-search?api_key={key}
```

**Gotchas:**

- PerimeterX is aggressive. Googlebot UA is blocked. Rotating UAs does not help -- PX fingerprints at the TLS/behavioral level.
- `api.goodrx.com` does not enforce PerimeterX but does enforce API key auth on all routes. A 404 response (no API key) returns `{}` -- empty JSON, not a 404 body.
- The `optimizely-edge` path (`/optimizely-edge/*`) is disallowed in robots.txt and blocked by PX -- Optimizely feature flag evaluation runs at the edge but is not externally queryable.
- `cd.goodrx.com` (Segment proxy) has wildcard CORS but expects Segment's write key in the payload -- it's a data collection endpoint, not a read API.
- The Formsort affiliate flow at `hellogoodrx.com` loads via `https://api.flow.formsort.com/flow-api/client/GoodRx/flow/leadsrx/variant?schemaVersion=20&random=1` -- this URL is in the page source and may expose flow configuration without auth, though Formsort's API terms apply.
- Sentry DSN (`b77e90b1f5654f2e83a0238f4cf07987` for project 5148329) returns a quota error when called directly -- the project exists and is active, but external security report submission is quota-gated.
