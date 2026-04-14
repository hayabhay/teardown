---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "Glossier --- Teardown"
url: "https://glossier.com"
company: "Glossier"
industry: "Retail"
description: "DTC beauty brand selling skincare, makeup, and fragrance."
summary: "Glossier runs on a custom Shopify storefront (glossier-admin.myshopify.com) with a bespoke SDG theme framework behind Cloudflare CDN. International commerce is handled by Global-e across 150+ countries. Subscriptions run through ReCharge. Paid acquisition traffic routes to a parallel Fermat Commerce stack on buy.glossier.com (Vercel/Next.js). A separate UK Shopify store mirrors the US catalog."
date: "2026-04-13"
time: "19:53"
contributor: "hayabhay"
model: "sonnet-4.6"
effort: "high"
stack:
  - Shopify
  - Cloudflare
  - Vercel
  - ReCharge
  - Global-e
  - Fermat Commerce
trackers:
  - Google Analytics
  - Google Ads
  - Facebook Pixel
  - Facebook CAPI
  - Pinterest Pixel
  - TikTok Pixel
  - Reddit Pixel
  - Snapchat Pixel
  - Microsoft Clarity
  - Microsoft UET
  - Klaviyo
  - Optimizely
  - FullStory
  - PostHog
  - Forter
  - Elevar
  - Impact Radius
  - Yotpo
  - Gorgias
  - Joinground AI
  - Afterpay
  - Shopify Monorail
tags:
  - shopify
  - beauty
  - ecommerce
  - subscriptions
  - session-recording
  - pre-consent-tracking
  - product-tags
  - fermat
  - dtc
  - klaviyo
headline: "Glossier's public product catalog ships every internal operational tag -- employee discount flags, hardlocked sale pricing, and test markers on 50 live SKUs -- in a single JSON endpoint."
findings:
  - "Every product's tags array is public in products.json: 87 flagged for employee discounts, 18 with hardlocked Friends-of-Glossier sale prices, 50 marked as SDG Test on live inventory, and the full BFCM eligibility list -- a complete read of Glossier's discount architecture."
  - "Klaviyo's public forms endpoint returns all 41 email campaigns including pre-launch signups for two products that still 404 (Impressions, Black Cherry) and a Vegas retail store not yet announced."
  - "Three session recorders run simultaneously -- FullStory, Microsoft Clarity, and Fermat's Claire SDK -- each feeding a different optimization stack, with Optimizely experiment assignments piped directly into FullStory recordings."
  - "buy.glossier.com is a parallel Fermat Commerce app on Vercel that intercepts ad traffic into its own checkout funnel, structurally separate from the main Shopify store."
  - "OneTrust consent banner is present but non-blocking -- the OptanonWrapper callback only updates Shopify's internal consent API while all 20+ third-party trackers fire unconditionally on page load."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

Glossier's technical surface is broader than the clean, editorial storefront suggests. The main store (glossier-admin.myshopify.com, Shop ID `62791647477`) runs on Shopify with a fully custom theme -- theme ID `157354852597`, schema version 3.40.1 -- built around an internal framework called SDG. The SDG namespace is exposed as `window.SDG` with modules for cart management, country selection, product parsing, Klaviyo back-in-stock, modals, and OneTrust consent group parsing. The theme is not from the Shopify Theme Store (`theme_store_id: null`).

Cloudflare sits in front as CDN and bot filter, with Turnstile protecting checkout flows. Global-e handles international localization -- 150+ countries get country-specific paths (`/en-ad/`, `/en-ae/`, etc.) with a dedicated `GLBE_PARAMS` config that hides Afterpay and Amazon Pay for international visitors, disables Shop Pay internationally, and tracks UTM parameters with a 3-day cookie lifetime.

A separate UK Shopify store runs at `uk.glossier.com` (theme ID `183817470330`). The SSL certificate's Subject Alternative Names map the full infrastructure: `*.loyalty.glossier.com`, `*.email-data.glossier.com`, `*.email-data.staging.glossier.com`, `*.staging.glossier.com`, `account.glossier.com`, `account.uk.glossier.com`, `buy.glossier.com`, `shop-dev.glossier.com`, and `uk-dev.glossier.com`.

`shop-dev.glossier.com` is a live Shopify store on a public subdomain, password-gated with a different theme (`136332050669`) -- a dev/staging environment discoverable via cert enumeration. `account.glossier.com` returns 406 without `Accept: text/html`, and its server-timing header exposes `verdict_flag_enabled;desc="count=41"` -- 41 fraud and bot verdict flags evaluated on every request. `loyalty.glossier.com` has a wildcard cert entry but no live DNS -- either upcoming or retired.

## The Product Tag Catalog

Shopify's `products.json` endpoint serves the full catalog without authentication. Glossier's 134 products come back in a 1.4 MB response that includes handles, variant SKUs, variant IDs, full HTML descriptions, pricing, and -- the interesting part -- every product's internal `tags` array.

These are not display metadata. They are Glossier's internal CMS state, promotion logic, and operational flags, readable by anyone who makes a single GET request:

**Discount and pricing strategy:**
- `emp-disc-yes` -- 87 of 134 products (65%) are flagged as eligible for the employee discount program.
- `fog25` / `fog24` -- 59 and 46 products carry Friends of Glossier sale event tags from consecutive years. FOG is an annual sale; both years' tags remain on live products.
- `fog2025_hardmark` -- 18 products have hardlocked FOG pricing: Perfecting Skin Tint, Haloscope, Monochromes, Stretch Fluid Foundation, Stretch Balm Concealer, Creme de You, Cloud Paint, Three Eyed Smiley Mug, Generation G, Birthday Cake Candle, Lip Gloss, Stretch Face Brush, G Suit, Lidstar, Skywash, Universal Pro-Retinol, Pro Tip, Super Pure.
- `bfcm-eligible` -- 69 products eligible for Black Friday/Cyber Monday discounts.
- `bfcm-2025-hardmark` / `part2_bfcm_hardmark25` -- products with hardcoded BFCM prices, separate from standard discount eligibility.
- `Promo Excluded` -- 19 products excluded from promotional pricing.
- `Maximum Limit: 20` -- 61 products with a per-order purchase cap embedded as a tag.

**Promotion and sale history:**
- `dec-surprise-sale`, `dec25_surprisesale`, `surprisesaledec24`, `surprisesalemarch25` -- four historical flash sale events still tagged on live products.
- `EndOfSeason_2025`, `eos_2025` -- end-of-season clearance tags.
- `FABB` -- 46 products tagged, likely "Friends and Family Buy" based on the pattern.

**Platform and operational:**
- `GLS 2.0` -- 122 products tagged with an internal platform version marker.
- `pricing_export` -- 95 products flagged for price feed generation.
- `SDG Test` -- 50 live products marked as used for testing the SDG theme framework in production.
- `tiktokshop` -- 12 products synced to TikTok Shop: Balm Dotcom, Cloud Paint, Boy Brow, Boy Brow Arch, Glossier You line, Futuredew, and related SKUs.
- `YGroup_*` -- 30+ unique recommendation grouping IDs (e.g., `YGroup_bbrow`, `YGroup_sc`, `YGroup_solution`) that drive Yotpo's related-product logic.

The `pricing_export` tag on 95 products combined with `fog2025_hardmark`, `bfcm-2025-hardmark`, and `Promo Excluded` gives a complete read of which products are eligible for which discount tiers -- the kind of information that normally lives behind an internal admin.

## Klaviyo's Public Launch Calendar

Glossier's Klaviyo public key (`Sn6eFZ`) is hardcoded in the page source. The endpoint `https://static-forms.klaviyo.com/forms/api/v7/Sn6eFZ/full-forms` returns all 41 configured email/popup forms without authentication. This is standard Klaviyo architecture -- the public key renders consent forms -- but the full-forms endpoint returns form names that expose Glossier's product launch sequencing.

**Pre-launch signals for products that still return 404:**
- `Impressions Pre-Launch LP - Email Signup` -- no product at `/products/impressions`, no catalog entry. An `impressions` tag appears on fragrance sample collateral, suggesting a new fragrance in the Glossier You line.
- `Black Cherry Pre-Launch LP - Email Signup` -- no product at `/products/black-cherry`, no catalog entry.
- `Banana Pudding BDC Pre-Launch LP - Email Signup` -- "BDC" is Balm Dotcom; Banana Pudding is not among the current 134 products. Likely an unreleased flavor variant.

Several other "pre-launch" forms are historical -- Fleur, Skylight, and Invisible Shield SPF50 all have live products in the catalog. The endpoint is an archive of past and future campaigns, not just upcoming ones.

**Retail expansion:**
- `Vegas + Dallas Opening Soon Module - Email Signup` -- a Dallas store opened in 2024 (a giveaway form for it is also present). Vegas is the undisclosed expansion signal.

**Professional segmentation:**
- `2026 - Soie - Welcome Modal - Pros - Email + SMS` variants reveal a professional/trade program ("Pros") with distinct welcome flows from consumer visitors.

**Test forms in production:**
- `TEST BFCM Early Access Pre-launch Module Signup` and `WB TEST Rich Text Module Signup` -- test forms with production audience configurations still live.

The form settings confirm Klaviyo syncs SMS consent to Shopify customer records (`sync_SMS_consent: true`) but not email consent (`sync_email_consent: false`).

## Surveillance Stack

28 third-party domains make requests on homepage load. The tracker footprint spans every major ad platform plus several layers of session recording and fraud detection.

**Ad and analytics pixels (all fire before consent interaction):**
- Google Analytics: three GA4 properties (`_ga_C43W8XZ93R`, `_ga_CKB65RMMGX`, `_ga_J11MBLGD5V`).
- Google Ads: conversion tracking ID `960173363`. Google Merchant Center analytics.
- Facebook Pixel with server-side CAPI enabled (`facebookCapiEnabled: true`, `apiClientId: 580111`) -- conversion events fire server-to-server regardless of browser-side blocking.
- Pinterest Pixel: `_pin_unauth` UUID set pre-consent.
- TikTok Pixel with TikTok Shop click sessions tracked via `ttcsid` cookies.
- Reddit Pixel: `_rdt_uuid`, pixel ID `t2_3j2avnpr`.
- Snapchat Pixel: `_scid`, `_scid_r`.
- Microsoft Bing UET: `_uetsid`, `_uetvid`. Integrated with Microsoft Clarity for cross-session identity resolution.
- Klaviyo: `__kla_id` user token.
- Impact Radius: affiliate tracking ID `1424243` via `glossier.79ic8e.net`.

**Consent state:**
OneTrust (UUID `3477b0b7-8634-4e7d-9808-fced5620e97d`) provides the consent banner. The `OptanonWrapper` callback -- the function that fires when a user interacts with the banner -- handles exactly three things: calling `setShopifyConsent()` to update Shopify's internal consent API, toggling Optimizely event sending, and nothing else. All 20+ third-party trackers load unconditionally before the banner is shown.

Elevar's `consent_v2` configuration defaults every consent category to `true`: `ad_storage`, `ad_user_data`, `ad_personalization`, and `analytics_storage` are all `{default: true, update: true}`. Google Consent Mode v2 treats all visitors as having consented until they explicitly opt out -- the reverse of the GDPR default model.

**Elevar attribution aggregation:**
Elevar (`/a/elevar`, 204 responses) collects all tracker IDs into a single `_Elevar-apex` cookie: `_fbp`, `_ga`, `_rdt_uuid`, `_scid`, `_ttp`, `_uetsid`, `_uetvid` serialized together. Glossier's server-side infrastructure receives every user's full cross-platform identity on every page request, independent of browser-side cookie blocking.

**Forter fraud detection:**
Two Forter site IDs: `21bd15724800` (main US store) and `7ce243a1e1a2` (UK/international via Global-e). Forter generates a `forterToken` device fingerprint that persists across sessions.

## Three-Layer Session Recording

Three session recording tools run simultaneously:

**FullStory** (org `o-1WSDXJ-na1`): Glossier's primary UX research tool. Optimizely is wired directly into FullStory -- every A/B test variant assignment fires `FS.event('Experiment', payload)` via a custom plugin in the Optimizely bundle, making every experiment decision visible in session recordings.

**Microsoft Clarity** (project `w4j1994wue`): heatmaps and session recordings integrated with the Microsoft Advertising UET stack. Clarity tracks `_uetmsclkid` alongside `_clck` and `_uetvid`, enabling cross-session identity resolution between recordings and Bing Ads conversions.

**Fermat "Claire"** (endpoints: `e.clairedefermat.com`, `events-server.fermatcommerce.workers.dev`): Fermat's own session recording SDK with PII sanitization patterns built in (email, phone, SSN, credit card, IP address regexes in `Claire.ALL_PII_PATTERNS`). Claire records sessions on the main site and on `buy.glossier.com`, feeding conversion data back to Fermat's landing page optimization model.

PostHog (token `phc_jDLcwdhyM7Tr7YGVJOvN9HduieQ7AhG3mBp8l8wrAQA`) is present with heatmaps enabled but session recording disabled. It serves product analytics, not session playback.

## Fermat Commerce: The Parallel Ad Stack

`buy.glossier.com` is not part of the main Shopify store. It runs on Vercel (Next.js) as Fermat Commerce's AI landing page builder for paid acquisition.

Ad traffic from Facebook, TikTok, and Google lands on Fermat-managed pages at `buy.glossier.com` rather than the main site. Fermat builds and optimizes these landing pages independently -- assets from `hosted-tiles-next-assets.fermatcommerce.com`, images via ImageKit.io CDN. The Claire SDK captures behavior on these pages to inform Fermat's optimization model.

This means Glossier runs two separate conversion paths: organic and direct traffic through Shopify checkout, ad traffic through Fermat's funnel. Optimizely experiments run on the main site; Fermat's optimization runs on the paid funnel. The two analytics stacks -- FullStory + Optimizely on main, Claire + Fermat on buy -- are structurally separate.

## Additional Services

**Optimizely** (account `22916101539`): The full experiment configuration is public in the client bundle at `cdn.optimizely.com/js/22916101539.js`. Active experiments at time of investigation:
- `[RPX] CLPs` (ID: 29256360136) -- Collection Landing Pages
- `Stretch Balm Concealer` (ID: 29457580105) -- PDP-level experiment
- `[RPX] US & UK Sitewide` (ID: 4983924435189760)
- `[RPX] US & UK PLPs + PDPs` (ID: 6670767841083392)

A JavaScript condition in one experiment reads `SDG.Data.productJson.tags.includes('final_sale')` -- confirming that internal product tags drive experiment eligibility logic.

**ReCharge subscriptions:** Subscription plan data is publicly accessible at `https://static.rechargecdn.com/store/glossier-admin.myshopify.com/product/2022-06/{product_id}.json`. For Boy Brow, five plans are configured: 1-5 month intervals, all at 10% discount, external plan group ID `1754693877`.

**Yotpo reviews:** API key `xAJLIqkdZjK3FOIgCqiXbx1OtYADZxhE80pWNsAW` hardcoded in page globals. The widget API is publicly accessible. Boy Brow: 6,996 reviews, average score 4.41.

**Gorgias chat:** The `/agents` endpoint returns three active support agent names and profile photo URLs: Ariela, Tammie, Christine.

**Joinground AI** (`ai.joinground.com`): Posts 3 events on homepage load. No globals or config exposed -- injected via tag manager. Scope unclear; likely AI-powered personalization.

**Shopify internals:**
- Beta flags in client config: `enabledBetaFlags = ["b5387b81", "d5bdd5d0"]`.
- `checkout_extensibility_converted` cookie confirms migration to Shopify Checkout Extensibility.
- Storefront GraphQL at `/api/unstable/graphql.json` responds without a `X-Shopify-Storefront-Access-Token` -- schema introspection works, full product queries work. The `unstable` version has no stability guarantees. This is standard Shopify default behavior, not a misconfiguration.

**robots.txt agent policy:** Glossier's robots.txt includes an explicit block targeting AI agents: "Checkouts are for humans. Automated scraping, 'buy-for-me' agents, or any end-to-end flow that completes payment without a final human review step is not permitted." URL disallow patterns include hex-suffix `-remote` product variants across all locales -- likely targeting federated catalog entries from Global-e.

## Machine Briefing

### Access & Auth

No authentication is required for the product catalog, reviews, subscription data, or GraphQL. The main site returns HTML without bot challenges for basic GET requests. Rate limiting is aggressive on some endpoints -- 429 observed after minimal crawling, enforced by Cloudflare.

A first request to `https://www.glossier.com/` sets `_shopify_y` (1-year persistent user ID) and `_shopify_s` (30-min session) automatically. These are sufficient for cart and browsing APIs. Checkout requires Cloudflare Turnstile; automated checkout is explicitly prohibited in robots.txt.

### Endpoints

**Product catalog (open)**
```
GET https://www.glossier.com/products.json?limit=250
```
Returns 134 products with handles, variants, prices, tags, HTML descriptions. No auth. Response ~1.4MB.

**Product detail (open)**
```
GET https://www.glossier.com/products/{handle}.json
```
Single product with full variant/SKU data.

**Product recommendations (open, disallowed by robots.txt)**
```
GET https://www.glossier.com/recommendations/products.json?product_id={id}&limit=5
```
Returns complete product data for recommended products. Accessible but explicitly disallowed.

**Collections (open)**
```
GET https://www.glossier.com/collections/{handle}/products.json?limit=250
```
Notable collections: `bestsellers-test`, `danielas-routine`, `complexion-bogo`, `build-your-routine`.

**Storefront GraphQL (open, no token required)**
```
POST https://www.glossier.com/api/unstable/graphql.json
Content-Type: application/json

{"query": "{ products(first: 10) { edges { node { title handle priceRange { minVariantPrice { amount } } } } } }"}
```
Schema introspection works. `requestedQueryCost` in extensions. Rate-limited but not enforced on simple queries.

**Klaviyo forms (open)**
```
GET https://static-forms.klaviyo.com/forms/api/v7/Sn6eFZ/full-forms
```
Returns all 41 configured email/popup forms including names and configuration.

**ReCharge subscription plans (open)**
```
GET https://static.rechargecdn.com/store/glossier-admin.myshopify.com/product/2022-06/{shopify_product_id}.json
```
Returns plan IDs, discount amounts, intervals. Boy Brow product ID: `6706219819253`.

**Yotpo reviews (open)**
```
GET https://api-cdn.yotpo.com/v1/widget/xAJLIqkdZjK3FOIgCqiXbx1OtYADZxhE80pWNsAW/products/{domain_key}/reviews.json?per_page=50&page=1
```
`domain_key` is the Shopify variant ID. Boy Brow: `8058325532917`.

**Cart (session required)**
```
GET https://www.glossier.com/cart.js
POST https://www.glossier.com/cart/add.js
POST https://www.glossier.com/cart/update.js
```
Standard Shopify cart API. Requires `_shopify_y` + `_shopify_s` cookies.

### Gotchas

- `unstable` GraphQL version: fields can disappear without notice.
- `/recommendations/products.json` works but is disallowed by robots.txt.
- Cloudflare rate limiting is aggressive -- 429 at low request rates on product endpoints.
- ReCharge CDN uses a `2022-06` path segment that may be a static snapshot date.
- Facebook CAPI is server-side; browser pixel blocking does not prevent conversion events.
- Klaviyo key `Sn6eFZ` is read-only for forms. Yotpo key is read-only for reviews.
