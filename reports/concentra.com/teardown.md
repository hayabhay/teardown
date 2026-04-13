---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "Concentra -- Teardown"
url: "https://concentra.com"
company: "Concentra"
industry: "Healthcare"
description: "Occupational health clinics and urgent care network across the US."
summary: "Sitecore Experience Accelerator with jQuery and Backbone.js, fronted by Cloudflare managed challenge. Self-hosted Matomo analytics across three instances (www, IR, campaign). TrustArc handles consent with implied consent for US visitors. Campaign and investor relations subdomains run Dynatrace RUM outside the consent framework entirely. SSO is Keycloak; patient portal is Epic MyChart."
date: 2026-04-12
time: "20:39"
contributor: hayabhay
model: "sonnet-4.6"
effort: medium
stack:
  - Sitecore XA
  - Cloudflare
  - Keycloak
  - Epic MyChart
  - Microsoft D365
trackers:
  - Matomo
  - TrustArc
  - Dynatrace
  - Google Maps
  - YouTube
  - Cloudflare RUM
  - D365 Marketing
tags:
  - healthcare
  - occupational-health
  - sitecore
  - matomo
  - dynatrace
  - trustarc
  - keycloak
  - consent
  - hipaa-adjacent
  - epic
headline: "Certificate transparency logs expose 124 Concentra subdomains — Splunk SIEM, PACS medical imaging, AKeyless secrets management, and GlobalProtect VPN."
findings:
  - "Dynatrace RUM fires on the campaign and investor relations subdomains with zero consent gating -- no Dynatrace domain appears anywhere in TrustArc's vendor list, so the framework has no mechanism to block it."
  - "Matomo is classified as Marketing (opt-in required) but fires immediately on every US visit under implied consent -- cookies are set before any banner interaction on a site that handles workers' comp and drug screening."
  - "Certificate transparency logs expose 124 subdomains including Splunk SIEM, AKeyless secrets management, PACS medical imaging, UltiPro HR, Citrix VDI, and Palo Alto GlobalProtect VPN."
  - "The primary employer lead-gen page ships two broken script references to /undefined in production, generating 404s on every page load."
  - "Keycloak's public OpenID configuration advertises the password grant type -- the resource owner credential flow deprecated in OAuth 2.1."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

Concentra is the largest occupational health company in the United States -- 625+ clinic locations, roughly 50,000 patient visits a day, and a recent IPO (NYSE: CON, first earnings call May 8, 2026). Their business is workplace medicine: injury treatment, drug screening, DOT physicals, fit-for-duty exams, and urgent care. Their web estate reflects the dual audience: employers who need occupational health programs, and patients who need to pay bills, access test results, or find a nearby clinic. That split is architectural -- the site runs across at least six distinct subdomains with different tech stacks, different consent configurations, and in some cases, different consent frameworks entirely.

---

## Architecture

The public marketing site (`www.concentra.com`) runs on **Sitecore Experience Accelerator (XA)**. The stack is unmistakable: script paths under `/-/media/base-themes/xa-api/scripts/` and `/-/media/base-themes/main-theme/scripts/`, `window.XA` in the global namespace, and the Sitecore search API pattern (`//sxa/search/results/`, `//sxa/search/facets/`, `//sxa/favsearch/favresults/`, `//sxa/searchitem/findnearest/`) in the network tab. Backbone.js and Bloodhound (typeahead) are both present as XA dependencies. jQuery is the DOM layer. MediaElement.js handles embedded video. jsPDF is loaded globally. Last confirmed site update: September 2025.

The campaign subdomain (`campaign.concentra.com`) is also Sitecore. It layers **Microsoft Dynamics 365 Marketing** on top for lead capture forms, loaded from `cxppusa1formui01cdnsa01-endpoint.azureedge.net` and posting to `public-usa.mkt.dynamics.com/api/v1.0/orgs/f0bc7527-24ff-409a-bf9a-7871ca6cdec7/`.

Payments (`payments.concentra.com`) is a separate application with a distinct CSP. It integrates **Biller Payments** (`sbjsco.billerpayments.com`, `jsco.billerpayments.com`) for processing. Three payment categories are offered: Workers' Comp Injury, Drug Testing/Non-Injury, and Urgent Care.

SSO runs on **Keycloak** at `sso.concentra.com`, realm `ConcentraCustomerPortal`. The patient-facing portal is **Epic MyChart** at `mychart.concentra.com/ConcentraMyChart/`. Telehealth is outsourced entirely to **eVisit** (concentratelemed.com, practice ID: `injurycareconnect`).

All public surfaces sit behind **Cloudflare** managed challenge -- curl and headless browsers without a valid browser fingerprint get a 403 with `cf-mitigated: challenge`. The site requests extensive client hints via `accept-ch`: UA architecture, bitness, model, platform version, and full version. Cloudflare RUM (`cf-rum` beacon) fires on both the homepage and location pages.

Security headers are well-configured on the main site: `cross-origin-embedder-policy: require-corp`, `cross-origin-opener-policy: same-origin`, `cross-origin-resource-policy: same-origin`, `x-frame-options: SAMEORIGIN`, `referrer-policy: same-origin`. The `permissions-policy` header explicitly disables `browsing-topics` and `interest-cohort` (Google's FLoC/Topics API), `geolocation`, `camera`, `microphone`, and `payment`.

---

## Consent Architecture

Consent is managed by **TrustArc** via `consent.trustarc.com`. The autoblock framework classifies vendors into three tiers:

- **Required Cookies** (value=0, always fire): concentra.com, consent.trustarc.com, payments.concentra.com, ir.concentra.com, campaign.concentra.com, cohri.net, maps.googleapis.com, and related CDN domains.
- **Functional Cookies** (value=1): app.quotemedia.com, hcaptcha.com, shared.equisolve.net, irdirect.net, static.cloudflareinsights.com.
- **Marketing Cookies** (value=2): matomo.concentra.com, googleads.g.doubleclick.net, doubleclick.net, youtube.com, i.ytimg.com.

On first load, the site sets `notice_behavior=implied,us` -- implied consent for US visitors. Under this behavior, all cookie tiers are released before any user interaction with the banner.

Two behavioral flags in the autoblockoptout.js config:

- `gpcEnabled: true`, `gpcConsentLevels: '0'` -- GPC signal only releases Required Cookies (level 0). Functional and Marketing vendors are not gated by GPC.
- `dntEnabled: false` -- Do Not Track is explicitly ignored.

The practical consequence: a US visitor who sends a GPC signal still has Matomo set immediately under implied consent. GPC does not override implied consent because it only governs level 0 -- and Matomo is level 2.

---

## Pre-Consent Tracking

On the main site, a fresh session with no prior cookies sets four cookies before any banner interaction:

- `_pk_id.3.4876` -- Matomo long-lived visitor ID
- `_pk_ses.3.4876` -- Matomo session cookie
- `TAsessionID=...NEW` -- TrustArc session
- `notice_behavior=implied,us` -- consent mode

Matomo (`matomo.concentra.com`) is classified as a Marketing cookie in the TrustArc config -- a category that should require opt-in under explicit consent regimes. Under implied consent for US visitors, it fires immediately.

Matomo is self-hosted and runs three separate site instances:
- **idsite=3**, trackerid `QcDBG9` -- www.concentra.com
- **idsite=6**, trackerid `9zrwIB` -- campaign.concentra.com
- **idsite=21**, trackerid `QetX0D` -- ir.concentra.com

The **HeatmapSessionRecording plugin** is loaded on both www and ir instances. Both currently show empty configuration arrays -- `{"heatmaps":[],"sessions":[]}` -- meaning the plugin is instrumented but no active heatmaps or session recordings are currently configured.

What's absent is as notable as what's present: no Google Analytics, no Meta/Facebook Pixel, no LinkedIn Insight Tag, no Google Ads conversion tracking on the main site. For an occupational health company operating under HIPAA, this is likely deliberate.

---

## Dynatrace: Outside the Consent Framework

**Dynatrace RUM** is active on both `campaign.concentra.com` and `ir.concentra.com`. It sets five cookies: `dtCookie` (session), `rxVisitor` (long-lived visitor ID), `rxvt` (visit timeout), `dtPC` (page context and performance data), and `dtSa` (session attributes). No Dynatrace domains appear anywhere in the TrustArc autoblockoptout.js vendor list. The consent framework has no entry for Dynatrace -- no category, no domain, no blocking mechanism.

On the campaign site, this matters more than on investor relations. The campaign page is the primary employer lead-generation surface. It hosts a D365 Marketing form that collects: `chs_companyname`, `chs_industrycategory`, `chs_numberofobservedemployees`, `chs_leadsourcereferralurl`, `chs_marketingleadsource`, and `chs_marketingroutingrules`. There's also a Sitecore RoutingForm collecting `FirstName`, `LastName`, `Company`, `Email`, `Phone`, `Zip`, and `Comments`.

Dynatrace RUM instruments JavaScript errors, page performance metrics, and user session interactions. Whether session replay (keystroke and interaction capture) is actively configured -- beyond RUM instrumentation -- cannot be determined from the outside. What is confirmed is that Dynatrace fires before, during, and after any form interaction on the campaign page with no consent gating of any kind.

The field prefix `chs_` in the D365 schema is a custom publisher prefix. This matches the `chs-` hostnames in certificate transparency logs -- likely a legacy entity name ("Concentra Health Services") or internal system name that predates the current branding.

---

## Campaign Site: Production Errors

The campaign site (`campaign.concentra.com`) generates two HTTP 404 errors on every page load: `GET /undefined` fires twice. These are broken JavaScript references where a variable holding a script URL is undefined at execution time. This is a production bug on the primary employer acquisition page -- scripts that should load do not.

---

## Infrastructure Exposure via Certificate Transparency

Certificate transparency logs show 124 subdomains registered under `concentra.com`. Notable entries by category:

**Internal tooling and security:**
- `admin.akeyless.concentra.com`, `akeyless.concentra.com`, `api.akeyless.concentra.com`, `apiv1.akeyless.concentra.com`, `hvp.akeyless.concentra.com` -- AKeyless secrets management platform
- `splunk-syslogdmz.concentra.com` -- Splunk SIEM in the DMZ
- `globalprotect.concentra.com` -- Palo Alto GlobalProtect VPN
- `citrixpilot.concentra.com` -- Citrix virtual desktop
- `zixone.concentra.com` -- Zix email encryption
- `ldaps.concentra.com` -- LDAP over SSL
- `fs.concentra.com` -- likely Active Directory Federation Services

**HR and internal applications:**
- `ultipro.concentra.com`, `ultiproreporting.concentra.com`, `ultiproweb.concentra.com` -- UltiPro/UKG HR platform
- `infolink.concentra.com` -- likely employee self-service
- `inside.concentra.com` -- intranet portal
- `surveys.concentra.com` -- internal survey system
- `referral-insights.concentra.com` (+ dev, test) -- referral analytics

**Medical systems:**
- `mychart.concentra.com` -- Epic MyChart patient portal
- `pacs.concentra.com`, `pacstest.concentra.com` -- PACS medical imaging (times out -- likely internal-only)

**Legacy / decommissioned:**
- `alumni-portal.concentra.com` (+ dev, stg, tst) -- DNS does not resolve; likely decommissioned

**Internal server naming:**
- `ch-prdrhvtibbc01.concentra.com`, `chs-intrhvtibbc01.concentra.com`, `chs-prdrhvtibbc01.concentra.com`, `chs-stgrhvtibbc01.concentra.com` -- internal server hostnames exposing the environment tier structure (prd/int/stg).

**GE reporting:**
- `ge-cb-prod.concentra.com`, `ge-rpt-prod.concentra.com` -- GE reporting systems (clinical or financial)

---

## SSO & Patient Portal

The Keycloak instance at `sso.concentra.com` serves the Concentra HUB customer portal. Its OpenID Connect discovery document is publicly accessible:

```
GET https://sso.concentra.com/realms/ConcentraCustomerPortal/.well-known/openid-configuration
```

The `grant_types_supported` array includes `password` (the resource owner password credential grant), `client_credentials`, `authorization_code`, `implicit`, `refresh_token`, `urn:openid:params:grant-type:ciba`, and `urn:ietf:params:oauth:grant-type:device_code`. The password grant is deprecated in OAuth 2.1. Its presence in the .well-known advertisement reflects Keycloak's default capability list -- whether any registered client has `direct_access_grants_enabled` configured is not externally determinable.

A staging SSO instance (`sso-stg.concentra.com`) is visible in CT logs and returns 403 via curl.

Epic MyChart is accessible at `https://mychart.concentra.com/ConcentraMyChart/Authentication/Login`. The Epic server responds with `x-epic-performance-metrics` headers. Login accepts MyChart Username or Epic ID. Account recovery is at `/ConcentraMyChart/Authentication/AccountRecovery`. FHIR endpoints (DSTU2 and R4 paths tested) return 404 -- not exposed at the paths checked.

The portal forgot-password page at `portal.concentra.com/forgotPassword` includes "Currently in server 3" in the page footer -- an internal load balancer artifact revealing the server naming scheme. Password reset responses are identical for valid and invalid email addresses (correct enumeration protection).

Drug screen portals linked from the main portal login include:
- `www.results-concentra.com/website/` -- Concentra Drug Screen Portal (timed out during investigation)
- `www.Myescreen.com/Concentra` -- CMCA eScreen Portal (third-party)
- `CMCAportal.concentra.com` and `cmca.concentra.com` -- redirect to /Account (separate .NET applications)

---

## Sitecore XA APIs

The location finder at `/urgent-care-centers/` drives three Sitecore XA search endpoints, all returning 200 in the browser session:

```
GET //sxa/search/results/?g={location}&o={open_hours}&a={services}&z={zoom}&l={limit}&p={page}
GET //sxa/search/facets/?...
GET //sxa/favsearch/favresults/?...
```

There is also a nearest-location API:
```
GET //sxa/searchitem/findnearest/?g={location_param}
```

When queried without the `g` parameter, the API returns: `"Value cannot be null. Parameter name: g"`. The expected format for `g` is not documented -- lat/lng pairs and city names were tested without success.

A site-wide search endpoint takes the site GUID as a parameter:
```
GET //sxa/search/results/?s={18150D45-C6D7-42A0-BD26-8D34BC971E3C}&q={query}
```

All Sitecore XA APIs require a valid Cloudflare browser session -- they are not accessible via curl.

---

## Machine Briefing

### Access & Auth

Cloudflare managed challenge blocks curl and headless browsers without valid browser fingerprinting. All meaningful API calls require a browser session with Cloudflare cookies (`__cf_bm`, `cf_clearance`). Use Playwright with a real browser profile to establish a session first.

Keycloak OpenID discovery is freely accessible:
```bash
curl https://sso.concentra.com/realms/ConcentraCustomerPortal/.well-known/openid-configuration
```

Epic MyChart login page is accessible without auth:
```bash
curl https://mychart.concentra.com/ConcentraMyChart/Authentication/Login
```

### Endpoints

**Open (no session required):**
```
GET https://sso.concentra.com/realms/ConcentraCustomerPortal/.well-known/openid-configuration
GET https://sso.concentra.com/realms/ConcentraCustomerPortal/protocol/openid-connect/certs
GET https://mychart.concentra.com/ConcentraMyChart/Authentication/Login
GET https://mychart.concentra.com/ConcentraMyChart/Authentication/AccountRecovery
GET https://matomo.concentra.com/matomo.js
GET https://consent.trustarc.com/notice?domain=concentra.com&c=teconsent&js=nj&noticeType=bb&gtm=1&pcookie&irmc=irmlink
GET https://consent.trustarc.com/autoblockasset/core.min.js?domain=concentra.com
GET https://public-usa.mkt.dynamics.com/api/v1.0/orgs/f0bc7527-24ff-409a-bf9a-7871ca6cdec7/landingpageforms/{formId}
```

**Requires browser session (Cloudflare-gated):**
```
GET https://www.concentra.com//sxa/search/results/?g={location}&l={limit}&p={page}
GET https://www.concentra.com//sxa/search/facets/?g={location}
GET https://www.concentra.com//sxa/favsearch/favresults/?g={location}
GET https://www.concentra.com//sxa/searchitem/findnearest/?g={location_param}
GET https://www.concentra.com//sxa/search/results/?s=18150D45-C6D7-42A0-BD26-8D34BC971E3C&q={query}
```

**Campaign form submission (requires CSRF token from page):**
```
POST https://campaign.concentra.com/api/sitecore/RoutingForm/HandleForm
  Fields: __RequestVerificationToken, FirstName, LastName, Company, Email, Phone, Zip, Comments

POST https://public-usa.mkt.dynamics.com/api/v1.0/orgs/f0bc7527-24ff-409a-bf9a-7871ca6cdec7/landingpageforsms
  D365 fields: chs_companyname, chs_industrycategory, chs_numberofobservedemployees,
               chs_leadsourcereferralurl, chs_marketingleadsource, chs_marketingroutingrules
```

### Gotchas

- `//sxa/searchitem/findnearest/` returns a .NET null reference error without the `g` parameter; accepted format for `g` is unresolved.
- Matomo's admin interface at `matomo.concentra.com` returns 500 -- not a login page, just broken. The tracker JS at `/matomo.js` is accessible.
- `sso-stg.concentra.com` is visible in CT logs but returns 403.
- The campaign site fires `GET /undefined` twice on load -- two broken script references that generate 404s before the page completes.
- Payment forms at `payments.concentra.com` have a strict CSP; third-party script injection won't work there.
- PACS imaging (`pacs.concentra.com`) and most internal tooling subdomains time out -- not publicly reachable despite having public SSL certs.
