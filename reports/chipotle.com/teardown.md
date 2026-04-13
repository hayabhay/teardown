---
# agents: machine-friendly instructions in "## Machine Briefing"
title: Chipotle — Teardown
url: "https://www.chipotle.com"
company: Chipotle
industry: Hospitality
description: "Fast-casual Mexican food chain with online ordering, catering, and loyalty rewards."
summary: "Chipotle runs four distinct technology stacks under one brand: an Adobe Experience Manager marketing site on Fastly, a Vue.js ordering SPA served from Azure Blob Storage, a separately hosted catering site on Microsoft IIS with its own Vue.js build, and a Nuance/Microsoft Amelia AI chatbot on Azure App Gateway. The ordering platform gates API calls behind PerimeterX/HUMAN bot protection, but the AEM GraphQL layer and menu metadata APIs are entirely unauthenticated. Ketch CMP handles consent with an opt-out default, and 14 trackers fire before any user interaction."
date: 2026-04-06
time: "00:36"
contributor: hayabhay
model: "sonnet-4.6"
effort: high
stack: [Adobe Experience Manager, Vue.js, Fastly, Azure CDN, Microsoft IIS, PerimeterX]
trackers: [Adobe Analytics, Adobe Target, Google Tag Manager, Google Ads, DoubleClick, FullStory, Datadog RUM, Reddit Pixel, Microsoft UET, Twitter Pixel, Branch.io, Split.io, Ketch CMP, Vibes CM]
tags: [fast-casual, food-ordering, aem, vue, azure, consent-optout, session-replay, menu-intelligence, gpc-bug, multi-stack]
headline: "The catering site's privacy code is backwards — browsers sending the GPC 'do not sell' signal have it silently disabled instead of honored."
findings:
  - "catering.chipotle.com has an inverted GPC condition: the code sets ketchGpcSignalEnabled to true when globalPrivacyControl is absent, so browsers that actually send the opt-out signal have it silently ignored — the opposite of the main site's correct implementation."
  - "Ketch CMP sets consent to 'granted' for all nine non-essential purposes — including behavioral_advertising, data_broking, and sms_mktg — on first pageload before the banner renders, using legalBasisCode consent_optout as the default for every visitor."
  - "Honey Chicken (CMG-1115, 210 cal, 'A Touch of Heat & Sweet') is fully staged in the menu metadata catalog with a promo 'New' tag and dietary flags, already queued in the upsell API, but absent from the live ordering menu."
  - "The production legal-text GraphQL endpoint returns literal 'Test Content' for a field called chooseYourOwnBirthday — a rewards birthday-customization feature leaking its existence before launch."
  - "An unauthenticated AEM experience fragment at /experience-fragments/rewards-banner-experience-fragment/master carries the page title 'TEMP DO NOT DELETE - GOLDIE - master', exposing an internal codename on the public web."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

Chipotle's web presence is four separate stacks stitched together under a single domain. The main marketing site runs Adobe Experience Manager with a custom namespace (`cmgaemacs`). The order app is a Vue.js SPA served from Azure Blob Storage at `orderweb-cdn.chipotle.com` and embedded in the AEM shell. Catering lives on a completely separate Microsoft IIS server with its own Vue.js build. And quietly running at `amelia.chipotle.com` is a Microsoft Nuance AI chatbot reachable by anyone with the URL.

Fourteen trackers start firing before the consent banner renders — and if you send a Global Privacy Control signal on the catering site, a code bug ensures it gets ignored.

## Architecture — Four Stacks, One Brand

**www.chipotle.com** runs Adobe Experience Manager, identifiable by the `/etc.clientlibs/cmgaemacs/` asset path pattern (custom AEM project namespace `cmgaemacs`). Pages are served through Fastly CDN — `x-vhost: publish` response header, `affinity` cookie for Fastly load balancer session affinity (`affinity="b3dc81bf25e88ad7"`). The AEM instance responds to persisted GraphQL queries at `/graphql/execute.json/chipotle/{query-name}` — all returning JSON without authentication.

One infrastructure oddity: both `robots.txt` and `sitemap.xml` return 200 status with the full 70KB AEM HTML page instead of their expected content. The AEM publish instance is rendering the HTML template for these paths rather than serving static files. Crawlers requesting `robots.txt` receive a complete web page.

**orderweb-cdn.chipotle.com** hosts the Vue.js ordering SPA as static assets on Azure Blob Storage behind Azure CDN (`access-control-allow-origin: *`). The SPA reads from a global config object injected by AEM into the page:

```json
{
  "chipotleServicesApiConfig": {
    "chipotleServicesBaseUrl": "https://services.chipotle.com",
    "chipotleServicesAppKey": "937624593c7048759a9657d6cb705a2b"
  },
  "restaurantConfig": {
    "endpoint": "/restaurant/v3/restaurant",
    "key": "937624593c7048759a9657d6cb705a2b"
  },
  "util": { "LOCAL_STORAGE_KEY": "cmg-aem" }
}
```

This same key (`937624593c7048759a9657d6cb705a2b`) appears in three separate meta tags on the homepage and is the `chipotle-app-key` header value for all `services.chipotle.com` requests. All `services.chipotle.com` calls also require a valid PerimeterX/HUMAN KPSDK token — the app key alone is not sufficient.

**catering.chipotle.com** runs a separate Vue.js build on Microsoft IIS 10.0, entirely distinct from the AEM main site. Different GTM container (`GTM-PMJRJVKF` vs. main site's `GTM-5PRDNQPS`), different consent configuration, and its own payment SDKs. The Google Maps API key (`AIzaSyDtG5aNVNGdVqWbE9MhliQ7D7axqnwu0FM`) is inlined in the HTML.

**order.chipotle.com** redirects to www.chipotle.com and is served from AWS S3 + CloudFront — a third cloud provider in the mix alongside Fastly and Azure.

**amelia.chipotle.com** runs a React-based Microsoft Nuance Amelia AI chatbot behind Azure Application Gateway. Covered in its own section below.

### Subdomain Map

| Subdomain | Stack | Host |
|-----------|-------|------|
| www.chipotle.com | Adobe Experience Manager | Fastly |
| services.chipotle.com | API gateway | Azure |
| orderweb-cdn.chipotle.com | Vue.js assets, Azure Blob Storage | Azure CDN |
| catering.chipotle.com | Vue.js / Microsoft IIS 10.0 | Azure |
| order.chipotle.com | Static redirect | AWS CloudFront |
| amelia.chipotle.com | Nuance/Microsoft Amelia AI | Azure App Gateway |
| badges.chipotle.com | Azure Blob Storage | Azure CDN |
| loyaltycus-cdn.chipotle.com | Loyalty CDN, Azure Blob Storage | Azure CDN |
| payeezy-cdn.chipotle.com | Azure Blob Storage | Azure CDN |
| chipotlegoods.com | Shopify | Cloudflare |
| services.chipotle.co.uk | UK API gateway | — |

### Payment Stack

Five payment integrations span the ecosystem:

1. **Fiserv/FirstData** (`ucom-cmg.fiservapis.com`, `lib.paymentjs.firstdata.com`) — primary US/Canada ordering
2. **Payeezy** (`api.payeezy.com`, `payeezy-cdn.chipotle.com`) — legacy or UK
3. **Chase Paymentech** (`www.chasepaymentechhostedpay.com`) — UK hosted payment form; callback HTML (`ChaseUKForm.html`) served from `payeezystrg.z19.web.core.windows.net` (Azure Blob, open CORS)
4. **Apple Pay** (`applepay.cdn-apple.com`) — supplemental
5. **ID.me** (`s3.amazonaws.com/idme/`) — identity/age verification

## Ordering Stack — Vue.js SPA + Bot Protection

The ordering experience is architecturally separate from the marketing site. A user beginning an order on www.chipotle.com loads the Vue.js SPA bundle from `orderweb-cdn.chipotle.com`.

The SPA maintains state in a `cmg-vuex` localStorage key that grows to approximately 1MB, caching the full menu metadata catalog, nutritional data, preconfigured meal templates, and session state including the field `optedInSummerOfChipotle2025: false` — a 2025 campaign flag carrying into the 2026 production build.

**Bot protection.** All calls to `services.chipotle.com` are gated by PerimeterX/HUMAN KPSDK (`px_app_id: 149e9513-01fa-4fb0-aad4-566afd725d1b`). The KPSDK fingerprinting endpoint (`/149e9513-01fa-4fb0-aad4-566afd725d1b/2d206a39-8ed7-437e-a3be-862e0f06eea3/fp`) returned HTTP 429 on every request during the investigation — the bot protection rate-limits its own fingerprint collection for headless browsers.

**Feature flags.** Split.io provides real-time feature flag updates via SSE through Ably infrastructure. Stream URL parameters expose workspace and environment IDs base64-encoded:
- Workspace: `MzIyNzc3MTA0OA==` (3227771048)
- Environment: `MTUxOTU5NDgxNg==` (1519594816)
- SDK client key suffix: `...SplitSDKClientKey=17ea`

Flag names visible in the app bundle: `configure-is-summer-of-extras-enabled`, `rdo-enable-email-marketing`, `rdo-enable-personalized-content`, `cmg-rewards-feature-flags-offline`.

**A/B testing.** Adobe Target is active. The experiment running at investigation time:
- Activity: "Web | PROD | Meal Builder v1.2 GUEST 04_02_26" (activity_id: 323758, launched April 2, 2026)
- Experience: "MBv1 Guest Control" (experience_id: 0)
- Decision scope: `mb-customizations-integration`

Full set of Target decision scopes queried per homepage load: `dual-promo-banner`, `featured-meals`, `hero-promo-banner-top`, `large-promo-order`, `loyalty-banner-homepage`, `hp-content-order`, `top-level-menu`, `top-level-menu-image`, `mb-customizations-integration`.

## Consent Architecture — Opt-Out by Default

On a fresh browser session with no prior cookies and no user interaction, the Ketch CMP sets `_ketch_consent_v1_` immediately on pageload. The `_swb_consent_` cookie (base64-encoded JSON) shows the mechanism:

```json
{
  "context": {
    "source": "legalBasisDefault"
  },
  "purposes": {
    "us_essential": {
      "allowed": "true",
      "legalBasisCode": "disclosure"
    },
    "us_nonessential": {
      "allowed": "true",
      "legalBasisCode": "consent_optout"
    }
  }
}
```

`legalBasisCode: consent_optout` with `source: legalBasisDefault` means the system default is to assume consent for all non-essential purposes. The Ketch banner does render — but the consent cookies are already set when it appears. Non-essential purposes granted by default:

- `data_broking`
- `prod_enhancement`
- `personalization`
- `mail_mktg`
- `analytics`
- `tele_mktg`
- `behavioral_advertising`
- `email_mktg`
- `sms_mktg`

### GPC Signal Bug on catering.chipotle.com

The Global Privacy Control implementation differs between subdomains in a way that inverts the intended behavior on the catering site. From the main site (confirmed in `api-experience-fragment.json`):

```javascript
// www.chipotle.com — correct
window.ketchGpcSignalEnabled = false;
if(window.navigator.globalPrivacyControl && window.navigator.globalPrivacyControl == true) {
    window.ketchGpcSignalEnabled = true;
}
```

From the catering site (confirmed in `catering-index.html`):

```javascript
// catering.chipotle.com — inverted
window.ketchGpcSignalEnabled = false;
if(!window.navigator.globalPrivacyControl || window.navigator.globalPrivacyControl == false) {
    window.ketchGpcSignalEnabled = true;
}
```

The catering version activates the GPC signal when `globalPrivacyControl` is absent or false — the default state for any browser not sending GPC. Browsers that send the GPC opt-out (`globalPrivacyControl == true`) satisfy neither condition and leave the signal disabled. The logic is exactly backwards from the main site.

## Menu Intelligence — The Staged Catalog

The AEM GraphQL endpoints and menu metadata APIs are unauthenticated and return the full item catalog, including items not yet available in live ordering. The Vuex store caches this entire catalog for the session.

**Honey Chicken (CMG-1115)** is the most current staged item. Present in the Vuex-cached menu metadata with:
- Nutrition: 210 cal, 4 oz portion
- Tags: `{type:"promo", value:"New"}` and `{type:"tagline", value:"A Touch of Heat & Sweet"}`
- Dietary flags: `pale`, `keto`
- Side portion: CMG-1131 "Side of Chipotle Honey Chicken" — present in the upsell API response at sort position 105

CMG-1115 is absent from `/menuinnovation/v1/universalmenus/online` (the live ordering menu endpoint). The item's image path follows the standard DAM pattern (`/content/dam/chipotle/menu/menu-items/cmg-1115-honey-chicken/web-desktop/order.png`), indicating the content is complete in AEM. The promotional "New" tag and upsell queue placement both point toward an imminent live launch.

Other items present in the catalog but not in live ordering:

| CMG ID | Item | Notes |
|--------|------|-------|
| cmg-5164-pb-chorizo | Plant-Based Chorizo | Image present |
| cmg-112-brisket | Brisket | Seasonal protein |
| cmg-1133-side-of-smoked-brisket | Side of Smoked Brisket | Returns 404 |
| cmg-1130-side-of-carne-asada | Side of Carne Asada | Seasonal |
| cmg-5353-chipotle-honey-vinaigrette | Chipotle Honey Vinaigrette | New dressing |
| cmg-2811-honest-honey-green-tea | Honey Green Tea | Beverage |
| cmg-2819-moonshine-sweet-tea-mint-honey | Moonshine Sweet Tea Mint Honey | Beverage |

**Meal type taxonomy** in the catalog:
- `HighProtein` — 7 preconfigured meals ("DOUBLE HIGH PROTEIN BOWL", "HIGH PROTEIN CUP", etc.)
- `Influencer` — 7 meals (celebrity/social-media curated orders)
- `BuildYourOwn` — 5 customization entry points

The upsell GraphQL endpoint (`/graphql/execute.json/chipotle/upsell`) returns 80+ items ranked by `sortOrderPosition` for the upsell queue, including all the Honey Chicken side portions already staged for ordering.

## Production Artifacts

**"GOLDIE" codename.** The AEM experience fragment at `/experience-fragments/rewards-banner-experience-fragment/master` is publicly accessible without authentication. Its page `<title>` reads: `TEMP DO NOT DELETE - GOLDIE - master`. This is an AEM rewards banner component embedded in the ordering app — an internal campaign or project codename visible to anyone who requests the URL.

**Test content in production legal copy.** The AEM persisted query `/graphql/execute.json/chipotle/legal-text;region=en-us` returns all legal UI copy — sign-in agreements, rewards enrollment terms, retro credit policy, nutrition disclaimers — alongside one field with placeholder content:

```json
"chooseYourOwnBirthday": {
  "html": "<p>Test Content</p><p>Test Content</p><p>Test Content</p>"
}
```

The field name `chooseYourOwnBirthday` indicates a planned rewards feature allowing members to select their own birthday for perks. The content slot exists in AEM and the field returns in the production API, but the copy has not been written — it contains the literal text "Test Content" three times.

**Summer campaign routes in production SPA.** The Vue.js SPA router (inferred from `orderweb` app.js bundle analysis) contains routes not yet publicly promoted:
- `/order/summer-amoe-grand-prize` — Alternative Method of Entry for a sweepstakes grand prize
- `/order/summer-amoe-weekly` — Weekly sweepstakes AMOE
- `/order/summer-dashboard` — Summer loyalty campaign dashboard
- `/order/vendor/sign-in` — Route labeled "Vendor Sign In", renders as sweepstakes sign-in
- `/guacmodeverified` — "GuacMode Sign In" for a promotional/loyalty tier
- `/order/retro-credit` — Manual order credit request form

The Vuex store (verified in `vuex-store.json`) carries `optedInSummerOfChipotle2025: false` — the 2025 campaign participation flag is live in the 2026 production state structure. Whether this is a carryover key or intentional reuse for a 2026 edition is not determinable from external observation.

## Surveillance Footprint

Fourteen tracking systems are active before any consent interaction. The homepage network log records 35 third-party requests across 12 domains on a fresh session — all before the user sees or responds to the Ketch consent banner.

**Session recording:**
- **FullStory** (`rs.fullstory.com`): Full interaction recording via `POST /rec/bundle/v2`. Settings endpoint: `edge.fullstory.com/s/settings/WYVAY/v1/web`. FullStory organization: WYVAY. Session ID stored in `fs_uid` cookie.
- **Datadog RUM** (`browser-intake-datadoghq.com`): 9 `POST /api/v2/rum` requests per homepage load, 2 `POST /api/v2/replay` requests (session replay). Configured at 50% session replay sample rate (`data-datadog-sessionReplaySampleRate="50"`). App ID: `48b45813-81df-4b03-a67d-f4d0b1d6acfe`. Client token: `pub8e5003899c13f4f4038bd658c58e60a3`.

**Identity cookies set before consent interaction:**

| Cookie | System | Value observed |
|--------|--------|----------------|
| `kndctr_4E7F56EC5BE2CCCF0A495CE8_AdobeOrg_identity` | Adobe ECID | encoded ECID |
| `AMCV_4E7F56EC5BE2CCCF0A495CE8@AdobeOrg` | Adobe MID | MCMID\|86784268239383598490... |
| `cmg-pvc-ecid` | Chipotle ECID store | same ECID value |
| `_swb` | Ketch user UUID | ea39e428-5cbf-4a0f-ac74-c21b40b5442c |
| `_gcl_au` | Google Ads linker | 1.1.1051460551.1775520918 |
| `_twpid` | Twitter pixel | tw.1775520918810.835... |
| `_rdt_uuid` | Reddit pixel | 1775520918885.a82d7280-... |
| `_uetsid` / `_uetvid` | Microsoft/Bing UET | dc3e1020321611f194... |
| `fs_uid` | FullStory session | #WYVAY#c7cc78c5-67cd-4f58... |
| `_dd_s` | Datadog session | rum=1&id=504a755a-... |

**Advertising network calls before consent:**
- `ad.doubleclick.net` — 4 requests (src=6527605, categories `chipo000` and `chipo0`)
- `www.google.com/ccm/collect` — Google Ads conversion measurement (x2)
- `www.google.com/rmkt/collect/964791676/` — Google Remarketing (account 964791676)
- `pixel-config.reddit.com` — Reddit pixel config (account `t2_29dp3289`)
- `www.google.com/gmp/conversion/` — Google conversion measurement

**Additional active trackers:**
- `r.sdiapi.net` (`POST /service/viceEvent`) — Vice (sdiapi.com) ad serving events. Loaded via `vice-prod.sdiapi.com/vice_loader/chipotle/chipotle`. Config: `viceAccountId: "chipotle"`, `viceSiteId: "chipotle"`, version 1.23.9.3.
- `api2.branch.io` (`/v1/open`, `/v1/pageview`) — Branch.io deep linking. Live key: `key_live_hfK28UOcUBBlr9owR5EW2gpdtAkb0vgc`.
- `mp.vibescm.com` — Vibes CM mobile marketing
- `streaming.split.io` (+ `sdk.split.io`, `auth.split.io`) — Split.io feature flags
- `global.ketchcdn.com` — Ketch consent management (IP geolocation, config, consent get/set)
- `reporting.cdndex.io` (`POST /error`) — Error reporting

Adobe sends behavioral telemetry to Experience Platform Edge Network via `POST /ee/or2/v1/interact` (6 requests per homepage). The `adobeDataLayer` carries XDM-formatted page events, component modification timestamps, and user/commerce state. A second `POST /ee/or2/v1/privacy/set-consent` call fires to record the default consent grant.

## Amelia — The Unlisted AI

`amelia.chipotle.com/Amelia/ui/chipotle/` is a publicly accessible React SPA built on Microsoft Nuance Amelia. It is not linked from any main navigation, footer, or visible sitemap entry. Deployment identifier: `ms16635505704`.

Application shell:

```html
<base href="/Amelia/ui/chipotle/4/ms16635505704/">
<title>Amelia</title>
<script type="module" src="./assets/index-DigazbTy.js"></script>
<link rel="stylesheet" href="./assets/index-v5bGl6EQ.css">
```

Main application bundle: `index-DigazbTy.js` (716KB). Widget loader: `amelia.js` (9.6KB). Azure Application Gateway handles routing — confirmed by Azure App Gateway affinity cookies (`ApplicationGatewayAffinity`) in the session response headers.

The widget iframe requests browser permissions for geolocation, microphone, and camera. Whether Amelia surfaces in any customer-facing context (e.g., embedded in the mobile ordering app) or serves only internal users is not determinable from external observation.

## Machine Briefing

**Access:** AEM GraphQL endpoints and menu metadata APIs work with plain `GET` requests — no auth, no session required. The `services.chipotle.com` API requires a KPSDK token injected by the PerimeterX SDK running in-browser. Direct curl calls to gated services.chipotle.com endpoints return 401/403 without a valid token.

**Open endpoints — no auth required:**

```bash
# AEM persisted GraphQL — UI copy and metadata
curl "https://www.chipotle.com/graphql/execute.json/chipotle/nutrition-facts;region=en-us;"
curl "https://www.chipotle.com/graphql/execute.json/chipotle/upsell"
curl "https://www.chipotle.com/graphql/execute.json/chipotle/fac;region=en-us;"
curl "https://www.chipotle.com/graphql/execute.json/chipotle/account-modal;region=en-us;"
curl "https://www.chipotle.com/graphql/execute.json/chipotle/pickup-options;region=en-us;"
curl "https://www.chipotle.com/graphql/execute.json/chipotle/legal-text;region=en-us"

# Menu structure and metadata (open on services.chipotle.com)
curl "https://services.chipotle.com/menuinnovation/v1/universalmenus/online"
curl "https://services.chipotle.com/menuinnovation/v1/universalmeals/online"
curl "https://services.chipotle.com/menu-metadata/v1/menu-metadata"

# AEM experience fragment (publicly accessible, unauthenticated)
curl "https://www.chipotle.com/experience-fragments/rewards-banner-experience-fragment/master"
```

**KPSDK-gated endpoints — require PerimeterX token:**

```bash
# Restaurant lookup
curl "https://services.chipotle.com/restaurant/v3/restaurant?..." \
  -H "chipotle-app-key: 937624593c7048759a9657d6cb705a2b" \
  -H "x-px-authorization: <KPSDK_token>"

# Ordering system status
curl "https://services.chipotle.com/onlineorderingstatus?country=US" \
  -H "chipotle-app-key: 937624593c7048759a9657d6cb705a2b" \
  -H "x-px-authorization: <KPSDK_token>"
```

**Adobe Experience Platform Edge:**

```bash
# Behavioral events — XDM payload POST
POST https://server.adobedc.net/ee/or2/v1/interact

# Consent telemetry
POST https://server.adobedc.net/ee/or2/v1/privacy/set-consent
```

**Split.io feature flags:**

```bash
# Auth (requires SDK key)
curl "https://auth.split.io/api/v2/auth" \
  -H "Authorization: Bearer <sdk_key>"

# SSE stream for real-time flag updates
GET "https://streaming.split.io/sse?...&SplitSDKClientKey=17ea&channels=MzIyNzc3MTA0OA%3D%3D..."
```

**Amelia AI chatbot:**

```bash
# App shell
curl "https://amelia.chipotle.com/Amelia/ui/chipotle/"

# Main app bundle (716KB)
curl "https://amelia.chipotle.com/Amelia/ui/chipotle/4/ms16635505704/assets/index-DigazbTy.js"
```

**Gotchas:**
- The PerimeterX `/fp` fingerprint endpoint returns 429 consistently for headless/automated clients. KPSDK requires a real browser environment to generate a valid token — services.chipotle.com API calls without a token return 401.
- AEM GraphQL schema introspection returns `409 Conflict` — blocked at the Apache layer.
- Menu metadata endpoints (`/menuinnovation/v1/` and `/menu-metadata/v1/`) are served from `services.chipotle.com` but returned 200 during the investigation without a KPSDK token. These appear to be open, unlike the restaurant/order endpoints.
- The `chipotle-app-key` header value (`937624593c7048759a9657d6cb705a2b`) is identical for all services.chipotle.com requests; it is present in `window.CHIPW.chipotleServicesApiConfig.chipotleServicesAppKey` and in three meta tags on the homepage HTML.
- catering.chipotle.com uses GTM container `GTM-PMJRJVKF` (different from main site `GTM-5PRDNQPS`) and Fiserv ucom SDK directly rather than through the main ordering stack.
- The `cmg-vuex` localStorage key caches the full menu catalog on first load — reading it in a live browser session gives the complete item database including staged/unlaunched items.
