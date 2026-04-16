---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "Frontier Airlines — Teardown"
url: "https://flyfrontier.com"
company: "Frontier Airlines"
industry: Transportation
description: "Ultra-low-cost US domestic airline."
summary: "Frontier runs an ASP.NET/Umbraco CMS behind layered CDN (Varnish/Fastly in front, Azure Front Door behind), with a separate booking engine at booking.flyfrontier.com protected by PerimeterX. A white-label flight deals subdomain (flights.flyfrontier.com) runs on a separate Next.js/Cloudflare Pages stack powered by AirTRFX. The main site layers four analytics stacks, two consent management platforms in parallel migration, and Google Tag Manager as a tracking multiplier."
date: 2026-04-16
time: "02:52"
contributor: hayabhay
model: "sonnet-4.6"
effort: high
stack: [Umbraco, ASP.NET, Azure Front Door, Varnish, Next.js, Cloudflare Pages, React, Vue]
trackers: [Google Analytics, Google Ads, DoubleClick, Pinterest Pixel, Facebook Pixel, Reddit Pixel, TikTok Pixel, FullStory, Oracle Infinity, Commission Junction, WebTrends, Mapp Intelligence, PerimeterX]
tags: [airline, travel, consent-migration, session-recording, fingerprinting, analytics-debt, graphql, dual-cmp, white-label]
headline: "Frontier's white-label flight deals subdomain embeds a live JWT in every page's HTML and backs it with a GraphQL API that accepts unauthenticated queries from any origin."
findings:
  - "The AirTRFX-powered flights.flyfrontier.com embeds a fresh 48-hour JWT in every server-rendered page; the backing GraphQL API at vg-api.airtrfx.com accepts unauthenticated queries from any origin and returns all UI copy, tenant config, and label data for Frontier's deals platform."
  - "Two consent management platforms (Clarip and Ketch) run simultaneously on the same pages — a CMP migration in progress where the Clarip DSR iframe in the production privacy portal is hardcoded with brand=dev2.clarip.com, a staging environment reference that was never updated."
  - "PerimeterX stores a 4KB+ device fingerprint in localStorage on every page visit — capturing WebGL renderer, GPU string, canvas hashes, font lists, and 35 WebGL extensions — with 6 collector calls before the page finishes loading."
  - "Four analytics stacks run concurrently (GA UA + GA4, Oracle Infinity, WebTrends, Mapp Intelligence), each with its own persistent cookies and localStorage entries, alongside Noibu JS error monitoring, New Relic Browser, and Qubit A/B testing."
  - "Pinterest, DoubleClick, FullStory session recording, and 9 other trackers fire on first page load with no consent interaction — the consent banner only appears for California and Virginia visitors, and GTM fires tracking independently of the Clarip script blocker."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

Frontier Airlines operates flyfrontier.com as an ultra-low-cost carrier with roughly 130 destinations across the US, Mexico, and the Caribbean. The site handles marketing, content, and account management at www.flyfrontier.com, while flight booking is handled by a separate engine at booking.flyfrontier.com. A third property, flights.flyfrontier.com, is a white-labeled flight deals platform powered by a third-party vendor. Fifty requests fire on a cold homepage load — 42 of them to 18 third-party domains — before any user interaction.

## Architecture

The main site runs on Umbraco CMS (ASP.NET MVC/Razor), evident from HTML comments (`<!--Anti forgery: Base.cshtml-->`) and publicly accessible CMS API endpoints under `/umbraco/api/`. The frontend is a mixed-generation stack: jQuery and moment.js (legacy), Modernizr, a Vue.js app for the header/nav component, and React Router with Webpack for the booking search widget. The `window.webpackChunkPGEligibilityWidget` global suggests the booking eligibility widget ships as a separate Webpack chunk.

CDN setup is layered: Varnish (Fastly) sits in front, as indicated by the `via: 1.1 varnish` and `x-served-by: cache-pao-kpao1770062-PAO` response headers. Behind that, Azure Front Door handles routing — the CDN base URL is `flyfrontier-com-frontdoor-en-chh3dufqdpdff8h9.a02.azurefd.net`, and `arr-disable-session-affinity: true` in response headers confirms Azure's Application Request Routing. Cache TTL on the homepage is `max-age=3` — a 3-second window, prioritizing freshness over edge performance while relying on the layered CDN to absorb load.

The booking engine at booking.flyfrontier.com is a separate .NET application with its own Varnish layer, its own PerimeterX deployment, and no session continuity with the main site. Globals on the main site reference it directly: `window.ibeHost = "https://booking.flyfrontier.com"`, with market and schedule URLs pointing to its `/Resource/GetMarkets` and `/Flight/RetrieveSchedule` endpoints.

Other subdomains: `vacations.flyfrontier.com` (403), `api.flyfrontier.com` (returns 406 — a live API gateway with strict content negotiation but no publicly accessible endpoint), and `flights.flyfrontier.com` (a separate Next.js app on Cloudflare Pages, covered below).

## Umbraco CMS APIs

Several Umbraco content endpoints are fully public and require no authentication:

- `GET /umbraco/api/externalcontent/menuv2` — returns the full navigation JSON including all section names, page URLs, and credit card promotional content with Barclays referral links embedded inline. Each link object carries `caption`, `link`, `newWindow`, `external`, `isInternal`, and `title`.
- `GET /umbraco/api/externalcontent/headerV2` — returns an HTML fragment including a Vue.js `<app>` component with props for member state, IBE host, and corp host hardcoded in the markup.
- `GET /umbraco/api/externalcontent/footer` — HTML footer fragment, public.

The authenticated-looking F9 endpoints (`/F9Loyalty/DiscountDenDetails`, `/F9Loyalty/BarclaysFrontierMilesSignupLink`, `/F9/showCancellationSlider`, `/F9Sessionless/Member`, `/F9Sessionless/Resources`) all return 403 to unauthenticated requests. Despite "Sessionless" in some names, they require a valid session or PerimeterX-approved browser.

## Consent Architecture

Frontier's consent setup involves two platforms running simultaneously — a migration in progress with visible seams.

**Clarip** is the primary CMP for www.flyfrontier.com. The Clarip client name is `"frontier"`, the cookie manager identifier is `"fc014cd00ce2338ab3a5"`, and the DSR client identifier is `"78d7a8618c6025d33fd5"`. On first page load, Clarip sets a `CLARIP_IDENTIFIER` cookie containing a persistent visitor `guid`, `gpc: false`, `dnssSubmitted: false`, `loggedInUser: false`, and the current page URL — all before any consent interaction.

**Ketch** is loaded simultaneously. On the main site, `window.ketch` is initialized as a command queue (`window.semaphore.push(arguments)`), with the org ID `frontierairlines`. The Ketch boot script loads from `global.ketchcdn.com/web/v2/config/frontierairlines/{property}/boot.js`. Both CMPs coexist on the same pages during what appears to be an active migration from Clarip to Ketch.

**/darksite** is the dedicated privacy management portal — Frontier's "Do Not Sell or Share My Personal Information" page. Despite a `Disallow: /darksite$` rule in robots.txt, the page returns 200 and is fully accessible. Both Clarip and Ketch load here simultaneously. Ketch is configured to show only the rights tab (`showPreferencesTab: false, showConsentsTab: false, showRightsTab: true`) and redirects the user to the privacy policy on close.

The Clarip DSR iframe in the darksite HTML tells the story of how the page was built:

```
src="https://cdn.clarip.com/frontier/donotsell/78d7a8618c6025d33fd5-dsr-controller.html?...
  &brand=dev2.clarip.com
  &pageUrl=https://dev2.clarip.com/clients/frontier/dnss.html"
```

The actual iframe source is `cdn.clarip.com` (production), but the `brand` and `pageUrl` parameters still point at `dev2.clarip.com` — a Clarip staging environment. The page was configured against a staging account and the parameters were never updated for production. It's a vestigial reference rather than active dev routing, but it means the production CCPA portal carries staging environment fingerprints.

**The critical constraint on consent visibility** is explicit in the darksite JavaScript:

```javascript
var regionCode = localStorage.getItem("regionCode");
var countryCode = localStorage.getItem("countryCode");
var canViewCookie = ((regionCode == "CA" || regionCode == "VA") && countryCode == "US")
  ? "inline" : "none";
document.getElementById("consent-management-tool").style.display = canViewCookie;
```

The consent management interface is hidden from everyone except California and Virginia residents. This is legally sufficient under CCPA and VCDPA, but it means that for all other US visitors — and all international visitors — the consent infrastructure runs silently in the background with no user-facing controls. Clarip's geolocation API (`frontier.clarip.com/clarip/api/geolocation/current`) handles the state detection, returning full IP-to-location data (city, zip, region code) with no authentication required.

## Pre-Consent Tracking

The network log from first page load — before any consent interaction — shows 42 third-party requests to 18 domains:

| Tracker | Network calls | Cookie |
|---------|--------------|--------|
| Google Analytics (GA4) | `analytics.google.com/g/collect` (4 calls) | `_ga`, `_gid` |
| Google Analytics (UA, legacy) | `www.google-analytics.com/j/collect` | — |
| Google Ads conversion | `www.googleadservices.com/pagead/conversion/1065346207/` | `_gcl_au` |
| Google Remarketing | `ad.doubleclick.net/activity;src=8303106;type=rmkt;cat=fro_r0` (2 calls) | — |
| Google ccm/collect | `www.google.com/ccm/collect` (6 calls) | — |
| Pinterest | `ct.pinterest.com/user/`, `ct.pinterest.com/v3/` (4 calls) | `_pin_unauth` |
| FullStory | `edge.fullstory.com`, `rs.fullstory.com/rec/page` | — |
| Oracle Infinity | `dc.oracleinfinity.io/v4/account/t3ctwioupl/client/id` | `ORA_FPC` |
| Commission Junction | `www.mczbf.com/760155155930/pageInfo` | `cjConsent`, `cjUser` |
| Reddit | `pixel-config.reddit.com/pixels/a2_dwwt4fntqvs8/config` | `_rdt_uuid` |
| PerimeterX | `collector-pxvb73hteg.px-cloud.net/api/v2/collector` (6 calls) | `_pxvid`, `pxcts`, `_px2` |

Pinterest and DoubleClick are both present in the page's `CLARIP_BLACKLIST` — a list of domains that the `yett` script blocker is configured to intercept pre-consent. Both fire anyway. The likely mechanism: Google Tag Manager fires its own tag container independently of script-level interception, and tracking calls routed through GTM are not blocked by blockers that operate on `<script src>` tags. Facebook's `_fbp` cookie is set through the same GTM pathway — no direct `facebook.com` network call appears in the log, consistent with GTM firing the pixel as a tag.

In localStorage: `_pin_unauth_ls` stores Pinterest's unauth user identifier with a 1-year expiry. `ORA_COOK_STORE` persists both Oracle Infinity's `ORA_FPC` and WebTrends' `WTPERSIST` with multi-year expiry. TikTok (`window.TiktokAnalyticsObject`) and Reddit (`window.rdt`) pixel objects are initialized in globals but don't fire direct network calls on page load — likely event-triggered via GTM in the booking funnel.

## PerimeterX Fingerprinting

PerimeterX app ID `PXVb73hTEg` runs on every page of the main site. It makes 6 calls to `collector-pxvb73hteg.px-cloud.net/api/v2/collector` on homepage load alone and stores its fingerprint in localStorage under `PXVb73hTEg_px_fp`.

The fingerprint blob is base64-encoded JSON with obfuscated keys. Decoded, it captures:

- WebGL vendor and renderer (including GPU model — SwiftShader identifies headless Chrome)
- 35 WebGL extensions and a 38-element capability array (max texture sizes, depth precision)
- Canvas fingerprint hashes (multiple distinct values)
- GLSL version string
- PerimeterX-injected window properties (`_pwClock`)

Additional localStorage entries from the same deployment: `PXVb73hTEg_px-ff` (feature flags with TTL), `PXVb73hTEg_px_hvd` (visit digest hash). Cookies: `_pxvid` (persistent visitor ID), `pxcts` (session), `_px2` (challenge token).

The booking engine at booking.flyfrontier.com runs the same PerimeterX deployment. Headless browsers receive a captcha challenge page instead of API data — the `GetMarkets` endpoint returns the PX block page HTML, not flight markets.

## Analytics Debt

Frontier runs four distinct analytics stacks, accumulated across vendor relationships without consolidation:

1. **Google Analytics**: Both Universal Analytics (legacy `www.google-analytics.com/j/collect`) and GA4 (`analytics.google.com/g/collect`) are active simultaneously. Two GA4 property calls fire on homepage load.

2. **Oracle Infinity** (formerly Oracle Maxymiser): Account ID `t3ctwioupl`, with `ORA_FPC` cookie persisted in `ORA_COOK_STORE` in localStorage at 2-year expiry.

3. **WebTrends**: `WTPERSIST` cookie, also persisted through `ORA_COOK_STORE`. WebTrends has largely been superseded in the industry — its presence alongside Oracle Infinity and GA4 suggests a contract that predates current infrastructure.

4. **Mapp Intelligence** (formerly Webtrekk): Active via `frontierairlinesflyfrontiercom.mpeasylink.com/mpel/mpel.js`. The Frontier-branded subdomain on Mapp's link tracking infrastructure and HTML comment markers (`mp_linkcode`, `mp_snippet`, `mp_easylink`) indicate a standing enterprise contract.

On top of these: Google Tag Manager acts as the container loading most tracking tags. **Noibu JS** (`NOIBUJS_CONFIG: {scriptID: "1.155.0"}`) handles JavaScript error monitoring. **New Relic Browser** (`bam.nr-data.net`) handles performance monitoring. A/B testing runs via **Qubit** (`window.F9Qubit`, now part of Coveo). The **Uplift** BNPL integration (`window.__UP_FROM_PRICING_ORCHESTRATOR__`) is initialized but inactive without a booking context. **WisePops** handles popup engagement with three persistent cookies.

## flights.flyfrontier.com — AirTRFX White-Label

`flights.flyfrontier.com` is a separate technical property entirely — a white-labeled flight deals platform powered by AirTRFX, running on Next.js deployed to Cloudflare Pages with no architectural overlap with the main Umbraco/ASP.NET site.

The `__NEXT_DATA__` server-rendered JSON block on every page load contains the tenant identifier (`"f9"`, Frontier's IATA designator), the Next.js build ID, and a live JWT token embedded inline.

The JWT (`alg: HS256, typ: JWS`) is a short-lived API session token:
- `iat: 2026-04-16T02:51:50Z`, `exp: 2026-04-18T02:51:50Z` (48-hour window)
- `jti`: a 64-hex-character unique identifier
- `om_scope`: an opaque credential string

Each page load generates a fresh token. This is server-rendered credential provisioning — the token is scoped for the AirTRFX API session and expires in 48 hours, so it's not a static credential. But it is an API token visible in unauthenticated page HTML.

The backing GraphQL API at `vg-api.airtrfx.com/graphql` has `Access-Control-Allow-Origin: *` and introspection disabled, but several queries work without authentication:

- `labels(page: {tenant: "f9", siteEdition: "en"})` — returns every user-visible string in the deals interface: booking widget labels, disclaimer text, call-to-action copy, countdown timer labels, passenger options.
- `tenant(page: {tenant: "f9", siteEdition: "en"}) { name }` — returns `{"name":""}` (empty in current config).

The HSTS header on flights.flyfrontier.com is `max-age=31536000; includeSubDomains; preload` — a full year, with preload eligibility. The main www.flyfrontier.com domain uses `max-age=300` (5 minutes), meaning browsers forget the HTTPS requirement within 5 minutes of any visit. Same company, opposite security postures on adjacent properties.

## Security Posture

**CSP**: `default-src * self blob: data: gap:` with explicit `'unsafe-eval'` and `'unsafe-inline'` in `script-src` — the wildcard renders this policy non-functional as a security control.

**HSTS**: `strict-transport-security: max-age=300` on the main domain. Five minutes. Standard practice is 31536000 (1 year).

**CORS**: `access-control-allow-headers: *` on main site responses. Not a significant exposure on its own, but combined with the useless CSP, there's no defense-in-depth.

**X-Frame-Options**: `SAMEORIGIN` (present and correct). **X-Content-Type-Options**: `nosniff` (present). **X-XSS-Protection**: `1; mode=block` (present but deprecated).

**Booking engine**: PerimeterX enforces meaningful access control on booking.flyfrontier.com. Direct access returns a captcha challenge, not API data. Protection is at the application layer — a valid browser session with a solved PX challenge can proceed.

**/darksite**: The privacy portal is in `Disallow` in robots.txt but returns 200 and is fully functional. This is by design — the URL is shared in privacy policy links — but the robots.txt entry creates a false impression of restriction.

**GlobalSiteSEO**: A third-party SEO service at `globalsiteseo.com` generates Frontier's public sitemap (56 URLs, version `gsm_3.8.3`, last updated 2026-04-13).

## Machine Briefing

**Access & auth**

The main site (www.flyfrontier.com) is accessible without session cookies for content pages and Umbraco APIs. PerimeterX runs on every page and collects fingerprint data but does not block browser-rendered requests. The booking engine (booking.flyfrontier.com) requires a PerimeterX-solved browser session — headless Chrome with default settings is detected and blocked immediately via SwiftShader GPU string in WebGL.

The AirTRFX subdomain (flights.flyfrontier.com) serves full page HTML without any auth requirement. The GraphQL API at `vg-api.airtrfx.com` accepts unauthenticated POST requests from any origin.

**Endpoints**

Open (no auth, no session):

```bash
# Full navigation structure with all page URLs
GET https://www.flyfrontier.com/umbraco/api/externalcontent/menuv2

# HTML header fragment with Vue component
GET https://www.flyfrontier.com/umbraco/api/externalcontent/headerV2

# HTML footer fragment
GET https://www.flyfrontier.com/umbraco/api/externalcontent/footer

# Clarip geolocation — returns IP geolocation used for consent gating
GET https://frontier.clarip.com/clarip/api/geolocation/current

# AirTRFX GraphQL — all UI copy strings for Frontier deals site
POST https://vg-api.airtrfx.com/graphql
Content-Type: application/json
{"query":"{ labels(page: {tenant: \"f9\", siteEdition: \"en\"}) }"}

# AirTRFX GraphQL — tenant config
POST https://vg-api.airtrfx.com/graphql
Content-Type: application/json
{"query":"{ tenant(page: {tenant: \"f9\", siteEdition: \"en\"}) { name } }"}

# AirTRFX JWT token — fresh 48-hour token in __NEXT_DATA__ on every page load
GET https://flights.flyfrontier.com/en/
# Parse: JSON.parse(document.getElementById('__NEXT_DATA__').textContent).props.pageProps.jwt

# Privacy portal (robots-blocked but publicly accessible)
GET https://www.flyfrontier.com/darksite
```

Blocked (requires PerimeterX-solved browser session):

```bash
# Booking markets — returns PerimeterX captcha without valid browser session
GET https://booking.flyfrontier.com/Resource/GetMarkets

# Schedule retrieval
GET https://booking.flyfrontier.com/Flight/RetrieveSchedule

# Loyalty endpoints
GET https://www.flyfrontier.com/F9Loyalty/DiscountDenDetails
GET https://www.flyfrontier.com/F9Loyalty/BarclaysFrontierMilesSignupLink
GET https://www.flyfrontier.com/F9Sessionless/Member
GET https://www.flyfrontier.com/F9Sessionless/Resources
```

**Gotchas**

- PerimeterX app ID `PXVb73hTEg` detects headless Chrome via SwiftShader GPU string in WebGL. Standard headless Chrome fingerprint will be blocked. The fingerprint is stored in localStorage and sent on 6 collector calls before page render completes.
- The booking engine at booking.flyfrontier.com is completely isolated from the main site — cookies and sessions do not transfer.
- `api.flyfrontier.com` returns 406 for all requests — alive but won't respond to standard content types.
- The AirTRFX GraphQL endpoint has introspection disabled. Type errors in query responses leak some schema information.
- Cache TTL on the main site is `max-age=3` (3 seconds). Repeat requests will not be served from edge cache.
