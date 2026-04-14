---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "Clearview AI — Teardown"
url: "https://clearview.ai"
company: "Clearview AI"
industry: "Professional Services"
description: "Facial recognition search engine for law enforcement and government agencies."
summary: "Two separate stacks: a Wix marketing site (Pepyaka server, wixstatic CDN) and a fully independent Cloudflare-hosted React SPA at app.clearview.ai built with Vite, React Router, and Ant Design. The app is invite-only with multi-factor authentication and LexisNexis credential verification. The marketing site runs 10 third-party trackers before any consent interaction. The app portal uses Datadog RUM and PostHog."
date: "2026-04-14"
time: "05:41"
contributor: "hayabhay"
model: "sonnet-4.6"
effort: "high"
stack: [Wix, React, Cloudflare, Vite, Ant Design, React Router]
trackers: [Google Analytics, Google Ads, Google Tag Manager, Microsoft Clarity, Bing UET, HubSpot Analytics, HubSpot Live Chat, LinkedIn Insight, UserWay, OneTrust, Datadog RUM, PostHog]
tags: [facial-recognition, law-enforcement, government, biometrics, surveillance, saas, on-premises, b2b, invite-only, lexisnexis]
headline: "Officers can share facial recognition results outside the platform -- recipients just check a consent box and hand over their contact info to view and export the matches."
findings:
  - "Officers can share facial recognition search results with anyone outside the platform via a link -- the only gate is a consent checkbox that collects the recipient's name and email for Clearview's CRM before showing matches and offering PDF export."
  - "Agencies pool private facial databases with each other through coalition_gallery_shares -- cross-agency data sharing is a built-in feature, with an is_coalition flag marking which search hits came from another agency's gallery."
  - "Login failures redirect users to LexisNexis Risk Solutions for credential resolution, but the routing code has a typo: the correct domain (lexisnexisrisk.com) fires when an error code exists, and a misspelled domain (lexisnexusrisk.com) fires when it doesn't."
  - "A defunct white-label product called Insight is still bundled in production, referencing insightcamera.com for branding -- a domain that no longer resolves -- alongside on-prem deployment endpoints that disable sharing and coalition features."
  - "The database grew from 40 billion images (DoD press release, March 2024) to 70+ billion (site copy, April 2026) -- roughly 40 million new scraped images per day, inferred."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

Clearview AI operates one of the better-known and more legally contested facial recognition platforms. The public-facing website is a Wix marketing site. The product itself lives at a completely separate domain -- app.clearview.ai -- on separate infrastructure. This report covers both.

## Architecture

The marketing site (clearview.ai / www.clearview.ai) runs on Wix's Pepyaka server stack with assets served from wixstatic.com and parastorage.com CDNs. Wix site ID: `46f41a8f-b7c6-40f8-a869-6940783ba81f`. The site has no custom backend beyond a Wix-hosted serverless function for cookie consent settings (`/_serverless/cookie-consent-settings-serverless/v1/cookie-banner-settings`). Of the 125 page-load requests on the homepage, only 4 are first-party.

The app portal (app.clearview.ai) is built on entirely different infrastructure. Cloudflare handles the edge (cf-ray headers, `__cflb` load-balancing cookie, wildcard TLS cert covering `*.clearview.ai`). The frontend is a React SPA built with Vite (fingerprinted, cache-busted bundles) using React Router for client-side navigation and Ant Design (`ant-*` class names throughout) for the component library.

Other infrastructure:
- `staging.clearview.ai` -- protected by Cloudflare Access; requires organizational auth to reach
- `docs.clearview.ai` -- 403, also protected
- `status.clearview.ai` -- redirects to `clearviewai.statuspage.io` (Atlassian Statuspage)
- `staticfiles.clearview.ai` -- public static asset hosting; accessible without auth

The marketing site TLS cert covers only `clearview.ai` and `www.clearview.ai` (issued via Wix). The app portal cert covers the full wildcard `*.clearview.ai` (issued via Cloudflare). Two different certificate authorities, two different operators.

## App Portal: Authentication and Access

The app is invite-only. There is no public registration path. `/app/signup` exists but requires an invite token from an authorized organization. `/app/invite/:token` handles invite redemption. Without a valid invite from an onboarded agency or company, the platform is inaccessible.

The authentication flow:
1. Email entered at `/app/login`
2. `POST /auth/determine_login_method` -- returns `{login_method, redirect_uri}`. Tested against government, commercial, and nonexistent email domains -- returns "email" for all, does not enumerate users or reveal SSO configurations.
3. `POST /auth/generate_login_token` -- generates one-time login token
4. Multi-factor authentication: supports email OTP, SMS OTP (`"Use SMS instead"` visible in login flow), and TOTP (authenticator app). Recovery codes also supported.
5. Session established: `x-clearview-session` cookie (HttpOnly, Secure, SameSite=Lax, 4-year expiry)

SSO is implemented: the bundle contains references to `sso_invite_code`, `sso_error`, and `redirect_to_identity_provider`. SSO appears to be an organization-level configuration, not available to arbitrary callers.

Role system visible in the client bundle: `Viewer` and `Manager` types are referenced, with `Viewer` role restricting certain image interaction behaviors (face rect detection differs by role). Additional roles likely exist server-side but are not present in the bundle.

Session status check available unauthenticated:
```
GET https://app.clearview.ai/auth/
-> {"logged_in": false}
```

CORS is properly locked: `Access-Control-Allow-Origin: https://app.clearview.ai` -- not wildcard.

## LexisNexis AVCC Integration

The app's routing module contains an error page at `/app/error/avcc/:errorCode` that auto-redirects users to LexisNexis Risk Solutions. The routing code:

```js
const bi = "clearview";
function mc(e) {
  return e
    ? `https://avcc.lexisnexisrisk.com/oops/${bi}/${e}`
    : `https://avcc.lexisnexusrisk.com/oops/${bi}`
}
```

There is a typo. When `errorCode` is present (truthy), the function uses the correct domain -- `lexisnexisrisk.com`. When `errorCode` is absent or falsy, it uses a misspelled domain -- `lexisnexusrisk.com` ("nexus" instead of "nexis"). The fallback case -- no specific error code, just a generic AVCC failure -- silently routes to a broken URL.

The redirect page shows both a `cvErrorCode` (Clearview's internal error) and an `errorCode` (the AVCC code), then counts down 10 seconds before redirecting. The `bi` ("clearview") constant embeds Clearview's identifier in the LexisNexis URL path, suggesting the integration is a named, configured relationship -- not a generic link.

AVCC is a LexisNexis Risk Solutions product. What it verifies is not stated in the code. Given Clearview's law enforcement customer base and the placement of AVCC errors in the authentication flow, it likely relates to credential or identity verification. When a user's AVCC check fails, Clearview exports the problem to LexisNexis for resolution rather than handling it internally.

## Share Feature: External Access to Results

Officers can distribute facial recognition search results to people who don't have Clearview accounts. The recipient URL takes the form:

```
https://app.clearview.ai/app/share/{shareId}?token={token}
```

The share route bypasses the authentication redirect entirely -- it is one of four paths excluded from the session check, along with verify_email, AVCC error, and setup. Unauthenticated visitors see a consent gate: they acknowledge terms and consent to be contacted by Clearview AI, providing their name and email (`guest_name`, `guest_email`). After consent, they can view the shared search results and export them as PDF.

The API backing this:
```
POST /api/guest_shared_searches_exports   (unauthenticated)
GET  /api/guest_shared_searches_exports/{id}
```

The feature is explicitly gated to cloud deployments only -- a runtime check in the routing code disables the share routes on on-premises instances. The practical effect: prosecutors, partner agencies, victims' families, or other third parties can receive facial recognition results via a link. The only gate is a checkbox and contact-info collection that feeds Clearview's own CRM.

## Gallery System: Private Databases and Cross-Agency Pooling

Beyond the web-scraped 70-billion-image database, agencies can maintain private, customized galleries -- mugshot repositories, custom watchlists, any facial database they choose to upload. The gallery system has several notable features visible in the client bundle:

**Coalition galleries (`coalition_gallery_shares`):** Agencies can share their private galleries with other agencies. When a search hits a result from a coalition gallery, the result carries an `is_coalition` flag. One agency formally requests access to another's gallery via `POST /api/v1/request_gallery_access`, optionally sharing their name, email, and phone as part of the request. This is the database network effect built into the product -- agencies contribute proprietary data and pool it with peers.

**Blind gallery (`gallery_data.blind`):** Items can be marked with a `blind` flag that hides the image download button and displays a "blind" indicator. Likely used for blinded lineup procedures (standard eyewitness identification practice) or privacy-protected individuals. Exact semantics not stated in the code.

**Deepfake detection (`image_authenticity.risky`):** Search results carry an `image_authenticity` object with a `risky` field that flags potentially manipulated or deepfake images. AI-powered authenticity checking is built into the result layer.

**Content moderation:** Users can report any search result via a flag form with three fields:
- `explicit` (boolean) -- adult content
- `csam` (boolean) -- Child Sexual Abuse Material
- `additional_comments` -- free text

The report is submitted with `blob_id` and `search_result_id`. This is content moderation for the web-scraped database -- the mechanism by which Clearview's own users flag inappropriate material in the 70-billion-image corpus.

**Sensitive images:** A `sensitive` flag on blob images controls certain display behaviors, distinct from the `blind` and `explicit` flags.

## On-Premises Deployment and the Insight White-Label

Clearview offers on-premises deployment -- not just cloud SaaS. Three endpoints handle on-prem setup:

```
POST /api/onprem_setup/check_setup
POST /api/onprem_setup/create_organization
POST /api/onprem_setup/invite_user
```

On-prem instances disable the share feature and coalition gallery features via runtime checks. The same codebase supports both deployment modes.

The codebase also supports multi-tenant theming. The `integration-utils.js` bundle defines two branded configurations: "Clearview AI" (the default) and "Insight." The Insight theme references `https://insightcamera.com/static/insightcamera/images/2.jpg` as its background image. The domain `insightcamera.com` no longer resolves -- DNS failure. Whether Insight was a defunct consumer product, an acquired company's product, or a white-label for a specific agency is not determinable from public evidence. The theme code is still present and active in the production bundle.

## Database Scale and Market Position

The marketing site (April 2026) claims "70+ billion facial images" -- "the world's largest facial network." A DoD Tradewinds press release from March 2024 quoted "over 40 billion images." The roughly 30 billion growth over approximately two years implies a sustained scraping rate on the order of 40 million images per day.

NIST accuracy claims from the site: 99.85% accuracy on a 12 million mugshot sample, 99.86% on a 1.6 million VISA border photo sample. The blog positions Clearview as #1 in the US for WILD (Webcam/In-the-wild, Low resolution, Degraded) facial recognition -- uncontrolled real-world environments.

Verified use cases and markets from the site:
- **Federal:** counter-narcotics, financial investigations, human trafficking, national security, counterterrorism, ISR (Intelligence Surveillance Reconnaissance), drone analysis
- **DoD/IC:** counterterrorism, counterintelligence, source vetting, spy identification, base security via CCTV, undercover asset identity management
- **Public safety:** child exploitation identification, exoneration, criminal investigation
- **Defense procurement:** DoD Tradewinds "Awardable" status (March 2024)
- **International:** Ukraine State Border Guard Service (confirmed, then folded into general success stories)

**JusticeClearview:** A separately branded product giving public defenders access to the same 70-billion-image database and search interface that law enforcement uses. Marketed as balancing the justice system -- defense attorneys get the same facial recognition capability as prosecution.

The privacy page at `/privacy-and-requests` publishes state-by-state opt-out mechanisms for 13 states: California, Colorado, Connecticut, Delaware, Illinois, Iowa, Kentucky, Minnesota, Montana, Nebraska, New Hampshire, Utah, Virginia. The Illinois opt-out is an automated webform (BIPA compliance). The DMCA section notes that photo subjects typically do not hold copyright in their own photos.

Press room: ACLU Illinois BIPA lawsuit settled. Inc. 5000 fastest-growing companies, #710 in 2025.

## Marketing Site Tracker Stack

Ten trackers fire on the marketing site homepage before any user interaction with the consent banner. Confirmed by the `OptanonConsent` cookie present in `document.cookie` on first load with `interactionCount=0` -- the OneTrust banner had rendered but received zero interactions before all tracking was underway.

| Tracker | Cookie(s) | ID |
|---|---|---|
| Google Analytics (GA4) | `_ga`, `_ga_KVBBX61L9Z` | G-KVBBX61L9Z |
| Google Ads / DoubleClick | `_gcl_au` | AW-10873001610 |
| Google Tag Manager | -- | GTM-W3DD9MS9 |
| Microsoft Clarity | `_clck`, `_clsk` | Tag ID 97010705 |
| Bing UET / Microsoft Advertising | `_uetsid`, `_uetvid` | Tag ID 97010705 |
| HubSpot Analytics | `__hstc`, `hubspotutk`, `__hssrc`, `__hssc` | Portal 6595819 |
| HubSpot Live Chat | -- | -- |
| LinkedIn Insight Tag | -- | -- |
| UserWay | -- | Account 36Lv6hmejZ, Widget 2750556 |
| OneTrust CMP | `OptanonConsent` | Tenant 6a79aefc-6805-4099-9b45-2276df4296c0 |

Clarity and Bing UET share tag ID 97010705 -- both Microsoft products, and the Clarity tag loads the UET pixel. HubSpot loads three separate scripts: analytics, live chat embed, and cookie banner.

UserWay (the accessibility widget) generates 42+ CDN requests per page load across three CDN origins: `api.userway.org` (28 requests), `cdn77.api.userway.org` (14 requests), and `cdn.userway.org`. The bulk are widget state polling calls to `GET /api/br-links/v0/links/2750556` and `GET /api/br-links/v0/contribute/2750556`.

OneTrust configuration: `PublisherCC: US`. Two rule sets -- "EU & Others" (GDPR-territory countries) and "Global." Both have `IsGPPEnabled: false` (no Global Privacy Platform signals) and `GCEnable: false` (Google Consent Mode not enabled). No IAB TCF signals.

On app.clearview.ai: Datadog RUM (app ID `f7eb1a24-7133-418f-9354-7db5a69f2ac1`) and PostHog (`__PosthogExtensions__` global). PostHog keys are not hardcoded -- they're fetched from backend configuration at runtime.

The app bundle also embeds a reference to DOJ Final Rule 2024-31486 -- the Executive Order 14117 implementation restricting data transactions with foreign adversaries. This appears in the app's compliance or terms context.

## Open Questions

**AVCC definition:** The LexisNexis AVCC product's full name and exact function are not stated in any evidence. Given the law enforcement context and auth placement, credential or identity verification for officers is the logical inference.

**Insight brand status:** insightcamera.com is dead. Whether Insight is defunct, white-labeled for a private on-prem deployment, or acquired cannot be determined from public signals.

**`gallery_data.blind` semantics:** The blind flag's exact operational meaning -- blinded lineup procedure, privacy-protected identity, or something else -- is not documented in the code.

**Backend framework:** Unknown. Nothing in the evidence identifies the server-side language or framework.

---

## Machine Briefing

### Access and Auth

The marketing site is fully public. The app portal (`app.clearview.ai`) requires an invite from an authorized organization. No public registration.

Two endpoints are accessible without authentication:

```bash
# Session status check
curl https://app.clearview.ai/auth/
# -> {"logged_in": false}

# Login method resolution -- does not enumerate users or SSO configs
curl -X POST https://app.clearview.ai/auth/determine_login_method \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com"}'
# -> {"login_method": "email", "redirect_uri": null}
```

The share route loads without auth:
```
GET https://app.clearview.ai/app/share/{shareId}?token={token}
```
Share IDs and tokens are distributed out-of-band by authenticated officers.

### Endpoints

**Unauthenticated:**
```
GET  https://app.clearview.ai/auth/                        -> {logged_in: false}
POST https://app.clearview.ai/auth/determine_login_method  -> {login_method, redirect_uri}
GET  https://app.clearview.ai/app/share/{shareId}          -> consent gate (HTML)
POST https://app.clearview.ai/api/guest_shared_searches_exports  -> 400 if malformed
GET  https://app.clearview.ai/api/guest_shared_searches_exports/{id}
POST https://app.clearview.ai/api/onprem_setup/check_setup
POST https://app.clearview.ai/api/onprem_setup/create_organization
POST https://app.clearview.ai/api/onprem_setup/invite_user
```

**Authenticated (session cookie `x-clearview-session` required):**
```
POST https://app.clearview.ai/api/v1/request_gallery_access
     -> 401 "session not found" without auth
```

**Marketing site Wix internals:**
```
GET https://www.clearview.ai/_api/v1/access-tokens
GET https://www.clearview.ai/_api/tag-manager/api/v1/tags/sites/46f41a8f-b7c6-40f8-a869-6940783ba81f
GET https://www.clearview.ai/_serverless/cookie-consent-settings-serverless/v1/cookie-banner-settings
    -> 403 without auth cookie
GET https://www.clearview.ai/_api/wix-code-app-registry-global/v1/public-code-config
    -> 200, returns {}
```

### Gotchas

- `POST /api/guest_shared_searches_exports` returns 400 "Operation get not found" for GET requests -- use POST.
- `/api/` itself returns 404 "Path not found".
- `/api/v2/` paths return 404 for most tested paths.
- Source maps are not exposed -- `.map` file requests return 404/400.
- `staging.clearview.ai` is behind Cloudflare Access -- you'll get an auth redirect, not the staging environment.
- `docs.clearview.ai` returns 403 directly.
- Wix XSRF token (`XSRF-TOKEN`) is set on first page load; Wix API calls likely require it.
- The `_serverless/cookie-consent-settings-serverless/...` endpoint requires a valid Wix session cookie or it returns 403.
