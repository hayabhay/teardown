---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "Warby Parker — Teardown"
url: "https://warbyparker.com"
company: "Warby Parker"
industry: "Retail"
description: "DTC eyewear brand selling glasses, sunglasses, contacts, and eye exams."
summary: "Next.js App Router on Vercel, behind Cloudflare. Feature flags via DevCycle (51 flags); consent via Ketch; store locator via Yext. Payment infrastructure is mid-migration from Braintree to Stripe with a dynamic gateway routing declined payments across processors. Site was in scheduled maintenance at investigation time; core APIs were not directly accessible."
date: "2026-04-13"
time: "20:00"
contributor: "hayabhay"
model: "sonnet-4.6"
effort: "medium"
stack: [Next.js, Vercel, Cloudflare, New Relic, DevCycle, Yext, Dynamic Yield, JScrambler]
trackers: [Google Tag Manager, New Relic, Ketch, BazaarVoice, Singular, Dynamic Yield]
tags: [eyewear, dtc, feature-flags, payment-migration, prescription, virtual-try-on, home-try-on, ai-chat, a-b-testing, consent]
headline: "Sierra AI is feature-flagged off in Warby Parker's production bundle while HubSpot live chat runs — an AI customer service agent is staged and waiting to replace the current support layer."
findings:
  - "All 165 frames in the live catalog have Home Try-On disabled while three Virtual Try-On flags expand -- the original differentiator is off at the catalog level, not the UI."
  - "Declined payments route dynamically between Braintree and Stripe via a live gateway fallback, with three concurrent Stripe A/B tests running the migration in production."
  - "JScrambler JavaScript obfuscation is gated behind a DevCycle feature flag rather than baked into the build -- it can be killed remotely, likely to measure its conversion impact."
  - "The prescription-in-add-to-cart flow is on its third A/B test iteration, with the prior two versions deprecated from the active flag set."
  - "Ketch consent config still wires to Mixpanel's distinct ID for identity linkage, but the Mixpanel browser SDK is flagged off -- the cross-system link silently fails."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

## Investigation Context

The live site (www.warbyparker.com) was in scheduled maintenance for the full duration of this investigation. Cloudflare intercepted all requests and served a maintenance page. The maintenance page itself contains `::CLOUDFLARE_ERROR_500S_BOX::` as a literal unexpanded template placeholder in a hidden div -- a Cloudflare Workers error template variable that wasn't substituted.

Primary data sources:
- **Wayback Machine archive** from 2026-04-12 03:55:10 UTC (one day prior) -- a full Next.js App Router page with React Server Component payloads, including 120 RSC chunks and embedded feature flag state
- **stores.warbyparker.com** -- Yext-powered store locator, fully operational throughout
- **Ketch CDN** (`global.ketchcdn.com`) -- consent configuration publicly accessible
- Direct API probing was blocked; the WAPI endpoints returned maintenance HTML

## Infrastructure

Warby Parker runs Next.js App Router (not Pages Router -- no `__NEXT_DATA__` present, App Router confirmed by `self.__next_f.push()` RSC streaming). Deployed on Vercel: the `data-dpl-id` attribute on the `<html>` element carries the deployment identifier `dpl_DEYRCGDeV2sVgwNn4wvbnsfgXWFk`. The entire domain sits behind Cloudflare.

Response security headers:
- `x-frame-options: SAMEORIGIN`
- `referrer-policy: same-origin`
- `strict-transport-security: max-age=31536000; includeSubDomains`
- `speculation-rules: "/cdn-cgi/speculation"` -- Cloudflare's standard prefetch speculation rules

SSL certificate is a wildcard (`*.warbyparker.com`, `warbyparker.com`) -- no additional subdomains enumerable from the cert chain.

**robots.txt** disallows `/account`, `/my-account`, `/ajax`, `/ajaxcontent`, `/api`, `/cart`, `/checkout`, `/logout`, `/virtual-tryon`, `/preview`, `/cms`, `/rx-upload`, `/pd-upload`, `/atc/*`, `/prescription/*`, `/appointments/eye-exams/`. Notable: `/rx-upload` and `/pd-upload` are dedicated routes for prescription document uploads. `/cms` is at a path rather than a subdomain. `/appointments/eye-exams/booking/` is explicitly allowed -- appointment booking is crawlable. Crawl-delay of 30 seconds. Several AI crawlers blocked by name: `cohere-ai`, `008`, `Bytespider`, `CCBot`, `magpie-crawler`.

**Subdomain responses:**
- `stores.warbyparker.com` -- 200 OK (Yext, fully operational)
- `api.warbyparker.com`, `admin.warbyparker.com`, `blog.warbyparker.com`, `ca.warbyparker.com` -- 403 (Cloudflare)
- `staging.warbyparker.com`, `dev.warbyparker.com` -- DNS / connection refused

**New Relic** (SPA mode) is configured via DevCycle rather than a static script. Full New Relic config is embedded in the `new-relic-browser-sdk` DevCycle variable:
- Account ID: `3902898` / Application ID: `1134439407`
- License key: `NRJS-9041aa5062a3d97ebff` (client-side, expected to be public)
- Session replay: disabled. Session trace: disabled, but error sampling at 100%.
- Loader type: `spa`. Beacon: `bam.nr-data.net`, which is also in the AJAX deny list (prevents NR from tracking its own telemetry calls).

**GTM container**: `GTM-N29SR4` (from archived HTML).

## Feature Flag Architecture

Warby Parker uses **DevCycle** for feature management. The client SDK key (`dvc_client_d2585069_2cdf_4551_9744_18a704565d6f_46734c0`) is embedded in the RSC payload -- this is a public client-side key by design. DevCycle project: `ecom-web` (ID `63dc0fd543fbe6e551ca04fa`), Auth0 org `org_nFoFwyqgVDNM3DP5`.

The full DevCycle SDK configuration is served to every client and embedded in the server-rendered HTML. Fifty-one features are present in the SDK config. The RSC payload also contains a broader flat flags object with additional variables not in the SDK config -- this second set includes flags like `sierra-ai`, `unit-test-flag`, and several others, suggesting a second flag source or older config path that pre-dates DevCycle.

**Active release flags (enabled):**
`advisor`, `atc-options-as-button`, `cart-quantity-dropdown`, `contacts-atc-simplified-flow`, `contacts-plp-list-filters`, `dri-awareness`, `dynamic-similar-to-this-plp`, `dynamic-yield`, `flexible-gift-card-amount`, `frame-lockup-inline-rating-test`, `frame-lockup-try-on-v3`, `frames-plp-updated-lockups`, `insurance-universal-eligibility-check`, `jscrambler`, `ketch`, `legacy-urls` (config: `{legacyUrls:["/cart"]}`), `live-chat`, `manual-pd-entry`, `memo-widgets`, `new-relic-browser-sdk`, `payment-decline-dynamic-gateway`, `plp-filters-tooltip`, `plp-sorting-v2`, `promo-widgets-v3`, `redirect-discontinued-frames-to-plp`, `remove-x-cart-id`, `rx-in-cart`, `rx-in-cart-contacts`, `send-ketch-to-auth0`, `stripe-payment-form`, `two-tokens`, `two-tokens-redirects`, `vto-2-web-pdp`, `vto-rnd-update`, `www-ketch`, `www-next-checkout`, `www-utm-params`

**Inactive release flags (off):**
`address-autocomplete-2` (in A/B test below), `contacts-atc-edit-selections`, `contacts-atc-scan-box`, `contacts-pdp-six-months-supply`, `contacts-plp-add-to-cart`, `customer-profiles-on-account`, `filter-slider-v2`, `frame-lockup-v-3`, `homepage-v2`, `ketch-ccpa`, `mixpanel-browser`, `pdp-cross-selling-bridge-fit`, `pdp-insurance-drawer`, `pdp-width-guide-redesign`, `plp-multi-layout` (+ desktop/mobile variants), `plp-scrollable-images-with-auto-zoom`, `plp-widget-loading-fallback`, `roosevelt-pdp-redesign`, `rx-in-atc-2` (superseded), `show-return-button`, `sierra-ai`, `skip-contacts-atc`, `vto-2-0` (desktop), `vto-debug`, `vto-measure-endlessly`, `vto-performance-optimizations`, `www-route-redirects`

**Active A/B experiments:**
| Flag | Variation |
|------|-----------|
| `address-autocomplete-2` | control |
| `analytics-service` | "both" |
| `filter-slider` | variation-b |
| `manual-pd-entry` | variation-on |
| `next-available-nearby-location-in-booking-flow-2` | variation-b |
| `rx-in-atc-3` | variation-a |
| `show-footer-media` | variation-a |
| `show-kids-frames-in-search` | variation-b (SPLIT -- random distribution) |
| `stripe-link` | variation-a |
| `stripe-payment-element-test` | variation-a |
| `vto-2-0-mobile-only` | variation-a |

`analytics-service: "both"` targets "All Users" -- 100% of visitors are simultaneously running two analytics pipelines. This is a migration bridge, not a test.

## AI Initiatives

Two distinct AI threads are visible in the flag data, operating at different readiness levels.

**Advisor** (`advisor: true`) is fully live. This is Warby Parker's in-house frames recommendation tool, built in partnership with digital agency Kettle and announced publicly in 2025. It handles personalized frame recommendations, combining virtual try-on signals with quiz data.

**Sierra AI** (`sierra-ai: false`) is built and waiting. Sierra.ai is an AI customer service platform -- their product replaces live chat with an AI agent capable of handling order tracking, returns, and guided purchasing. The flag exists in the RSC flat flags object alongside the live flags, which means the integration code is in the current production bundle. The current customer service layer is HubSpot's chat widget, confirmed by Ketch's `appDivs` configuration pointing to `hubspot-messages-iframe-container`, and by `live-chat: true` in the DevCycle flags. Sierra would be its replacement.

The two initiatives are not redundant. `advisor` is a shopping/recommendation tool; Sierra would handle post-purchase and service interactions. Both could coexist.

## Payment Architecture

Warby Parker is in the middle of a payment processor migration. Both Braintree and Stripe are actively loaded.

**Braintree** (legacy): `web.btncdn.com/v1/button.js` loads inline in the archived HTML. This is the Braintree JS SDK CDN -- the loader is still in the production bundle.

**Stripe** (new primary): `stripe-payment-form: true` is live for all users. Three concurrent Stripe experiments are running simultaneously:
- `stripe-payment-element-test: variation-a` -- testing Stripe's Payment Element component (their newer unified form)
- `stripe-link: variation-a` -- testing Stripe Link (saved card auto-fill using Stripe's network)
- `stripe-payment-form` -- the baseline Stripe form, currently the standard path

**Bridge**: `payment-decline-dynamic-gateway: true` is the live fallback. When a payment is declined on one processor, the system routes the retry to the other. This allows the migration to proceed without requiring a hard cutover -- Stripe is primary, Braintree absorbs the failures.

**Auth**: `two-tokens: true` and `two-tokens-redirects: true` -- a dual-token auth pattern (access + refresh), standard for SPA/JWT-based sessions.

## Prescription & Commerce Flow

Prescription handling is a core technical challenge for an eyewear retailer. The robots.txt disallows `/rx-upload`, `/pd-upload`, and `/prescription/*` entirely.

The product detail API returns per-frame data with a direct add-to-cart route at `/eyeglasses/{frame}/{color}/atc`, bypassing the PDP. From the RSC catalog payload, each frame object contains `id`, `storeFrameId`, `name`, `description`, `kind` (eyeGlasses/sunGlasses), `bridgeFit`, `color`, `colorCode`, images (angle, baseTransparent, front, swatch, head_turn variants), `gender`, `isAvailable`, `widthVariants` with per-width HTO availability and htoId values, `isFavorited`, `isKidsFrame`, `price`, `primaryShape`, `eyewireMaterial`, `crossKindFrameColorVariantId` (links to the sunglasses version), `crossBridgeFrameColorVariantId` (links to the large-bridge version), and `action.cta`.

The prescription-in-cart UX has been iterated at least three times. `rx-in-atc-2` is absent from the active flag set (deprecated), `rx-in-cart: true` and `rx-in-cart-contacts: true` are live, and `rx-in-atc-3: variation-a` is the current A/B test. `contacts-atc-scan-box: false` (barcode scanning for contact lens prescriptions) is built but not launched. `checkout-show-upload-preview: false` (prescription upload preview during checkout) is also off.

The WAPI (their internal catalog/commerce API) is referenced in RSC fetch calls with paths like `/v1/catalog/frames/search?kind=eyeGlasses&from=0` and `/v1/pages/homepage-next`. Feature flag `skip-experiments-to-wapi: false` confirms the internal API name. All WAPI endpoints were blocked during maintenance.

## Home Try-On: Signal from the Catalog

The RSC homepage payload includes 165 product items across carousels and recommendation sections. Every single one has `"isHtoAvailable": false`. Every one also has a populated `htoId` field (e.g., `"htoId": "2872801"`, `"htoId": "363024"`).

The Home Try-On program -- Warby Parker's original "try 5 frames at home for free" differentiator -- is not reflected in any current feature flag. No flag controls HTO availability; it's a catalog-level field on each product. The pattern suggests the feature was disabled at the inventory/catalog layer rather than the UI layer.

What this is not: a temporarily hidden UI element. The `isHtoAvailable` field is the signal the frontend reads to decide whether to show HTO as an option. When it's universally false, the option doesn't render regardless of any flag state.

What this could be: a program wind-down (the HTO SKUs still exist as `htoId` references, suggesting the catalog hasn't been cleaned up), a temporary suspension during a platform rebuild, or a strategic pivot. The simultaneous expansion of Virtual Try-On -- `vto-2-web-pdp: true`, `vto-rnd-update: true`, `vto-2-0-mobile-only: variation-a` active -- is the obvious parallel thread.

## Store Infrastructure

`stores.warbyparker.com` is a Yext-powered store locator running independently of the main site. Yext business ID: `3899968`, site ID: `57773`.

The directory contains 357 locations: 352 US stores and 5 Canadian stores. Each individual store page at `stores.warbyparker.com/{state}/{city}/{address-slug}` exposes full entity data in a `window.__INITIAL__DATA__` object without authentication:

- Full address, GPS coordinates (latitude/longitude), Google Place ID
- Phone number, hours (current week + holiday overrides)
- Insurance carriers accepted
- Appointment booking URL (direct link into the eye exam scheduling system)
- `fetchedReviews` array: typically 50 reviews per location, each with author name, full review text, date, and the company's written response
- `ref_reviewsAgg`: aggregate ratings by publisher -- `GOOGLEMYBUSINESS`, `FACEBOOK`, `EXTERNALFIRSTPARTY`, `FIRSTPARTY`

The Mapbox key in `window.__INITIAL__DATA__._env.YEXT_PUBLIC_MAPS_API_KEY` decodes with username `yext` -- this is Yext's shared platform key, not a Warby Parker-owned key.

## Consent & Analytics

**Ketch** is the consent management platform (property code `website_smart_tag`, org code `warby_parker`). The boot configuration covers seven US state-specific regulatory regimes: California (CPRA), Virginia (VCDPA), Colorado, Nevada, Oregon, Texas, and Utah. All other US users fall under a `usgeneral` scope. First-party consent state is stored in the `_swb` cookie. Privacy portal at `https://warby_parker.privacyportal.co`.

Ketch's identity configuration includes `"_mixpanelDistinctID": {"type":"window","variable":"mixpanel.get_distinct_id()","format":"string","priority":1}` -- this wires Ketch's consent decisions to the user's Mixpanel identity, allowing consent to be persisted cross-session via Mixpanel's identity graph. However, `mixpanel-browser: false` in the feature flags means the Mixpanel browser SDK is currently disabled. The `window.mixpanel` object that Ketch expects to call `.get_distinct_id()` on doesn't exist -- the linkage silently fails. This is a legacy configuration that predates the analytics migration.

`send-ketch-to-auth0: true` -- consent state is also pushed into the Auth0 authentication layer. For logged-in users, consent decisions persist in their account and carry across devices without relying on cookie-based state.

`analytics-service: "both"` runs 100% of users through two analytics pipelines simultaneously. The Mixpanel SDK is off but the destination platform isn't named in any flag.

**BazaarVoice** powers product reviews (`apps.bazaarvoice.com` preconnect). **Dynamic Yield** handles personalization including similar-frames carousels (`dynamic-yield: true`). **Singular** (`warbyparker.sng.link`) manages mobile app deep links and attribution. **Vimeo** handles product/marketing video embeds. **HubSpot** provides the current live chat widget (`live-chat: true`).

## Staged Features

Two major page experiences are built and feature-flagged off:

**`homepage-v2: false`** -- A new homepage is ready to deploy but hasn't launched.

**`roosevelt-pdp-redesign: false`** -- "Roosevelt" is also a frame name in the Warby Parker collection, making this a dual-meaning codename. The full PDP redesign is built and gated.

Other unreleased features visible in flags:
- `contacts-plp-add-to-cart: false` -- direct add-to-cart from the contacts listing page
- `contacts-atc-edit-selections: false` -- editing contact lens selections post-add
- `contacts-pdp-six-months-supply: false` -- six-month supply option on contact lens PDPs
- `pdp-insurance-drawer: false` -- insurance information panel on product detail pages
- `pdp-cross-selling-bridge-fit: false` -- cross-sell to large-bridge variants on PDP
- `plp-multi-layout: false` (+ desktop/mobile variants) -- alternative grid layouts for listing pages
- `plp-scrollable-images-with-auto-zoom: false` -- scrollable image strip with zoom on listing pages

**JScrambler** is active via `jscrambler: variation-on`, serving obfuscated JavaScript bundles from `wge20359.jscrambler.com`. The fact that obfuscation is a DevCycle feature flag rather than a build-time constant means it can be toggled off without a deployment. JScrambler adds measurable bundle overhead (typically 10-30% size increase, with latency impact), and gating it behind a remote toggle lets Warby Parker kill it if it causes a conversion regression -- or A/B test its presence against a clean bundle.

## Machine Briefing

**Access & auth**

The live site was in maintenance mode as of 2026-04-13. The stores subdomain is fully operational and requires no auth. Historical homepage content is available via Wayback Machine. Direct API access to WAPI requires the live site to be up.

For the stores subdomain: all data is in `window.__INITIAL__DATA__` on the server-rendered page. No session or authentication required.

For the main site when live: Next.js App Router with RSC streaming. Feature flags and New Relic config are embedded in the RSC payload chunks. No `window.__REDUX_STATE__` or similar global -- all server-side.

**Endpoints**

Stores directory page (no auth):
```
GET https://stores.warbyparker.com/
```

Individual store page (no auth, replace slug with `{state}/{city}/{address}`):
```
GET https://stores.warbyparker.com/us/ny/new-york/1407-broadway
```
Response: full HTML with `window.__INITIAL__DATA__` containing entity data, reviews, coordinates, hours, insurance carriers.

Sitemap for all store slugs:
```
GET https://stores.warbyparker.com/sitemap.xml
```

Internal catalog API (blocked during maintenance, schema from RSC):
```
GET https://www.warbyparker.com/v1/catalog/frames/search?kind=eyeGlasses&from=0
GET https://www.warbyparker.com/v1/catalog/frames/search?merch=new-arrival&kind=eyeGlasses&kind=sunGlasses&prices=95
GET https://www.warbyparker.com/v1/catalog/frames?groups={group-id}&defaults=front
GET https://www.warbyparker.com/v1/pages/homepage-next
```

CMS page API (blocked during maintenance):
```
GET https://www.warbyparker.com/v1/pages/{page-slug}
```

Ketch consent configuration (public, no auth):
```
GET https://global.ketchcdn.com/web/v2/config/warby_parker/website_smart_tag/boot.js
```

DevCycle SDK config (public, no auth):
```
GET https://sdk-api.devcycle.com/v1/sdkConfig?sdkKey=dvc_client_d2585069_2cdf_4551_9744_18a704565d6f_46734c0&user_id={any_id}
```

Direct add-to-cart route (bypasses PDP, blocked during maintenance):
```
GET https://www.warbyparker.com/eyeglasses/{frame-name}/{color-name}/atc
```

**Gotchas**

- The main site is behind Cloudflare maintenance mode as of 2026-04-13 and may still be during any replay of this report.
- RSC payload chunks are numbered (`self.__next_f.push([1, "..."])`) but not labeled by content -- chunk numbers may shift across deployments.
- DevCycle SDK config returns 51 features with full variation state. The flat flags object embedded separately in the RSC HTML contains additional variables not in the SDK response -- look for the `"flags":{...}` key in the RSC stream.
- WAPI path prefix is `/v1/` -- not `/api/v1/`. The `/api` path is disallowed in robots.txt, but `/v1/` is not.
- Stores subdomain slug format: `/{state-abbr}/{city}/{street-address-slug}` for US locations, `/ca/{province-abbr}/{city}/{address-slug}` for Canada.
