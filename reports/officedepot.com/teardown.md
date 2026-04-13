---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "Office Depot — Teardown"
url: "https://officedepot.com"
company: "Office Depot"
industry: "Retail"
description: "Office supplies and furniture retailer with B2B and consumer segments."
summary: "IBM WebSphere Java EE monolith behind Akamai CDN, with a React 16 micro-frontend layer at ma.officedepot.com for header/footer/product rails. Customer data infrastructure runs through Rokt's white-labeled mParticle stack, with all SDK endpoints remapped to apps.rokt-api.com under a first-party subdomain. Multiple Oracle products persist — ATG cross-device from 2013, RightNow chat — alongside Adobe Analytics, Bloomreach, and Microsoft Clarity. B2B traffic routes to a separate Java app at odpbusiness.com."
date: 2026-04-06
time: "06:03"
contributor: hayabhay
model: "sonnet-4.6"
effort: high
stack:
  - IBM WebSphere
  - Akamai
  - React
  - mParticle
  - Oracle ATG
trackers:
  - Google Analytics 4
  - Adobe Analytics
  - mParticle
  - Rokt
  - Microsoft Clarity
  - Bloomreach
  - Criteo
  - Bazaarvoice
  - Curalate
  - Medallia
  - Oracle ATG
  - Oracle RightNow
  - AudioEye
  - OneTrust
  - Akamai mPulse
  - Meta Pixel
  - Pinterest Pixel
tags:
  - retail
  - e-commerce
  - java
  - ibm-websphere
  - legacy-tech
  - consent-gap
  - micro-frontends
  - surveillance
  - rokt
  - session-leakage
headline: "Office Depot handed its entire customer data pipeline to Rokt — every page view, search, and click flows through the ad-tech company's servers via a first-party subdomain designed to dodge blockers."
findings:
  - "Rokt operates as the customer data platform, not just an ad widget — the entire mParticle SDK is remapped to apps.rokt-api.com, anonymous visitors are profiled by default, and all traffic routes through the first-party subdomain rkt.officedepot.com so browser privacy tools treat it as Office Depot's own traffic."
  - "Every page bakes the Java session ID into HTML in three separate places — a window global, an inline JSON block, and a GTM dataLayer push — then appends it to URL paths via WebSphere URL rewriting, where it ends up in server logs, CDN logs, Referer headers, and browser history."
  - "Criteo retargeting fires on search pages while OneTrust's consent cookie explicitly records C0004 (Targeting/Advertising) as disabled — the consent framework says no, the network says yes."
  - "An Oracle ATG cross-device identity script dated May 2013 loads on every page and returns visitor IDs via unauthenticated JSONP — the same script, unchanged, for over a decade on a live production site."
  - "The guest JWT cookie has no HttpOnly flag, making it readable by every third-party script on the page — and the payload names internal infrastructure: the 'WARP' auth service, specific WebSphere node IDs, and the inventory location used to price the session."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

## Architecture

Office Depot runs on an IBM WebSphere Java EE 7 monolith (`x-powered-by: Servlet/3.0` on all responses). Akamai sits in front as CDN, bot protection (`_abck`, `bm_sz` cookies), and RUM (`mpulse_cdn_cache` headers). Java session state is rendered into HTML at request time via a `document.getElementById("globalSettings")` pattern — a pre-React server-side Java approach still running in production.

On top of the monolith sits a micro-frontend layer at `ma.officedepot.com`: separate deployments for header, footer, product rails, content publishing, and analytics utilities. These ship React 16.8.0 pinned verbatim (`react.prod.16.8.0.js`, released February 2019, EOL March 2022). The underlying page is Java-rendered; the micro-frontends bolt on as islands.

Customer data infrastructure routes through a white-labeled mParticle stack operated by Rokt (`apps.rokt-api.com`). Realtime analytics run on a custom AWS property (`realtime.officedepot.com`, key `rt_od_prod`, site ID `bAEQTsC`). Product intelligence lives at `pim-prod.odepotcloud.com`. AI recommendations are served from `api.officedepot.io`. B2B traffic routes to a separate Java app at `odpbusiness.com` (HttpOnly session management, unlike the main site).

The SSL certificate SAN list exposes internal hostnames: `masq.officedepot.com` (consistent with a CSR impersonation tool — returns 404 via Akamai), `wwwprod.officedepot.com` (production internal hostname), `futureorders.officedepot.com`, `cpdsqpservice.officedepot.com`, `cpdsvcprd.officedepot.com`, `bsd.officedepot.com` (Business Solutions Division), `odams.officedepot.com`. Also on the cert: `officemax.com`, `reliable.com`, and `www.elfyourself.com`.

Security headers: `access-control-allow-origin: *` with `access-control-allow-credentials: false` on the main site. `cache-control: no-cache, no-store` on HTML responses. No `X-Frame-Options` or `Content-Security-Policy` headers observed.

---

## Session Architecture

The `AccessToken` cookie is a signed JWT issued to every visitor, including anonymous guests. It is set without `HttpOnly` — readable by any script on the page. The full Set-Cookie: `AccessToken=...; Path=/; Secure; SameSite=None`. No HttpOnly flag.

Decoded JWT payload for an anonymous session:

```json
{
  "sub": "GUEST",
  "iss": "OD",
  "aud": "WARP",
  "environment": "node13B",
  "sessionId": "0041820",
  "invLocDft": "1135",
  "identity": "tgahtaftwspxcn",
  "isAnon": "true",
  "userType": "P",
  "siteType": "J",
  "kjt": "false",
  "dcid": "J20fe9fd9-2480-427b-8dce-eb066a77cd2b"
}
```

`aud: "WARP"` is the internal name of the authentication service. `environment` rotates between `node10B`, `node12B`, and `node13B` across requests — these are WebSphere Application Server node identifiers, giving the load balancer assignment for each session. `invLocDft: "1135"` is the default inventory location used for pricing this session, tied to the IP-geolocated postal code (`postalCode: "94540"` also exposed as a window global, along with `GEO_LONG`, `GEO_LAT`, `GEO_CITY`, `GEO_STATE` cookies). `siteType: "J"` is an undocumented field, likely a platform variant flag. RS256 signing, kid `RtMWcfBHNV4JHrrPSZkP8TFaAwgb5uXR777QRlKQfcSCAaBm`.

The Java session ID appears in three additional places on every page load: the `window.jSessionID` global, the `globalSettings` inline JSON block (`jsessionId` field), and the GTM dataLayer push (`jsessionId: "0000PcvYZLqo1_V0EajUYZD2R40:17h4h7d2r"`). The format is `0000{sessionId}:{cloneId}` — IBM WebSphere's load balancing pattern. The `cloneID` (`17h4h7d2r`) also appears as a separate window global.

The dataLayer push includes `sessionHash: "$2a$10$MmQK.gC3hKqz5kA4dHugzOUdwaxsUwrUUJ2222vuKkzEPHO093n82"` — a bcrypt hash pushed to analytics on every pageview. What it hashes is unknown from client-side evidence; likely a session deduplication token.

The most consequential session leakage is URL-based: legacy Java endpoints use WebSphere's URL rewriting pattern to append the full session ID to the path:

```
/mobile/getAjaxPriceListFromService.do;jsessionid=0000PcvYZLqo1_V0EajUYZD2R40:17h4h7d2r
/json/translations.do;jsessionid=0000PcvYZLqo1_V0EajUYZD2R40:17h4h7d2r
```

The segment after the colon (`17h4h7d2r`) is the WebSphere clone ID / load balancer affinity token. Session IDs in URLs end up in server access logs, CDN logs, Referer headers to third-party domains, browser history, and analytics pipelines.

Other notable globals from the GTM dataLayer: `store_address: "23882 HESPERIAN BLVD"`, `store_id: "2160"`, `currentSBArea: "FREMONT_SC"` (geolocated store assignment), `loyaltyTierType: "EXECUTIVE"` (default for anonymous visitors), `sbAccountStatus: "ELIGIBLE"`, `thirdPartyCustomerJSEnabled: "true"`. Fields for `csrId`, `agentId`, and `salesRepID` are present but empty — the page template is shared between customer-facing and customer-service-representative views.

The B2B site at `odpbusiness.com` manages sessions differently — cookies are HttpOnly there. The main consumer site never got the same treatment.

## The Rokt Infrastructure Layer

Office Depot's mParticle integration has been fully white-labeled to Rokt's infrastructure. The mParticle SDK configuration remaps every service endpoint:

- Identity: `apps.rokt-api.com/identity/v1/`
- Events: `apps.rokt-api.com/webevents/v3/JS/us2-7f4b4169b1653c49a6efe03f866365d1/events`
- Audience: `apps.rokt-api.com/nativeevents/v1/`
- Config: `apps.rokt-api.com/tags/JS/v2/`

The mParticle config specifies Rokt as a kit with `accountId: "243"`. `excludeAnonymousUser: false` — Rokt profiles every visitor regardless of login state. `appName: "Office Depot, Inc."`, `workspaceToken: "2353A87B"`.

Traffic routes through `rkt.officedepot.com` (a first-party subdomain), bypassing browser-level third-party domain blocking. The Rokt `app.js` is served by Kestrel (.NET Core/ASP.NET), a separate service stack from the Java backend. Load balancer affinity cookie: `akaalb_Instance-1=Prod_MP_Snippet:Prod-MP-Snippet`.

The effect: Rokt operates as Office Depot's customer data platform, not just an ad widget. Every behavioral event — page views, product interactions, search queries — flows through Rokt's infrastructure. The first-party subdomain framing means browser extensions and network-level blockers that filter third-party requests see this as Office Depot traffic. The `POST /identity/v1/identify` call fires on the first homepage load, establishing a Rokt identity for the visitor before they interact with anything.

Additionally, `omxIntegrationEnabled: true` in globalSettings suggests an Order Management integration running through this same pipeline — Rokt potentially sees transaction data, not just behavioral signals.

## Pre-Consent Tracker Activity

OneTrust consent state on a fresh anonymous session: `OnetrustActiveGroups: ",C0001,C0003,C0002,"` — groups 1 (Strictly Necessary), 2 (Performance), and 3 (Functional) active. Group C0004 (Targeting/Advertising) is NOT in the active groups. The `OptanonConsent` cookie records `C0004:0`. OneTrust consent UUID: `3e132ab0-381e-4960-8ae2-d7e9a995f0f9`.

Despite this, the network capture for a search page shows Criteo firing three times: `POST b.us5.us.criteo.com/rm => 200 (x3)`. This is a retargeting request — a C0004 activity — on a session where C0004 is explicitly marked disabled. On a fresh homepage session (no prior search), Criteo does not fire — it appears to be conditionally loaded on search pages regardless of consent state.

On the homepage with a fresh session, all of the following fire before any user consent interaction:
- Rokt events: `POST /webevents/v3/JS/... => 202`
- Rokt identity: `POST /identity/v1/identify => 200`
- Adobe Analytics: `POST edge.adobedc.net/ee/or2/v1/interact` (up to 12 calls on homepage)
- Adobe identity: `POST edge.adobedc.net/ee/v1/identity/acquire`
- Microsoft Clarity: `POST b.clarity.ms/collect` (multiple calls across all pages)
- Bloomreach tracking: loaded on page render
- Oracle ATG: `POST rules.atgsvcs.com/EERules/view/rules/...` (visitor ID, every page)
- Medallia/Kampyle: `POST analytics-fe.digital-cloud-us-main.medallia.com/api/web/events`
- Curalate: `GET edge.curalate.com/v1/media/UWgMLdNvxUAJkPUC`

## Legacy Technology Debt

Office Depot's stack carries a continuous layer of technology accumulating since before 2010. Running live today:

**Oracle ATG cross-device identity** — `rules.atgsvcs.com/EERules/xd/3.0/json/200106306014/xd.js` fires on every page load, returns a visitor identifier via JSONP, and carries `Last-Modified: Wed, 01 May 2013 00:00:00 GMT`. The script has been running unchanged for over 13 years on a live production site. Oracle ATG Commerce was acquired by Oracle in 2011; the ATG cross-device service has been deprecated for years.

**P3P header** — `CP="ALL DEVa TAIa OUR BUS UNI NAV STA PRE" policyref="http://www.officedepot.com/w3c/p3p.xml"` is set on every response. The Platform for Privacy Preferences (P3P) standard was deprecated in 2018; the referenced policy documents date from ~2013. No browser has enforced P3P since IE11.

**Coremetrics/IBM Watson Marketing on error pages** — 404 and error pages load the Coremetrics analytics beacon: `cmSetClientID("90031492")`, endpoint `www18.officedepot.com/eluminate?`, JAWR bundler (`jawr_loader.js`). Coremetrics was rebranded to IBM Campaign in 2015 and subsequently discontinued. The 404 page shows `Copyright 2009`, references a FeedBurner RSS feed (`http://feeds.feedburner.com/OfficeDepot` — Google shut down FeedBurner in 2021), and links to assets over plain `http://`. The error page appears to have been frozen around 2009.

**Oracle RightNow** — Chat widget at `officedepotchat-en.widget.custhelp.com`, visitor tracking at `vsvippi01.rightnowtech.com`. Response headers expose node identifiers: `RNT-JN-Int-Machine: 42.3`, `RNT-CMachine: 0.33`, `RNT-JN-Ext-Machine: 43.3`. Site identifier in tracking URL: `officedepot_na`.

**React 16.8.0 on micro-frontends** — The `ma.officedepot.com` micro-frontends pin React 16.8.0. React 16 went EOL with React 18 stable in March 2022. Build hash: `294bb0e904cd1ccfd3bb`.

**Realtime analytics** — `realtime.officedepot.com` error responses leak the Java JSON parser class name: `StreamReadFeature.INCLUDE_SOURCE_IN_LOCATION` — a Jackson-specific string, confirming the Java/Jackson stack. Global config: `realTimeEnabled: "true"`, `realTimeUrl: "https://realtime.officedepot.com/rt?"`, `realTimeSite: "bAEQTsC"`, `realTimeKey: "rt_od_prod"`.

**globalSettings architecture** — The `global_vars.min.js` bundle reads `document.getElementById("globalSettings")`, parses the JSON, and spreads every key-value pair onto `window`. This is the primary mechanism for server-to-client state transfer. Notable config values exposed as window globals: `passwordMaxLength: 30`, `passwordMinLength: 8`, `socialLogin: false`, `jsConsoleLoggingEnabled: false`, `aiRecZone: "false"`, `aiRecZoneEndpoint: "https://api.officedepot.io/services/recrnnservice/recModel"`.

## Open Endpoints

**AI recommendation service** — `https://api.officedepot.io/services/recrnnservice/health` returns `{"status":"ok"}` with HTTP 200, no authentication required. The service name (`recrnnservice`) suggests an RNN (Recurrent Neural Network) model. Root domain `api.officedepot.io` serves the nginx default welcome page — misconfigured at the root level. POST to `/recModel` returns `()` (empty callback); the required payload format is referenced in globalSettings as `aiRecZoneEndpoint` but not documented client-side. Flask/Django-style 404 error pages indicate a Python web framework backing the service.

**Splunk logger** — `POST /ajax/splunkLogger/log.do` accepts arbitrary POST bodies, returns HTTP 200 with empty response, no authentication required. No request validation observed in testing.

**Micro-frontend demo page** — `https://ma.officedepot.com/header/index.html` is publicly accessible on a production subdomain. It contains a hardcoded logged-in session stub:

```html
<input type="hidden" id="header-info" value='{
    "userLoggedIn": true,
    "firstName": "Osbel",
    "initial": "OM",
    "welcomeMessage": ""
}'/>
```

This is the test/demo state used to preview the header component. The name appears to be a real employee or test account identity baked into static production HTML.

**Translations endpoint** — `GET /json/translations.do` returns HTTP 200 without authentication: `{"errorMessages":["Translation keys missing or empty"],"errorCode":"","success":false,"csrfAttack":false}`. The `csrfAttack: false` field in the response body returns CSRF validation state directly.

## Staging Environments

The GTM container's referral exclusion list for `G-MZ424N4G1Y` contains confirmed internal environments:

- `bsdas1.officedepot.com` — returns 503 (Akamai-gated, likely Business Solutions Division staging)
- `wwwsln.officedepot.com` — returns 401 (live Java app, authentication required)
- `wwwsqm.officedepot.com` — returns 401 (live Java app, authentication required)

The SSL cert SAN list includes `wwwprod.officedepot.com` — the production internal hostname, a separate vhost from `www.officedepot.com`. Also on the cert: `sweepstakes.officedepot.com` and `mps.officedepot.com` (Managed Print Services).

Login pages use Google reCAPTCHA Enterprise (`www.google.com/recaptcha/enterprise/reload`) and a secondary verification layer (`/_sec/verify`, `/_sec/cp_challenge/verify`). A `POST /ajaxhtml/smartEnroll.do` endpoint fires on the login page — loyalty enrollment probing.

## Tracker Inventory

| Tracker | Domain | Notes |
|---------|--------|-------|
| Google Analytics 4 | `www.googletagmanager.com` | `G-MZ424N4G1Y` |
| Adobe Analytics | `edge.adobedc.net` | Via Adobe Launch, 8 rule configs |
| mParticle / Rokt | `apps.rokt-api.com`, `rkt.officedepot.com` | Full CDP, first-party subdomain |
| Microsoft Clarity | `scripts.clarity.ms`, `b.clarity.ms` | ID `snku0m9q1s` |
| Bloomreach | `cdns.brsrvr.com` | `br-trk-6489.js` |
| Criteo | `b.us5.us.criteo.com` | Fires pre-consent on search pages |
| Bazaarvoice | `apps.bazaarvoice.com` | Reviews, client `OfficeDepot`, loaded 3x on some pages |
| Curalate | `edge.curalate.com` | UGC, collection `UWgMLdNvxUAJkPUC` |
| Medallia / Kampyle | `nebula-cdn.kampyle.com`, `analytics-fe.digital-cloud-us-main.medallia.com` | Survey, workspace `383567`, forms `47146`, `22006` |
| Oracle ATG | `rules.atgsvcs.com`, `static.atgsvcs.com` | Cross-device identity, Last-Modified 2013 |
| Oracle RightNow | `officedepotchat-en.widget.custhelp.com`, `vsvippi01.rightnowtech.com` | Chat + visitor tracking, `officedepot_na` |
| AudioEye | `ws.audioeye.com`, `wsv3cdn.audioeye.com` | Accessibility monitoring |
| OneTrust | `cdn.cookielaw.org` | CMP, UUID `3e132ab0-381e-4960-8ae2-d7e9a995f0f9` |
| Akamai mPulse | `c.go-mpulse.net` | Real user monitoring |
| Meta / Facebook Pixel | Via Adobe Launch | `fbc` click tracking cookie |
| Pinterest Pixel | Via Adobe Launch | Configured in Launch container |
| Coremetrics | `www18.officedepot.com/eluminate` | Discontinued, active on error pages only |
| PayPal | `www.paypal.com` | Credit presentment experiments, logger |
| p11 TechLab | `p11.techlab-cdn.com` | 5 audience data scripts, Azure Blob Storage |

## Machine Briefing

**Access & auth**

No authentication required for most read operations. Session cookies (`AccessToken`, `JSESSIONID`) issue automatically on first request. `AccessToken` JWT is readable client-side (no HttpOnly). Standard `curl` requests receive a valid session. Akamai bot detection (`_abck`, `bm_sz`) is active — persistent scraping will encounter challenges. Headed Playwright bypasses bot protection.

### Open Endpoints (no auth)

```bash
# AI recommendation service health
curl https://api.officedepot.io/services/recrnnservice/health
# Returns: {"status":"ok"}

# AI recommendation model (payload format unknown, returns empty callback)
curl -X POST https://api.officedepot.io/services/recrnnservice/recModel \
  -H "Content-Type: application/json" -d '{}'

# Translations endpoint (CSRF status in response)
curl https://www.officedepot.com/json/translations.do

# Splunk logger (unauthenticated POST, 200 empty body)
curl -X POST https://www.officedepot.com/ajax/splunkLogger/log.do \
  -H "Content-Type: application/json" -d '{"message":"test"}'

# Micro-frontend demo page (hardcoded logged-in user state)
curl https://ma.officedepot.com/header/index.html

# Oracle ATG cross-device identity (JSONP, no auth, Last-Modified 2013)
curl "https://rules.atgsvcs.com/EERules/xd/3.0/json/200106306014/xd.js"
```

### Session-Gated Endpoints

```bash
# Acquire session (AccessToken JWT and JSESSIONID set automatically)
curl -sc /tmp/od-session.txt https://www.officedepot.com/ -o /dev/null

# Extract jsessionid from cookies (WebSphere format: 0000{id}:{cloneId})
JSID=$(grep -i jsessionid /tmp/od-session.txt | awk '{print $7}')

# Price list (jsessionid goes in URL path via semicolon syntax)
curl -b /tmp/od-session.txt \
  "https://www.officedepot.com/mobile/getAjaxPriceListFromService.do;jsessionid=${JSID}"

# Product promotion service
curl -b /tmp/od-session.txt -X POST \
  https://www.officedepot.com/services/product-promotion-service/v1/promotions \
  -H "Content-Type: application/json" \
  -d '{"skus":["<SKU>"]}'

# Identity service (fires on every page load)
curl -b /tmp/od-session.txt -X POST \
  https://www.officedepot.com/identity/v1/identify \
  -H "Content-Type: application/json"

# Consent recording
curl -b /tmp/od-session.txt -X POST \
  https://www.officedepot.com/services/marketing/v1/api/consent/webcookieconsent \
  -H "Content-Type: application/json"
```

### JWT Structure

`AccessToken` cookie: RS256, kid `RtMWcfBHNV4JHrrPSZkP8TFaAwgb5uXR777QRlKQfcSCAaBm`.

| Field | Example | Meaning |
|-------|---------|---------|
| `sub` | `GUEST` | Guest or user ID when authenticated |
| `aud` | `WARP` | Internal auth service name |
| `environment` | `node13B` | WebSphere node ID (10B/12B/13B observed) |
| `invLocDft` | `1135` | Default inventory location for session pricing |
| `isAnon` | `"true"` | Auth state |
| `userType` | `P` | Public user |
| `siteType` | `J` | Platform variant (undocumented) |
| `identity` | `tgahtaftwspxcn` | Persistent device identity token |
| `sessionId` | `0041820` | Internal session reference |
| `dcid` | `J20fe9fd9-...` | Device/client identifier |

### Gotchas

- Legacy `.do` endpoints use semicolon path syntax for jsessionid, not query params: `/path.do;jsessionid=VALUE`
- `pim-prod.odepotcloud.com/predictive` returns 403 without session — properly gated
- `api.officedepot.com` is an AWS API Gateway requiring auth tokens — returns `MissingAuthenticationTokenException`
- `realtime.officedepot.com/rt?` requires valid JSON payload; error leaks Jackson class names (`StreamReadFeature.INCLUDE_SOURCE_IN_LOCATION`)
- OneTrust consent UUID: `3e132ab0-381e-4960-8ae2-d7e9a995f0f9`
- Rokt workspace token: `2353A87B`, account ID: `243`
- Bloomreach tracking ID: `6489`
- Medallia workspace: `383567`, form IDs: `47146`, `22006`
- reCAPTCHA Enterprise on login; `/_sec/verify` and `/_sec/cp_challenge/verify` as secondary challenge layer
- Error pages fall back to a 2009-era template with Coremetrics, FeedBurner, and HTTP (not HTTPS) asset URLs
