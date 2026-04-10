---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "National Public Data — Teardown"
url: "https://nationalpublicdata.com"
company: "National Public Data"
industry: "Information"
description: "People-search directory and public records aggregator rebuilt on a breach-infamous domain."
summary: "PHP/Laravel backend with Vite-built frontend, served entirely as server-side HTML through Cloudflare's CDN and WAF. GrowthBook feature flags are evaluated server-side and baked into each HTML response. All profile data is rendered in HTML with no authenticated API layer. The business runs dual affiliate revenue streams — TruthFinder for background checks and OneRep for data removal — both monetizing the privacy anxiety the free directory generates."
date: 2026-04-12
time: "07:15"
contributor: hayabhay
model: sonnet-4-6
effort: high
stack: [Laravel, Vite, Cloudflare, GrowthBook]
trackers: [Google Analytics 4, Google Tag Manager, Google Maps]
tags: [data-broker, people-search, affiliate-marketing, privacy, a-b-testing, public-records, fcra, consent, growthbook, dark-pattern]
headline: "NPD exposes your address, phone, and relatives for free, then A/B tests which icon on the 'remove my data' button converts best for its paid affiliate partner."
findings:
  - "The site monetizes both sides of privacy anxiety — free profiles drive traffic to TruthFinder (background check affiliate, ID a=1640) and OneRep (data removal affiliate via orps93ms.com/9RL41M), and the affiliate links send the profiled person's name, city, and state to third-party tracking domains."
  - "Two active GrowthBook experiments (EXP-NPD-2026-04, EXP-NPD-2026-05) are testing icon variants on the affiliate CTA buttons; a third flag (profile-headline-onerep) shows a planned inline OneRep button was staged and disabled."
  - "The entire multi-million-profile directory is excluded from the sitemap's 27 entries but remains fully crawlable via footer links — explicit submission omitted, organic indexing preserved."
  - "The 'Do Not Sell My Info' link routes to a manual per-profile removal form — at a directory scale of 22,000+ profiles for a single common name, individual opt-out is the only mechanism offered."
  - "GA4 fires on every page with personalized ads enabled (npa=0) and no cookie banner or consent mechanism of any kind."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

## Background

nationalpublicdata.com carries more brand recognition than any legitimate white-pages directory has a right to. That recognition comes entirely from a 2024 data breach: Jerico Pictures, Inc., the prior operator, suffered a breach that exposed approximately 2.9 billion records — names, Social Security numbers, addresses, and phone numbers for US, UK, and Canadian citizens. A threat actor calling themselves "USDoD" listed the data for $3.5 million on dark web forums. Jerico Pictures filed for bankruptcy and abandoned the domain.

The domain was reacquired by a new operator, registered via Perfect Privacy LLC — a Florida anonymizing registrar that shields the beneficial owner's identity. The current site explicitly disclaims any connection to Jerico Pictures on both the breach page and the opt-out FAQ: "Jerico Pictures, Inc., the Florida company that suffered a major data breach in 2024, no longer operates this site. We have zero affiliation with them." The breach page from the prior operator remains on the site at `/breach.html`, kept "for traceability," which also captures SEO traffic from anyone searching for information about the breach. The domain name's infamy drives organic search volume the new operator didn't have to earn.

The rebuilt site is a free people-search and white-pages directory. The breach history is the business context, not an operational detail.

---

## Architecture

The site runs a PHP/Laravel backend (inferred from the CSRF token pattern — Laravel's standard `<meta name="csrf-token">` + `_token` POST field) with a Vite-built frontend. All pages are server-side rendered: profile data — names, addresses, phone numbers, relatives — arrives in the HTML response, not via client-side API calls. There is no authenticated public API layer.

Frontend assets follow Vite's chunked ESM format with content-hash filenames:

- `common-7bxN7TQ2.js` — shared nav and search form
- `mainPage-G76DJ8mE.js` — homepage logic
- `profilePage-QMOaIb3v.js` — individual profile TOC behavior
- `affiliate-1DwK5W0f.js` — affiliate link manager (`window.AFLK`)
- `optout-DOqrbt2J.js` — opt-out form
- `protectMyInfoPage-DyX-D9Wf.js` — protect-my-info funnel (step 2)
- `chunk-C1QHra1u.js` — autocomplete client (calls `/api/autocomplete`)
- `chunk-BKSPAgUi.js` — ky HTTP client library

GrowthBook handles feature flags and A/B experiments. The SDK runs server-side — the evaluated flag state is baked into each HTML response as `window.FEATURES` in an inline `<script>` tag. No GrowthBook API call appears in any network capture; the browser receives only the already-evaluated config. A `did` cookie (device ID, e.g., `lhq2rhojnWi54qvtTnJrWZ6n66hiLK`) is set on first visit and used as the `deviceId` hash attribute for experiment bucketing.

Cloudflare handles CDN, WAF, and bot protection. Direct curl requests return HTTP 403 with `cf-mitigated: challenge`. Headless Playwright is similarly blocked without challenge resolution. Security headers are comprehensive: strict CORS headers (`cross-origin-embedder-policy: require-corp`, `cross-origin-opener-policy: same-origin`, `cross-origin-resource-policy: same-origin`), `x-frame-options: SAMEORIGIN`, `x-content-type-options: nosniff`, HSTS with `max-age=15552000; includeSubDomains; preload`.

The directory URL structure: `/people/{letter}/{name}/{state}/{city}/{hash}/`. Profile IDs are opaque hashes (e.g., `pd54o6eb8dlpfolznflmm4fvj6wi006r`), not sequential integers, but reachable via the alphabetical directory pages linked from every page's footer.

---

## Business Model — Double-Sided Monetization

The business logic is a closed loop: expose personal data freely to generate search traffic, then monetize the anxiety that exposure creates. There are three layers:

**1. Free directory as SEO funnel.** Public profile pages indexed in Google bring in users searching for their own records or someone else's. No authentication, no paywall, no subscription.

**2. TruthFinder affiliate upsell.** Every profile page embeds affiliate links to TruthFinder (a paid background check service) via `window.AFLK`. The "Open Report" and "View Address History" buttons are affiliate links that pre-fill the searched person's name, city, and state:

```
https://tracking.truthfinder.com/?s1=d-profile-headline-button-v4&a=1640&oc=27&c=288&firstName=john&lastName=smith&city=San+Francisco&state=CA
```

- `a=1640` — NPD's affiliate publisher ID on TruthFinder's network
- `oc=27`, `c=288` — offer and creative/campaign IDs
- `s1` — sub-ID encoding which button was clicked and which A/B variant was shown

**3. OneRep affiliate upsell.** The "Protect my info" button routes to a two-step internal funnel (`/protect-my-info/step-1`, `/protect-my-info/step-2`). Step 1 displays a list of approximately 300 data broker sites and claims NPD can help remove your data from all of them. Step 2 redirects to OneRep (a paid automated opt-out service) via an affiliate tracking domain:

```js
const e = "https://www.orps93ms.com/9RL41M"
const r = {
  head: `${e}/4G6SHH/`,
  bottom: `${e}/4HKP84/`
}
// URL built with: city, state, first_name, last_name pre-filled
```

- `orps93ms.com` is OneRep's affiliate tracking domain
- `9RL41M` is NPD's affiliate ID with OneRep
- `4G6SHH` and `4HKP84` are placement IDs (headline button vs. bottom button)

The irony is structural: NPD exposes your data at no cost, then earns affiliate revenue by sending you to OneRep — a service that automates opt-out requests to data brokers, including NPD itself. The same profile that generates the anxiety is the conversion event.

Both affiliate flows send the searched person's name and location to third-party tracking infrastructure. The privacy policy states "We do not sell, rent, or trade your personal information to third parties" — but this refers to visitor data. The affiliate links transmit the *subject's* data (the person whose profile is displayed) as URL parameters. The policy does not address this data flow.

---

## A/B Testing the Affiliate Buttons

Two active GrowthBook experiments are running on the affiliate CTAs on profile pages, with a third flag signaling a product decision that was tried and reversed.

**EXP-NPD-2026-04** (`distribution-adunit-bottom-icon-phase2`): Tests icon variants on the TruthFinder ad unit at the bottom of profiles. 6 variations (v0-v5), 4 active at 25% each. v3 and v5 are at 0% allocation — paused or eliminated.

**EXP-NPD-2026-05** (`profile-headline-button-icon-phase2`): Tests icon variants on the TruthFinder headline button. Same structure — 6 variations, v3 and v5 at 0%.

Both experiments use `deviceId` hash bucketing (the `did` cookie), `coverage: 1` (100% of traffic eligible), and log impressions to GA4 via:

```js
gtag('event', 'experiment_impression', {
  'experiment_id': experiment.experiment.key,
  'variant_id': experiment.result.variationId,
});
```

**`profile-headline-onerep` (disabled):** This flag has `defaultValue: false` and `force: false`, with a full experiment structure (seed, hash attribute, coverage 1). The flag controls a direct OneRep button on the profile headline. It is currently disabled for all users. The presence of the full experiment scaffolding suggests this was either run as a live test and disabled, or staged and never launched. The current approach routes users to OneRep through the separate `/protect-my-info/` funnel instead.

**`search-vs-results-tf: 282`** — A scalar value with no experiment structure. Its purpose could not be determined from saved evidence — likely an internal variant selector or timeout parameter for the TruthFinder integration.

The forced-on flags are equally revealing: `profile-headline-button: force=true` and `profile-summary-button: force=true` mean TruthFinder CTA buttons at the top and middle of every profile are hard-on — not experimental, not conditional. `distribution-adunit-bottom: force=true` similarly locks the affiliate ad unit at the bottom of profiles.

---

## Tracking and Consent

**Google Analytics 4** — property `G-T8Z1EK5GBG`, loaded via GTM container `GTM-WRCK2JWR`. Fires on every page. GTM contains only one tag: GA4. No additional pixels, no additional vendors in the GTM container.

Every GA4 payload carries:
- `npa=0` — "non-personalized ads" is disabled, meaning personalized ad targeting is active
- `dma=0` — Digital Markets Act restrictions are off
- `ep.normalized_page_path` — custom dimension on directory and profile pages (e.g., `/people/letters/name/state/city/person_id/`), used to group page types in GA4 reporting

There is no cookie banner, consent management platform, or consent dialog of any kind. GA4 and GTM fire immediately on every page load for all visitors. For EU or UK visitors, this is likely non-compliant with GDPR and PECR.

Three cookies are set on first visit:
- `did` — device ID used as GrowthBook experiment hash attribute
- `_ga_T8Z1EK5GBG` — GA4 session cookie
- `_ga` — GA client ID

**Google Maps** — on individual profile pages, the current address of the profiled person is rendered in a Google Maps embed. Each profile page load sends the profiled person's address data to Google's Maps and Places infrastructure via calls to `maps.googleapis.com` and `places.googleapis.com`.

---

## Directory Scale and Access

No authentication is required to view any public profile page. The directory is accessible to anyone who can pass Cloudflare's bot challenge.

The structure is a four-level alphabetical hierarchy: letter (`/people/s/`) -> last name (`/people/s/smith/`) -> name+state (`/people/s/john-smith/ca/`) -> name+state+city (`/people/s/john-smith/ca/san-francisco/`) -> individual profile (`/people/s/john-smith/ca/san-francisco/{hash}/`). Each profile page contains server-rendered PII: full name, age, year of birth, current address, historical addresses with dates, phone numbers with carrier type (landline or mobile), email addresses (partially shown), relatives list, and employment.

For "John Smith" alone, the directory contains 22,343 profiles across more than 300 cities. The total directory covers all 26 letters and common names for each, suggesting tens of millions of profiles overall.

The sitemap at `/sitemap.xml` contains exactly 27 entries — all static marketing pages (`/bankruptcy.html`, `/criminal-records.html`, etc.). None of the `/people/` directory is included. The directory is not explicitly submitted to search engines but is fully crawlable via footer navigation links present on every page.

**Opt-out:** The form at `/optout.html` accepts a profile URL, posts to `/optout/profile` with a CSRF token, and processes the request manually per the FAQ: "provide us with a hyperlink to the page on nationalpublicdata.com where the information appears, and we will remove it manually." Manual removal at the scale of tens of millions of profiles means the opt-out mechanism is viable only for high-effort individual cases.

**Autocomplete APIs:** Two endpoints are open without authentication:

```
GET /api/autocomplete/name?q={prefix}
GET /api/autocomplete/location?q={prefix}
```

Name autocomplete returns `{"name": "..."}` objects. Location autocomplete returns `{"city": "...", "state": "...", "full_state": "..."}` objects. No rate limiting was observed on initial requests.

---

## Regulatory Positioning

Every page footer carries an FCRA disclaimer: "National Public Data is not a 'consumer reporting agency' as defined by the Fair Credit Reporting Act, and the information provided does not constitute a 'consumer report'. You may not use any information from this site to make decisions about employment, credit, insurance, housing, or other purposes covered by the FCRA." This disclaimer positions the site as a white-pages directory rather than a consumer reporting agency, keeping it outside the FCRA's consent and accuracy requirements.

The "Do Not Sell My Personal Information" link in the footer routes to `/optout.html` — the same individual profile removal form. CCPA's "Do Not Sell" right would nominally require a mechanism to stop the sale of the requesting individual's data broadly, not just remove one profile URL. The page is titled "National Public Data Opt Out" and functions as a profile-removal form, not a categorical data sale opt-out. Whether this satisfies CCPA obligations is a legal question; the implementation is observable.

The site is registered through Perfect Privacy LLC, shielding the new operator's identity from public WHOIS records.

---

## Machine Briefing

### Access and Auth

All public-facing content is server-side rendered HTML. No API authentication for read access. Cloudflare managed challenge blocks curl and headless browsers — a full browser environment that can solve the JS challenge is required. Once solved, a session cookie is established and subsequent requests succeed.

CSRF token required for any POST: grab it from `<meta name="csrf-token" content="...">` on any page, include as `_token` in POST body or `X-CSRF-TOKEN` header.

### Endpoints

**Open — no auth required (require Cloudflare session cookie)**

```
GET https://nationalpublicdata.com/api/autocomplete/name?q={prefix}
# Returns: [{"name": "john"}, {"name": "johnny"}, ...]

GET https://nationalpublicdata.com/api/autocomplete/location?q={prefix}
# Returns: [{"city": "san francisco", "state": "ca", "full_state": "california"}, ...]
```

**Directory traversal (server-rendered HTML)**

```
GET https://nationalpublicdata.com/people/{letter}/
# Lists last names starting with letter

GET https://nationalpublicdata.com/people/{letter}/{first-last}/{state}/
# Lists cities

GET https://nationalpublicdata.com/people/{letter}/{first-last}/{state}/{city}/
# Lists individual profiles with hash IDs

GET https://nationalpublicdata.com/people/{letter}/{first-last}/{state}/{city}/{hash}/
# Full profile page — name, DOB, addresses, phones, emails, relatives (all in HTML)
```

**Opt-out (CSRF required)**

```
POST https://nationalpublicdata.com/optout/profile
Content-Type: application/x-www-form-urlencoded
Body: link={profile_url}&_token={csrf_token}
```

### Gotchas

- Cloudflare challenge must be solved first. Use a browser session. Playwright with headed mode and a pre-solved session cookie will pass; headless without cookies will get 403.
- Profile hash IDs are opaque and not guessable — enumerate via directory pages.
- `window.FEATURES` is baked into the HTML on each page response. Parse it from the page source to get the current flag state and experiment assignments.
- The `did` cookie determines your experiment bucket — to test specific variants, set the cookie to a value that hashes to the desired bucket for the experiment seed.
- `/api/` root returns 403. Only the specific autocomplete paths are accessible.
- Sitemap covers only static pages — don't use it for directory discovery.
