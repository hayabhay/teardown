---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "Mindbody — Teardown"
url: "https://www.mindbodyonline.com"
company: "Mindbody"
industry: "Information"
description: "SaaS platform for fitness and wellness business management and consumer booking."
summary: "Mindbody runs two separate apps on one domain: a Drupal 11 B2B marketing site at www and a React 16 SPA (internal codename project-sunset-cliffs) serving the consumer marketplace at /explore/. A third micro-frontend (single-spa) handles the business portal at business.mindbodyonline.com. Infrastructure runs Cloudflare in front of Pantheon's Styx CDN for the Drupal layer, with AWS API Gateway backing the consumer search APIs. Tealium IQ manages 17 tag slots on B2B; LaunchDarkly manages 54 feature flags on B2C. Both apps have separate TrustArc consent domains, separate GA4 properties, and separate New Relic app IDs, but share centralized auth at auth.mindbodyonline.com."
date: "2026-04-12"
time: "17:16"
contributor: "hayabhay"
model: "sonnet-4.6"
effort: "high"
stack:
  - Drupal 11
  - React
  - Cloudflare
  - Pantheon
  - AWS
  - Tealium
  - LaunchDarkly
trackers:
  - Google Analytics 4
  - Google Ads
  - Facebook Pixel
  - TikTok Pixel
  - Microsoft Clarity
  - Bing Ads
  - Marketo
  - Bizible
  - Optimizely
  - Tealium IQ
  - Pinterest
  - Capterra
  - G2Crowd
  - New Relic
  - Mixpanel
  - Branch.io
  - ChiliPiper
  - Spara
  - Source Defense
tags:
  - saas
  - fitness
  - wellness
  - feature-flags
  - de-anonymization
  - consent
  - tealium
  - drupal
  - checkout-ads
  - first-party-proxy
headline: "Mindbody's consumer booking app is one LaunchDarkly flag flip from showing Rokt checkout ads to people booking yoga classes and spa appointments."
findings:
  - "Rokt checkout ad integration is fully wired into the production React bundle with a live account ID -- the only gate is a single LaunchDarkly flag set to false, requiring no code deploy to activate third-party ads on wellness booking confirmations."
  - "Spara visitor de-anonymization is active on the B2B site -- anonymous visitors have their IP submitted to a company-matching database, and the full Spara config including a developer's personal ngrok tunnel and local Ddev URL shipped in the production whitelist."
  - "The consumer search API at prod-mkt-gateway.mindbody.io returns paginated business records with phone numbers, coordinates, live class openings, and full pricing without any authentication -- 10,000-result Elasticsearch cap per query."
  - "54 LaunchDarkly feature flags are readable by anonymous users, exposing internal codenames, geographic expansion plans, a 2024 hackathon feature running in production, and disabled-but-configured ad and affiliate networks."
  - "TrustArc is configured with consentModel opt-out and behaviorManager eu on both B2B and B2C surfaces -- EU visitors have 17+ trackers fire before any consent interaction, including on the consumer app handling fitness class bookings."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

Mindbody sells cloud software to gyms, yoga studios, spas, and wellness businesses, and runs a consumer marketplace where people book classes and appointments. The site at `www.mindbodyonline.com` hosts both. What it doesn't advertise is that visiting the B2B marketing pages puts your IP address through a company-identification system, that the EU consent banner defaults to opt-out for everyone, or that 54 internal feature flags are readable without authentication.

## Architecture

Mindbody runs two separate applications on one domain. The `www.mindbodyonline.com` root serves a Drupal 11 marketing site aimed at business owners. The `/explore/` path loads an entirely different React 16 SPA -- internal codename `project-sunset-cliffs` (the webpack bundle opens with `webpackJsonpproject-sunset-cliffs`; a LaunchDarkly flag named `sunset-cliffs-maintenance-mode` corroborates the name; Sunset Cliffs is a San Diego landmark, consistent with Mindbody's historical HQ). A third separate micro-frontend at `business.mindbodyonline.com` handles the business owner portal using `single-spa` and SystemJS module federation.

The CDN stack for the Drupal site is layered: Cloudflare sits in front, Pantheon's Styx CDN behind it (header: `x-pantheon-styx-hostname: styx-us-a-869d8c6599-djcjl`), with Fastly cache nodes visible in `x-served-by` headers (`cache-chi-klot8100156-CHI`, `cache-sjc1000141-SJC`). The React app and APIs run on AWS, with `x-amzn-requestid` headers on API responses. The search and data gateway is internally named "beacons" -- the bundle contains `REACT_APP_BEACONS_HOST: "https://prod-mkt-gateway.mindbody.io"`.

Stack markers:

- `x-generator: Drupal 11` in response headers
- Tealium IQ tag manager (`mindbody/main/prod`) for B2B; LaunchDarkly for B2C feature flags
- Auth centralized at `auth.mindbodyonline.com` and `signin.mindbodyonline.com`
- Inbenta AI search integrated via `sdk.inbenta.io/search/1.50/inbenta-search-sdk-space-cowboy.css` -- "space-cowboy" is either a Mindbody project codename or an Inbenta build name
- Source Defense supply chain security agent loaded from `sd.mindbodyonline.com`
- B2C app last built `2026-03-16T07:02:03.848Z`, git hash `08b19d32`
- 2-hour session timeout (`REACT_APP_SESSION_TIMEOUT_SECONDS: "7200"`)

Each surface has its own instrumentation: two GA4 properties (`G-EDX6GRS9K2` for B2B, `G-BV27YTBYV8` for B2C), two New Relic app IDs (`262698732` on B2B, `174011954` on B2C using a different NR datacenter region), and two separate TrustArc consent domains (`mindbodyonline-business.com` for B2B, `mindbodyonline-consumer.com` for B2C).

The sitemap index at `/sitemap_index.xml` exposes internal naming in its XML comments: "B2B Marketing" (1,884 URLs across `www`), "B2C Product" (`/explore/sitemap.xml.gz`), and "Mindbody Support" (`support.mindbodyonline.com`).

---

## The Surveillance Stack

A fresh load of the Mindbody B2B homepage fires 74 network requests: 3 first-party, 71 third-party across 14 domains. The full tracker inventory, managed through Tealium IQ with 17 tag slots:

**B2B site (Tealium-managed):**
- Google Analytics 4 (`G-EDX6GRS9K2`) via gtag.js
- Google Ads Conversion Tracking (`AW-1031143406`) -- 5 conversion fires on homepage alone
- Facebook Pixel -- two IDs: `358256010035004` (tag 232) and `620545974695508` (tag 282). Two distinct pixel configs, both firing on all pages; likely legacy accumulation rather than intentional split
- TikTok Pixel (`CCBR3E3C77U85D4J6VU0`)
- Microsoft Clarity (`mth4wtyzqj`) -- session recording
- Bing Ads (bat.js) -- Microsoft Ads conversion
- Marketo Munchkin (`043-BNO-230`) -- B2B lead tracking
- Bizible (`cdn.bizible.com`) -- B2B marketing attribution (`_biz_uid`, `_biz_nA`, `_biz_ABTestA`, `_biz_flagsA`, `_biz_pendingA`)
- G2Crowd (`tracking.g2crowd.com`) -- review site attribution
- Capterra -- two pixel IDs (`2302814`, `2302813`)
- Optimizely (project `17462770603`) -- A/B testing
- Pinterest (`2613683513352`)
- ChiliPiper -- demo booking widget
- Spara (tag 368) -- AI chat and visitor de-anonymization
- New Relic (APM + Browser Agent with Session Replay)

**B2C /explore/ app -- additional/different:**
- LaunchDarkly (`61097c2c978a2f283aeaeda1`) -- feature flags
- Branch.io (`key_live_afkKjTVeeJSKbzNtDBh4EjlhztivgHcU`) -- deep link tracking; fires `pageview` and `open` events on every load
- Mixpanel (`38489367533689072d7cce494fc6aa7b`) -- product analytics
- Optimizely Full Stack (`9e4QfFdtzv6LhcYwThmXL`) -- server-side feature experiments
- Rokt (`2962520505079567949`) -- checkout ad network; code present, disabled via flag (see section below)
- Facebook App ID `1485657611676811` -- social login and pixel
- Source Defense (supply chain security)

**First-party tracker proxy:** `collect.mindbodyonline.com/mindbody/main/2/i.gif` is a first-party subdomain routing to Tealium AudienceStream. Data routed through it bypasses third-party cookie blockers that would intercept requests to `collect.tealiumiq.com`.

**Two session recorders:** New Relic Browser Agent sends `type=SessionReplay` payloads to `bam.nr-data.net` starting within the first 5 seconds of a homepage load (decompressed payload 868 KB on first chunk, using rrweb `@newrelic/rrweb@1.0.1`). Microsoft Clarity (`_clck`, `_clsk` cookies) records separately. Both fire on first load with no consent interaction.

**Google Enhanced Conversions:** `allow_enhanced_conversions: "true"` in the Google Ads dataLayer config. `en=user_provided_data` events fire to `google.com/ccm/collect` and `google.com/rmkt/collect` on page load, indicating that when visitors submit Marketo forms (name, email, phone), that data gets hashed and relayed to Google for ad attribution matching.

**Visitor geolocation in a JavaScript-readable cookie:** Pantheon's Styx CDN injects precise visitor location into `STYXKEY_mbGeolocation` on every request:

```
STYXKEY_mbGeolocation={"city":"San Francisco","countryName":"United States","isoCode":"us","postalCode":"94133","subdivision":"California"}
```

The cookie has no HttpOnly flag, meaning every third-party script on the page can read it. Tealium uses it for audience segmentation (`user_country` field in utag_data). Spara also fetches raw visitor IP separately via `api.ipify.org`.

---

## TrustArc EU Consent Configuration

Both TrustArc instances -- `mindbodyonline-business.com` (B2B) and `mindbodyonline-consumer.com` (B2C) -- share the same consent configuration:

- `consentModel: "opt-out"` in the TrustArc script
- `behaviorManager: "eu"` -- applies the EU behavior manager
- Cookie `notice_behavior=implied,eu` set on first response

The result: Tealium's utag_data shows `tci.consent_type: "implicit"` with `tci.purposes_with_consent_all: ["0","1","2"]` -- all three consent categories (analytics, advertising, personalization) granted without user action. The full tracker stack fires before any visitor touches the consent banner.

GDPR Article 6(1)(a) requires freely given, specific, informed, and unambiguous consent for processing based on consent. Opt-out consent with implied mode pre-grants all purposes and does not meet that bar.

This applies to both surfaces. On the consumer side, the B2C app processes fitness class bookings and wellness service preferences under the same opt-out configuration. A LaunchDarkly flag `enable-explore-privacy-policy-consumer-agreement-notice: false` indicates a specific privacy/consumer agreement notice is disabled in the consumer app.

Both TrustArc instances run on separate domains but identical behavioral config, suggesting this is a deliberate architectural choice rather than a misconfiguration of one instance.

---

## Spara: Visitor De-anonymization

Spara is a B2B "revenue acceleration" platform. Mindbody runs it on the B2B marketing site with `deanonymize_traffic_enabled: true` and `deanonymization_mode: "ENGAGED_ONLY"`. The operational sequence: a business owner (or anyone) visits the marketing site, Spara loads via Tealium (tag 368), `api.ipify.org` fetches the visitor's raw IP, Spara submits the IP to its company-identification database, and if matched, routes to the appropriate sales representative. "ENGAGED_ONLY" mode means the de-anonymization activates only after the visitor shows some interaction, not on cold page loads.

Mindbody's full Spara configuration is accessible without authentication:

```
GET https://app.spara.co/api/v1/organizations/qx6XUAM4W
GET https://app.spara.co/api/v1/organizations/qx6XUAM4W/navigator_mode
GET https://app.spara.co/api/v1/organizations/qx6XUAM4W/default-sales-rep
```

The org config endpoint returns `deanonymize_traffic_enabled`, `deanonymization_mode`, theme config, and Mindbody's privacy policy text used for disclosure. The navigator endpoint returns the chatbot's full behavioral config: initial message ("Welcome to Mindbody! I am your virtual guide -- here to help you find what you need."), suggested responses ("I'd like a demo from sales", "I need customer support", "Book a class or appointment", "What is Mindbody?"), and the preview message shown before the visitor interacts. The sales rep endpoint returns title ("Virtual Guide") and profile image URL hosted on Spara's S3 bucket.

The Spara embed script served to every marketing site visitor (`spara-full-embed.js`) contains Mindbody's URL whitelist -- the domains where Spara is permitted to load. That list includes two entries that should not be there:

- `https://b2b-mb.ddev.site:8443/` -- a local development environment using Ddev (Docker-based local dev tooling)
- `https://cherise-schmaltzy-apetaly.ngrok-free.dev/` -- a personal ngrok tunnel, likely belonging to a developer named Cherise

These were added to the Spara widget configuration and committed to production. Both URLs are now served to every visitor's browser as part of the Mindbody marketing site.

---

## LaunchDarkly Feature Flags

The B2C app evaluates feature flags via LaunchDarkly's client-side SDK. For anonymous users, flags are returned by `GET https://app.launchdarkly.com/sdk/evalx/61097c2c978a2f283aeaeda1/users/{base64-encoded-user-context}` without any authentication beyond the SDK client key. 54 flags are returned:

**Confirmed live features:**
- `convenience-fee-explore-webapp: true` -- convenience fees active in checkout
- `enable-ftc-checkout-web-explore: true` -- FTC-related checkout compliance enabled
- `sunset-flex-membership: true` -- "Flex" membership type live
- `marketplace-optin-welcome-modal: true` -- marketplace opt-in flow present
- `should-show-strength-training-category: true` -- new category expansion
- `local-hubs-nearby-cities: true` -- nearby city listings enabled
- `web-attribution-update-logic: true` -- updated attribution logic active
- `web-attribution-update-logic-hackathon-2024: true` -- a flag explicitly named after a 2024 hackathon, currently active in production
- `tealium_cookie_consent_management: true` -- Tealium-based consent management configured (though TrustArc overrides with implicit mode)
- `show-deib-highlights: true` -- diversity/equity/inclusion business highlights shown

**Disabled but configured:**
- `enable-rokt-ads-explore: false` -- Rokt checkout ad network off (account ID already in bundle)
- `default-affiliate-network-enable: false` -- affiliate network configured, not yet enabled
- `partner-network-for-international-customers: false` -- international partner network ready

**Geographic and expansion signals:**
- `partner-network-allowed-countries: "US,GB,IE,CA,AU,SG,HK"` -- consumer partner network limited to 7 countries
- `apphub-allowed-countries: "All"` -- AppHub (third-party integrations marketplace) globally available

**Internal codename confirmation:**
- `sunset-cliffs-maintenance-mode: false` -- confirms "project-sunset-cliffs" as the consumer app's codename; the flag would take down the app in a maintenance scenario

**Payment expansion signals:**
- `idealWeroCobranding: true` and `web_ideal_payment_option_support: true` -- Wero is a European digital wallet; suggests EU payment method expansion

---

## Rokt Checkout Ads: One Flag Away

Rokt is a post-checkout advertising platform that places third-party brand offers on checkout confirmation pages. The Mindbody React bundle contains `REACT_APP_ROKT_ACCOUNT_ID: "2962520505079567949"`. The only thing preventing Rokt ads from appearing when consumers book fitness and wellness services is the LaunchDarkly flag `enable-rokt-ads-explore: false`.

Flipping that flag activates the full Rokt integration already wired into the production codebase. No code changes, no deploy, no migration -- the account is registered, the SDK is loaded, the integration is built. The consumer booking confirmation page would start showing third-party ads from other brands.

---

## Unauthenticated Search API

`prod-mkt-gateway.mindbody.io` serves the consumer marketplace data with no authentication required:

**`POST /v1/search/locations`**
Returns paginated fitness business records. Response includes: business name, street address, phone number, lat/lon coordinates (`latLon: "40.7550990,-74.0314936"`), categories, amenities, `averageRating`, `totalRatings`, `totalDeals`, `businessIdentifiesAs` (identity tags), `crowdSafeAs` (safety tags), currency, timezone, slug. Elasticsearch backend; `meta.found: 10000` cap per query with `searchEngine: "elasticsearch_1.0"`. Response structure wraps records as `data[].attributes`.

**`POST /v1/search/class_times`**
Returns available class slots with live openings counts and full pricing. Response includes: `openings: 10`, `duration: 60`, `category`, `purchaseOptions[]` with `pricing.retail` and `pricing.online` values, `mb_class_id`, `mb_site_id`, `mb_location_id` (internal IDs from the Mindbody booking system), `startTime`, `endTime`, `cutoffAt`, `waitlistable`, `isIntroOffer`.

**`POST /v1/search/deals`**
Returns deals and intro offers: deal name, session counts, duration, `activation_type`, retail/online pricing, `mb_product_id`, `mb_program_id`.

**`GET /v1/geolocate`**
Returns 204 and sets a geolocation cookie server-side.

What someone could build: a complete real-time directory of every Mindbody-networked business, with live pricing and class availability, scraped without any authentication or API key. The 10,000-result cap is the only practical limit.

---

## Infrastructure Exposure

The robots.txt disallows `/export_architecture/` -- that path returns 401, confirming it exists and is auth-gated. It's a Drupal path that likely exports the site structure. The admin panel at `/admin/` returns 403. Node IDs are visible client-side (`path.currentPath: "node/3958"` in drupalSettings for the homepage).

Subdomains visible via certificate transparency:
- `insights-admin.mindbodyonline.com` -- returns 200, login page for a BI/analytics tool (likely Looker)
- `canary-auth.mindbodyonline.com` -- returns 200, "MINDBODY Authentication" with New Relic visible; canary deploy of the auth service
- `auth.mindbodyonline.com` -- production auth (200)
- `adfs.mindbodyonline.com` -- Active Directory Federation Services for SSO
- `aws-signin.mindbodyonline.com` -- AWS console sign-in subdomain visible in CT logs
- `kibana.mindbodyonline.com` -- returns 404 (no longer accessible)

Infrastructure naming: headers expose Cisco ISE nodes `LV9-ISE-A` and `LV9-ISE-B` (identity/network access control), suggesting corporate network access management is integrated with SSO.

The business portal at `business.mindbodyonline.com` uses Pendo.io (`183ec609-d20c-40fd-6d6f-af75d69e15ca`) for in-app product analytics and onboarding flows targeted at business owners. It connects to `clients.mindbodyonline.com/launch` for legacy client software continuity.

---

## Machine Briefing

### Access & auth

The marketing site (Drupal) and consumer app (`/explore/`) are both public. No auth needed for the search and data APIs. The Spara org config API is open. LaunchDarkly flag evaluation is open with the client SDK key. For auth-gated flows (bookings, user accounts), auth is handled at `auth.mindbodyonline.com` -- not investigated in this teardown.

All API calls can be made with a standard `fetch` or `curl`. No cookies or session tokens required for the data APIs.

### Endpoints

**Search / Data API (no auth)**

```bash
# Search locations -- paginated, up to 10,000 results
curl -X POST https://prod-mkt-gateway.mindbody.io/v1/search/locations \
  -H "Content-Type: application/json" \
  -d '{
    "query": "yoga",
    "filter": {
      "location": { "lat": 37.7749, "lon": -122.4194, "radius_miles": 5 }
    },
    "pageSize": 20,
    "startFrom": 0
  }'

# Class times for a location -- live openings + pricing
curl -X POST https://prod-mkt-gateway.mindbody.io/v1/search/class_times \
  -H "Content-Type: application/json" \
  -d '{
    "filter": {
      "location_ids": ["<slug-or-id>"],
      "start_time": "2026-04-12T00:00:00Z",
      "end_time": "2026-04-19T00:00:00Z"
    }
  }'

# Deals / intro offers
curl "https://prod-mkt-gateway.mindbody.io/v1/search/deals?filter.location_id=<id>"
```

Response structure: `{ "data": [ { "id": "...", "type": "...", "attributes": { ... } } ], "meta": { "found": 10000, "start": 0, "searchEngine": "elasticsearch_1.0" } }`

**LaunchDarkly flags (no auth beyond SDK key)**

```bash
# Evaluate all 54 feature flags for anonymous user
# User context is base64-encoded JSON: {"kind":"user","anonymous":true}
curl "https://app.launchdarkly.com/sdk/evalx/61097c2c978a2f283aeaeda1/users/eyJraW5kIjoidXNlciIsImFub255bW91cyI6dHJ1ZX0="
```

Returns all 54 flags as a flat JSON object. Interesting keys: `enable-rokt-ads-explore`, `partner-network-allowed-countries`, `sunset-cliffs-maintenance-mode`, `web-attribution-update-logic-hackathon-2024`.

**Spara org config (no auth)**

```bash
# Full org config including de-anonymization settings
curl https://app.spara.co/api/v1/organizations/qx6XUAM4W

# Chatbot / navigator config
curl https://app.spara.co/api/v1/organizations/qx6XUAM4W/navigator_mode

# Sales rep config
curl https://app.spara.co/api/v1/organizations/qx6XUAM4W/default-sales-rep
```

**Drupal CMS**

```bash
# Node IDs are sequential; homepage is node/3958
curl https://www.mindbodyonline.com/node/3958  # redirects to canonical URL

# robots.txt shows disallowed paths
curl https://www.mindbodyonline.com/robots.txt

# export_architecture path exists, auth-gated
curl https://www.mindbodyonline.com/export_architecture/  # 401
```

### Gotchas

- `prod-mkt-gateway.mindbody.io` search endpoints: the `found: 10000` cap is an Elasticsearch default; you cannot page past offset 10,000. Use tighter geographic filters to segment requests.
- Class times endpoint requires explicit date range filters -- requests without `start_time`/`end_time` return empty results.
- LaunchDarkly user context must be base64-encoded JSON matching the LaunchDarkly user schema; malformed contexts return errors, not flags.
- Spara org ID `qx6XUAM4W` is baked into the production embed script -- it's the stable identifier for Mindbody's Spara instance.
- Stripe publishable key `pk_live_0UGLrZDh3rO0NgCdvMLgcP0j00x9125phk` is in the B2C bundle -- standard for client-side Stripe, not usable server-side. A Stripe TEST key `pk_test_Y0zsNqf1Yabighk6oMr206WK00oK5sdaVc` is also in the production bundle -- indicates test infrastructure artifacts were not cleaned from the build.
- `collect.mindbodyonline.com/mindbody/main/2/i.gif` is a first-party Tealium proxy -- requests there will be logged as first-party Mindbody data even though they're analytics beacons.
