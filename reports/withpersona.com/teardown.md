---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "Persona — Teardown"
url: "https://withpersona.com"
company: "Persona"
industry: "Professional Services"
description: "B2B identity verification platform for KYC, document scanning, and compliance workflows."
summary: "Persona's marketing site runs on Astro 5 via Cloudflare Pages, split across two separate CF Pages projects — withpersona.com for HTML and marketing-website-dfh.pages.dev for JavaScript assets. The operator dashboard is a React SPA at app.withpersona.com; the B2C verification flow runs at inquiry.withpersona.com. API docs are hosted on Fern via Vercel. Error tracking via Sentry (two projects), RUM via Datadog on the dashboard, payments via Stripe."
date: 2026-04-16
time: "04:19"
contributor: hayabhay
model: "sonnet-4-6"
effort: high
stack: [Astro, React, Cloudflare Pages, Vercel, Sentry, Datadog, Stripe]
trackers: [Google Analytics 4, Segment, GTM, Hotjar, Marketo, Clearbit Reveal, Unify, Clay, Qualified, CommonRoom, StackAdapt, PostHog, Amplitude, LinkedIn Insight, Meta Pixel, Reddit Ads, X Ads, Bing Ads, Pendo]
tags: [identity-verification, kyc, b2b-saas, consent-gap, surveillance, clearbit, segment, astro, cloudflare, privacy]
headline: "Persona's inquiry bundle ships its entire verification supply chain — Equifax, Chainalysis, Nova Credit, FINRA, and 12 more data partners named in client-side JavaScript."
findings:
  - "The inquiry.withpersona.com JavaScript bundle exposes Persona's full data partner graph through ReportTemplate type names: Equifax Oneview, Chainalysis, Coinbase, Nova Credit (two products), MX, Middesk, Kyckr, FINRA, BBB, Clearbit, and custom watchlist integrations — the complete verification supply chain in client code."
  - "A function named runScriptsWithCookiesAllowed() loads GTM, GA4, and Segment on every page view with no conditional check — the consent gate exists only in the function name, not the code. No Google Consent Mode initialization appears before GTM loads."
  - "docs.withpersona.com runs PostHog with session recording and a Segment-to-Amplitude pipeline with no consent banner at all — every developer browsing the API docs is tracked without being asked."
  - "Segment routes visitor data to 10 downstream destinations including Clearbit Reveal for IP-to-company de-anonymization — any enterprise evaluating Persona's product is identified by company before clicking anything."
  - "An unauthenticated endpoint at /api/internal/dashboard/v1/version returns the current deploy's git commit hash, matching the Sentry release ID in the dashboard bundle."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

Persona sells identity verification — government ID scanning, selfie matching, KYC/AML, liveness detection — to companies like LinkedIn, OpenAI, Twilio, Etsy, Lyft, and Ripple. Their B2C verification flow ships the full partner graph in client-side JavaScript. Their marketing site loads analytics unconditionally through a function whose name claims otherwise. Their API docs record developer sessions with no consent prompt. And their Segment pipeline identifies visiting companies by IP before anyone fills out a form.

## Architecture

The marketing site runs on **Astro 5.18.1** deployed to Cloudflare Pages. It's split across two separate CF Pages projects: `withpersona.com` serves the HTML and `marketing-website-dfh.pages.dev` serves JavaScript assets, including a central analytics orchestration script (`marketingheaderscript.js`). Animations use GSAP 3.14.2 and dotlottie/Lottie via jsDelivr CDN.

The operator dashboard lives at `app.withpersona.com` — a React SPA with a custom backend API. The B2C verification flow runs at `inquiry.withpersona.com` — a separate React SPA. API documentation is hosted at `docs.withpersona.com` via Vercel and Fern.

Other active subdomains: `cdn.withpersona.com` (GCS-backed asset CDN, CORS: `*`), `files.withpersona.com` (file uploads), `help.withpersona.com`, `academy.withpersona.com`, and `copilot.withpersona.com` (returns 401 — GCP-hosted, auth-gated AI agent feature). The dashboard bundle references `agentConversationId`, `agentType`, `agentVersionId`, and streaming tool call permissions — an AI copilot is in the product.

A staging environment exists at `withpersona-staging.com`, with subdomains for app, CDN, and files. The CDN subdomain (`cdn.withpersona-staging.com`) serves from Google Cloud Storage with wildcard CORS (`access-control-allow-origin: *`) but denies bucket-root access (403 AccessDenied).

SSL SANs include `*.ingress.withpersona.com` — a wildcard pattern consistent with Kubernetes ingress routing.

**Infrastructure:**
- CDN/WAF: Cloudflare with aggressive bot challenge — curl returns 403 with `cf-mitigated: challenge`
- Error tracking: Sentry, two projects — marketing/dashboard (org `175220`, release `14baaf9d9c067f0deb824c856aa07775ca56f6c1`) and inquiry (project `5579484`)
- RUM: Datadog on dashboard (app ID `4e8f42a5-3e64-4221-afe0-8ff6e57a19d8`, client token `pubc7893d2a3771850ddf094d3d8a63c535`)
- Payments: Stripe.js v3
- Maps: Google Maps in dashboard bundle (key `AIzaSyC3xuGg4MTspY8OrwSlRFPY2lGDYOJWd5g`)
- reCAPTCHA on dashboard login: site key `6Lfmx2osAAAAAHL8ID0oSMVsrDeyCVfKlYUogOc1`
- Dashboard SSO: Google, Okta, OneLogin, SAML

Security headers are strict: `cross-origin-embedder-policy: require-corp`, `cross-origin-opener-policy: same-origin`, `cross-origin-resource-policy: same-origin`. The `permissions-policy` header explicitly disables camera, microphone, geolocation, payment, and 10 other browser APIs.

## The Verification Partner Graph

The B2C verification flow at `inquiry.withpersona.com` ships the full Persona platform in one JavaScript bundle (`inquiry-BpwkToPF.js`). Every data lookup integration Persona supports is named through `ReportTemplate` type strings in the client code — the complete verification supply chain, visible to anyone who reads the bundle.

**Credit and identity:**
- `ReportTemplateEquifaxOneview` — Equifax credit and identity verification

**Business verification:**
- `ReportTemplateClearbitBusinessLookup` — Clearbit company data
- `ReportTemplateKyckrBusinessLookup` — Kyckr business registry lookup
- `ReportTemplateMiddeskBusinessLookup` — Middesk business verification
- `ReportTemplateBetterBusinessBureau` — BBB business check

**Financial and crypto compliance:**
- `ReportTemplateChainalysisAddressScreening` — Chainalysis crypto sanctions screening
- `ReportTemplateCoinbaseCheckCryptoRisk` — Coinbase crypto risk assessment
- `ReportTemplateNovaCreditCashAtlas` — Nova Credit income verification
- `ReportTemplateNovaCreditCreditPassport` — Nova Credit immigrant credit history
- `ReportTemplateMxAccount` — MX bank account data aggregation
- `ReportTemplateFinraBrokerCheck` — FINRA broker compliance check

**Compliance and watchlists:**
- `ReportTemplateAdverseMedia` — adverse media screening
- `ReportTemplatePoliticallyExposedPerson` — PEP screening
- `ReportTemplateCustomList` — custom operator watchlists
- `ReportTemplateBusinessWatchlist`, `ReportTemplateCryptoAddressWatchlist`

**Data lookups:**
- `ReportTemplateEmailAddress`, `ReportTemplatePhoneNumber`, `ReportTemplateAddressLookup`

**Business intelligence** categories in the bundle cover online presence, social media, industry classification, liens, registrations, personnel insights, media coverage, nonprofit status, and enforcement actions.

Document scanning uses Microblink BlinkID in three versions (`6-0-1`, `6-0-1-lightweight`, `6-7-2`). Facial analysis uses face-api.js with the `face_landmark_68_tiny_model_v2` landmark model, with WebGL/WASM fallback. Liveness detection is built in.

This is a map of what the platform can do, not what every operator enables. Each operator configures which checks to run per their template. But the full catalog is in the client bundle for anyone to read.

## The Consent Architecture Problem

Persona runs Osano as its consent management platform (cookie ID `16A2wbUC984py8tcH`, config `c49963e3-512f-42d0-8156-efdf6118723a`). On a fresh visit, Osano defaults to Essential = ACCEPT, all others DENY. The design implies analytics and marketing scripts wait for consent.

The implementation doesn't match the design.

The central analytics script — `marketingheaderscript.js` hosted at `marketing-website-dfh.pages.dev` — contains a function named `runScriptsWithCookiesAllowed()`. The name implies consent gating. The call site is unconditional:

```javascript
// These third party tools require cookies to be explicitly allowed
function runScriptsWithCookiesAllowed() {
  // Google Tag Manager
  (function (w, d, s, l, i) {
    w[l] = w[l] || [];
    w[l].push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
    // ... loads GTM-TTVF7JQ
  })(window, document, 'script', 'dataLayer', 'GTM-TTVF7JQ');

  // GA4
  gtag('config', 'G-Q92N31LEWJ');

  // Segment
  analytics.load('SuUPhftAo6g2fi1wSBYy601B39BuMiOR');
  analytics.page();
}

runScriptsWithCookiesAllowed();  // no conditional, no consent check
```

GTM (`GTM-TTVF7JQ`), GA4 (`G-Q92N31LEWJ`), and Segment (write key `kKAIMx2JyypE5hiikb1tsGdBaOO8A0DM`, source key `SuUPhftAo6g2fi1wSBYy601B39BuMiOR`) are all initialized on every page load. Whether network requests actually fire before consent depends on Osano intercepting script injection at the DOM level — the application code implements no consent check. There is no Google Consent Mode initialization (`gtag('consent', 'default', ...)`) before GTM loads, a gap in GDPR implementation.

The comment in the source reads "These third party tools require cookies to be explicitly allowed." That describes intent, not execution.

Osano's event listener in the same script fires after consent is saved. It handles Marketo cookie deletion on MARKETING DENY and UTM parameter storage on ANALYTICS ACCEPT. The CMP handles downstream cleanup but not pre-loading prevention.

On a fresh session with no consent interaction, pre-consent network traffic is limited: Sentry error tracking (`POST /api/4508775074496512/envelope/` to `o175220.ingest.us.sentry.io`), Lottie animation JSON, and CF Pages JS assets. Sentry fires pre-consent, classified as "essential" by Osano.

Post-consent (Accept All), the full stack loads through GTM and Segment:
- **Hotjar** (ID `3819523`) — screen recording and heatmaps, injected via GTM
- **Marketo Munchkin** (ID `804-WQF-575`) — lead tracking
- **Clay** (workspace `cEQbiYM8GC`, UUID `1efa3680-9917-6c00-ab68-068ec4d5c9bd`) — sales automation. Currently `active: false` in the Clay workspace config.
- **Qualified** (chat ID `JCdhyycpqL2HL42z`) — fires visitor events every ~30 seconds
- **Unify** (`api.unifyintent.com`) — B2B intent data tracking
- **StackAdapt** — conversion pixel with browser fingerprinting

Microsoft UET (`window.uetq`) is handled correctly: Osano calls `window.uetq.push('consent', 'default', { ad_storage: 'denied' })` to set default-denied state.

### The Docs Site: No Consent at All

`docs.withpersona.com` runs a separate analytics stack with no consent banner. The Fern-hosted docs site loads PostHog (project key `phc_yQgAEdJJkVpI24NdSRID2mor1x1leRpDoC9yZ9mfXal`) with dead-click autocapture and session recording, and a Segment pipeline (write key `yp9ScATHotSRCteDta8Q8FfS8KgyFXSR`) routing to Amplitude. Every developer browsing the API docs has their session recorded and behavior sent to Amplitude without a consent prompt.

## The B2B Surveillance Stack

Persona's Segment source (`SuUPhftAo6g2fi1wSBYy601B39BuMiOR`) routes to 10 downstream destinations, confirmed via the Segment CDN settings API:

| Destination | Purpose |
|---|---|
| Actions Amplitude | Product analytics |
| Webhooks | Internal pipelines |
| **Clearbit Reveal** | IP-to-company de-anonymization |
| Google Tag Manager | Tag orchestration |
| Actions Google Analytics 4 | Web analytics |
| Testing 2 (Persona - Production) | Internal testing pipeline |
| Linkedin Audiences | LinkedIn retargeting |
| StackAdapt Cloud (Actions) | Programmatic B2B ads |
| Reddit Conversions API | Reddit retargeting |
| LinkedIn Conversions API | LinkedIn conversion tracking |

**Clearbit Reveal** identifies the company, industry, and firmographic profile of every website visitor by IP address — before any form submission. Any enterprise visiting withpersona.com to evaluate the product is identified and logged before clicking anything.

The full post-consent GTM stack compounds this:

- **Unify** (`api.unifyintent.com`) — B2B intent data platform. Tracks anonymous enterprise visitors and enriches with firmographic data.
- **Clay** (`api.claydar.com`) — sales automation. Tracks form fills, button clicks, and downloads. Currently inactive (`active: false`).
- **Qualified** — fires sales chat events every 30 seconds, building a behavioral profile per session.
- **CommonRoom** — community analytics linking visitor data across touchpoints.
- **StackAdapt** — programmatic B2B advertising with browser fingerprinting for retargeting.

Advertising pixels round out the stack: Meta (`_fbc`, `_fbp`), LinkedIn Insights (`bcookie`, `lidc`, `UserMatchHistory`), Reddit (`_rdt_uuid`), X Ads (`personalization_id`, `guest_id`), Google Ads, and Bing Ads (`MUID`, `_uetmsclkid`, `_uetsid`, `_uetvid`).

The cookie policy (last updated December 2025) discloses these trackers and includes: "Some of the data disclosures to these third parties may be considered a 'sale' or 'sharing' of personal information as defined under the laws of California."

Not disclosed in the cookie policy: PostHog on `docs.withpersona.com` (no policy or CMP there), and Amplitude as a Segment downstream destination (not listed separately).

The in-product dashboard (`app.withpersona.com`) runs its own analytics: Pendo (`_pendo_visitorId`, `pendo_identity`, `_pendo_accountId`) for in-product analytics and messaging, and Qualified for sales chat.

## Relay

Persona announced **Relay** prominently on the homepage during this investigation — positioned as privacy-preserving eligibility verification. The pitch: cryptographic separation where the verification happens independently from the gated service. Persona claims "no single party, including Persona, can reconstruct the relationship between a person's information and the website requesting verification." Use cases include humanness detection, age assurance, and delegated KYC.

Relay was invite-only (early access) with no public technical spec or whitepaper. The cryptographic claim is strong and unverifiable without implementation details.

## Open Endpoints

**Unauthenticated version endpoint:**
```
GET https://withpersona.com/api/internal/dashboard/v1/version
-> 8e399617dfe363ebb3f45d0a749bc42d397fca8d
```
Returns the current deploy's git commit hash with no authentication. The value matches the Sentry release ID in the dashboard bundle (`dashboard-mz90tCK3.js`, 5.9MB). Source maps for the bundle return 404.

All other `/api/internal/dashboard/v1/*` routes return:
```json
{"errors":[{"status":404,"title":"Invalid route","details":"Invalid route: ..."}]}
```
The error schema confirms the internal routing structure.

**Clay workspace config (public):**
```
GET https://api.claydar.com/bp/cEQbiYM8GC/settings
-> {"workspace_uuid":"1efa3680-9917-6c00-ab68-068ec4d5c9bd","active":false,
    "settings":{"features":{"formTracking":true,"clickTracking":true,
    "downloadTracking":true,"errorCapture":false},...}}
```

**Segment CDN settings (public):**
```
GET https://cdn.segment.com/v1/projects/SuUPhftAo6g2fi1wSBYy601B39BuMiOR/settings
-> integrations list (see Surveillance section)
```

## Machine Briefing

**Access & auth**

`withpersona.com` — Cloudflare with bot challenge. curl returns 403 with `cf-mitigated: challenge`. Use a real browser or Playwright. The marketing JS assets at `marketing-website-dfh.pages.dev` are curl-accessible without a challenge.

`app.withpersona.com` — React SPA. Requires account registration (email + reCAPTCHA). 60-day free trial with test data; production access requires approval. SSO options: Google, Okta, OneLogin, SAML.

`inquiry.withpersona.com` — verification flow. Requires a `template-id` query parameter set by an operator. Without it: "This application is misconfigured — template-id is blank."

`docs.withpersona.com` — no auth. Fern-hosted Next.js, rendered client-side.

`copilot.withpersona.com` — 401 Unauthorized. GCP/Google Frontend server. Auth-gated.

**Endpoints — open, no auth**

```bash
# Current deploy commit hash
curl https://withpersona.com/api/internal/dashboard/v1/version
# -> 8e399617dfe363ebb3f45d0a749bc42d397fca8d

# Segment pipeline destinations
curl https://cdn.segment.com/v1/projects/SuUPhftAo6g2fi1wSBYy601B39BuMiOR/settings | jq '.integrations | keys'

# Clay workspace state
curl https://api.claydar.com/bp/cEQbiYM8GC/settings

# Marketing analytics script (full source)
curl https://marketing-website-dfh.pages.dev/marketingheaderscript.js

# Staging CDN probe (bucket root — access denied, CORS wildcard)
curl -I https://cdn.withpersona-staging.com/
```

**Gotchas**

- The marketing site HTML is blocked by Cloudflare bot challenge. JS assets from `marketing-website-dfh.pages.dev` are accessible without a challenge.
- `/api/internal/dashboard/v1/version` is the only unauthenticated internal API route. All others return 404 with the error schema.
- The inquiry flow at `inquiry.withpersona.com` will always error without a valid operator `template-id` — these are operator-specific and not publicly enumerable.
- Dashboard source maps (`dashboard-mz90tCK3.js.map`) return 404 — protected.
- `cdn.withpersona-staging.com` has CORS `*` but GCS bucket access is denied at root. Requires knowing file paths.
- GTM container `GTM-TTVF7JQ` contents (Hotjar ID, Marketo Munchkin, UA tag) are only observable post-consent via browser network monitoring — not in server-side HTML or the marketing header script.
- Old Universal Analytics (`UA-127044648`) is present in the GTM container but only GA4 is listed in the cookie policy.
