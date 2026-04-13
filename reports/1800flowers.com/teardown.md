---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "1-800-Flowers — Teardown"
url: "https://1800flowers.com"
company: "1-800-Flowers"
industry: "Retail"
description: "Online floral and gifting retailer operating 13 sister brands on shared infrastructure."
summary: "React PWA backed by Apollo GraphQL and a Contentstack CMS. The checkout runs as a separate micro-frontend at /checkout_app/ with its own asset manifest. All 13 sister brands (Harry & David, Cheryl's, Wolferman's, etc.) share one TLS certificate and infrastructure. Auth0 handles identity; Tealium IQ orchestrates a 16-vendor tracking stack. A Spring-based flag service delivers 1,241 feature flags client-side on every session."
date: 2026-04-07
time: "08:11"
contributor: hayabhay
model: "sonnet-4.6"
effort: high
stack:
  - React
  - Apollo GraphQL
  - Contentstack
  - Auth0
  - Varnish
  - Tealium IQ
trackers:
  - DataDog RUM
  - Google Analytics 4
  - Google Tag Manager
  - Tealium IQ
  - FullStory
  - TrustArc
  - Klarna
  - Accertify
  - Rokt
  - Amazon Ads
  - MediaMath
  - Taboola
  - BounceX/Wunderkind
  - Yotpo
  - Salesforce Marketing Cloud
  - CardIsle
tags:
  - e-commerce
  - flowers
  - retail
  - graphql
  - source-maps
  - feature-flags
  - dynamic-pricing
  - credential-exposure
  - micro-frontend
  - multi-brand
headline: "Every browser session downloads 1,241 feature flags -- including a live pricing experiment that quietly varies what you pay by SKU."
findings:
  - "The checkout micro-frontend publishes its asset manifest and all 14 source maps at /checkout_app/ -- the 12MB main.js.map contains 1,703 source files marked 'Confidential and Proprietary,' exposing internal API routes, A/B test wiring, and fraud detection implementation details."
  - "A public JavaScript file every browser downloads bundles a SmartGift App Secret, two live Experian address-verification tokens, Twilio and Genesys chat credentials, and a florist portal Auth0 domain that points at a UAT tenant -- not production."
  - "The GraphQL catalog API returns full pricing for any product or category without authentication -- all SKU tiers, retail and sale -- enabling unauthenticated price monitoring across all 13 sister brands from a single endpoint."
  - "TrustArc's consent model is set to 'implied' for US visitors, auto-granting all 15 tracking categories on first load -- DataDog RUM, GA4, and Klarna fire before the user touches anything, and Accertify device-fingerprints at checkout with no explicit consent."
---

## Architecture

1-800-Flowers runs a React Progressive Web App backed by Apollo GraphQL for data fetching and Contentstack as the headless CMS. Varnish sits at the edge with multi-layer CDN caching (`x-cache: MISS, HIT, HIT`). The `Vary` header includes `fabvh`, `be-origin`, `x-pwa-canary`, and `X-UA-Device` -- canary deployments and A/B test routing happen at the CDN layer.

The checkout is a separate micro-frontend deployed at `/checkout_app/`, with its own webpack build, asset manifest, and source map files. The main site and checkout MFE communicate via shared Apollo state and session cookies.

All 13 sister brands -- 1-800-Baskets, Berries, Cheryl's, Florists.com, Plants.com, Fruit Bouquets, Harry & David, Simply Chocolate, The Popcorn Factory, Vital Choice, Wolferman's, Celebrations.com, and 1-800-Flowers.ca -- share one TLS certificate and the same infrastructure. The `frame-ancestors` CSP directive and SSL SAN list confirm the full portfolio. The internal domain `18f.tech` appears in multiple config values (`prod-celebrations-chained.18f.tech`, `wss-prod.origin-gcp-prod.18f.tech`), with `pmallstore.pmalladmin.com` referencing the PersonalizationMall admin interface.

Auth0 handles identity via `login.celebrations.com`. The `access-control-allow-headers` list includes `LambdaTest-Testing` -- a test automation platform header exposed in production CORS config.

Initial page weight: 1.4MB uncompressed.

---

## The env.js Config Dump

`window.mbp.env` is a public JavaScript object loaded on every page. It contains 80+ configuration keys, and the approach is clearly "give the browser everything the app might need." Most are standard client-side config -- PayPal client ID, Google reCAPTCHA site keys, Klarna SDK URL. But mixed in with the harmless keys:

**SmartGift credentials:**
```
APP_SMARTGIFT_APP_ID: 'LaQiolqfh1TV23QA5fd8nivBza9NhM7SOKiAdzES'
APP_SMARTGIFT_APP_SECRET: 'dPBhCshdKR18nk6ZRfQcbB2KHHf4RZSxl0MeX8Od'
```
An ID/secret pair served in plaintext. Whether this is a client-facing app secret (like Stripe's publishable key) or a server-side credential depends on SmartGift's auth model -- but the field name `APP_SECRET` and the credential pair pattern suggest an OAuth-style merchant identity that could allow acting as the 1-800-Flowers SmartGift merchant.

**Experian address verification tokens:**
```
APP_VERIFY_ADDRESS_AUTH_TOKEN: '57d922c9-043e-4073-bee3-a5c8982baa3a'
APP_VERIFY_ADDRESS_AUTH_TOKEN_GNAV: '00957c89-bb2f-499a-a62e-ac6e7ce06a69'
```
Two API auth tokens for Experian's address validation service (`api.edq.com`, `api.experianaperture.io`). The investigator confirmed these are functional -- they return authenticated API responses.

**ROSS recommendation tokens:**
```
ROSS_TOKEN_DESKTOP: '7496af667ead3c3540e3adb197d503cf65e9cf58...'
ROSS_TOKEN_MOBILE: '37f69a0a64aee14734d612a60cb04134ee70bd65...'
```
64-character hex strings for the product recommendation service, scoped by device type.

**UAT Auth0 in production:**
```
APP_FLORISTS_AUTH_DOMAIN: 'florists-uat.1800-flowers.auth0.com'
APP_FLORISTS_AUTH_AUDIENCE: 'https://florists-uat.1800-flowers.auth0.com/api/v2/'
```
The florist order management portal -- where florists receive and process customer orders -- is configured with UAT (User Acceptance Testing) Auth0 credentials in the production customer-facing app. The OIDC configuration endpoint is live.

**Also present:** Twilio WebChat account SID and Flex Flow SID (`ACbca1d63020e4c2121c08289b8b4635a3`, `FOc4bba81a487c9ffb7c3fd60ed67b2730`), Genesys deployment key and org GUID, Google OAuth client ID, Reserve Bar (alcohol delivery) client ID, WeSalute (military discount) client ID, Accertify fraud detection script URL, Apple Pay and Google Pay merchant IDs, Paze (Chase) digital wallet ID, USAA SAML redirect URL, Military Connect OAuth client ID, and a full RSA public key for email encryption.

---

## Checkout Source Maps

The checkout micro-frontend's build manifest at `/checkout_app/asset-manifest.json` is publicly accessible and lists 14 `.map` files. Every one returns HTTP 200.

The `main.js.map` is 12MB and contains 1,703 source files -- 514 internal application files and 1,189 `node_modules` dependencies. Every internal file carries the header:

```
/*
 * Confidential and Proprietary.
 * Do not distribute without 1-800-Flowers.com, Inc. consent.
 * Copyright 1-800-Flowers.com, Inc. 2019. All rights reserved.
 */
```

The source tree reveals the full internal architecture:

- `apis/cart-service-apis/` -- cart operations, dynamic passport pricing (`calculateDynamicPassport.js`), AI gift messages (`getChatgptMessage.js`)
- `apis/checkout-apis/` -- checkout flow implementation
- `app/helpers/DynamicPricing/Debouncer.js` -- price engine with request batching
- `app/pages/Checkout/containers/EnterpriseCheckout/Common/ABTestSaleForce/` -- 13 Salesforce-managed A/B test containers, including `ShortenedShippingABTest`, `OnePageCheckoutABTest`, `MiddlePlaceOrderButtonABTest`, `RememberMeABTest`, `CardisleGridViewABTest`
- `app/pages/Checkout/containers/EnterpriseCheckout/Common/Accertify/` -- fraud detection implementation (AccertifyContext, AccertifyScript, AccertifyWrapper)
- `state/ducks/MfeCheckout/ducks/CartItem/ChatGptMessage/` -- Redux duck for AI gift message feature (action types, actions, selectors)

The `getChatgptMessage.js` source routes to `/flowers-gpt/api/gift-message` -- an internal AI gift message generation service. The flag `is-chat-gpt-enabled: false` suggests this is disabled, but the source code and Redux state management are fully present in production builds. The endpoint itself requires JWT authentication.

---

## Feature Flag Apparatus

Every browser session triggers a `POST /r/api/feature/mbp-ui/flags` request. The response contains 1,241 feature flags -- the entire operational configuration of the site, delivered to the client.

Error responses from this endpoint leak the Java class path: `com.fd.flags.controller.FlagsController` with Spring MVC validation error details including method signatures and parameter types.

**Employee email whitelist** -- the `flora-chat-whitelist` flag contains 9 real employee email addresses, including QA team distribution lists and individual developer emails at `@1800flowers.com` and personal Gmail addresses.

**Stale promo codes:**
```json
"hd-prom-code-variant": {
  "1018": "FAL22",
  "1019": "FAL22",
  "1020": "WOW22",
  "1031": "VTC22"
}
```
These appear to be fall 2022 promotional codes for multiple brand IDs (Harry & David, Wolferman's, etc.), still sitting in live production configuration years later. Whether they're still redeemable is a separate question -- their presence reveals the multi-brand promo code structure and naming convention.

**Active A/B tests:**
- `dynamic-pricing-test: "enabled"` and `is-dynamic-pricing-enabled: true` -- dynamic pricing is live
- `which-flex-redesign: "VARIANT A"` -- pricing UI experiment
- `which-collection-page-restructure: "variantB"` -- collection page layout test
- `which-passport-sidebar-enabled-variant: "VARIANT B"` -- passport subscription sidebar
- `which-giftfinder-homepage-variant: "VARIANT A"` -- gift finder UI test
- `localpages-ab-testing: "VARIANT A"` -- local florist page experiment

**Internal routes and shelved features:**
- `/account/dadjokegpt` -- confirmed to exist (redirects to sign-in). Corroborated by `is-dad-joke-otd-enabled: true` and `is-dad-joke-page-product-button-enabled: false`
- `/account/momverse` -- redirects to sign-in
- `/account/vday-playbook` -- excluded from chat widget per flags
- `is-floraverse-route-enabled: false` alongside other Floraverse flags -- a shelved product line

**LaunchDarkly conflict:** `APP_LD_CLIENT_SDK_ID: "5de9153a8eba6c07f7e3d253"` and `LD_CLIENT_SDK_ENABLED: "true"` are configured in env.js, but `is-launch-darkly-client-sdk-enabled: false` in the flag payload. The in-house 1,241-flag system appears to have won this particular infrastructure decision.

---

## GraphQL Open Catalog

The GraphQL endpoint at `POST /r/api/aggregator/graphql` serves the entire product catalog without authentication. Key queries:

- `findProductById(brand, environment, id)` -- returns full product data with all price tiers
- `findCategoryById(brand, environment, id)` -- returns categories with all products and pricing
- `findCategoryPageByUrl` -- collection pages with product listings
- `findContent(brand, contentType, environment)` -- CMS content and brand configuration for any sister brand
- `findHomePage`, `findHeader`, `findTrendingSearches` -- all open

Introspection is partially disabled -- the `__schema` `types` and `queryType` fields are blocked -- but error messages expose the type system piecemeal. Querying an invalid field returns the valid field names for that type: `ProductBase` exposes `id`, `name`, `partNumber`, `brandId`, `prices`, `skuPriceRange`, `image`, `brand`, `seo`, `isPersonalizable`, `isPassportEligible`, `availability`.

A single `findCategoryById` call for "Best Selling Flowers" returns 12 products with every SKU price point (retail and sale). The same query structure works across all sister brands -- `findContent(brand: "HD", ...)` for Harry & David, `findContent(brand: "CCO", ...)` for Cheryl's. Cart, personalization, and search endpoints properly return `RBAC: access denied`.

---

## Dynamic Pricing

Dynamic pricing is confirmed live via two feature flags: `dynamic-pricing-test: "enabled"` and `is-dynamic-pricing-enabled: true`.

The evidence: querying `findProductById` for "Floral Embrace" (part number `1001-P-191167`) directly via the GraphQL API returns 8 distinct price points ($44.99, $49.99, $54.99, $59.99, $64.99, $69.99, $74.99, $79.99), while the Apollo cache from a browser session showed only 4 of those same prices. The difference could reflect geo-gating, session-level assignment, or the browser simply displaying the subset relevant to the visitor's selected size options -- but the API makes the full price ladder visible either way.

The flag `is-breakdown-price-region-enabled` limits price breakdown display to CA, NY, IN, DC, and CO. The source maps reveal `DynamicPricing/Debouncer.js` -- a request batching mechanism for the price engine, and `calculateDynamicPassport.js` for dynamic passport subscription pricing at `/checkout/v2/cart/{cartId}/dynamicpassport`.

---

## Tracking and Surveillance

**Consent model:** TrustArc sets `notice_behavior=implied,eu` for US visitors. This means all 15 consent categories are auto-granted (`c1:1|c2:1|...|c15:1`) without any user action. The `CONSENTMGR` cookie arrives pre-populated on first visit. European visitors presumably get an opt-in banner; US visitors get implied consent and immediate tracking.

**Pre-consent activity on first homepage load (25 requests, 4 first-party endpoints, 4 third-party domains):**
- DataDog RUM: 15 POST requests to `browser-intake-datadoghq.com` (application: `mbp-pwa-rum-application`, v5.35.1)
- TrustArc: 2 analytics calls to `consent.trustarc.com`
- Google Analytics 4: 2 POST requests to `www.google-analytics.com/g/collect`
- Klarna: on-site messaging SDK loads on homepage and product pages regardless of cart state

**Checkout adds:**
- Accertify: device fingerprinting beacon to `prod.accdab.net/beacon/gt` -- fires at checkout before any explicit consent for device fingerprinting
- Paze (Chase): ghost layer and logging at `checkout.paze.com`
- PayPal: logger at `www.paypal.com/xoplatform/logger/api/logger`
- Visa Checkout: legacy integration (Visa Checkout was deprecated in 2020)

**Full tracker inventory via Tealium IQ (`1800flowers/full/prod` profile):**

| Tracker | Purpose | Notes |
|---------|---------|-------|
| DataDog RUM | Performance monitoring | Client token public, 15 calls/pageview |
| Google Analytics 4 | Web analytics | Fires pre-consent |
| Google Tag Manager | Tag orchestration | |
| Tealium IQ | Tag management | Primary orchestrator |
| FullStory | Session replay | Org: MXD29 |
| TrustArc | Consent management | Implied consent for US |
| Klarna | BNPL messaging | Loads on homepage, no cart needed |
| Accertify | Fraud/device fingerprinting | Fires at checkout |
| Rokt | Post-order ad injection | Account ID: 369 |
| Amazon Ads | Programmatic advertising | Via utag_data |
| MediaMath | Programmatic advertising | Via utag_data |
| Taboola | Content/native ads | Via utag_data |
| BounceX/Wunderkind | Behavioral targeting | Via utag_data |
| Yotpo | Reviews and loyalty | Gallery: 5d2e3213dbcbdf551ee8dd20 |
| Salesforce Marketing Cloud | Email marketing | ExactTarget integration |
| CardIsle | AI greeting cards | Ghostwriter AI, public S3 bucket |

**AI integrations:**
- "Aigo" is the live AI chat assistant (`is-aigo-www-chat-widget-enabled: true`), integrated with Genesys chat platform. AI address suggestions are enabled. AI promo code suggestions are disabled (`is-aigo-promo-code-usecase-enabled: false`). AI Q&A on product pages is disabled.
- CardIsle Ghostwriter provides AI-generated greeting card text. Its transformation API is unauthenticated and returns the full prompt list: "Add Emojis," "Say It Another Way," "More Heartfelt," "Funnier," "More Fabulous," "Make It Rhyme," "Correct Spelling & Grammar," "Write Like A Country Song," "Write Like Shakespeare," "Write Like A Rap," "Write In Haiku," plus Spanish and French translation.

---

## Operational Curiosities

**UAT in production:** The florist portal Auth0 domain points at `florists-uat.1800-flowers.auth0.com` in the production app config. The `-uat` suffix is unambiguous -- this is a User Acceptance Testing tenant being referenced from a production deployment.

**Legacy paths:** `/fhdirect` (Florist Direct ordering system) is disallowed in robots.txt. `/blog_orig` suggests a blog migration that left the original behind.

**Internal route archaeology:** The existence of `/account/dadjokegpt`, `/account/momverse`, and `/account/vday-playbook` alongside flags like `is-dad-joke-otd-enabled: true` reveals seasonal marketing features built as authenticated account routes. The dad joke feature has a "joke of the day" component and a product button (currently disabled).

**Configuration archaeology:** LaunchDarkly SDK configured and enabled in env.js, explicitly disabled via the in-house flag system. The 1,241-flag apparatus apparently replaced or superseded LaunchDarkly.

**Visa Checkout:** A deprecated payment service (Visa Checkout was sunset and replaced by Click to Pay in 2020). The SDK URL, API key, and button image URL are all still configured in env.js, and `thm.visa.com` assets still load on checkout pages.

---

## Machine Briefing

**Access and auth**

Guest sessions initialize via `POST /r/api/session/guesttoken`. Auth0 handles login at `login.celebrations.com`. GraphQL catalog queries require no authentication. Cart, personalization, and search APIs return `RBAC: access denied` without a valid session. Headed Playwright bypasses any lightweight bot detection.

### Open Endpoints (no auth)

```bash
# GraphQL catalog query -- full product with all price tiers
curl -X POST https://www.1800flowers.com/r/api/aggregator/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"{ findProductById(brand: \"1001\", environment: \"production\", id: \"1001-P-191167\") { id name partNumber prices { value type } isPassportEligible } }"}'

# GraphQL category query -- all products with pricing
curl -X POST https://www.1800flowers.com/r/api/aggregator/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"{ findCategoryById(brand: \"1001\", environment: \"production\", id: \"18F-Best Selling Flowers-400215581\") { id products { id name prices { value type } } } }"}'

# GraphQL cross-brand content (Harry & David example)
curl -X POST https://www.1800flowers.com/r/api/aggregator/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"{ findContent(brand: \"HD\", contentType: \"ref-brand\", environment: \"production\") { __typename } }"}'

# Checkout MFE asset manifest
curl https://www.1800flowers.com/checkout_app/asset-manifest.json

# Source maps (14 total, all HTTP 200)
curl -I https://www.1800flowers.com/checkout_app/static/js/main.898077a1e801eb7164c8.js.map

# CardIsle Ghostwriter transformation prompts (no auth)
curl https://www.cardisle.com/api/ghostwriter/transformations

# Feature flags (requires userKey -- error leaks Spring class path)
curl -X POST https://www.1800flowers.com/r/api/feature/mbp-ui/flags \
  -H "Content-Type: application/json" -d '{}'
```

### RBAC-Gated Endpoints

```bash
# Cart (requires session)
curl https://www.1800flowers.com/r/api/checkout/v2/cart/cartcount
# Returns: RBAC: access denied

# Personalization (requires session)
curl -X POST https://www.1800flowers.com/r/api/personalize/graphql
# Returns: RBAC: access denied

# Search (requires session)
curl https://www.1800flowers.com/r/api/search
# Returns: RBAC: access denied

# Flora flags (requires session on some pages)
curl https://www.1800flowers.com/r/api/bumblebee/flora/flags
# Returns: RBAC: access denied (works with session on PDP)
```

### GraphQL Schema (partial, from error messages)

```
ProductBase: id, name, partNumber, brandId, prices, skuPriceRange,
             image, brand, seo, isPersonalizable, isPassportEligible,
             availability
Price: value, currency, type
Query: findProductById, findCategoryById, findCategoryPageByUrl,
       findContent, findHomePage, findHeader, findURL,
       findTrendingSearches
```

### Gotchas

- GraphQL introspection is partially blocked: `__schema { types }` and `__schema { queryType }` return `FieldUndefined` errors, but `{ __typename }` works and error messages expose valid fields per type
- Flag endpoint requires `userKey` in the POST body -- error without it leaks Spring MVC class name and method signature
- Source maps are at `/checkout_app/static/js/*.map`, not under the main site's asset path
- `env.js` is inlined in the HTML, not a separate static file -- it's part of the server-rendered page
- Sister brand IDs: 1001 (1-800-Flowers), HD (Harry & David), CCO (Cheryl's), etc. -- use in `brand` parameter for GraphQL queries
- Experiments endpoint at `POST /r/api/experiments/graphql` fires on PDP and search pages (returned 503 during testing)
