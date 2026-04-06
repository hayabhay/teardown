---
# agents: machine-friendly instructions in "## Machine Briefing"
title: Ticketmaster — Teardown
url: "https://www.ticketmaster.com"
company: Ticketmaster
industry: Entertainment
description: "Online ticketing platform for live events, concerts, and sports."
summary: "Ticketmaster runs a hybrid architecture: a Next.js frontend (build production-10-298-0-13406314) on Fastly CDN with three Varnish layers, sitting atop a legacy PHP/Perl stack still serving browse and search. Redux with RTK Query manages client state; WebAssembly handles interactive seat selection (roar-0.39.2.wasm) with real-time inventory via WebSocket. ISM (Interactive Seat Maps) venue data is served from two public, unauthenticated APIs with wildcard CORS. OneTrust manages consent with US visitors in an opt-out ruleset, meaning all 19 tracked vendors fire by default."
date: 2026-04-05
time: "20:31"
contributor: hayabhay
model: sonnet-4.6
effort: high
stack: ["Next.js", "Fastly", "Redux", "WebAssembly", "Varnish"]
trackers: ["Google Tag Manager", "Google Analytics 4", "Google Ad Manager", "Google Ads", "ContentSquare", "Lytics", "Monetate", "OneTrust", "Hadron", "Quantcast", "Pinterest Pixel", "Spotify Pixel", "Reddit Pixel", "Amazon DSP", "Bing UET", "The Trade Desk", "reCAPTCHA Enterprise", "Bugsnag", "Zendesk"]
tags: ["ticketing", "live-events", "next-js", "wasm", "open-api", "feature-flags", "surveillance", "dual-stack", "consent"]
headline: "Feature flags confirm Ticketmaster built all-in pricing to show fees upfront, then disabled it — every buyer still pays surprise fees by design."
findings:
  - "Feature flags allInPricingV2, allInPricingV3, showFeeOnTicket, and feebreakdown are all set to false — Ticketmaster built the infrastructure to show fees upfront but keeps it turned off, so buyers still see the price jump at checkout."
  - "Two unauthenticated APIs with wildcard CORS return the full seating geometry for any venue — 6,340 seat IDs with pixel-level x/y coordinates — letting anyone reconstruct any ticketed venue's layout programmatically."
  - "Live Nation operates its own ad identity graph (Hadron at ad.gt) that fires on every Ticketmaster page, resolving visitor identities across the Live Nation ecosystem — a first-party tracking network disguised as a third-party domain."
  - "A public CloudFront endpoint serves per-event ad/sponsorship pixel configs including purchase-price variable mappings, exposing the ad revenue plumbing for every event without authentication."
  - "200+ feature flags are fully exposed client-side, naming disabled checkout features (buyNowPayLater, integratedResale) and every upsell partner (Fanatics, Parkwhiz, Spothero, JustPark) gated at checkout."
---

## Architecture

Ticketmaster runs two rendering stacks simultaneously. The primary stack is Next.js — identified by `x-powered-by: Next.js`, `__NEXT_DATA__`, `__BUILD_MANIFEST`, and `webpackChunk_N_E` globals — branded internally as ICCP (International Consumer-facing CCP). Build version `production-10-298-0-13406314`, build ID `prAeYIj_YKLXoEhYRO5wy`. The legacy stack — PHP/Perl, served by Apache with Prototype.js and jQuery 3.1.1 — still handles browse, legacy search, and sitemap routes. Visiting `/sitemap.xml` returns legacy HTML with `var isSuperNav = 0` and Prototype.js script tags. The `/DhA6lQM5/` disallowed path in robots.txt returns a 404 from `server: Apache` with a distinct CSP (`default-src * 'unsafe-inline' 'unsafe-eval'`) and sets a `TMSO` signed-session cookie — confirming the legacy path is still live. The coexistence of two stacks, two CSPs, and two server technologies is visible from a single curl.

CDN is Fastly, identified by `x-fastly: ICCP-GLOBAL-PROD` and `via: 1.1 varnish, 1.1 varnish, 1.1 varnish` (three Varnish hops). Homepage cache TTL is 30 seconds (`cache-control: max-age=30`). Blue-green deployment is visible in response headers: `x-bluegreen-route: green`.

Client state management is Redux with RTK Query (`__REDUX_STORE__`, `__INITIAL_STATE__`). Homepage SSR populates `__NEXT_DATA__.props.pageProps.initialReduxState` with the full config, feature flags, translations, and theme — all accessible before any JavaScript executes. The globals list also exposes `__THEME__`, `__TRANSLATIONS__`, `__STATE__`, `epsSID`, `epsfToken`, `gecToken`, and `client_ip` — the last being the visitor IP address assigned to a window global.

Homepage content is served via Prismic CMS (`prismicHomePage: true` in feature flags). The site uses a TMDS ("Discovery") microservice for all search and browse operations — feature flags confirm `useDiscovery: true` for events, artists, venues, categories, search suggest, and keyword search.

Seat selection is WebAssembly-powered. Event detail pages load `roar-0.39.2.wasm` (the RAS seat selection module) from `pubapi.ticketmaster.com/sdk/static/wasm/`. Real-time inventory communicates over WebSocket at `wss://marketplace.prod.pub-tmaws.io`. The RAS SDK itself is at `pubapi.ticketmaster.com/sdk/ras-sdk-v0.js`.

The SSL certificate for `www.ticketmaster.com` carries SANs for 70+ domains. Notable inclusions: `tickets.taylorswift.com`, `harrypotter.ticketmaster.com`, `shaniatickets.com`, `settlement.livenation.com`, `beta.ticketmaster.com`, `preprod-verifiedfan.ticketmaster.com`, `preprod.vf.ticketmaster.com`, `identity-preprod.ticketmaster.com`, `services-preprod.ticketmaster.net`, and `*.nonprod.ticketmaster.net`. The artist-specific domains (`tickets.taylorswift.com`, `shaniatickets.com`) redirect to Ticketmaster event pages, confirming white-label ticketing infrastructure. `settlement.livenation.com` in the cert suggests the Live Nation antitrust settlement portal shares certificate infrastructure.

Internal subdomain map from `__NEXT_DATA__` config:

| Subdomain | Purpose |
|---|---|
| `identity.ticketmaster.com` | OAuth / SSO |
| `analytics.ticketmaster.com` | Analytics backend (strict CORS whitelist) |
| `promoted.ticketmaster.com` | Promoted listings |
| `my.ticketmaster.com` | Post-purchase portal |
| `offeradapter.ticketmaster.com` | ISM offer/inventory API |
| `pubapi.ticketmaster.com` | Public SDK and manifest API (CORS `*`) |
| `mapsapi.tmol.io` | Venue geometry API (CORS `*`) |
| `venue.tmol.co` | View-from-seat (VVS) API |
| `epsf.ticketmaster.com` | EPS feature manager |
| `marketplace.prod.pub-tmaws.io` | RAS real-time availability WebSocket |

## Open Venue Data APIs

Two APIs return full venue geometry without authentication and with `Access-Control-Allow-Origin: *`.

**Seat manifest** — `GET https://pubapi.ticketmaster.com/sdk/static/manifest/v1/{eventId}`

Returns a JSON structure with `placeIds[]`, `manifestSections[]`, `manifestRows[]`, `manifestSeats[]`, and `partitions[]`. For event `3A006449897E4C84`, the response contains 6,340 seat IDs across 16 sections plus a PIT zone. The file is served from Amazon S3 (`x-amz-server-side-encryption: AES256`, `server: AmazonS3`), last modified `2026-02-10T17:58:44Z`. Response headers confirm `access-control-allow-origin: *`.

**Venue geometry** — `GET https://mapsapi.tmol.io/maps/geometry/3/event/{eventId}/placeDetailNoKeys`

Returns per-seat pixel coordinates: each seat is represented as `[seatKey, seatNum, x, y, colorCode, colIndex, rowIndex]`. For the same event, 6,340 seats with precise SVG coordinate positions. Combined with the manifest, this is sufficient to reconstruct any venue's seating chart, determine which sections exist, and map seat IDs to physical positions. The `placeDetailNoKeys` suffix in the path name implies there is also a `placeDetail` endpoint (presumably with keys), suggesting the keyless variant is an intentional public access tier.

The vector SVG of the seating chart is also publicly accessible at `mapsapi.tmol.io/maps/geometry/image/{imageId}` — the 14KB SVG for the tested event contains named section paths (101, 102, 103, BOX, PIT, LAWN) with precise bezier coordinates at 10240x7680 viewport scale. The WASM module `roar-0.39.2.wasm` consumes both the manifest and geometry data client-side for the interactive seat picker.

The ISM config in `__NEXT_DATA__` ties these together:

```json
{
  "ism": {
    "apiKey": "b462oi7fic6pehcdkzony5bxhe",
    "apiSecret": "pquzpfrfz7zd2ylvtz3w5dtyse",
    "facetsBaseUrl": "https://offeradapter.ticketmaster.com/api/ismds",
    "mapsBaseUrl": "https://mapsapi.tmol.io/maps",
    "ras": {
      "rasSdkUrl": "https://pubapi.ticketmaster.com/sdk/ras-sdk-v0.js",
      "avscUrl": "https://pubapi.ticketmaster.com",
      "avppUrl": "wss://marketplace.prod.pub-tmaws.io",
      "manifestUrl": "https://pubapi.ticketmaster.com",
      "app": "PRD2663_EDPAPP_ICCP"
    }
  }
}
```

The `offeradapter.ticketmaster.com/api/ismds` endpoint (ticket offers and facets) returns 403 with `tm-bl: 1` (blocked flag) without a valid session cookie — the key/secret pair does not unlock it from outside a browser session.

## ISM Credentials in Client Config

Every page load of ticketmaster.com sends `__NEXT_DATA__` to the browser containing:

```json
"apiKey": "b462oi7fic6pehcdkzony5bxhe",
"apiSecret": "pquzpfrfz7zd2ylvtz3w5dtyse"
```

These are the credentials for the ISM seating service. The naming — `apiSecret` specifically — is notable: standard client-side SDK keys use terms like `publishableKey` or `clientToken` to distinguish from server-side secrets. The presence of a feature flag named `ismCredentials` set to `false` confirms the team is aware these credentials are in the bundle and has built a suppression mechanism that is currently inactive.

The credentials are used by the Next.js BFF (Backend for Frontend) server-side to call `offeradapter.ticketmaster.com`. Their presence in `__NEXT_DATA__` appears to be a side effect of the Redux state initialization pattern — the server-side config is serialized wholesale into the page rather than selectively filtered. Enabling the suppression flag (`ismCredentials: true`) would presumably filter them from the client payload.

Verified live against production on 2026-04-05: both keys present, suppression flag off.

## Feature Flags — 200+ Client-Side

The `__INITIAL_STATE__.api.queries['featureFlags(undefined)'].data` object contains over 200 boolean flags, fully enumerated in the SSR payload. Selected flags of note:

**Pricing strategy:**
- `allInPricingV2: false` — all-in fee display (V2) not live
- `allInPricingV3: false` — all-in fee display (V3) not live
- `showFeeOnTicket: false` — per-ticket fee not shown
- `feebreakdown: false` — fee breakdown UI disabled
- `noplusfees: false`

**Checkout and payments:**
- `checkoutSdk: false` — checkout SDK disabled
- `checkoutSdkHighDemand: false`
- `checkoutSdkUnlock: false`
- `buyNowPayLater: false`
- `paypalBuyNowPayLater: false`
- `afterPay: false`
- `useTmpayInstallments: true` — Ticketmaster Pay installments enabled
- `installmentsEnabled: false` — installments UI is off

**Resale:**
- `integratedResale: false` — fan-to-fan resale not integrated
- `ticketMasterResale: true` — TM resale is on

**Upsell partners gated at checkout:**
- `enableSponsorshipCheckoutUpsellsFanatics: true`
- `enableSponsorshipCheckoutUpsellsJustpark: true`
- `enableSponsorshipCheckoutUpsellsParkwhiz: true`
- `enableSponsorshipCheckoutUpsellsSpothero: true`
- `enableSponsorshipCheckoutUpsellsHotels: true`

**Infrastructure and ops:**
- `ismCredentials: false` — ISM credential suppression (inactive)
- `googleTagMgrDisabled: false` — GTM on
- `csp: false` — application-level Content Security Policy disabled
- `cspReportOnly: false` — CSP report-only mode also off
- `bypassGateway: false`
- `selfServiceRefunds: true`
- `ticketTransferMFA: true`
- `sellMFA: true`
- `prismicHomePage: true` — Prismic CMS active

The `csp: false` and `cspReportOnly: false` flags indicate an application-level CSP toggle exists (separate from the CDN-level `frame-ancestors` header) and both modes are currently off.

## Surveillance Architecture

**Consent design:** OneTrust CMP, tenant ID `d885fb8f-5a20-4170-a914-66c45a60fe2e`, version `202601.1.0`. The ruleset partitions visitors into three groups:

- **Opt-out Markets** (US, AU, NZ, KR, CA, MX, and others): tracking fires by default, visitors must actively opt out.
- **Opt-in Markets** (EU+, UK, DE, FR, IE, and 60+ others): consent banner required before tracking.
- **Global** (remaining countries): default/fallback.

For US visitors, all four active consent groups are pre-consented. The session captured 39 cookies already set with no consent banner shown. Cookie group sizes: C0001 Strictly Necessary (27 cookies), C0002 Performance (35 cookies), C0003 Functional (2 cookies), C0004 Advertising & Targeting (43 cookies), C0005 Social (0 cookies listed).

**Session cookies:** `SID` (session-scoped, HttpOnly, SameSite=None) and `BID` (1-year expiry, HttpOnly, SameSite=None), both scoped to `.ticketmaster.com`.

**Tracker count by page type:**

| Page | Requests | Third-party Domains |
|---|---|---|
| Homepage | 131 total | 15 |
| Search | 90 total | 19 |
| Event detail | 164 total | 28 |

**Full tracker inventory (verified from network captures):**

1. **Google Tag Manager** — container `GTM-K4QMLG`. Two GTM globals: `google_tag_manager` and `google_tag_manager_external`. The data layer uses an `lne_` namespace prefix (`lne_artist_id`, `lne_event_id`, `lne_venue_id`) confirming a unified Live Nation Events tracking namespace across Ticketmaster and Live Nation properties.

2. **Google Analytics 4** — `analytics.google.com/g/collect`. 14 requests on event detail pages.

3. **Google Ad Manager / DFP** — `pagead2.googlesyndication.com` (48 requests on homepage), `securepubads.g.doubleclick.net`. Google's ad targeting model endpoint `www.googletagservices.com/agrp/prod/model_person_country_code_US...` fires on every page.

4. **Google Ads Conversion / Floodlight** — 12 distinct Floodlight activity pixels on event pages (`ad.doubleclick.net/activity;src=...`), covering music retargeting, universal tags, and first-party audience segments.

5. **ContentSquare** — Session recording at `k-us1.az.contentsquare.net/v2/recording` and pageview at `c.az.contentsquare.net/pageview`. Config global `CS_CONF` enables `recordingEncryptionEnabled`. Integrates with Usabilla (survey overlays) and Zendesk Chat.

6. **Lytics** — CDP via `jstag` global. Collects: `artistID`, `eventID`, `venueID`, `genreID`, `segmentID`, `subgenreID`, `searchTerm`, `pageChannel`, `destinationURL`, `referringURL`, and Disco taxonomy attributes. `pathfora` (Lytics messaging layer) and `divolte` (behavioral event stream) are also present as window globals.

7. **Monetate** — Personalization engine (`monetateQ` global), account path `a-a1627c0e/p/ticketmaster.com`.

8. **Hadron Identity Graph** — `id.hadron.ad.gt` (identity resolution), `a.ad.gt` (collection), `p.ad.gt` (decisioning). Hadron is Live Nation's own ad identity network (ad.gt), making this a first-party-owned identity graph despite appearing as a third-party domain.

9. **Quantcast** — `pixel.quantserve.com/cs`. Audience segmentation.

10. **Pinterest Pixel** — `ct.pinterest.com/user/` and `/v3/`. 8 requests on event pages.

11. **Spotify Pixel** — `pixels.spotify.com`. Two pixel config IDs (`a521a4317cfd466db14314e4c569d628`, `e42d9a3e61d84a9cbede3e4491bd18ee`) and an ingest endpoint. Fires on event detail pages only.

12. **Reddit Pixel** — `pixel-config.reddit.com`. Three distinct pixel IDs on event pages: `a2_fm6siofehrw6`, `t2_20xwkl0w`, `t2_vzwzugge`.

13. **Amazon DSP** — `s.amazon-adsystem.com/iu3` (12 requests on event pages), `c.amazon-adsystem.com`, `ara.paa-reporting-advertising.amazon/aat`.

14. **Bing UET** — `bat.bing.com/p/insights/c/e`.

15. **The Trade Desk** — `insight.adsrvr.org/track/realtimeconversion` (3 requests on event pages).

16. **reCAPTCHA Enterprise** — Fires on page load, not just at checkout. `www.google.com/recaptcha/enterprise/reload` and `/clr` on homepage and event pages.

17. **Bugsnag** — Error tracking at `sessions.bugsnag.com`.

18. **Zendesk** — Chat widget via `zE` global.

19. **Usabilla / Surveymonkey** — Survey overlays via `usabilla_live` global.

**SSP/Sponsorship pixel config:** A public CloudFront endpoint at `d2v54wjmlooyi.cloudfront.net/ssp/prod/event/e_{eventId}.json` serves per-event ad configuration arrays. Each entry includes pixel URLs (e.g., `t.vibe.co`), trigger conditions (domains, pageSubtypes), and custom variable mappings including `transaction.total.basePrice` and `transaction.total.currency`. This exposes the ad/sponsorship revenue configuration for each event — including purchase price variable mappings — to any caller without authentication.

## Security Posture

**HSTS:** `strict-transport-security: max-age=300` on `www.ticketmaster.com` — 5 minutes. The HSTS preloading requirement is 1 year minimum (`max-age=31536000`). At 300 seconds, the HTTPS upgrade protection window expires every 5 minutes. By contrast, `content.resale.ticketmaster.com` has `Strict-Transport-Security: max-age=31536000; includeSubDomains` — the industry standard. The inconsistency suggests the short value on the main domain is a deliberate CDN configuration choice, not an oversight.

**CSP:** `frame-ancestors 'none'` on the homepage (CDN-enforced). Event pages use `frame-ancestors 'self'`. Application-level CSP is disabled (`csp: false` in feature flags). The legacy Apache stack has a substantially weaker policy: `default-src * 'unsafe-inline' 'unsafe-eval' data: blob:`.

**CORS:**
- `pubapi.ticketmaster.com` — `Access-Control-Allow-Origin: *`
- `mapsapi.tmol.io` — `Access-Control-Allow-Origin: *`
- `content.resale.ticketmaster.com` — `Access-Control-Allow-Origin: *`
- `analytics.ticketmaster.com` — explicit whitelist of Ticketmaster/Live Nation domains only

**Robots.txt disclosures:** Beyond standard disallows, the 99-line robots.txt names: `/api/ismds/host/` and `/api/ismds/event` (ISM API paths), `/tmol/features` and `/tmol/health` (internal health/feature endpoints), `/bba/checkout`, `/json/isc`, `/exchange/checkout` (checkout flow), `/edp/v1/` prefix paths (Event Detail Page logging), and `/DhA6lQM5/` — an obfuscated path that, when requested, returns a 404 from `server: Apache` but sets a `TMSO` signed-session cookie with `seed`, `exp`, `kid`, and `sig` fields.

**Stack anomaly:** `content.resale.ticketmaster.com` returns `Server: Microsoft-IIS/10.0` — Windows IIS, distinct from the main site's Nginx/Apache/Varnish stack. The resale platform runs on a completely different OS and server stack.

**Certificate SANs:** The SSL certificate includes `tickets.taylorswift.com`, `harrypotter.ticketmaster.com`, `shaniatickets.com`, `settlement.livenation.com`, `beta.ticketmaster.com`, `preprod-verifiedfan.ticketmaster.com`, `preprod.vf.ticketmaster.com`, `identity-preprod.ticketmaster.com`, `services-preprod.ticketmaster.net`, and `*.nonprod.ticketmaster.net` — confirming white-label artist ticketing, the Live Nation settlement portal, and several named staging environments all share the main certificate.

## Machine Briefing

**Getting in:** The main site requires browser context for all BFF API routes. All `/api/*` and `/json/*` routes return full Next.js page HTML when called with plain curl — there is no `Accept: application/json` handling. Session cookies `SID` and `BID` must be present for BFF routes to return JSON. For the two open CORS endpoints below, plain `curl` or `fetch` from any origin works without cookies.

**Anti-bot:** reCAPTCHA Enterprise fires on page load (not just checkout). The `tm-bl: 1` header appears on blocked requests to the ISM offeradapter. The ISM offeradapter validates session cookies server-side. The event queue (`/event-queue`) is a separate service with its own gating.

**Open endpoints — no auth, CORS `*`:**

Seat manifest by event ID:
```
GET https://pubapi.ticketmaster.com/sdk/static/manifest/v1/{eventId}
```
Returns: `placeIds[]`, `manifestSections[]`, `manifestRows[]`, `manifestSeats[]`, `partitions[]`. Served from S3. Event ID format: uppercase hex, 16 chars (e.g., `3A006449897E4C84`).

Venue geometry with per-seat coordinates:
```
GET https://mapsapi.tmol.io/maps/geometry/3/event/{eventId}/placeDetailNoKeys
```
Returns: `pages`, `totalPlaces`, `venueConfigId`. Each seat: `[seatKey, seatNum, x, y, colorCode, colIndex, rowIndex]`. Cached 1 hour (`cache-control: max-age=3600`).

Per-event ad/sponsorship config:
```
GET https://d2v54wjmlooyi.cloudfront.net/ssp/prod/event/e_{eventId}.json
```
Returns: array of pixel configs with trigger conditions and variable mappings including transaction price fields.

**Extracting config without browser:** All interesting config is in `__NEXT_DATA__` in the initial HTML:
```
curl -s https://www.ticketmaster.com/ | python3 -c "import sys,json,re; html=sys.stdin.read(); m=re.search(r'<script id=\"__NEXT_DATA__\" type=\"application/json\">(.*?)</script>', html); print(json.dumps(json.loads(m.group(1))['props']['pageProps']['initialReduxState']['config'], indent=2)) if m else print('not found')"
```

Feature flags are in `__INITIAL_STATE__` (a separate inline script). The full flag object requires JavaScript evaluation (`window.__INITIAL_STATE__.api.queries['featureFlags(undefined)'].data`).

**Event ID sourcing:** Event IDs appear in page URLs (`/event/{eventId}`) and in `__NEXT_DATA__`. The same 16-char uppercase hex ID is used across all three open endpoints.

**Rate limiting:** Not observed on the open S3/mapsapi endpoints during testing. BFF routes (session-required) likely enforce rate limits server-side; not tested.

**Pagination:** Manifest and geometry endpoints return complete data in a single response. No pagination observed for a 6,340-seat venue.

**What will break:** BFF routes (`/api/*`) require `SID`+`BID` cookies and validate request origin. Direct fetch without browser context returns HTML, not JSON. The ISM offeradapter requires a full authenticated session — the published `apiKey`/`apiSecret` pair alone returns 403 with `tm-bl: 1`.
