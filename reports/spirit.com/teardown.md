---
# agents: machine-friendly instructions in "## Machine Briefing"
title: Spirit Airlines — Teardown
url: "https://www.spirit.com"
company: Spirit Airlines
industry: Transportation
description: "Ultra-low-cost US airline operating domestic and international routes."
summary: "Spirit Airlines runs an Angular SPA fronted by Akamai CDN and PerimeterX bot protection, with all booking logic proxied through Azure API Management to Navitaire dotRez (confirmed via JWT claims in the session cookie). A custom Sitecore-like CMS at content.spirit.com serves all feature flags, banner campaigns, and site content over an unauthenticated, wildcard-CORS API. Adobe Launch orchestrates 20+ tracking vendors including Adobe Target, which fires A/B test impressions before OneTrust consent loads. Google Tag Manager container GTM-TRK4LPZ (version 891) houses the full tracker map."
date: 2026-04-05
time: "00:27"
contributor: hayabhay
model: sonnet-4.6
effort: high
stack:
  - Angular
  - Navitaire dotRez
  - Azure APIM
  - Akamai
  - Adobe Launch
  - OneTrust
trackers:
  - Google Analytics 4
  - Google Ads
  - Adobe Target
  - Adobe Analytics
  - Dynatrace
  - PerimeterX
  - Akamai Bot Manager
  - Adara
  - Skyscanner SAT Pixel
  - ClickTripz
  - Oracle Infinity
  - Amazon DSP
  - Facebook Pixel
  - Pinterest Ads
  - Bing Ads
  - YieldOptimizer
  - Movable Ink
  - ROKT
  - Uplift
  - Quiq
tags:
  - airline
  - angular
  - navitaire
  - azure-apim
  - adobe-launch
  - feature-flags
  - pre-consent-tracking
  - ssl-enumeration
  - dark-patterns
  - competitive-intelligence
headline: "Spirit's CMS API exposes 184 production feature flags without authentication — including enableFakeBlockedMiddleSeats, a disabled toggle for a fake seat-scarcity UI."
findings:
  - "Unauthenticated CMS API at content.spirit.com serves all 184 production feature flags, banner campaign schedules, and active promo codes over wildcard CORS — queryable from any origin."
  - "SSL certificate enumerates 59+ subdomains including three competitive fare scrapers (Everymundo, InFare, TravelScraper), crew scheduling systems (FLICA, NavBlue PBS), and six staging/QA environments."
  - "Session cookie JWT decodes to Navitaire dotRez reservation internals — agent name, role codes, sequential person IDs, and a systemType identifier that fingerprints the exact platform."
  - "Adobe Target fires two A/B test impressions at dataLayer positions 3 and 9; OneTrust consent framework does not load until position 12, and the user's C0004 (Targeting) consent group is off."
  - "GTM container reveals securitytrfx.com is Everymundo's tracking pixel disguised under a security-sounding domain — the same vendor operating Spirit's competitive fare scraper on the SSL cert."
---

## Architecture

Spirit's web presence is a single Angular SPA — confirmed via `getAllAngularRootElements` in the global scope. There is no React, no Next.js, no server-side rendering. The app is static Angular served through Akamai, with all dynamic data coming from a family of internal APIs.

The edge stack is layered: Akamai GHost handles CDN and bot management (`_abck`, `bm_sz`, `bm_sv`, `bm_so`, `bm_lso` cookies), and PerimeterX provides a secondary bot protection layer (App ID: `PXkp4CLSb5`, cookies `_pxhd`, `_pxvid`, `pxcts`, `_px2`, `_pxde`, collector at `collector-pxkp4clsb5.px-cloud.net`). Headed browsers bypass both. Akamai's load balancer pool is visible in cookie values: `akaalb_api_spiritcom:origin_api_east_spirit_com`, confirming east coast origin servers.

All internal APIs follow the pattern `/api/prod-{service}/api/{path}`, proxied through Akamai to Azure API Management at `nkapim.spirit.com` (Spirit's IATA code is NK). The APIM error message is explicit: `"Access denied due to missing subscription key. Make sure to include subscription key when making requests to an API."` Identified microservices behind APIM: `prod-station`, `prod-token`, `prod-promotion`, `prod-availability`, `prod-apo` (ancillary pricing).

CMS content lives at `content.spirit.com` — a custom Sitecore-like headless CMS serving JSON via `GET /api/content/en-US?path={path}`. CORS is `access-control-allow-origin: *`. The Angular app hits this endpoint up to 15 times per page load. The raw XML root at `https://content.spirit.com/` returns CMS internals including item IDs going back to 2019.

Security headers: `X-Frame-Options: DENY`, `HSTS max-age=86400` (1 day — industry recommendation is 2 years), `Content-Security-Policy-Report-Only` (policy exists but is not enforced), `X-Content-Type-Options: nosniff`.

Tag orchestration runs through Adobe Experience Platform (Adobe Launch). Window globals confirm the full Adobe stack: `_satellite`, `__satelliteLoaded`, `adobe`, `__target_telemetry`, `___target_traces`. The Adobe Launch property ID is `PR81e2d229154744588c78cfbd012aa639`, org ID `449B1E3D6613DC4C0A495CB7@AdobeOrg`, built `2026-04-01T15:30:47Z` in production environment on Turbine version 29.0.0.

Consent management is OneTrust (GUID: `0390835f-17d4-4720-a875-08b2c2eeac36`). Active consent groups observed: `C0001` (Strictly Necessary) and `C0003` (Functional) only. `C0002` (Performance/Analytics) and `C0004` (Targeting/Advertising) were both off.

---

## The Reservation System: Navitaire dotRez

Every page load on the book flow POSTs to `/api/prod-token/api/v1/token`, which issues or refreshes a JWT stored in the `tokenData` cookie. Decoding that JWT reveals Spirit's entire back-office stack in plaintext:

```json
{
  "agentName": "webanonymous2",
  "organizationCode": "NK",
  "roleCode": "WWWA",
  "channelType": "DigitalAPI",
  "clientName": "dotRezWeb",
  "cultureCode": "en-US",
  "currencyCode": "USD",
  "locationCode": "SYS",
  "personID": "43694354",
  "personType": "2",
  "systemType": "119",
  "domainCode": "WW2"
}
```

`clientName: "dotRezWeb"` is the Navitaire dotRez web client. Navitaire is the reservation platform used by ultra-low-cost carriers globally (Spirit, Southwest, Wizz Air, IndiGo, and others). `NK` is Spirit's IATA code. `WWWA` is the dotRez anonymous web role code. `WW2` is the domain code — the `2` suffix suggests Spirit may run multiple environments or brands on the same dotRez instance. `systemType: 119` is a Navitaire internal system type identifier.

The token endpoint also returns session state:

```json
{
  "defaultCultureCode": "en-US",
  "defaultCurrencyCode": "USD",
  "hasBookingInState": false,
  "type": 2,
  "idleTimeoutInMinutes": 13
}
```

`type: 2` is the anonymous session type. `hasBookingInState: true` when the dotRez cart holds an in-progress booking. Idle timeout is 13-15 minutes.

The `personID` field (`43694354`) is assigned incrementally per session. Spirit's `PIM-SESSION-ID` cookie (e.g., `LKbqLv2OD4YxLaWQ`) tracks the Navitaire session separately from the JWT and persists in both cookie and sessionStorage.

---

## The Public CMS API

`content.spirit.com` is the site's headless CMS, and it is entirely open. No authentication, wildcard CORS. The query pattern is:

```
GET https://content.spirit.com/api/content/en-US?path={path}
```

Key paths and what they return:

**`?path=feature-flags/prod`** — 184 production feature flags, timestamped `2026-04-01T07:54:25`. Every flag is a named boolean or string with its current value.

**`?path=home-banners`** — all homepage carousel banners with headline text, promo codes, pricing tiers (Savers Club vs. non-member), start and end dates, image asset IDs, and UTM attribution for each campaign. Banner `startDate` and `endDate` are ISO 8601 timestamps — a live view of what campaigns are scheduled and when they expire.

**`?path=settings/auto-apply-discount-fares`** — returns the currently configured auto-apply promo code. At time of investigation: `NKPROMO`, validity window `2026-03-10T17:00` to `2026-03-11T04:00` (expired). The endpoint itself is permanent; whatever the active code is at query time is what gets returned.

**`?path=settings/stations-seasonal-service`** — seasonal route configuration.

**`?path=settings/floating-chatbot-pages`** — per-page chatbot visibility configuration.

The root `https://content.spirit.com/` returns raw XML exposing the CMS internal structure: item IDs (`ID="x401"`), XPower content paths (`XPowerPath="/Global Components/home-banners/en-us/20190115_EN"`), field UIDs, and creation timestamps going back to January 2019.

---

## Infrastructure Map from SSL Certificate

Spirit's TLS certificate (GeoTrust, issued by DigiCert) covers 59+ subdomains. The Subject Alternative Names are a near-complete inventory of Spirit's third-party tooling and internal environments:

**Competitor intelligence systems:**
- `everymundoscraperv2.spirit.com` — Everymundo flight price scraper
- `infarescraperv2.spirit.com` — InFare competitor fare monitoring
- `travelscraperv2.spirit.com` — generic travel price scraper

**Crew and operations:**
- `flica.spirit.com` — FLICA crew scheduling (industry-standard airline crew management)
- `navblue-pbs.spirit.com` — NavBlue Pilot Bidding System
- `crewcentral.spirit.com` / `crewcentralstage.spirit.com` — crew scheduling portal

**Staging and QA environments:**
- `flystaging.spirit.com` — main app staging (returns 403)
- `preprod.cars.spirit.com`, `preprod.hotels.spirit.com`, `preprod.vacations.spirit.com`
- `qaa.cars.spirit.com`, `qaa.hotels.spirit.com`, `qaa.vacations.spirit.com`

**Internal tooling:**
- `nkapim.spirit.com` — Azure APIM gateway
- `calabrio.spirit.com` — Calabrio workforce management
- `centralcontent.spirit.com` — additional content management
- `customersupport.spirit.com` — Zendesk customer support
- `myidtravel.spirit.com` — ID90 industry travel benefits
- `azureworkspace.spirit.com` — Azure workspace

**HR and vendor portals:** `aetna.spirit.com`, `uhc.spirit.com`, `vsp.spirit.com`, `schwab.spirit.com`, `schwab401k.spirit.com`, `sedgwick.spirit.com`, `lifeworks.spirit.com`, `concur.spirit.com`, `coupa.spirit.com`, `coupauat.spirit.com`, `docusign.spirit.com`, `workiva.spirit.com`

**Ancillary products:**
- `parking.spirit.com`, `vacations.spirit.com`, `hotels.spirit.com`, `cars.spirit.com`, `travelmore.spirit.com`, `travelagent.spirit.com`

**Load testing:**
- `loadtesting.spirit.com`, `performancetesting.spirit.com`

The Akamai load balancer cookie confirms east coast origin: `akaalb_api_spiritcom:origin_api_east_spirit_com`.

---

## Surveillance and Tracking

### The Tracker Stack

Spirit operates one of the denser tracking stacks observed on a commercial airline site. The GTM container (`GTM-TRK4LPZ`, version 891) is the delivery vehicle for most of it.

**Analytics and APM:** Google Analytics 4 (IDs: `G-P32J4HY6S0`, `G-VKEG2ZBNZ5`), legacy Universal Analytics (`UA-117089654-50`), Adobe Analytics (report suite: `spiritairlines`), Dynatrace RUM/APM (`bf04820crc.bf.dynatrace.com`, cookies: `rxVisitor`, `rxvt`, `dtSa`, `dtCookie`, `dtPC`), Oracle Infinity (`d.oracleinfinity.io`)

**Advertising:** Google Ads (7 conversion IDs: `961659573`, `792368536`, `327503185`, `10775522020`, `10955792042`, `11308359223`, `11308382757`), Google Display (`DC-00000000`), Bing/Microsoft UET (Tag ID: `2612956645567`, `bat.bing.com`), Amazon DSP (`c.amazon-adsystem.com/aat/amzn.js`), Facebook/Meta Pixel (pixel IDs resolved at runtime from GTM macros), Pinterest (`s.pinimg.com/ct/core.js`), YieldOptimizer (`tag.yieldoptimizer.com/ps/ps?t=s`)

**Identity and audience:** Adara (`js.adara.com/index.js`, ID: `a5e18e5f-8d0e-4de1-bbf6-785864cb1733`) — receives user email hash and page type for logged-in users; ClickTripz (publisher ID: `2486`, reads `dataLayer`, sets `_ctpuid` cookie with 90-day expiry, sends flight search data to `api.clicktripz.com`); Skyscanner SAT Pixel (ID: `SAT-374319-1`)

**Post-booking commerce:** ROKT (active, with CoverGenius insurance integration in production mode), Bell Media sub-container (`GTM-NGGQ34S`) firing only on `/book/confirmation` — Canadian broadcast/digital retargeting on booking completions

**Personalized email:** Movable Ink (`dnlq9p2b.micpn.com`) — tracks conversions back to email campaigns via `sessionStorage` item `movable-ink-querystring`

**Consent and bot protection:** OneTrust (`cdn.cookielaw.org`), PerimeterX (`collector-pxkp4clsb5.px-cloud.net`, `tzm.px-cloud.net`), Akamai Bot Manager

**Other:** Uplift BNPL (`cdn.uplift-platform.com/a/up.js?id=UP-63569511-5`, sets `_up` cookie), Quiq chat (`spiritairlines.quiq-api.com`), TechLab (`p11.techlab-cdn.com/e/65319_*` — 5 audience data scripts)

### Pre-Consent Adobe Target

The dataLayer sequence on homepage load, confirmed from `datalayer.json`:

```
Event ID 3:  AdobeTargetActivity — experience_impression: "AdobeTarget-131330-1"
Event ID 9:  AdobeTargetActivity — experience_impression: "AdobeTarget-131015-0"
Event ID 12: OneTrustLoaded — OnetrustActiveGroups: ",C0001,C0003,"
Event ID 14: OptanonLoaded — OptanonActiveGroups: ",C0001,C0003,"
```

Adobe Target fires two A/B test impressions before OneTrust even loads. The `mbox` cookie is set at this point. `C0004` (Targeting/Advertising) is not in the active consent groups — yet Adobe Target, which falls under C0004, has already fired and set cookies. The feature flag `delayGtmLoad: true` is active in production, which delays GTM but has no effect on Adobe Target since Target is loaded directly via Adobe Launch outside of GTM.

Experiment `AdobeTarget-131015-0` is inferred to be the 2025 homepage redesign experiment: the session's `redesign2025Pages = false` in sessionStorage (control group) correlates with the "0" experience ID, and the CMS feature flag confirms `redesign2025Pages: false` in production.

### Google Consent Mode

The GTM container's consent configuration defaults `ad_storage`, `ad_user_data`, `ad_personalization`, and `analytics_storage` to on for all regions except a specific list. US-CA (California) and 11 other states receive `ad_storage: Off by default`, `ad_user_data: Off by default`, `ad_personalization: Off by default`. Standard Google Consent Mode v2 with state-level opt-out.

### Geolocation on Redirect

The first HTTP response Spirit's servers emit — a 301 redirect from `spirit.com` to `www.spirit.com` — includes three geolocation cookies, confirmed in `headers-www.txt`:

```
set-cookie: userGeolocation=-122.0799, 37.6687; path=/; secure
set-cookie: userCountryLocation=US; path=/; secure
set-cookie: userProvinceLocation=CA; path=/; secure
```

These are set before any page renders and before any JavaScript executes. IP-geolocation derived (server-side lookup, not GPS), precision roughly 400m, delivered as a plain-text cookie accessible to any JavaScript running on `spirit.com`.

### The Everymundo Disguise

The GTM container (tag IDs 76 and 77) loads two scripts from `securitytrfx.com`:

- tag 76: `<script id="everymundo-tracking" src="https://www.securitytrfx.com/js/nk.js">`
- tag 77: `<script id="everymundo-conversion" src="https://www.securitytrfx.com/js/nk_cf.js">`

The script tag IDs are explicitly named `everymundo-tracking` and `everymundo-conversion`. The filenames use Spirit's IATA code (`nk_`) as a prefix. `securitytrfx.com` is Everymundo's tracking and conversion pixel, served under a domain chosen to look like a security vendor. This is the same company that operates `everymundoscraperv2.spirit.com` on the SSL certificate — Spirit's competitive fare monitoring system.

---

## Feature Flag Archaeology

The `content.spirit.com/api/content/en-US?path=feature-flags/prod` endpoint returns all 184 production flags as of `2026-04-01T07:54:25`.

### Products Not Yet Deployed

| Flag | Value | Notes |
|------|-------|-------|
| `enableApplePay` | `false` | Not deployed |
| `enableGooglePay` | `false` | Not deployed |
| `enablePazeCheckout` | _(empty)_ | Paze is Early Warning's bank consortium checkout (Zelle parent) |
| `paypal` | `false` | Disabled |
| `petInCabin` | `false` | Policy not active |
| `enableGroupTravelBooking` | `false` | Coming |
| `enableStudentBeans` | `false` | StudentBeans student discount verification platform |
| `homeRedesignRayEdition` | `false` | Internal codename for homepage redesign |
| `enablePaxHubRedesign2026` | _(empty)_ | Passenger hub redesign in 2026 pipeline |
| `saversClubFareCard` | `false` | New fare card product for Savers Club |
| `seatUpgradePopoverBookingFlow` | `false` | Seat upgrade popover in booking flow |
| `seatUpgradePopoverPostBookingFlow` | `false` | Post-booking seat upgrade popover |

### Currently Active

| Flag | Value | Notes |
|------|-------|-------|
| `enableMultiFactorAuthentication` | `true` | MFA deployed |
| `enableMultiCityBooking` | `true` | Multi-city booking live |
| `rokt` | `true` | ROKT post-booking commerce |
| `roktCoverGenius` | `true` | CoverGenius insurance via ROKT |
| `roktCoverGeniusProdMode` | `true` | Production mode confirmed |
| `enableAccertify` | `true` | Accertify (AmEx) fraud detection |
| `uplift` | `true` | Buy now, pay later |
| `upliftUpCode` | `"UP-63569511-5"` | Uplift merchant code |
| `travelGuard` | `true` | Travel Guard v2 insurance |
| `firstResponder` | `true` | First responder discounts |
| `wifiIncludedForGold` | `true` | WiFi for Gold status members |
| `pointsAndCash` | `true` | Mixed points + cash payment |
| `enableSaversClubRedesign2026` | `true` | Savers Club 2026 redesign live |
| `seatsBeforeBagsPage` | `true` | Seat selection precedes baggage |
| `enableBoaCreditCardModal` | `true` | Bank of America upsell modal |
| `contactTracing` | `true` | Contact tracing data collection still flagged active |

### Notable Entries

`enableFakeBlockedMiddleSeats` exists in the system with an empty value — never deployed, never removed. The name describes a UI pattern where middle seats appear blocked to create urgency or steer passenger seat selection. The flag's presence with an empty value indicates it was built into the code path and discarded.

`lastChanceSeats`, `lastChanceFlightFlex`, `lastChanceShortcutBoarding` are all set to `"0"` — the scarcity upsell mechanic is implemented and currently throttled to zero across all three product categories.

`showCfar: "option"` — Cancel for Any Reason is shown as an optional add-on.

Business policy is embedded directly: `unaccompaniedMinorMinAge: "10"`, `unaccompaniedMinorMaxAge: "15"` (the age window for unaccompanied minor service), `defaultTimeUntilNextReset: "15"` (session expiry in minutes).

---

## Quiq Chat Configuration

The Quiq chat platform (`spiritairlines.quiq-api.com`) exposes its full configuration without authentication:

- Tenant: `spiritairlines`
- SMS number: `48763`
- Auto-start: enabled, greeting message "Welcome to the Spirit Chat Service!"
- File attachments: PDF, images, video/mp4, audio
- Cobrowse: CobrowseIO integration present (`cobrowseio.goquiq.com`) but `enabled: false`
- Two active chat tenants: `contact-us-page` (general) and `gr-chat` (loyalty/club)
- Email transcript domain: `spiritairlines`

Live agent availability and load balancing endpoints are also public: `GET /api/v1/messaging/agents-available-cross-platform` and `GET /api/v1/messaging/least-loaded-handle`.

---

## Machine Briefing

**Access and auth:** Most read endpoints work without authentication. PerimeterX and Akamai Bot Manager are active — use a standard browser user-agent. Headed Playwright bypasses both. Booking APIs require an Azure APIM subscription key that is not embedded in the client-side app; those endpoints return 401/400 without it.

### Open Endpoints

```bash
# Airport station data — 78 airports, IATA codes, markets, coordinates, currency
GET https://www.spirit.com/api/prod-station/api/resources/v2/stations

# All 184 production feature flags (live, no auth)
GET https://content.spirit.com/api/content/en-US?path=feature-flags/prod

# Homepage banners — pricing, dates, promo codes, image asset IDs
GET https://content.spirit.com/api/content/en-US?path=home-banners

# Current auto-apply discount code
GET https://content.spirit.com/api/content/en-US?path=settings/auto-apply-discount-fares

# Any CMS content path (enumerate from Angular bundle string constants)
GET https://content.spirit.com/api/content/en-US?path={path}

# CMS root — raw XML dump with item IDs and content paths back to 2019
GET https://content.spirit.com/

# Quiq chat configuration
GET https://spiritairlines.quiq-api.com/api/v1/messaging/chat/contact-us-page/configuration
GET https://spiritairlines.quiq-api.com/api/v1/messaging/chat/gr-chat/configuration
GET https://spiritairlines.quiq-api.com/api/v1/messaging/agents-available-cross-platform
GET https://spiritairlines.quiq-api.com/api/v1/messaging/least-loaded-handle
```

### Session-Gated Endpoints

```bash
# Token — establish anonymous session, returns JWT in tokenData cookie
# Call this first; the JWT reveals dotRez internals (see report)
POST https://www.spirit.com/api/prod-token/api/v1/token
# Response: { defaultCultureCode, defaultCurrencyCode, hasBookingInState, type, idleTimeoutInMinutes }

# Flight availability (requires session + Azure APIM subscription key)
POST https://www.spirit.com/api/prod-availability/api/availability/v3/search

# Low fare calendar
POST https://www.spirit.com/api/prod-availability/api/availability/v2/lowfare

# Ancillary pricing
POST https://www.spirit.com/api/prod-apo/api/apo

# Promotion validation
POST https://www.spirit.com/api/prod-promotion/api/promotions/validateDetailed
```

### Gotchas

- `content.spirit.com` is `access-control-allow-origin: *` — works from any origin including browser `fetch()`
- Stations endpoint returns all 78 airports in one response, no pagination
- Token endpoint is `POST` and returns 201 even without a request body — session is established from cookies
- Azure APIM subscription key errors return the literal string: `"Access denied due to missing subscription key. Make sure to include subscription key when making requests to an API."` These endpoints are correctly gated and not accessible without an embedded key from an active client session
- PerimeterX telemetry routes rotate (e.g., `/mx0FzRoIrFBeQ/JTJzqHTm3JC/PTg/...`) — not stable
- Session idle timeout is 13-15 minutes — call the token endpoint to refresh
- `content.spirit.com/` root returns XML without a `path` parameter — useful for enumerating item IDs and CMS structure
- `delayGtmLoad: true` is a production feature flag that delays GTM initialization, but Adobe Target loads via Adobe Launch ahead of GTM and is unaffected
