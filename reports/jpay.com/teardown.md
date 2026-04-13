---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "JPay — Teardown"
url: "https://jpay.com"
company: "JPay"
industry: "Finance"
description: "Prison financial services — money transfers, messaging, payments for incarcerated people."
summary: "JPay runs on ASP.NET WebForms hosted on IIS with an F5 BIG-IP load balancer and WAF in front — a late-2000s stack for a captive financial platform serving families of incarcerated people, parole/probation payees, and correctional facilities across 43 states. The public site uses jQuery 3.5.1 with ASP.NET AJAX; the authenticated portal (secure.jpay.com) runs ASP.NET MVC 5 on a separate codebase. Owned by Aventiv Technologies (Platinum Equity), formerly Securus Technologies."
date: "2026-04-13"
time: "07:00"
contributor: "hayabhay"
model: "sonnet-4.6"
effort: "medium"
stack: [ASP.NET WebForms, IIS, F5 BIG-IP, jQuery, New Relic]
trackers: [Google Analytics 4, Google Ads Remarketing, New Relic Browser, Twitter Widget]
tags: [prison-tech, fintech, government-adjacent, captive-market, infrastructure-exposure, acquisition-artifacts, legacy-stack, surveillance]
headline: "Google Ads remarketing builds retargeting audiences from families of incarcerated people — no consent banner, no opt-out, no cookie notice anywhere on the site."
findings:
  - "downloads.jpay.com serves an open IIS directory listing exposing the prison kiosk deployment pipeline — production LDM client directories updated March 2026, JP5 tablet firmware, pilot state names, and a downloadable ebook catalog."
  - "The TLS certificate enumerates 31 subdomains including internal server names (terlb01, knoc01, vpndc01), an SFTP server, and machine-to-machine endpoints — the full internal service topology visible to anyone inspecting the cert."
  - "Google Ads remarketing builds retargeting audiences from visitors — primarily families of incarcerated people — with no consent mechanism anywhere on the site."
  - "Social handles point to Securus-branded accounts (@Securus_JPay) while Twitter meta tags still reference the original @JPay_com handle, and the video integration loads from securustech.net — an incomplete brand merger visible in both code and content."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

JPay is a financial and communications platform for the U.S. prison system — money transfers to incarcerated people, electronic messaging, video visitation, and parole/probation payments. It operates across 43 states and is wholly owned by Aventiv Technologies, a rebranding of Securus Technologies after acquisition by private equity firm Platinum Equity. The site is the primary interface for families sending money or messages to incarcerated relatives, and for people on supervision making court-ordered payments. It is, in the legal sense, a captive market.

## Architecture

The main site runs ASP.NET WebForms on IIS — confirmed by `__VIEWSTATE`, `WebForm_DoPostBack`, `ScriptResource.axd`, and `WebResource.axd` patterns throughout the HTML. JavaScript dependencies: jQuery 3.5.1 (loaded twice — once from local `/scripts/` and once from `code.jquery.com`, a redundant double-load), jQuery UI 1.12.1, and the ASP.NET AJAX `Sys` object with `$create` and `$addHandler`. Asset URLs carry a build version string: `?version=1_26_102_0303` and `1_26_102_0359`, indicating build `1.26.102` with two sequential build numbers across CSS and JS bundles.

An F5 BIG-IP appliance sits in front of the site, revealing itself via three cookies: `ASP.NET_SessionId` (domain: `www.jpay.com`, Secure, HttpOnly, SameSite=Lax), `BIGipServerJPAY_WWW_POOL` (server affinity), and `TS01a3fe4b` (F5 ASM/WAF session token). The BIG-IP WAF actively blocks direct API calls — `curl` and `fetch` requests to `AjaxBridge.aspx` endpoints without browser-matching headers return a WAF rejection page with a support ID. The `Server:` response header is suppressed entirely.

CORS is locked to a single origin: `Access-Control-Allow-Origin: https://secure.jpay.com` with `Access-Control-Allow-Credentials: true`. The CSP's `frame-ancestors` directive lists `'self' secure.jpay.com`, revealing the secure subdomain as a whitelisted frame origin — the authenticated experience is served from a separate subdomain and framed into the main site flow.

`secure.jpay.com` runs ASP.NET MVC 5.2 rather than WebForms — a different codebase and a newer framework, though still a decade-old Microsoft stack. Without an authenticated session from the main site, all routes on secure.jpay.com redirect to `/Error/ViewError`. Its CSP allows framing by `www.jpay.com` and `staging.jpay.com`.

`robots.txt`, `sitemap.xml`, `security.txt`, `humans.txt`, and `llms.txt` all 404.

## Infrastructure Exposure

Three independent signals combine to show more internal infrastructure than intended.

### TLS Certificate Subdomain Map

The TLS certificate Subject Alternative Names enumerate 31 hostnames — the full internal service topology:

| Subdomain | Type |
|-----------|------|
| terlb01.jpay.com, terlb.jpay.com | Load balancer nodes |
| tersrvtcs.jpay.com | Internal server (inferred: TeleCore Services) |
| knoc01.jpay.com | Network operations center node |
| vpndc01.jpay.com | VPN datacenter node |
| m2m.jpay.com | Machine-to-machine / device endpoint |
| ldm.services.jpay.com | Local Device Manager — tablet/kiosk management |
| kiosk.services.jpay.com | Kiosk services endpoint |
| android.services.jpay.com, ios.services.jpay.com | Mobile app services |
| wifi.services.jpay.com | In-prison WiFi services |
| sftp.jpay.com | SFTP file transfer server |
| unityservices.jpay.com, unityares.jpay.com | Unity integration services |
| jpaytelecore.jpay.com | Video visitation integration (see below) |
| logviewer.jpay.com | Internal log viewer |
| cs.jpay.com, cs.services.jpay.com | Customer service endpoints |
| staging.jpay.com | Staging environment |
| blog.jpay.com, forum.jpay.com | Legacy community (non-responsive) |
| cdna.jpay.com | CDN/asset delivery |
| ftp.jpay.com | FTP server |
| facility.jpay.com | Facility staff portal (see below) |
| secure.jpay.com | Authenticated user portal |
| offers.jpay.com | Marketing landing page |
| downloads.jpay.com | Software distribution (see below) |

The inclusion of internal server names — `terlb01`, `knoc01`, `vpndc01` — in a public TLS cert maps the internal infrastructure. The `m2m` endpoint and `wifi.services` subdomain indicate JPay operates device management and in-prison WiFi beyond the web application.

### downloads.jpay.com — Open Directory Listing

`downloads.jpay.com` returns an IIS directory listing at its root with no authentication required:

```
 3/31/2026  5:26 PM   <dir>  _Prod-Kiosk-LDM-clients/
 3/26/2026  4:10 PM   <dir>  _QA-Kiosk-LDM-clients/
 3/22/2016  9:29 AM   <dir>  aspnet_client/
 3/22/2016  9:15 AM   <dir>  DotNetInstall/
 9/29/2021 11:49 AM   <dir>  ebooks/
 5/15/2019  9:32 AM   <dir>  Education/
 2/18/2019  3:31 PM   <dir>  JP5 Firmware/
  8/6/2021  2:23 PM   <dir>  KioskScreen/
  3/6/2018 10:56 AM   <dir>  Marketing Images/
 3/22/2016  9:17 AM   <dir>  Ohio Pilot Only/
 7/13/2018  9:27 AM   <dir>  PrinterDrivers/
 3/22/2016  9:17 AM   <dir>  VA Pilot/
```

Most directories return 401 on entry. Two are fully accessible without credentials:

**`/ebooks/`** — Seven directories (Gutenberg IDs: 20772, 23682, 24931, 26975, 27327, 28730, 29057) plus a `web.config`. These are the Project Gutenberg EPUBs available on JPay tablets — public domain titles distributed through the same server as the production kiosk software.

**`/KioskScreen/`** — A single HTML page wrapping a `KioskScreen.png` image at full width. A screenshot of the JPay kiosk interface, publicly accessible.

The directory names tell the infrastructure story even where the contents are protected: `_Prod-Kiosk-LDM-clients/` and `_QA-Kiosk-LDM-clients/` indicate a Local Device Manager (LDM) distribution system for kiosk software deployed in facilities. The production directory was updated 3/31/2026 — actively maintained. `JP5 Firmware/` confirms JPay distributes firmware for the JP5 in-cell tablet through this server. `Ohio Pilot Only/` and `VA Pilot/` (both from 2016) document early deployment pilots by state. `DotNetInstall/` and `aspnet_client/` (both March 2016) are relics of the initial IIS deployment. This server has been running in this configuration for a decade.

### jpaytelecore.jpay.com — Accidental Default Page

`jpaytelecore.jpay.com` is a live, publicly accessible subdomain that serves the unmodified Microsoft Visual Studio ASP.NET MVC project scaffold — the template that Visual Studio generates when you click "New Project":

- A Bootstrap carousel cycling three slides: "Learn how to build ASP.NET apps", "There are powerful new features in Visual Studio", and "Learn how Microsoft's Azure cloud platform..."
- Links to `go.microsoft.com/fwlink/` learn resources for ASP.NET Core, NuGet, and Azure deployment
- Sections titled "Application uses", "How to", "Overview", and "Run & Deploy" with Microsoft documentation links

The title tag is `JPay Telecore - JPayTelecore` — so the application was named and deployed — but the homepage was never replaced with actual content. In the `<head>`, before any of the scaffold content loads, two scripts are fetched from Securus's production video infrastructure:

```
https://ngsvcjvideovisitation.securustech.net//jptds/include/telecore/core/api-front/telecore-2.0.0.js
https://ngsvcjvideovisitation.securustech.net//jptds/include/telecore/core/api-front/recplayer/js/videoplayer.js
```

The Securus TeleCore video visitation system is loaded and initialized on every page load of this default template. The double slash in the path (`//jptds/`) is a URL encoding artifact. This is production Securus infrastructure serving JPay's video integration, wrapped in an application that was never finished.

## Surveillance

Three trackers fire on the homepage immediately — no consent banner exists, and no consent management infrastructure is present anywhere on the site.

**New Relic Browser (version 1.312.1 PROD)** — Full error tracking, AJAX monitoring, and session instrumentation. Configuration embedded inline in every page's `<head>`:

```json
{
  "beacon": "bam.nr-data.net",
  "errorBeacon": "bam.nr-data.net",
  "licenseKey": "NRJS-cfb7c6a88f137c6854a",
  "applicationID": "394194688",
  "accountID": "2860417",
  "trustKey": "2860417"
}
```

The facility portal uses the same license key with a different applicationID: `394189989`. The browser-exposed license key and application/account IDs are consistent across the entire JPay property.

**Google Analytics 4** (measurement ID: `G-9P53RQWRG1`) — fires via `gtag` on page load. No conditional loading, no consent gate. Standard GA4 with `dataLayer` initialized on every page.

**Google Ads Remarketing** (conversion ID: 964322157) — a separate pixel loaded via `JPay.Remarketing.Pixel.js`:

```javascript
var google_conversion_id = 964322157;
var google_custom_params = window.google_tag_params;
var google_remarketing_only = true;
```

This is a remarketing-only pixel: it fires to `googleads.g.doubleclick.net` with `google_remarketing_only: true`, meaning its sole purpose is building a Google Ads audience list from visitors. The `google_tag_params` field allows passing custom audience segmentation parameters back to Google's ad platform. JPay is building retargeting audiences from people visiting a prison financial services site.

**Twitter Widget** — `twitter-widget.min.js` loads and fires a settings call to `syndication.twitter.com/settings`. The actual content it was supposed to serve — a Twitter feed cached at `/content/twitterJson.aspx` — returns an empty body. The Twitter API v1.1 integration is dead, but the widget SDK still initializes and contacts Twitter on every page load.

## Securus/Aventiv Acquisition Artifacts

JPay was acquired by Securus Technologies, which subsequently rebranded under parent company Aventiv Technologies (Platinum Equity). The merger left inconsistencies throughout the public-facing site:

- The homepage footer reads "JPay an Aventiv company"
- The Twitter nav link points to `https://x.com/Securus_JPay`
- The Facebook nav link points to `https://www.facebook.com/SecurusJPay/`
- The `<meta name="twitter:site" content="@JPay_com">` tag still references the original JPay handle
- `jpaytelecore.jpay.com` loads video JS from `ngsvcjvideovisitation.securustech.net` — Securus production infrastructure
- A footer link points to `www.securusconnects.com` (Securus community platform)
- An 80+ meta tag inventory includes stale geo and contact fields: `og:email`, `og:phone_number`, `geo.lmk` (physical address: `3450 Lakeside Dr, Suite 100, Miramar, FL 33027`)

The brand merge is incomplete. The infrastructure merge, by contrast, appears underway: the TeleCore video integration and jpaytelecore domain suggest backend systems have migrated to Securus infrastructure while the frontend JPay identity persists.

## Facility Staff Portal

`facility.jpay.com` is a distinct application for correctional facility administrators. It uses a separate F5 pool (`BIGipServerJPAY_FACILITY_POOL`) and a separate New Relic application ID (394189989). The login form presents three credential fields:

- **Customer Username** — text input (`ctl00$MainContent$uUsername`)
- **Pin Code** — 4-character password input (`ctl00$MainContent$uPin`), `AutoComplete="off"`
- **Password** — full-length password input (`ctl00$MainContent$uPassword`), `AutoComplete="off"`

The page is ASP.NET WebForms (same tech as the public site, not MVC). It shares the same New Relic license key as the public site but is tracked as a separate application — the account hierarchy is single-account (accountID 2860417) with multiple applications.

## Stack Age

The public site's HTML carries a `<meta name="revised">` tag timestamped `Wednesday, March 23, 2022, 12:14 pm`. The meta tag inventory runs to 80+ entries, including deprecated directives: `<meta name="skype_toolbar" content="skype_toolbar_parser_compatible">`, `<meta name="slurp" content="NOYDIR">` (Yahoo SLURP bot directive, deprecated circa 2010), and `<meta name="msapplication-*">` (Windows 8 live tile pinning). The `offers.jpay.com` subdomain uses an XHTML Transitional doctype — a format effectively retired after 2008.

The `jpayhelp.com` help site, by contrast, runs Next.js on Vercel with Builder.io CMS, OneTrust consent management, and Algolia search — a fully modern managed stack. The support experience and the transaction experience run on completely different technology generations.

## Machine Briefing

### Access & Auth

The main site is accessible via `curl` or `fetch` for page loads, but the F5 BIG-IP WAF blocks requests to internal API endpoints (`AjaxBridge.aspx`) without a proper browser session and matching headers. For authenticated actions, a session must be established via `login.aspx` with valid JPay credentials. The `secure.jpay.com` subdomain redirects all routes to `/Error/ViewError` without an authenticated session originating from the main site login flow.

CORS enforcement is strict: only `https://secure.jpay.com` is whitelisted for credentialed cross-origin requests. Direct API calls will fail without browser-matching headers.

### Endpoints

**Open (no auth required):**

```
GET  https://jpay.com/                          # Public homepage
GET  https://jpay.com/PAvail.aspx               # Service availability & pricing (43 states)
GET  https://jpay.com/MakePayment.aspx          # Parole/probation payment lookup
GET  https://jpay.com/login.aspx                # Login/signup
GET  https://jpay.com/FriendsFamily.aspx        # Friends & family services
GET  https://downloads.jpay.com/                # Open IIS directory listing
GET  https://downloads.jpay.com/ebooks/         # Ebook catalog directory
GET  https://downloads.jpay.com/ebooks/20772/   # Individual ebook directory
GET  https://jpaytelecore.jpay.com/             # Default ASP.NET scaffold page (loads TeleCore JS)
```

**AJAX bridge (WAF-protected, requires browser session):**

```
POST https://jpay.com/AjaxBridge.aspx/GetStates
Content-Type: application/json
# Returns state list for inmate search dropdown
# WAF rejects without browser-matching User-Agent and session cookies
```

**Availability/pricing (requires browser session, WebForms callbacks):**

```
# PAvail.aspx uses WebForm_DoCallback for on-demand state/agency pricing load
# No clean REST endpoint; data loads via ASP.NET treeview callbacks
POST https://jpay.com/PAvail.aspx
# With __VIEWSTATE, __VIEWSTATEGENERATOR, __EVENTVALIDATION, __CALLBACKID, __CALLBACKPARAM
```

**Facility portal:**

```
GET  https://facility.jpay.com/                 # Redirects to login
POST https://facility.jpay.com/                 # Login (requires username + PIN + password)
```

**Dead endpoints:**

```
GET  https://jpay.com/content/twitterJson.aspx  # Returns empty body — Twitter API integration dead
```

### Gotchas

- **WAF is aggressive**: Direct API calls to `AjaxBridge.aspx` without a full browser session return a WAF rejection page. You need `ASP.NET_SessionId`, `BIGipServerJPAY_WWW_POOL`, and `TS01a3fe4b` cookies plus a realistic `User-Agent`.
- **`__VIEWSTATE` is required**: All form submissions and AJAX callbacks require the ViewState token from the current page. These are large base64 blobs; extract from the page HTML before posting.
- **`AjaxBridge.aspx` path routing**: The `/GetStates` suffix is a WebForms method routing convention, not a REST path — the endpoint is `AjaxBridge.aspx` with the method in the path.
- **`secure.jpay.com` is a black box without credentials**: All routes return `/Error/ViewError`. No enumerable API surface without a valid session.
- **No pagination on observed API responses**: `GetStates` returned a complete state list in a single response; no pagination evident.
- **New Relic is instrumented everywhere**: Every request to jpay.com and facility.jpay.com sends timing and error data to `bam.nr-data.net`. If you're automating against this site, assume every JS error or unusual timing pattern is logged.
