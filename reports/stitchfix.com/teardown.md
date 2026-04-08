---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "Stitch Fix — Teardown"
url: "https://www.stitchfix.com"
company: Stitch Fix
industry: Retail
description: "Online personal styling service delivering curated clothing boxes."
summary: "Stitch Fix runs a two-stack architecture: a Next.js frontend (growth-next-ui, deployed on CloudFront) for marketing and onboarding, and a set of named Rails microservices (HELLBLAZER-WEB, KEPT_ITEMS_UI-WEB, CLIENTANALYTICSSERVICE-WEB) for legacy routes. The data layer is Apollo GraphQL (graph: sfix-kufak-eng) with unauthenticated visitor queries enabled. Tracking runs through GTM-7RWHC plus 17 directly-loaded third-party domains, all firing before consent."
date: 2026-04-07
time: "02:09"
contributor: hayabhay
model: sonnet-4.6
effort: high
stack:
  - Next.js
  - Apollo GraphQL
  - Ruby on Rails
  - CloudFront
  - AWS WAF
trackers:
  - Google Analytics
  - Google Ads
  - DoubleClick
  - Facebook Pixel
  - TikTok
  - Pinterest
  - Reddit Pixel
  - Bing Ads
  - Spotify Pixel
  - Impact Radius
  - Attentive
  - Zeta Global
  - ID5
  - LiveRamp
  - Criteo
  - Medallia
  - Sift Science
  - Datadog RUM
  - GTM
tags:
  - fashion
  - subscription
  - personal-styling
  - pre-consent-tracking
  - graphql
  - source-maps
  - a-b-testing
  - identity-graph
  - microservices
  - next-js
headline: "Stitch Fix's public source maps expose an unannounced loyalty program being A/B tested — spend $250 get $15 or spend $400 get $25 — alongside 958 TypeScript files, an internal ops panel URL, and team names."
findings:
  - "Public source maps at assets.stitchfix.com contain an active A/B experiment (eng.kufak.incentives.loyalty_pilot, Jira INC-294) testing a spending-based rewards program -- spend $250 get $15 or spend $400 get $25 -- with no public announcement of a loyalty program."
  - "Production JavaScript source maps expose 958 TypeScript source files (4.9MB) including an internal ops panel URL (fixops-web.infra.int.stitchfix.com), Apollo Studio graph ID, team name (kufak), and algorithm tracking library references."
  - "Legacy Rails routes expose internal microservice names (HELLBLAZER-WEB, KEPT_ITEMS_UI-WEB, CLIENTANALYTICSSERVICE-WEB) in x-request-id headers, production git SHAs, and Rails controller/action names in CSP report-uri parameters."
  - "GTM container has SHA-256 email hashing with vtp_isAutoCollectPiiEnabledFlag set to true, feeding hashed user.email and external_id to four distinct Facebook pixel IDs -- all firing pre-consent."
  - "OneTrust detects CPRA jurisdiction, sets all six consent groups to active including BG84 ('Allow Sale of Personal Information') with interactionCount=0 and no banner rendered -- 17 third-party domains including ID5, LiveRamp ATS, and Zeta/Boomtrain identity resolution fire on first page load without any user interaction."
---

Stitch Fix is an online personal styling service -- you fill out a style quiz, a human stylist picks five items, a box ships to your door, you keep what you want and return the rest. The business model runs on profile data: preferences, purchase history, body measurements, fit feedback. The site's technical infrastructure reflects that orientation toward data collection at every layer.

---

## Architecture

The public site runs a two-stack setup. The marketing surface -- homepage, women/men/kids landing pages, onboarding quiz, signup, and login -- is a Next.js frontend (internal name: `growth-next-ui`) served via CloudFront. The build ID ships in every page's `__NEXT_DATA__` payload: `growth-next-ui--031e512401a3f5a49682f16eb0fad550c84182ec`. Static assets land on a separate CDN at `assets.stitchfix.com/growth-next-ui/`.

A parallel set of Rails-era microservices handles legacy and authenticated routes:
- `HELLBLAZER-WEB` -- affiliate/partner promo landing pages (`/preferredpartner`, `/sign_up`)
- `KEPT_ITEMS_UI-WEB` -- saved/kept items (`/my-items`)
- `CLIENTANALYTICSSERVICE-WEB` -- analytics event collection (`/api/events_collector`)

These services expose their identities in `x-request-id` response headers, git SHAs in `git_sha:` headers, and Rails controller/action names embedded in the CSP `report-uri` query parameters. A request to `/preferredpartner` returns headers including:
```
x-request-id: HELLBLAZER-WEB-...
git_sha: e10894c5daf447703cdd5f9d1d7aebb139375c3f
```
And a CSP header with report-uri containing:
```
action_name=preferred_partner_promo&controller_name=promo_landings
```

The data layer is Apollo GraphQL at `https://www.stitchfix.com/graphql-api/api/graphql`. Introspection is disabled, but the endpoint accepts unauthenticated requests and returns visitor data -- feature flags, config params, and experiment allocations -- for any caller with a `visitor_uuid` cookie. The GraphQL responses expose query cost annotations per internal microservice (`client-graphql-api`, `incentives-graphql-api`, `visitor-graphql-api`, each with a max cost of 5000) and an `x-algo-request-ids` header that connects GraphQL queries to Stitch Fix's algorithm tracking system, storing results in `algo-tracking-id*` cookies on the client.

AWS WAF (token: `2075f002a43e.edge.sdk.awswaf.com`) is active on the signup page but not on the main marketing site. The `visitor_uuid` cookie is set on every request with a 20-year expiry (`Max-Age=630720000; Domain=.stitchfix.com; Secure`), establishing a persistent fingerprint for unauthenticated visitors regardless of consent state.

---

## The Consent Problem

OneTrust SDK (version `202512.1.0`, domain group ID `a8a1d6cf-f58b-450c-91ff-8511bb43ff37`) is present on every page and calls `geolocation.onetrust.com/cookieconsentpub/v1/geo/location` on load. That call returns California -- CPRA jurisdiction.

No consent banner appears.

Instead, the OneTrust `OptanonConsent` cookie is written immediately with all six consent groups set to active and `interactionCount=0`:

```
groups=BG84:1,C0004:1,C0005:1,C0003:1,C0002:1,C0001:1
interactionCount=0
```

The six groups are:
- `C0001` -- Strictly Necessary
- `C0002` -- Performance
- `C0003` -- Functional
- `C0004` -- Targeting
- `C0005` -- Social Media
- `BG84` -- "Allow the Sale of my Personal Information or Sharing or Processing for Targeted Ads"

`ForceConsent: false` in the OneTrust configuration means the page does not require consent before loading. `GCEnable: false` means Google Consent Mode is not enabled. All groups default to `status: "active"` in the SDK initialization. The user is treated as having consented the moment they land -- the consent banner is not deferred, it is skipped entirely.

Under CPRA, processing for targeted advertising and selling personal information both require either affirmative opt-in or at minimum a clear opt-out mechanism before processing begins. The opt-out mechanism here (`/privacy/do-not-sell`) exists but is not surfaced on landing -- the processing has already started.

---

## Tracker Inventory

On a cold first load from a California IP, 17 third-party domains fire before any user interaction:

**Identity Resolution**
- `id5-sync.com` -- ID5 cross-publisher fingerprinting (two endpoints: `/bounce` + `/gm/v3`; EU load balancers also contact `lbs.eu-1-id5-sync.com` and `lb.eu-1-id5-sync.com`)
- `people.api.boomtrain.com` -- Zeta Global identity resolution (`/identify/resolve`)
- `events.api.boomtrain.com` -- Zeta Global event tracking (app_id: `zx-stitch-fix-inc`)
- `rp.liadm.com` / `rp4.liadm.com` -- LiveRamp Authenticated Traffic Solution (fires on `/signup`)

The combination of ID5 (device fingerprinting for cross-site tracking), LiveRamp ATS (maps email addresses to RampIDs for authenticated audience targeting), and Zeta/Boomtrain (identity graph and CRM activation) on a single page load represents three separate identity resolution pipelines. ID5 and Zeta fire on every page. LiveRamp adds at the signup stage -- at the point where a user's email is most likely to be captured.

**Analytics & Measurement**
- `analytics.google.com` -- GA4 (measurement ID: `G-X5DKPDYPM7`)
- `browser-intake-datadoghq.com` -- Datadog RUM (`/api/v2/rum` and `/api/v2/replay`)

**Advertising**
- `ad.doubleclick.net` -- DCM/DoubleClick (Floodlight tag: `src=13958942`, campaign type: `stifi`)
- `www.google.com` -- Google Ads conversions (two accounts: `AW-879950942`, `AW-859311430`) + CCM
- `www.googleadservices.com` + `googleads.g.doubleclick.net` -- Google Ads conversion pixels
- `ct.pinterest.com` -- Pinterest tag (advertiser: `s.pinimg.com/ct/`)
- `pixels.spotify.com` -- Spotify pixel (advertiser ID: `e4b1f10eb3714529bd5a36e716f3f986`)
- `pixel-config.reddit.com` -- Reddit pixel (advertiser: `t2_3l1rruvs`)

**Direct-Response / Behavioral**
- `stitchfix-us.attn.tv` -- Attentive SMS marketing (two calls: `/d` and `/unrenderedCreative`)
- `cdn.cookielaw.org` -- OneTrust SDK load (four endpoints, including the flat JSON and modal templates -- loaded but modal never rendered)
- `geolocation.onetrust.com` -- jurisdiction detection

Additional trackers confirmed active across sessions but not all captured in the fresh-load baseline: Bing/Microsoft (`bat.bing.com`), Impact Radius affiliate tracking (advertiser `A1236641-0349-464e-8ea7-d0f78e90770c1`), TikTok (pixel `C4TQ8UNPECQ6U88FBPCG`, cookie `_ttp` + `_tt_enable_cookie` + `ttcsid`), Criteo, Medallia/Kampyle (survey popup), Sift Science (fraud detection, account `1e6c1662df`), and Digioh/ZeroPartyForms (email capture overlay, UUID `c47dc514-ab88-4785-ac35-0b57a0caac7f`).

Datadog RUM is initialized with `sessionSampleRate: 100` (every session logged) and `sessionReplaySampleRate: 10` (10% of sessions get full screen recording and replay). Service name: `growth-next-ui`, env: `prod`. The version field is the git SHA: `031e512401a3f5a49682f16eb0fad550c84182ec`. Session recording fires pre-consent along with the rest.

Facebook runs four distinct pixel IDs: `2251961828604479`, `743212369384428`, `812246562609385`, and `251896078802090`. Multiple pixel IDs typically indicate separate ad accounts, business units, or attribution paths. All four are managed through GTM.

---

## GTM Container & Email Matching

The GTM container (ID: `GTM-7RWHC`, container version 1141, ~664KB) handles the ad pixel suite and applies email hashing before passing data to Meta and other platforms.

The container uses `__awec` -- Google's Automatic Event Collection function -- configured with `vtp_isAutoCollectPiiEnabledFlag: true`. It reads `user.email` and `user.external_id` from the dataLayer, applies SHA-256 hashing, and passes the hash to Facebook Pixel as `facebook_pixel.parent_email`. The dataLayer also carries a `pltv` key (predicted lifetime value), a `business_line` key, and a `revenue` field.

The email hashing is standard practice for conversion matching -- hashed emails let ad platforms match website activity to known accounts without transmitting plaintext PII. The relevant detail is that this matching runs pre-consent.

The GTM dataLayer event mapping translates internal event names to standard e-commerce schema: `pdp_page_view` to `view_item`, `buy_now_button_click` to `add_to_cart`, `add_to_cart` to `sign_up`, `shop_order_confirmation` to `purchase`.

---

## Source Maps & Internal Infrastructure

Production JavaScript source maps for the Next.js frontend are publicly accessible at `assets.stitchfix.com`. The main app chunk map (`_app-d8c7f7fc68daeea1.js.map`) contains 958 source files with full `sourcesContent` -- the original TypeScript code, not just the mappings. File size: ~4.9MB. Additional chunk maps (`3332-c87936836b79189b.js.map`, `7268-eef5f864bcb74b30.js.map`) are also accessible.

The source code reveals:

**Internal tooling and infrastructure:**
- `fixops-web.infra.int.stitchfix.com/apps/client-service/environment/production/environment_variables/MAX_HOUSEHOLD_MEMBER_COUNT` -- an internal ops panel URL, used to source a constant (`MAX_HOUSEHOLD_MEMBER_COUNT = 7`) that caps household member slots
- Apollo Studio graph: `sfix-kufak-eng/variant/production` -- the team name is `kufak`, and the production GraphQL schema is browsable via Apollo Studio at `https://studio.apollographql.com/graph/sfix-kufak-eng/variant/production/schema/reference/`
- GitHub repository reference: `https://github.com/stitchfix/crex_client` -- the algorithm tracking library, with a Ruby controller helper path visible: `crex_client/blob/master/lib/stitch_fix/crex_client/controller_helpers/algo_tracking.rb`
- `@stitch-fix/log-weasel` -- internal library for generating structured `X-Request-Id` headers used across both the Next.js and Rails services

**Feature flags in source (not served in __NEXT_DATA__ to unauthenticated visitors):**
- `client.global.kids_categories` (enabled: true)
- `client.web.auth_cookie_override_ios_app` (enabled: true)
- `eng.kufak.shop.categories.v2` (enabled: false) -- a shop categories redesign not yet live
- `eng.kufak.stylefile_seasonal_refresh` (enabled: false)
- `eng.onboarding.lff_remove_item_count_messaging` (enabled: false)
- `algo.returns_redesign.return_carrier_default` -- carrier selection for returns redesign

---

## Unreleased Loyalty Experiment

Buried in the source map, in a file that builds configuration inputs for GraphQL experiment queries:

```typescript
export const { getAllocation, configParamInputs } = buildConfigParamInputs([
  {
    // TODO cleanup after experiment: https://stitchfix.atlassian.net/browse/INC-294
    name: 'eng.kufak.incentives.loyalty_pilot',
    expectedValues: ['control', 'spend_400_get_25', 'spend_250_get_15'],
    fallbackValue: 'control',
  },
] as const);
```

The experiment has three variants:
- `control` -- no reward (default)
- `spend_250_get_15` -- spend $250, receive a $15 reward
- `spend_400_get_25` -- spend $400, receive a $25 reward

The `fallbackValue: 'control'` means users who don't receive an experiment allocation default to no reward. The `TODO cleanup after experiment` comment with an active Jira ticket (INC-294) indicates the code is in production with the experiment running or recently concluded. Stitch Fix has no public loyalty or rewards program as of this investigation. The `/rewards` page that exists on the site is a referral/gifting program, not a spending-rewards scheme.

The `configParamInputs` pattern is how the frontend requests specific experiment allocations from the GraphQL API -- this code would be querying `visitor.configParams` or `client.configParams` to get the allocation value. Unauthenticated visitors without an allocation would fall through to `control`.

---

## GraphQL: Unauthenticated Access

The GraphQL endpoint at `https://www.stitchfix.com/graphql-api/api/graphql` accepts POST requests without authentication. Introspection is disabled (`INTROSPECTION_DISABLED`), but the schema is partially documented via Apollo Studio at the graph reference above.

What works unauthenticated:
- `Query.visitor` -- returns `Visitor` type with `id`, `countryCode`, `featureFlags`, `configParams`
- `Query.banners` -- returns `[]` (empty for unauthenticated)
- `Query.client` -- returns `null` for unauthenticated

`FeatureFlag { name, enabled }` and `ConfigParam { name, value }` are both queryable without auth. Any caller with a `visitor_uuid` cookie can query the feature flag state and experiment allocations the site would show to a visitor -- including the loyalty pilot experiment values.

The endpoint responds with `access-control-allow-credentials: true` and exposes `x-algo-request-ids` in the CORS-allowed headers list. The `x-algo-request-ids` header connects individual GraphQL requests to the algorithm tracking system, with values stored in client-side `algo-tracking-id*` cookies (up to 5 cookies, keyed by request ID, values set to the page pathname). This gives Stitch Fix's recommendation algorithms a traceable request chain from browser click through to server-side personalization, reconstructable from cookies alone.

CORS does restrict cross-origin requests -- no `Access-Control-Allow-Origin` header for non-stitchfix.com origins -- so the endpoint is not exploitable from arbitrary domains, but direct curl/fetch calls from any origin work fine.

---

## Machine Briefing

### Access & Auth

- No auth required for GraphQL visitor queries. A `visitor_uuid` cookie is set automatically on any request to `www.stitchfix.com`.
- Legacy Rails routes (`/preferredpartner`, `/my-items`) redirect or require login for meaningful content.
- AWS WAF covers `/signup` and related flows -- expect a challenge token on those paths.

### Endpoints (Open)

**Source maps (full TypeScript source):**
```
GET https://assets.stitchfix.com/growth-next-ui/_next/static/chunks/pages/_app-d8c7f7fc68daeea1.js.map
GET https://assets.stitchfix.com/growth-next-ui/_next/static/chunks/3332-c87936836b79189b.js.map
GET https://assets.stitchfix.com/growth-next-ui/_next/static/chunks/7268-eef5f864bcb74b30.js.map
```

**GraphQL (unauthenticated visitor queries):**
```
POST https://www.stitchfix.com/graphql-api/api/graphql
Content-Type: application/json
Cookie: visitor_uuid={uuid}

{"query": "{ visitor { id countryCode featureFlags { name enabled } } }"}
```

```
POST https://www.stitchfix.com/graphql-api/api/graphql
Content-Type: application/json

{
  "query": "{ visitor { configParams(input: { offlineLookupOnly: false, params: [{ name: \"eng.kufak.incentives.loyalty_pilot\" }] }) { name value } } }"
}
```

**Events collector:**
```
POST https://www.stitchfix.com/api/events_collector
Content-Type: application/json

{"event": "page_view"}
```
Returns 204 on success. Requires `event` field; returns `{"error":{"code":"missing_required_parameter","metadata":{"parameter_name":"event"}}}` without it.

**Apollo Studio schema reference:**
```
https://studio.apollographql.com/graph/sfix-kufak-eng/variant/production/schema/reference/
```

### Endpoints (Authenticated / Redirect)

```
GET https://www.stitchfix.com/my-items       -> redirect to /login
GET https://www.stitchfix.com/preferredpartner -> HELLBLAZER-WEB Rails app
```
Check `x-request-id` and `git_sha` response headers on these routes for internal service metadata.

### Gotchas

- GraphQL CORS restricts cross-origin fetches but direct requests (curl) work without restriction.
- `/api/v2/events_collector` returns 403 from CloudFront; only v1 (`/api/events_collector`) is open.
- Source map URLs include a content hash in the filename -- if the build ID changes, re-derive URLs from `__NEXT_DATA__.buildId` embedded in every page's HTML.
- `visitor_uuid` is a first-party cookie on `.stitchfix.com` -- it persists across sessions with a 20-year TTL and is used as the GraphQL visitor identifier.
- WAF token validation required for form submission flows.
