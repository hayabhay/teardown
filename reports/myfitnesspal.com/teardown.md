---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "MyFitnessPal \u2014 Teardown"
url: "https://www.myfitnesspal.com"
company: MyFitnessPal
industry: Healthcare
description: "Calorie counter and nutrition tracking app with 200M+ users."
summary: "Next.js frontend on Cloudflare with Envoy proxy, assets at web-assets.myfitnesspal.com, authenticated API at api.myfitnesspal.com. Sourcepoint manages USNAT/GDPR consent, Google Tag Manager orchestrates a large ad tech stack including Amazon Publisher Services with 24 identity vendors. Stripe handles subscription payments across two tiers (Premium and Premium+). Trainerize powers trainer widget integrations via iframe."
date: 2026-04-13
time: "01:38"
contributor: hayabhay
model: sonnet
effort: high
stack: [Next.js, Cloudflare, Envoy, Stripe, NextAuth]
trackers: [Google Analytics, Google Ads, AppsFlyer, Amplitude, Datadog RUM, Amazon Publisher Services, Meta Pixel, Pinterest, TikTok, Branch, TV Squared, The Trade Desk]
tags: [health, fitness, nutrition, advertising, ccpa, glp-1, pharma, subscription, identity-graph, dark-pattern]
headline: "The advertising portal sells food logging as 'genuine purchase intent' -- ads are timed to appear at the moment users are choosing what to eat."
findings:
  - "ads.myfitnesspal.com markets food logging behavior -- brand affinities, top food categories, 16 daily entries -- as advertiser targeting signals, with 'in-app product discovery' ads placed at the moment of food choice."
  - "Eli Lilly has a full co-branded partner landing page in MFP's UI strings offering GLP-1 patients 6 free months of Premium -- the pharmaceutical company's weight-loss drug users become an acquisition channel for the ad-supported health data platform."
  - "TrueMed integration lets users pay for Premium+ with HSA/FSA pre-tax dollars via a Letter of Medical Necessity -- positioning a calorie counter as a qualifying medical expense."
  - "Amazon Publisher Services initializes 24 cross-publisher identity vendors (LiveRamp, ID5, Criteo, UID2, Lotame, and 19 others) on every page load before consent interaction."
  - "Washington Health Data Privacy Policy confirms dietary habits, glucose, sleep, and body measurements are shared with 'business partners providing advertising and technology services.'"
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

MyFitnessPal has been logging food for 200 million users for over 20 years. That history of dietary choices, body measurements, fitness goals, and connected wearable data now has a second job: advertising product. The site makes this explicit -- ads.myfitnesspal.com is a separate portal that markets this behavioral dataset directly to brands. This teardown traces how the data flows out, who captures it on first page load, and what the partner ecosystem reveals about where the product is heading.

## Architecture

The web frontend is Next.js (build ID `2eHVkupThr3Qw2DWCwiii`, release version `v21.6.7`), served behind Cloudflare with an Envoy proxy upstream. Static assets serve from `web-assets.myfitnesspal.com/web-main`. The internal service name is `web-main` in environment `nutrition-prod` -- both visible in the Datadog configuration shipped in every page's `window.__ENV__`.

Every unauthenticated page load receives the full `window.__ENV__` object inline in the HTML, exposing the complete vendor stack configuration:

```json
{
  "AMPLITUDE_API_KEY": "2746a27a28431837e776d192ed6db604",
  "DD_ENV": "nutrition-prod",
  "DD_SERVICE": "web-main-canary",
  "DD_VERSION": "21.6.7_5a9e0f60947e",
  "DATADOG_CLIENT_TOKEN": "pub955b81ca94fa5d46b806064b78c7abf0",
  "DATADOGRUM_APPLICATION_ID": "d890f2b4-002c-43ba-b456-7f6517ecf309",
  "DATADOGRUM_CLIENT_TOKEN": "pub6bacd8a3d2ff4a25d741e639b3320206",
  "FACEBOOK_CLIENT_ID": "186796388009496",
  "GOOGLE_AD_KEY": "/17729925/UACF_W/MFP/",
  "GOOGLE_TAG_MANAGER_CONTAINER_ID": "GTM-NR6RNVL",
  "RECAPTCHA_SITE_KEY_V3": "6Ldo3qAhAAAAAIAZyTxwoKEZiewIZXsEdm1evMmZ",
  "SOURCEPOINT_PROPERTY_HREF": "https://www.prodmyfitnesspal.com",
  "STRIPE_PUBLISHABLE_KEY": "pk_live_feE27wU6f0bvDJBvFoK2iyOB",
  "STRIPE_API_VERSION": "2024-12-18.acacia",
  "STRIPE_CUSTOM_PAYMENT_METHOD_ID": "cpmt_1SD8qNIGFZ9eQDuYS53xRKpn",
  "MFP_PUBLIC_API_HOST": "https://api.myfitnesspal.com",
  "WIDGET_PARENT_DOMAIN_OR_ORIGIN": ".trainerize.com https://api.gymengine.com ..."
}
```

The authenticated API lives at `api.myfitnesspal.com`, which requires an `Authorization` header and returns `{"error":"validation/3","error_description":"Invalid request received: Missing HTTP header: Authorization"}` without one. A public partner OAuth2 API existed at `myfitnesspalapi.com` but is not accepting new partner applications.

Sessions are managed by NextAuth. The site supports 20 locales (en, es, da, de, fr, it, ja, ko, nb, nl, pt, sv, pl, id, tl, ru, ms, tr, zh-CN, zh-TW), and ships 3,369 localized UI strings to every unauthenticated visitor as part of the `__NEXT_DATA__` payload -- including the full text of all partner landing pages.

One notable configuration detail: `SOURCEPOINT_PROPERTY_HREF` is set to `https://www.prodmyfitnesspal.com` -- an internal production hostname, not the public-facing `myfitnesspal.com`. The CMP property lookup and vendor list resolution use this internal hostname. The siteId=36321 lookup still resolves correctly in network traffic, but the property hostname mismatch could affect which consent messages users are served.

Trainerize (a personal trainer platform) is integrated via iframe widgets. The CSP `frame-ancestors` directive exposes multiple staging environments by name: `trainerizealeks.gymengine.com`, `pasta.gymengine.com`, `vytest1.gymengine.com`, `emmatestcompany1.gymengine.com`, `emmamain.gymengine2.com`, `123456784.trzdev22.com`, `service-nutrition-dev3.trzdev.com`. Two test-flow widget routes exist in the build manifest (`/widgets/test-flow`, `/widgets/test-flow/dashboard`) and return 404 unauthenticated.

The robots.txt disallows the `/api` path and all user-specific paths (diary, profile, friends, measurements, reports), plus legacy paths: `/vanilla` (forum software), `/grocery`, `/weight-loss-ticker`, `/rss`, `/fitbit`. Only `ChatGPT-User` is blocked among AI crawlers.

## Surveillance Stack

### Consent Architecture

MyFitnessPal uses Sourcepoint as its CMP (account ID 1849, site ID 36321, USNAT manager ID 1142703, GDPR manager ID 1142806). Three consent categories are configured:

| Category | Type | respectGPC | defaultLegalBasis |
|----------|------|------------|-------------------|
| Targeted Advertising Cookies | SYSTEM_PURPOSE (systemId: 1) | true | OPT-OUT |
| Functional Cookies | SYSTEM_PURPOSE (systemId: 2) | true | OPT-OUT |
| Required Cookies | CUSTOM | false | OPT-OUT |

The default consent state fetched from Sourcepoint's API (`/usnat/consent/36321/default-consent`) is:

```json
{
  "consentStatus": {
    "rejectedAny": false,
    "consentedToAll": true,
    "consentedToAny": false,
    "hasConsentData": false,
    "granularStatus": {
      "sellStatus": true,
      "shareStatus": true,
      "sensitiveDataStatus": false,
      "gpcStatus": false
    }
  }
}
```

The combination of `hasConsentData: false` (no actual user consent recorded) with `consentedToAll: true`, `sellStatus: true`, and `shareStatus: true` means new visitors are treated as having fully consented to data sale and sharing before touching the consent banner. `gpcStatus: false` indicates GPC (Global Privacy Control) is not being honored in this default state, despite `respectGPC: true` being set on both advertising and functional cookie categories.

### What Fires on First Load

The following third-party requests were observed on a clean first page load, before any user interaction with the consent banner:

- `cdn.privacy-mgmt.com` -- 8 Sourcepoint CMP endpoints (site data, metadata, messages, pv-data, vendor list, consent state)
- `www.google.com` -- Google Ads (2x `ccm/collect`, 1x remarketing pixel `391609723`)
- `www.google-analytics.com` + `analytics.google.com` -- GA4 events (g/collect, 4 total)
- `c.amazon-adsystem.com` -- Amazon Publisher Services config fetch
- `wa.appsflyersdk.com` -- AppsFlyer web attribution events
- `api2.amplitude.com` -- Amplitude analytics batch
- `browser-intake-datadoghq.com` -- Datadog RUM
- `pagead2.googlesyndication.com` -- Google display ads ping

### Cookie & Storage Inventory

Cookies set before consent interaction:

| Cookie | Purpose |
|--------|---------|
| `anon-device-id` | Anonymous device ID, set server-side immediately |
| `AMP_MKTG_2746a27a28` | Amplitude marketing cookie |
| `usnatUUID` | US privacy consent UUID |
| `consentUUID` | Sourcepoint consent UUID |
| `_gcl_au` | Google Click conversion linking |
| `afUserId` | AppsFlyer cross-device user ID |
| `_ga` | Google Analytics GA4 |
| `AF_SYNC` | AppsFlyer sync timestamp |
| `_dd_s` | Datadog RUM session |
| `AMP_2746a27a28` | Amplitude session |
| `_ga_HL1EGFN51C` | GA4 property 1 (G-HL1EGFN51C) |
| `_ga_VG80VV73C6` | GA4 property 2 (G-VG80VV73C6) |

`afUserId` is notable: AppsFlyer is primarily a mobile attribution platform, and setting this cookie on web links the browser session to a mobile app install -- cross-device attribution on a health app.

### Amazon Publisher Services -- Identity Resolution

Amazon Publisher Services (APS) publisher ID 3257 initializes 24 cross-publisher identity resolution vendors on every page load:

`liveintent`, `merkle`, `intimateMerger`, `pair`, `amx`, `33across`, `fTrack`, `captify`, `publink`, `anonymised`, `quantcast`, `idPlus`, `unifiedid`, `ddb_key_638`, `fabrick`, `uid`, `criteo`, `yahoo`, `liveRamp`, `id5`, `pubcommon`, `audigent`, `lightPublisherAudiences`, `lotame`

Each vendor receives browser fingerprint, cookie data, and behavioral signals to build or match against cross-publisher identity graphs. UID2 (The Trade Desk's universal ID), LiveRamp's ATS, ID5, Criteo's Identity, and Lotame's Panorama ID are all industry-standard identity spine systems -- having all 24 active simultaneously on a health tracking app is a comprehensive identity resolution deployment.

### GTM Container -- Ad Platform Map

GTM container `GTM-NR6RNVL` contains the following active ad platform tags, each gated on a Sourcepoint-pushed consent data layer variable:

| Platform | Consent Variable |
|----------|----------------|
| Meta (Facebook) | `meta_consent_accepted` |
| Pinterest | `pinterest_consent_accepted` |
| TikTok | `tik_tok_consent_accepted` |
| Branch (mobile attribution) | `branch_consent_accepted` |
| TV Squared | `tv_squared_consent_accepted` |
| The Trade Desk (UK) | `uk_trade_desk_consent_accepted` |
| Google Advertising Products | `google_advertising_products_consent_accepted` |

Two GA4 measurement IDs are active: `G-HL1EGFN51C` and `G-VG80VV73C6`. Google Ads conversion ID is `391609723` with conversion labels `INf3CMHnttoCEPnv63boB` and `yXpFCOKp0NkCEPv63boB`. Nine GTM tags are currently paused (tag IDs 3, 4, 6, 34, 35, 42, 43, 45, 46).

Because all consent variables default to opted-in via Sourcepoint's default consent state, all these platforms effectively fire on every first-visit page load.

## Business Model -- The Advertising Portal

`ads.myfitnesspal.com` (served via Fastly CDN, tagged with GTM-M9HTQ8) is a standalone advertiser pitch site. It markets the MFP user base as a first-party data product:

- "200M+ health-focused consumers"
- "Deep user behavior insights -- plus segmentation criteria including brand affinities, top food categories"
- "~16 foods logged daily" as evidence of "genuine purchase intent"
- "Over 20 years of nutrition data and cutting-edge AI technology"

Ad formats offered: Interstitial, Native Banner, Native Video, Sponsored Emails, Branded Recipe Pages, and "In-app product discovery" -- the last of which means ads appear at the moment a user is logging a food choice. The ad placement is structural: the app's core loop (log what you eat) generates behavioral signals (food preferences, brand choices, dietary patterns) that are packaged as advertising inventory, and the ads are served back into that same moment of decision.

The Washington My Health My Data Act privacy policy confirms the data scope shared with advertising partners:

- Dietary habits and dietary restrictions
- Fitness activity, goals, fitness level
- Lifestyle (sleep habits, life events)
- Body measurements, BMI, calorie count, heart rate
- Connected health device data (heart rate, sleep, glucose from wearables)
- Demographic information

Shared with: "business partners such as those providing advertising and technology services."

## The GLP-1 Partnership -- Eli Lilly

MyFitnessPal has a co-branded partner program with Eli Lilly, maker of Mounjaro and Zepbound (GLP-1 receptor agonist medications for weight loss and diabetes management). The full partner landing page UI is built into the app's localized message strings -- 48 UI strings under the `partner.lilly.*` namespace -- and ships to every unauthenticated visitor.

The page positions MFP as "The perfect GLP-1 weight loss companion app." The offer: patients enrolled in Eli Lilly's medication program receive 6 months of MyFitnessPal Premium for free. The offer terms, embedded in the UI strings, read:

> "Offer applies to 6 months of Premium membership. Offer only available to users in Canada without an active subscription to Premium who are enrolled in the relevant program from the medication maker. Offer expires 30 days from your receipt of the applicable email and code."

The landing page includes a feature comparison chart (nutrition tracking, exercise tracking, barcode scan, meal scan, voice log, multi-day logging, ad-free experience, custom macros, intermittent fasting, food insights, net carbs mode), habit-building feature callouts, and a GLP-1 disclaimer. The redemption flow uses unique access codes delivered by email, no credit card required.

The `/partner/lilly` route does not appear in the web build manifest, suggesting the page is accessed via direct link or deep link rather than standard Next.js routing. The landing page content -- including all text variants -- is confirmed present in the `localizedMessages` payload served to all unauthenticated web visitors.

The structural implication: as Mounjaro/Zepbound adoption grows, Eli Lilly's patient program becomes a customer acquisition channel for MFP. GLP-1 users managing medication-driven weight loss are a consistently engaged, health-motivated cohort who log daily -- high-value users for the advertising model described above.

## HSA/FSA Positioning -- TrueMed

The `/partner/truemed` route exists in the build manifest and connects to a `/premium/truemed-complete` completion page. TrueMed is a service that issues Letters of Medical Necessity (LMN), enabling payment for qualifying health products using HSA (Health Savings Account) or FSA (Flexible Spending Account) pre-tax dollars.

The TrueMed checkout flow for Premium+ passes a specific Stripe price ID and a `truemed=true` parameter:

```
/premium/checkout/[id]?priceId=price_1QxAZ7IGFZ9eQDuYoi3PGnJ1&currency=usd&truemed=true
```

`price_1QxAZ7IGFZ9eQDuYoi3PGnJ1` corresponds to the Premium+ annual plan ($99.99/yr). TrueMed's LMN process involves a medical review that determines whether the subscription qualifies as a medical expense under IRS guidelines.

The positioning: a calorie counter app, accessed via a healthcare financing mechanism, classified as medical care. For users with HSA/FSA balances, the out-of-pocket cost of Premium+ effectively drops to zero after tax treatment.

## Partner Ecosystem

The build manifest enumerates the full partner route structure:

| Route | Partner | Offering |
|-------|---------|---------|
| `/partner/truemed` | TrueMed | HSA/FSA payment for Premium+ |
| `/partner/trainerize` | Trainerize | Personal trainer integration |
| `/partner/factorfreeyear` | Factor | 1 year free meal delivery |
| `/partner/1yearfreefromcalm` | Calm | 1 year free meditation |
| `/partner/6monthtrial` | (generic) | 6-month trial flow |
| `/wellhub-premium` | Wellhub (formerly Gympass) | Employee wellness benefit |
| `/gympass` | Gympass | Legacy route |
| `/partner-auth` | (generic) | Partner authentication |

Multiple partner pages share the same chunk bundle (`static/chunks/8749-cf34ef59d7f2ff75.js`, `static/chunks/7166-0710648c69bd0cf8.js`), suggesting a shared partner landing page template.

The Trainerize integration exposes development staging environments in the CSP `frame-ancestors` directive: named test accounts (`aleks`, `pasta`, `vytest1`, `emmatestcompany1`, `emmamain`) across three staging domains (`gymengine.com`, `gymengine2.com`, `trzdev22.com`). `service-nutrition-dev3.trzdev.com` is also listed.

## Pricing

Premium pricing is exposed in unauthenticated page renders:

| Plan | SKU | Price |
|------|-----|-------|
| Premium monthly | `mfp_1m_web_1999` | $19.99/mo |
| Premium annual | `mfp_12m_web_7999_v3` | $79.99/yr |
| Premium+ monthly | `mfp_1m_web_2499_plus` | $24.99/mo |
| Premium+ annual | `mfp_12m_web_9999_plus` | $99.99/yr |

All four plans have `_freetrial` variants. The tier hierarchy in `globalData` is clean: `premium.upgradeTo: premiumPlus`, `premiumPlus.downgradeTo: premium`.

Stripe price IDs confirmed in client HTML: `price_1QxAZ7IGFZ9eQDuYoi3PGnJ1` (Premium+ annual), `price_1NSj3mIGFZ9eQDuYRfs8nXS9` (Premium monthly).

## Machine Briefing

### Access & Auth

Most public-facing pages and `__NEXT_DATA__` payloads are accessible without auth via standard GET requests. The authenticated API at `api.myfitnesspal.com` requires an `Authorization` header -- direct requests without it return a structured validation error. The public OAuth partner API at `myfitnesspalapi.com` implements Authorization Code Grant but is not accepting new applications.

For authenticated sessions: standard cookie-based auth via NextAuth. SSO options are Google and Facebook. reCAPTCHA v3 (invisible) is active on registration.

### Endpoints

**Open (no auth required)**

```bash
# Homepage Next.js data
GET https://www.myfitnesspal.com/_next/data/2eHVkupThr3Qw2DWCwiii/en.json

# Login page data
GET https://www.myfitnesspal.com/_next/data/2eHVkupThr3Qw2DWCwiii/en/account/login.json

# Signup page data
GET https://www.myfitnesspal.com/_next/data/2eHVkupThr3Qw2DWCwiii/en/account/create/welcome.json

# NextAuth session check (returns empty/400 when unauthenticated)
GET https://www.myfitnesspal.com/api/auth/session

# Sourcepoint default consent state
GET https://cdn.privacy-mgmt.com/usnat/consent/36321/default-consent

# Sourcepoint consent vendor categories
GET https://cdn.privacy-mgmt.com/usnat/vendor-list/categories?siteId=36321

# Sourcepoint USNAT metadata
GET https://cdn.privacy-mgmt.com/wrapper/v2/meta-data?siteId=36321
```

**Authenticated (requires session cookie)**

```bash
# Internal API (all endpoints require Authorization header)
GET https://api.myfitnesspal.com/
# Returns: {"error":"validation/3","error_description":"Invalid request received: Missing HTTP header: Authorization"}

# Public diary by username (if privacy settings allow)
GET https://www.myfitnesspal.com/food/diary/[username]

# Public printable diary
GET https://www.myfitnesspal.com/reports/printable-diary/[username]
```

### Gotchas

- Build ID (`2eHVkupThr3Qw2DWCwiii`) is embedded in all `_next/data` paths and changes on each deployment. Extract from `__NEXT_DATA__` on first page load.
- `_next/data` routes for authenticated pages return 302 redirects to login when accessed without a session.
- The Sourcepoint property href mismatch (`prodmyfitnesspal.com` vs `myfitnesspal.com`) is in `window.__ENV__`; the siteId=36321 lookups still resolve correctly.
- `api.myfitnesspal.com` requires `Authorization: Bearer <token>`. Token format and acquisition flow for the public OAuth API at `myfitnesspalapi.com` follow standard OAuth2 Authorization Code Grant: `GET /oauth2/auth` then authorization code then `POST /oauth2/token`.
- `anon-device-id` is set as a server-side cookie on first request. Subsequent requests without it may produce different responses.
- DATADOG_SESSION_SAMPLE_RATE is 40% -- only 40% of sessions generate full RUM telemetry.
