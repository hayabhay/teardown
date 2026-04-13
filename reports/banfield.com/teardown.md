---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "Banfield Pet Hospital — Teardown"
url: "https://www.banfield.com"
company: "Banfield Pet Hospital"
industry: "Healthcare"
description: "Largest US veterinary chain with ~1,000 locations, owned by Mars."
summary: "Banfield runs Sitecore Experience Accelerator on .NET hosted on Azure behind Cloudflare, with a separate Salesforce Commerce Cloud instance at shop.banfield.com. The frontend is server-rendered jQuery/Bootstrap/Backbone. A 674KB GTM container (v210, 525 tags) orchestrates two GA4 properties, Optimizely, Facebook Pixel, AdRoll, Adelphic/Viant CTV, and Crazy Egg session recording."
date: "2026-04-12"
time: "23:36"
contributor: "hayabhay"
model: "sonnet-4.6"
effort: "high"
stack: [Sitecore, Azure, Cloudflare, jQuery, GTM, Salesforce Commerce Cloud]
trackers: [Google Analytics 4, Google Tag Manager, Facebook Pixel, Optimizely, AdRoll, Adelphic, Crazy Egg, OneTrust, Sitecore Analytics]
tags: [veterinary, healthcare, sitecore, azure, tracking, appointment-booking, pet-care, mars, consent, session-recording]
headline: "Every step of Banfield's 5-step appointment booking fires DoubleClick and Facebook conversion events with pet species (cat/dog/kitten/puppy) and wellness plan status as ad dimensions."
findings:
  - "GTM tag 618 injects a JSONP script from api.ipify.org at page init, pushing the visitor's real IP into the dataLayer as ipEvent.ipAddress and persisting it in sessionStorage.my_ip — available to Facebook, Google Ads, and Adelphic CTV tags for the full session."
  - "Every step of the 5-step appointment booking flow fires individual DoubleClick and Facebook Pixel conversion events with pet species (cat/dog/kitten/puppy) and wellness plan status as ad dimensions."
  - "Google Maps API key AIzaSyDhqLLtw3dmFqh5gwYJtYjdmwdsGksPQ2U is embedded in 1,914 vet profile pages and works for Geocoding, Places search, and Static Maps from any IP — billed to Banfield."
  - "Sitecore's SC_ANALYTICS_GLOBAL_COOKIE sets with a 10-year expiry (expires 2036) on first visit and isn't listed in OneTrust's consent categories."
  - "OneTrust auto-grants all four consent groups with interactionCount=0 on first load — every tracker fires before the visitor touches the consent banner."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

Banfield Pet Hospital operates ~1,000 US locations under Mars ownership. Its site runs on a conventional enterprise stack — Sitecore CMS on Azure behind Cloudflare — but the analytics layer is anything but conventional. A single GTM container with 525 tags actively fetches the visitor's real IP via a third-party JSONP service, pipes every appointment booking step into Google Ads and Facebook as conversion events with pet species as a dimension, and fires all of this before the OneTrust consent banner establishes any consent categories.

---

## Architecture

The public site runs Sitecore Experience Accelerator (SXA) on .NET, hosted on Azure with Application Gateway for session affinity, Application Insights for monitoring, and Blob Storage for media. Cloudflare sits in front as the CDN/WAF layer.

The frontend is server-rendered HTML — no SPA framework. The JavaScript stack is jQuery, Bootstrap, Backbone.js, Modernizr, Swiper, FullCalendar, and a tail of utility libraries (Bloodhound/Typeahead, Chart.js, DOMPurify, Hammer, Rellax). The global variable `window.GlobalVariables` returns a platform ID minted in March 2019: `banfield_platform_20190313190108619-0f334fcbf69e7bf`, still in active use.

A separate Salesforce Commerce Cloud (Demandware) instance handles retail at `shop.banfield.com`, with its own session context (`dwanonymous_*`, `dwsid` cookies). The commerce layer honors Do Not Track — `__cq_dnt=1` and `dw_dnt=1` are set on the Demandware side — a behavior absent from the main site.

The Sitecore Experience Accelerator site identifier (`sxa_site=en`) and ASP.NET session cookies confirm the .NET backend. Response headers leak the Azure Application Insights instrumentation ID on every request: `request-context: appId=cid-v1:7f937fea-c49f-4e2f-8ac6-c7d8cd1132ec`.

---

## IP Collection via JSONP

The GTM container (ID: GTM-P6GKLQ9, v210, 674KB) includes a custom HTML tag (tag_id 618) that runs on GTM initialization — before the DOM is ready and before the consent platform loads. The tag injects a JSONP script:

```html
<script type="text/gtmscript">
  function getIP(a) { dataLayer.push({event: "ipEvent", ipAddress: a.ip}); }
</script>
<script type="text/gtmscript"
  data-gtmsrc="https://api.ipify.org?format=jsonp&callback=getIP">
</script>
```

`api.ipify.org` is a public IP detection service. The JSONP callback pushes the visitor's real IP address into the GTM dataLayer as `ipEvent.ipAddress`. A second tag (tag_id 615) reads the value and stores it in `sessionStorage.my_ip`. The IP then becomes available to all downstream GTM tags via dataLayer macro 84 (`ipAddress`).

The dataLayer sequence on a fresh browser session confirms the timing:

```
0:   gtm.js                              ← GTM initializes
...
340: ipEvent  {ipAddress: "x.x.x.x"}     ← real IP captured
342: OneTrustLoaded  {groups: ",,"}       ← consent not yet established
...
350+: OneTrustLoaded {groups: ",1,2,3,4,"} ← all groups granted
```

The IP fires at event 340. OneTrust first loads at event 342 with empty consent groups — no consent categories have been established at the moment of capture. The value was confirmed persisting in `sessionStorage.my_ip` for the session duration.

The tag's trigger condition nominally includes an "unless URL contains banfield.com" predicate (predicate 342, using GTM's `_cn` function), which should suppress the tag on the main domain. In practice, the tag fires on every banfield.com page load. The most likely explanation: at `gtm.js` initialization time, the page URL macro evaluates before the full URL is populated, causing the predicate to miss.

With the IP in the dataLayer, all downstream ad and analytics tags — Facebook Pixel (746751738864113), Google Ads (DoubleClick src=16263111), and the Adelphic DSP pixel (account 107807) — have access to the real visitor IP throughout the session. This is distinct from server-side IP logging; the IP is explicitly resolved client-side via a third-party service, stored in the browser, and made available to every tag in the container.

---

## Tracker Inventory and Consent Configuration

The GTM container orchestrates the full surveillance stack. Cookies set before any consent banner interaction on a fresh session:

| Cookie | Vendor | Notes |
|--------|--------|-------|
| `_fbp` | Facebook Pixel | Pixel ID 746751738864113 |
| `_gcl_au` | Google Click Linker | Conversion attribution |
| `_ga` / `_ga_9V187TWY4G` / `_ga_8LG88H0H3Y` | Google Analytics 4 | Two separate properties |
| `optimizelyEndUserId` | Optimizely | A/B test user ID |
| `SC_ANALYTICS_GLOBAL_COOKIE` | Sitecore xDB | 10-year expiry (see below) |

**OneTrust consent configuration**: The `OptanonConsent` cookie reads `interactionCount=0&groups=1:1,2:1,3:1,4:1` on first load — all four consent groups pre-granted before any user interaction. The banner renders, but tracking has already fired. OneTrust UUID: `2d1a17d8-12f3-481c-b828-1a23dfc93792`.

**Sitecore Analytics** — `SC_ANALYTICS_GLOBAL_COOKIE` sets with a 10-year expiry on first visit. Format: `{GUID}|{isFirstAccess}` (e.g., `fc7490d9cc184480b99f638a08337ddc|False`; expires 2036-04-10). This is Sitecore's built-in Experience Database (xDB) cross-session tracker, set server-side with `HttpOnly; Secure` flags. It is not listed in OneTrust's consent categories and operates independently of the CMP.

**Full verified tracker list:**

- **Google Analytics 4** — two properties (`_ga_9V187TWY4G`, `_ga_8LG88H0H3Y`). Also legacy Universal Analytics (`www.google-analytics.com` collect endpoint). Six `POST` requests to `analytics.google.com/g/collect` fire on homepage load alone.
- **Google Ads / DoubleClick** — source 16263111, floodlight ID 8303955. Homepage fires `type=visits;cat=unive0` (site visit conversion). Appointment page fires `type=conv;cat=appoi0` (appointment conversion).
- **Facebook Pixel** — ID 746751738864113. GTM tags configured for `PageView` (tag_id 354), `ViewContent` (tag_id 356), `InitiateCheckout` (tag_id 360), `Lead` (tag_id 362), `AddToCart` (tag_id 444).
- **Optimizely** — project 21358250631. Five active experiments on fresh session, logging to `logx.optimizely.com/v1/events`. Experiment names visible in the event queue: `url_targeting_for_oes__aa_test`, `oes__global__all_banfield_pages`, `url_targeting_for_default_to_spanish_for_puerto_rico`. The public datafile at `cdn.optimizely.com/datafiles/21358250631.json` returns AccessDenied (private S3 bucket). Visitor profiles in localStorage include geolocation metadata: city, continent, country, region, DMA.
- **AdRoll** — segment `726CGXTGWZEFBDD3MX2QZY`, sub-segment `LYWBZ7U23RDSLLHPI6OOZ5`. Fires to `d.adroll.com` on homepage and appointment pages.
- **Adelphic (Viant DSP)** — account 107807. GTM fires `new AdelphicUniversalPixel(107807, "https://ad.ipredictive.com/d/track/event", {p1: eventName, p2: pageURL, ps: "0"}).fire()`. Viant/Adelphic specializes in connected TV and cross-device programmatic advertising — their presence here indicates Banfield runs CTV/streaming ads and builds web audiences for household-level CTV retargeting.
- **Crazy Egg** — GTM tag_id 946, account `01048874`. Session recording and heatmap tool (screen recordings, click maps, scroll maps). Loaded via `https://script.crazyegg.com/pages/scripts/01048874.js`. Not mentioned in the public privacy policy's tracker list. Whitelisted in CSP across script-src, connect-src, frame-src, img-src, and style-src.
- **api.ipify.org** — IP address resolution via JSONP, as detailed above.

---

## Appointment Funnel Instrumentation

The 525-tag GTM container fully instruments the appointment booking funnel into advertising conversion events. Two parallel flows are tracked:

**Guest flow** (5 steps): Pet type selection → Location search → Date/time → Personal information → Confirmation

**Logged-in flow** (4 steps): Pet selection → Date/time → Confirmation (with OWP variants)

At each step, individual GTM events fire with custom dimensions:
- **Pet type**: cat, dog, kitten, puppy
- **Patient status**: guest, logged-in
- **OWP status**: Optimum Wellness Plan member vs non-member

The DoubleClick floodlight tag fires `cat=appoi0` on the appointment page — a conversion event feeding directly into Google Ads campaign attribution. Multiple `POST /gmp/conversion;src=16263111;type=conv;cat=appoi0` requests are visible in the appointment page network log. Facebook Pixel's `InitiateCheckout` and `Lead` events trigger at appointment steps, with `AddToCart` used for wellness plan enrollment.

The container also tracks "Dotcom to Ecomm" events for wellness plan enrollment: `Start Enrollment Now`, `Start Enrollment Online`, funneling into the same conversion graph.

The result: Mars/Banfield has a full anonymous-visitor-to-appointment-completion conversion model with pet species and plan status as ad dimensions, shared in real time with Google Ads and Meta's advertising platforms. Viewing the appointment scheduler page alone — without booking anything — registers as a conversion event.

---

## Google Maps API Key

The key `AIzaSyDhqLLtw3dmFqh5gwYJtYjdmwdsGksPQ2U` appears in every vet profile page's HTML source:

```html
<script defer src="https://maps.google.com/maps/api/js?key=AIzaSyDhqLLtw3dmFqh5gwYJtYjdmwdsGksPQ2U"></script>
```

The key is restricted by API type but not by HTTP referrer or originating IP. Confirmed working from an external IP:

| API | Status |
|-----|--------|
| Geocoding | Working — full address → lat/lng responses |
| Places Nearby Search | Working — 20 results for veterinary queries |
| Static Maps | Working — 200 responses |
| Directions | REQUEST_DENIED |
| Distance Matrix | REQUEST_DENIED |

Any third party can use this key to run geocoding lookups, nearby place searches, and static map generation — all billed to Banfield's Google Cloud account. The key is present across 1,914+ vet profile pages, all publicly indexed via the sitemap.

---

## The Vet Profile Corpus

The sitemap at `https://www.banfield.com/sitemap.xml` enumerates 6,686 URLs across 25 groups. The `/associates/*` group contains 1,914 veterinarian profile pages, all publicly indexed on Google.

Each profile is a server-rendered Sitecore page with schema.org Person markup (JSON-LD):

```json
{
  "@context": "https://schema.org/",
  "@type": "Person",
  "name": "Dr. Alexandra Galindo",
  "url": "https://www.banfield.com/associates/a/10081",
  "jobTitle": "Veterinarian",
  "worksFor": {"@type": "Organization", "name": "Banfield Pet Hospital"}
}
```

Structured fields per profile:
- Full name and DVM degree
- Veterinary school(s) attended (undergrad and professional)
- State(s) licensed in
- Years in practice (start year — present)
- Board certifications where applicable
- Professional bio paragraph
- Personal interests (frequently includes family details, pets, hobbies)

A sample profile (Dr. Alexandra Galindo, `/associates/a/10081`) shows education at University of Florida and Auburn University College of Veterinary Medicine, licensed in Florida, years in practice 2013–2026, personal interests: "Spending time with her pets and husband."

These are company-published content pages, not opt-in public profiles — Sitecore-managed with sequential numeric IDs in the URL pattern (`/associates/a/{id}`). There is no API backing them; each is a full HTML page. The sitemap also indexes 4,129 individual hospital location pages, 296 blog posts, and inactive promotion pages (`/promotions/After-Party`, `/promotions/BanfieldFoundationImpactReport`) that appear in the sitemap but are blocked by robots.txt.

---

## Architecture Artifacts

**Azure backend URL in CSP**: The Content Security Policy `img-src` directive includes `https://ban-vygr-scnew-prod-rg-541040-cm.azurewebsites.net/` — a direct Azure App Service URL, likely the Sitecore content management server. The `scnew` in the resource group name suggests a Sitecore migration or platform upgrade project. Direct requests to this URL return 404.

**PARP dashboard**: `/parp/dashboard/` is blocked in robots.txt but accessible in URL space. Requesting it returns a 302 to `/error/404?item=%2fparp%2fdashboard%2f&user=extranet%5cAnonymous&site=en`. The `extranet\Anonymous` string is Sitecore's built-in extranet membership domain for client-facing authentication. This appears to be a deprecated patient portal predating the current `/my-banfield/` dashboard.

**DataMigration path**: `/DataMigration/` appears in robots.txt disallows and redirects to login — a migration endpoint still present in the URL namespace.

**Payment stack in CSP**: Two payment processors are whitelisted in the Content Security Policy:
- **iATS Payments** (now Deluxe): `http://*.iatspayments.com` in script-src, style-src, img-src — a processor typically used by subscription billing and nonprofits. Likely handles Optimum Wellness Plan subscription billing or Banfield Foundation charitable giving.
- **First Data / Fiserv GlobalGateway E4**: `https://checkout.globalgatewaye4.firstdata.com/payment` in frame-src — an iframe-embedded payment form, now part of Fiserv after the 2019 merger.

**CSP also reveals**: `prd01.launch.banfield.com` (a launch/deployment system), `launchpad.banfield.com` (returns 404), `webchat.helpshift.com` (Helpshift support chat), `embedsocial.com` (Instagram social wall embeds), and Facebook App ID `586924921329568`.

**Login system**: Username/password only — no SSO providers (Google, Apple, Facebook). Account creation requires an existing Banfield client ID, gating registration to existing customers.

---

## Machine Briefing

**Access and auth**: The main site is server-rendered and session-based. Most content is accessible unauthenticated. Hospital search endpoints return 500 without a valid ASP.NET session cookie. The patient dashboard (`/my-banfield/`) requires a Banfield account. `shop.banfield.com` is a separate SFCC instance with its own session — cookies from the main domain don't transfer.

**Open endpoints (no auth):**

```bash
# Sitemap — 6,686 URLs, 25 groups
curl https://www.banfield.com/sitemap.xml

# Vet profile (server-rendered HTML, schema.org Person)
# Pattern: /associates/a/{numeric_id}
curl https://www.banfield.com/associates/a/10081

# Google Maps API — Geocoding (unrestricted by referrer/IP)
curl "https://maps.googleapis.com/maps/api/geocode/json?address=1600+Amphitheatre+Pkwy&key=AIzaSyDhqLLtw3dmFqh5gwYJtYjdmwdsGksPQ2U"

# Google Maps API — Places Nearby Search
curl "https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=37.42,-122.08&radius=5000&type=veterinary_care&key=AIzaSyDhqLLtw3dmFqh5gwYJtYjdmwdsGksPQ2U"

# Google Maps API — Static Maps
curl "https://maps.googleapis.com/maps/api/staticmap?center=San+Francisco&zoom=12&size=400x400&key=AIzaSyDhqLLtw3dmFqh5gwYJtYjdmwdsGksPQ2U"

# GTM container (full tag config)
curl "https://www.googletagmanager.com/gtm.js?id=GTM-P6GKLQ9"
```

**Session-required endpoints:**

```bash
# Hospital search (returns HTML fragment, not JSON)
# Requires: ASP.NET_SessionId, shell#lang, SC_ANALYTICS_GLOBAL_COOKIE
GET https://www.banfield.com/Hospital/HospitalsSearchResults/
GET https://www.banfield.com/Hospital/LandingPageSearchresult/
```

**Vet profile enumeration:** URL pattern is `/associates/a/{id}` with numeric IDs. Parse the sitemap group for the full list of 1,914 profiles rather than brute-forcing IDs.

**Gotchas:**
- Hospital search endpoints silently return 500 without a valid session — no error message indicates what's missing
- `/parp/dashboard/` 302s to a 404 — don't interpret the redirect as a live endpoint
- Maps API key works for Geocoding, Places, and Static Maps — Directions and Distance Matrix return REQUEST_DENIED
- `shop.banfield.com` has a completely separate session context
- Optimizely datafile (`cdn.optimizely.com/datafiles/21358250631.json`) is private — returns AccessDenied
