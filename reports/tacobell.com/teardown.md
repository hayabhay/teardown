---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "Taco Bell — Teardown"
url: "https://tacobell.com"
company: "Taco Bell"
industry: "Hospitality"
description: "Quick-service Mexican-American fast food chain owned by Yum! Brands."
summary: "Next.js SPA backed by SAP Commerce Cloud (Hybris) OCC API v4 on AWS API Gateway, fronted by Akamai CDN and bot protection. Firebase handles remote config and 22 feature flags; Contentful manages CMS content. Transcend Airgap v9.140.0 enforces consent at the network layer, intercepting GTM tags that default to all-granted. Authentication runs on a shared Yum! Brands identity platform."
date: "2026-04-12"
time: "21:33"
contributor: "hayabhay"
model: "sonnet-4.6"
effort: "high"
stack: [Next.js, SAP Commerce Cloud, Akamai, Firebase, Contentful, AWS API Gateway]
trackers: [Google Tag Manager, Google Analytics, Facebook Pixel, FullStory, Snapchat Pixel, Pinterest Tag, AppsFlyer, Datadog, Braze, TikTok Pixel]
tags: [qsr, fast-food, sap-commerce, next-js, firebase, yum-brands, loyalty-program, consent-management, hidden-menu, akamai]
headline: "The website hides 43% of the menu — every combo and party pack is invisible but orderable via direct URL."
findings:
  - "99 of 228 menu products are hidden from the website but marked purchasable with working product pages — entire categories (all 16 combos, all 10 party packs, the full Cantina Chicken line) are absent from web browsing, reserving high-value multi-item orders for the app and in-store kiosk."
  - "The in-page Cookie Settings button is broken — a misconfigured base URL resolves to /undefined/privacyCenterPolicies-en.json, returning a 404 and leaving users with no way to manage consent preferences from the main site."
  - "GTM pushes all Google Consent Mode v2 signals to 'granted' on first page load before any user interaction — the only thing stopping ad pixels from firing is Transcend Airgap's network-layer interception, making the entire consent model a single point of failure."
  - "Firebase Remote Config exposes 22 feature flags to any browser, including 'popcorn_beta_enabled: 5' (an undisclosed beta feature) and survey configs that reveal internal product names: 'ConnectMe' for kiosks and 'DaaS' for Taco Bell's own first-party delivery network."
  - "Soft Taco and Crunchy Taco are hidden from the web menu but listed as HOT tier loyalty rewards — a deliberate scarcity mechanic that makes two of the most basic menu items appear exclusively as earned rewards."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

Taco Bell's website is a Next.js single-page application (buildId: `EhtpgRIYYs0A3pknd1jrz`) backed by a SAP Commerce Cloud (Hybris) OCC API v4 deployment. That backend sits behind AWS API Gateway — response headers confirm this with `x-amz-apigw-id`, `x-amzn-requestid`, and `x-amzn-trace-id` on every API response — and the whole stack is fronted by Akamai's CDN and bot protection layer. Homepage content comes from Contentful CMS; Contentful entry titles are visible in the `__NEXT_DATA__` payload and follow an internal naming convention: `Web Home | Hero | Crispy Meets Iconic (3/19) | E4 2026`, where the date and "E-period" (E4 2026) appear to denote a publishing sprint or editorial cycle.

Firebase serves as the runtime configuration layer. The project is `taco-bell-ecommerce-firebase` (project number `518205307253`, web app ID `1:518205307253:web:f719aefe9b8467d1e27b3c`). Every page load fires two requests to Firebase: an installation registration to `firebaseinstallations.googleapis.com` and a feature flag fetch to `firebaseremoteconfig.googleapis.com`. Both use the same API key (`AIzaSyBLtwoXLux6rxzsykYatKtGTaw7NBq-ZD4`), visible in clear text in the network log.

The site requires a real browser. Curl and raw HTTP/2 clients are rejected by Akamai's WAF — `net::ERR_HTTP2_PROTOCOL_ERROR` on non-browser requests. The SPA also swallows the `robots.txt` path: a request to `/robots.txt` returns the Next.js homepage HTML rather than a robots file.

Menu API responses are cached for 24 hours at the Akamai layer (`cache-control: max-age=86400`).

---

## The Hidden Menu

The menu API endpoint at `/tacobellwebservices/v4/tacobell/products/menu/0000` returns 228 products across 17 categories. Every single product has `purchasable: true`. But 99 of them — 43% of the catalog — have `isDisplayedOnStore: false`, meaning they don't appear anywhere on the standard web menu.

The breakdown by category:

| Category | Total | Hidden |
|---|---|---|
| Combos | 16 | 16 |
| Party packs | 10 | 10 |
| Cantina chicken menu | 9 | 9 |
| Online exclusives | 3 | 3 |
| Breakfast | 21 | 10 |
| Tacos | 13 | 9 |
| New | 18 | 9 |
| Sides & sweets | 29 | 8 |
| Best sellers | 13 | 5 |
| Specialties | 16 | 5 |
| Drinks | 35 | 5 |
| Nachos | 4 | 3 |
| Burritos | 7 | 2 |
| Vegetarian | 18 | 2 |
| Quesadillas | 4 | 1 |
| Bowls | 2 | 1 |
| Luxe value menu | 10 | 1 |

The pattern is not random. Entire structural categories are absent from the web: every combo meal (Crunchwrap Supreme Combo $8.99, Mexican Pizza Combo $11.29, 3 Crunchy Tacos Combo $8.89), every party pack (Taco Party Pack $20.99, Supreme Taco Party Pack $26.49, Variety Taco Party Pack $23.49), and the full Cantina Chicken line (Cantina Chicken Bowl $8.19, Cantina Chicken Burrito $5.99, Cantina Chicken Rolled Quesadilla $6.99, Cantina Chicken Crispy Taco Combo $9.49).

Hidden items also include prominent standalone products: Nacho Fries ($2.79), Large Nacho Fries ($3.79), Nachos BellGrande ($6.49), Chips and Guacamole ($3.79), Pintos N Cheese ($2.99), Soft Taco ($1.99), Crunchy Taco ($1.99), Soft Taco Supreme ($2.89), Crunchy Taco Supreme ($2.89), Nacho Cheese Doritos Locos Tacos ($2.89).

The reasons for hiding differ by category:

**Daypart gating.** Ten breakfast items are hidden because the default store code `0000` — used for the public website when no location is selected — reflects post-breakfast hours. The breakfast category has explicit `dayPartMessages` with `dayPartStatus: "after"` for the relevant time window (breakfast runs 7:00--10:45 AM). These items would appear during breakfast hours at a store that serves breakfast.

**Loyalty mechanics.** The Firebase Remote Config `how_it_works` flag contains the full loyalty tier structure. HOT tier rewards (250 points) are listed explicitly: Cheesy Fiesta Potatoes, Chips & Nacho Cheese Sauce, Cinnamon Twists, Cheesy Roll Up, Cheesy Bean & Rice Burrito, Bean Burrito, Crunchy Taco, Soft Taco, Spicy Potato Soft Taco, Cheesy Toasted Breakfast Burrito, Medium Fountain Drink. The Soft Taco and Crunchy Taco — two of the most recognizable items on the menu — are intentionally absent from the web menu so they appear exclusively as earned rewards for loyalty program members.

**App and kiosk push.** The majority of hidden items — combos, party packs, group meals — are the high-value, high-margin order types. The website is not the intended surface for these transactions. App ordering (where loyalty tracking, personalization, and upsell pipelines are richer) and in-store kiosk ordering (ConnectMe — see below) are the intended channels for multi-item purchases.

Despite being hidden from the browse experience, hidden products have fully functional individual pages. Visiting the product URL directly shows the item title, calories, price, full customization options, allergen information, and an active "Add to Order" button. No access restriction, no error message. The Breakfast Crunchwrap Sausage ($4.99, 740 calories) and the full Cantina Chicken line are browseable and orderable this way.

---

## Firebase Remote Config — 22 Feature Flags

Firebase Remote Config is Taco Bell's runtime feature flag system. The API key and app ID required to query it are embedded in every page's JavaScript and visible in the network log. The POST request to `https://firebaseremoteconfig.googleapis.com/v1/projects/taco-bell-ecommerce-firebase/namespaces/firebase:fetch?key=AIzaSyBLtwoXLux6rxzsykYatKtGTaw7NBq-ZD4` fires automatically on every page load. This is standard Firebase architecture — the client API key is explicitly designed to be public — but the flags it returns are not.

All 22 flags:

| Flag | Value |
|---|---|
| `braze_enabled` | `"true"` |
| `certona_enabled` | `"false"` |
| `certona_enabledAndroid` | `"false"` |
| `csc_enabled` | `"true"` |
| `favorites_enabled` | `"false"` |
| `hh_guest_gating_enabled` | `"false"` |
| `how_it_works` | (full loyalty tier JSON) |
| `in_app_resolution` | `"false"` |
| `login_signup_enabled` | `"-1"` |
| `loyalty_lifetime_points_enabled` | `"true"` |
| `manual_upsell_enabled` | `"false"` |
| `manual_upsell_enabledAndroid` | `"false"` |
| `min_app_version` | `"0"` |
| `minimum_fetch_interval_in_seconds` | `""` |
| `popcorn_beta_enabled` | `"5"` |
| `rate_order_chips` | (survey config JSON) |
| `rate_order_chips_connectme` | (kiosk survey config) |
| `rate_order_chips_daas` | (DaaS survey config) |
| `rate_order_chips_delivery` | (delivery survey config) |
| `rate_order_chips_pickup` | (pickup survey config) |
| `set_session_sampling_datadog` | `"15"` |
| `transcend_consent_enabled` | `"false"` |

Several flags stand out:

`certona_enabled: "false"` — Certona is SAP's personalization and recommendations engine. It's off. `manual_upsell_enabled: "false"` is also off on both web and Android. With both the algorithmic recommendations engine and manual upsell disabled, the web site has no active upsell mechanism beyond whatever GTM-driven ad targeting produces post-consent.

`favorites_enabled: "false"` — a "Favorites" feature exists in the codebase but is disabled.

`login_signup_enabled: "-1"` — The value `-1` is unusual for a feature flag. Boolean flags typically use `"true"/"false"` or `"0"/"1"`. The `-1` sentinel likely means the flag has a special state — possibly "controlled by backend," "globally disabled," or a condition code. The specific meaning is not resolvable from the evidence.

`popcorn_beta_enabled: "5"` — An undisclosed beta feature named "popcorn." The numeric value (not boolean) suggests a rollout percentage, A/B variant ID, or threshold. The identifier was not found in the web JavaScript bundle, suggesting this flag applies to the mobile app. The feature name and numeric value are the extent of what's visible.

`set_session_sampling_datadog: "15"` — 15% of user sessions are sent to Datadog Browser Logs for monitoring.

The `how_it_works` flag contains the full loyalty tier program copy including all Hot Tier and Fire Tier reward products, the $1 = 10 points conversion rate, and the complete Terms & Conditions text for the loyalty program — including the six-month points expiration policy and the clause that Taco Bell may change tier levels "in its sole discretion."

### Internal Product Names

The four `rate_order_chips_*` flags contain survey question configurations that reveal internal system names:

**ConnectMe** — Taco Bell's internal name for their in-store self-service kiosk ordering system. The `rate_order_chips_connectme` survey asks "How was your ConnectMe experience?" with chips for Kiosk Ease of Use, Order Accuracy, Wait Time, Food Temperature, Staff Assistance, Cleanliness, Wrong Order, Missing Items.

**DaaS** (Delivery as a Service) — Taco Bell's own first-party delivery fulfillment network, distinct from third-party platforms like DoorDash or Uber Eats. The `rate_order_chips_daas` survey includes "Courier Friendliness" and "Contactless Handoff," confirming it uses dedicated couriers rather than marketplace drivers.

The main `rate_order_chips` flag uses a `surveyDefinitionId: "TACCSIApp"` and has three variants matched by `visitTypes` and `orderMethodIn`: `non_delivery` (drive-thru, in-store, carry-out), `delivery`, and `connect_me` (kiosk, matched by `visitType: 2, orderMethodIn: [4], loyalty: true`). The kiosk variant requires `loyalty: true` — ConnectMe kiosk orders are loyalty-only.

---

## Consent Architecture

Taco Bell runs Transcend Airgap v9.140.0 as a consent management layer. The Airgap script loads from `transcend-cdn.com/cm/e7401ac7-ba3d-4dda-8e3b-63475ab9990f/airgap.js` and intercepts outbound network requests before they fire.

The consent design has a structural tension.

On every page load, the site pushes a `dataLayer` event to GTM:

```json
{
  "0": "consent",
  "1": "default",
  "2": {
    "ad_storage": "granted",
    "ad_user_data": "granted",
    "ad_personalization": "granted",
    "analytics_storage": "granted",
    "functionality_storage": "granted",
    "personalization_storage": "granted",
    "security_storage": "granted"
  }
}
```

This is Google Consent Mode v2's default consent state, and it sets every signal to `"granted"` before any user interaction. From GTM's perspective — and from the perspective of any tag loaded through GTM — full consent is in effect immediately.

What actually prevents those tags from sending data is Transcend Airgap's network-layer interception. When a quarantined tag (Facebook Pixel, Google Analytics, Snapchat, etc.) attempts an outbound request, Airgap intercepts it and stores the request in `localStorage.tcmQuarantine` instead of allowing the transmission. On the initial homepage load, no ad pixel network calls leave the browser. The quarantined Google Analytics requests include Google Consent Mode v2 state `gcd=13t3t3t3t5l1` and `npa=0` (non-personalized ads = false). The entire consent enforcement model depends on Airgap's interception working correctly on every page load — if Airgap fails to load, every tag believes it has full consent.

The `airgap.getConsent()` state on page load:

```json
{
  "purposes": {
    "Sms": "Auto",
    "Email": "Auto",
    "PushNotifications": "Auto",
    "Analytics": "Auto",
    "Advertising": "Auto",
    "Functional": "Auto",
    "SaleOfInfo": "Auto"
  },
  "confirmed": false,
  "prompted": true
}
```

`"Auto"` defers to Transcend's jurisdiction detection — in non-regulated regions, Auto typically allows; in GDPR/CCPA regions, it restricts. Four consent-relevant purposes (Analytics, Advertising, Functional, SaleOfInfo) have `optOutSignals: ["GPC"]` — browsers sending the Global Privacy Control signal are honored for these categories. SMS, Email, and PushNotifications do not have GPC listed as an opt-out signal, and have `showInConsentManager: false` — users cannot see or manage these categories even if the consent manager worked.

### The Consent Banner Suppression

The Firebase flag `transcend_consent_enabled: "false"` suppresses the proactive consent banner. Users are never shown a consent modal or cookie notice unprompted. The Airgap protection still runs — `airgap.status.protection: true` was confirmed — but users who haven't been prompted are unaware their consent state is being managed.

### The Broken Cookie Settings Button

The in-page "Cookie Settings" button is broken. Clicking it (or calling `window.transcend.showConsentManager()`) produces no UI. The Transcend UI module attempts to fetch the consent manager configuration from `https://www.tacobell.com/undefined/privacyCenterPolicies-en.json`, where `undefined` appears in place of a config variable that should contain a base URL. The fetch returns 404. Users who click "Cookie Settings" in the footer get no feedback.

The "Do Not Sell or Share My Personal Information" link in the footer works correctly — it navigates to `privacy.tacobell.com/sale-of-info`, a Transcend-hosted privacy center that loads independently. Users who know to look there can manage their preferences. Users who click the in-page settings button cannot.

---

## Surveillance Footprint

**Tracking stack (all quarantined by Airgap on initial page load):**
- Google Tag Manager `GTM-KSC92BG` — container for all GTM-managed tags
- Google Analytics — quarantined; events held in `localStorage.tcmQuarantine` with Google Consent Mode v2 state `gcd=13t3t3t3t5l1`
- Facebook Pixel — window global `fbq` present; network calls quarantined
- Snapchat Pixel — window global `snaptr` present; quarantined
- Pinterest Tag — window global `pintrk` present; quarantined
- TikTok Pixel — loaded via GTM conditionally

**Always-on trackers (not quarantined):**
- Akamai bot detection: cookies `bm_sz` (sensor data), `bm_sv` (session), `_abck` (challenge). Four additional scripts from `p11.techlab-cdn.com` (Akamai-owned). Sensor payload posts to obfuscated path `/D9ULPN/Lk/wC/2Unl/...` (4 calls per page load).
- Firebase Installations + Remote Config (functional infrastructure, not analytics)

**Post-auth trackers:**
- Braze (`braze_enabled: true`) — CRM and push notifications. Not initialized on the unauthenticated homepage. `window.braze` and `window.appboy` globals absent before login.
- AppsFlyer (banner key `ef325e6d-0f98-4e1f-b624-2d0fc40cb817`) — mobile app deep-linking banners

**Session monitoring:**
- FullStory (org `o-1VXZ5T-na1`, loaded from `edge.fullstory.com/s/fs.js`) — session recording
- Datadog Browser Logs (`DD_LOGS`) — 15% session sampling per `set_session_sampling_datadog: "15"`

**Cookies set before consent:**
- `bm_sz` — Akamai bot manager sensor data
- `bm_sv` — Akamai bot manager session
- `_abck` — Akamai bot challenge

No ad network cookies are set before user consent interaction. Transcend Airgap is doing its job on the tracking front — the issues are all in the consent management UI.

---

## Authentication & Access

Login is handled at `/login/yum` (registration at `/register/yum`). The `/yum` suffix indicates this is a shared Yum! Brands identity platform — the same system used by KFC and Pizza Hut. Available auth methods: email/password, SMS OTP ("Use Phone Number Instead"), and Apple Sign In. Google and Facebook SSO are absent — unusual for a major consumer app. The login page loads only Akamai and Transcend scripts; no auth provider SDK is preloaded until the user interacts.

Unauthenticated API access:

- `GET /tacobellwebservices/v4/tacobell/products/menu/{storeCode}` — open; returns full 228-product catalog including hidden items
- `GET /tacobellwebservices/v4/tacobell/stores?latitude={lat}&longitude={lng}` — open; returns real-time store data including phone numbers, `qrCodeEnabled`, `cupChargeParticipation`, `roundUpFlag`, `pickupShelves`, store number, and time zone
- `GET /tacobellwebservices/v4/tacobell/carts/current` — 404 unauthenticated
- `GET /tacobellwebservices/v4/tacobell/users/anonymous` — 200 with `{"message": "Not Found"}`
- `GET /tacobellwebservices/v4/tacobell/users/current/orders` — 401 unauthenticated
- `POST /tacobellwebservices/v4/tacobell/promotions` — 404 (HTML response)

Akamai enforces bot detection on all API paths. Calls without browser-like fingerprints return connection errors rather than HTTP 4xx responses.

The `GET /api/delete-auth-cookies` endpoint fires on every page load regardless of login state — a cleanup hook that clears stale authentication cookies.

IndexedDB databases present in a browser session: `cart` (v1, cart state), `firebase-heartbeat-database` (v1), `firebase-installations-database` (v1), `firebase_remote_config` (v1, cached feature flags).

---

## Machine Briefing

### Access & auth

No auth needed for menu and stores APIs. All requests require a real browser or convincing browser headers — Akamai rejects bare HTTP clients. Use Playwright or a session with browser-like headers.

```bash
# Menu — no auth, returns full 228-product catalog including hidden items
curl -H "User-Agent: Mozilla/5.0..." \
  "https://www.tacobell.com/tacobellwebservices/v4/tacobell/products/menu/0000"

# Stores near a coordinate
curl -H "User-Agent: ..." \
  "https://www.tacobell.com/tacobellwebservices/v4/tacobell/stores?latitude=34.052&longitude=-118.243&radius=10"

# Firebase Remote Config — 22 feature flags
curl -X POST \
  "https://firebaseremoteconfig.googleapis.com/v1/projects/taco-bell-ecommerce-firebase/namespaces/firebase:fetch?key=AIzaSyBLtwoXLux6rxzsykYatKtGTaw7NBq-ZD4" \
  -H "Content-Type: application/json" \
  -d '{"app_instance_id":"<generated-fid>","app_id":"1:518205307253:web:f719aefe9b8467d1e27b3c","sdk_version":"0.5.0","app_version":""}'
```

### Endpoints

**Open (no auth):**

```
GET /tacobellwebservices/v4/tacobell/products/menu/{storeCode}
  storeCode: "0000" for default/public menu
  Response: {menuProductCategories: [{code, name, products: [{code, name, price, isDisplayedOnStore, purchasable, hasAVA, ...}]}], ...}
  Cache: 24h Akamai

GET /tacobellwebservices/v4/tacobell/stores
  Params: latitude, longitude, radius (in miles, inferred)
  Response: [{storeNumber, phone, timeZone, qrCodeEnabled, cupChargeParticipation, roundUpFlag, pickupShelves, openHours, ...}]

POST https://firebaseremoteconfig.googleapis.com/v1/projects/taco-bell-ecommerce-firebase/namespaces/firebase:fetch
  ?key=AIzaSyBLtwoXLux6rxzsykYatKtGTaw7NBq-ZD4
  Body: {app_instance_id: <Firebase Installation ID>, app_id: "1:518205307253:web:f719aefe9b8467d1e27b3c"}
  Response: {entries: {braze_enabled, certona_enabled, favorites_enabled, popcorn_beta_enabled, ...}}
```

**Authenticated (bearer token required):**
```
GET /tacobellwebservices/v4/tacobell/users/current/orders  → 401 unauthenticated
GET /tacobellwebservices/v4/tacobell/carts/current         → 404 unauthenticated
```

### Gotchas

- **Akamai blocks non-browser clients.** Direct curl without browser UA and headers results in `ERR_HTTP2_PROTOCOL_ERROR`. Use Playwright or a session cookie with `bm_sz`/`bm_sv`/`_abck` values from a real browser session.
- **Menu is cached 24h.** The `/menu/0000` endpoint returns cached data; real-time product availability requires a specific store code and may differ.
- **CORS on menu API.** `OPTIONS` preflight returns 403 on cross-origin requests. The site proxies the menu call server-side in Next.js; client-side cross-origin fetch will fail.
- **Firebase Remote Config requires a valid app installation ID.** The `app_instance_id` field must be a properly generated Firebase Installation ID (FID) — random strings will return an error. Generate one using the Firebase Installations API first, or capture one from a real browser session's `firebase-installations-database` IndexedDB store.
- **Store code `0000`** is the default public menu. To get location-specific availability (including accurate daypart status for breakfast), use a real store code from the stores API response.
- **Hidden products** (`isDisplayedOnStore: false`) do not appear in any navigation or search on the website. Product pages are at `/food/{category}/{product-slug}` — the slug follows a predictable pattern from the product name.
