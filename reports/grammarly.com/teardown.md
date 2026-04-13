---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "Grammarly — Teardown"
url: "https://grammarly.com"
company: Grammarly
industry: Information
description: "AI writing assistant for grammar, style, and clarity."
summary: "Grammarly's marketing site runs two separate SSR surfaces — a Next.js app (Contentful CMS, Statsig + Manakin experiments) for the homepage and a standalone React funnel app for plans and payment — both behind CloudFront and now serving the broader Superhuman Platform suite after the 2025 acquisitions of Coda and Superhuman Mail. Consent is managed via Transcend airgap.js, configured to hide the banner entirely for US visitors while showing an accept-or-reject prompt for GDPR users. The blog is a separate WordPress install with a custom contenthub REST API. Payments run through Braintree."
date: 2026-04-07
time: "21:33"
contributor: hayabhay
model: "sonnet-4.6"
effort: high
stack:
  - Next.js
  - React
  - Contentful
  - CloudFront
  - WordPress
  - Braintree
trackers:
  - Google Analytics
  - Google Ads
  - LinkedIn Insight
  - ZoomInfo WebSights
  - 6sense
  - Microsoft Clarity
  - TikTok Pixel
  - Spotify Pixel
  - The Trade Desk
  - Facebook Pixel
  - Taboola
  - Microsoft UET
  - Impact
  - Transcend
  - Sprig
  - Vector
  - Podscribe
  - AppNexus
  - LiveRamp
  - Amazon Ads
  - Reddit Pixel
  - Pinterest Pixel
  - Quora Pixel
  - Tapad
  - GumGum
tags:
  - saas
  - ai-writing
  - b2b
  - consent-management
  - identity-graph
  - b2b-intent
  - rebranding
  - feature-flags
  - pricing-transparency
  - nextjs
headline: "Grammarly's plans page embeds unlisted pricing in a blocking script — a $40/seat/month business tier and volume-tiered enterprise rates ($150-180/seat/year) not shown in the UI."
findings:
  - "The plans page HTML embeds a complete pricing catalog in a blocking script tag — including unlisted bundleBusinessPlans at $40/seat/month and volume-tiered enterprise pricing ($150-180/seat/year) not shown in the UI."
  - "A Manakin gate called cheetah_geolaunch_anonymous (qualifiedName: cheetah_us_prelaunch_shadow) is enabled for all US visitors on the plans page — an unreleased product in shadow pre-launch mode with no public announcement."
  - "Grammarly's footer, careers, legal, and Twitter handle already point to 'Superhuman Platform' after the 2025 acquisitions — the corporate entity has migrated while the product branding still says Grammarly everywhere."
  - "Every page injects a full anonymous visitor profile into the HTML before JavaScript runs — a server-assigned numeric ID, city-level geolocation with postal code, 35 A/B test assignments, and a timestamped freemiumRegDate — creating a comprehensive pre-consent dossier in the page source."
  - "The Transcend airgap.js config sets initialViewStateByPrivacyRegime for USA to 'Hidden' and defaultConsent to 'Auto' — US visitors never see a banner, so the opt-in the config requires for 30+ Advertising/SaleOfInfo trackers (ZoomInfo, 6sense, TikTok, LinkedIn, Taboola, Facebook, and more) is structurally impossible to obtain."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

Grammarly serves 30 million daily active users as an AI writing assistant — grammar checking, style suggestions, plagiarism detection, and increasingly, AI text generation. In 2025, the company acquired Coda (collaborative documents) and Superhuman Mail, and has since reorganized under a new parent entity called Superhuman Platform. As of April 2026, the marketing site still reads "Grammarly" everywhere, but the footer says "2026 (C) Superhuman Platform," careers and legal pages redirect to superhuman.com, and the plans page React bundle contains "Superhuman Go" branding and navigation. The product consolidation is structurally further along than the marketing surface suggests.

---

## Architecture

The public-facing infrastructure splits into two distinct SSR surfaces. The homepage and marketing pages run on a Next.js application with content sourced from Contentful (space ID: `1e6ajr2k4140`, env: `master`). The `__NEXT_DATA__` payload on every page load exceeds 1MB, embedding full Contentful page entries, experiment assignments, pricing data, and a complete server-side user model. The build ID at time of investigation was `SB-nAS9CKUdTc-aHaf6kE`.

The plans and payment funnel is a separate React application — not Next.js — identified by its use of React Helmet for SSR meta tags and a `handleFacadeExperimentInfo()` pattern that injects user data via a blocking `<script>` tag before any render. This funnel app carries its own `containerId` (`dnlkalss9mvp0ko2` or `cklqalss91ki0k02`) distinct from the marketing site (`yhraalsrr4oe0ko2`). The variable `window.funnelServerEnv = 'prod'` is visible in the plans page source.

The blog at `www.grammarly.com/blog` is a separate WordPress install with a custom REST API namespace (`grammarly/contenthub`). Endpoints include `/blog/wp-json/grammarly/contenthub/posts/` and `/blog/wp-json/grammarly/contenthub/sticky/` — a custom WP REST plugin for blog content. The blog has its own Sentry project (DSN project 6025591), separate from the main application (project 565714 on `o565714.ingest.sentry.io`).

CDN is CloudFront (pop observed: SFO5-P2). Static assets serve from `static-web.grammarly.com` at paths like `/cms/master/_next/static/`. The `www.grammarly.com` origin returns 405 for HEAD requests — CloudFront only allows POST and GET. No `x-powered-by` or `server` header disclosure.

**Experiment systems:** Two separate platforms run in parallel. Statsig handles growth and marketing experiments, assigned on the client container. Manakin is Grammarly's internal feature flag system, evaluated server-side and injected into the page data — Manakin gates include infrastructure changes, product launches, and compliance flags. Both feed into the same `treatments` array in `window.Grammarly`.

**Payments:** Braintree is the primary payment processor (`gateway.braintreegateway.com`, `payments.braintree-api.com`). Stripe is listed in the Transcend purposeMap under Essential but does not appear in the primary payment flow. `api.payments.grammarly.com` returns 403. PayPal is enabled (`payPalDisabled: false`), American Express is accepted.

**Internal services visible in the Transcend purposeMap:**
- `irbis.grammarly.com` — 403 (internal auth service)
- `gates.grammarly.com` — alive, returns `{"error_msg":"404 Route Not Found"}` (feature gate API)
- `gateway.grammarly.com` — API gateway
- `gnar.grammarly.com` — real-time session heartbeat events
- `sso.grammarly.com` — SSO endpoint
- `f-log-at.grammarly.io` — analytics logging
- `f-log-assistant.grammarly.io` — AI assistant telemetry
- `redirect.grammarly.com` — redirect service
- `mail.staging-superhuman.com` — listed as Essential, confirming active Superhuman Mail infrastructure integration

---

## The Superhuman Platform Transition

In 2025, Grammarly acquired Coda and Superhuman Mail and reorganized under the parent entity "Superhuman Platform." The transition is partially complete on the public surface:

**Already migrated:**
- Footer copyright: "2026 (C) Superhuman Platform"
- Careers link: `superhuman.com/company/careers`
- Partners link: `superhuman.com/partners`
- Legal notices: `superhuman.com/legal/notices`
- Twitter/X handle in footer: `@Superhuman` (not `@Grammarly`)
- Jobs page references "Grammarly, Coda, and Mail became Superhuman"

**Still Grammarly-branded:**
- All marketing content, product descriptions, logos
- Signup flow
- Blog, docs, support infrastructure

**Shared between grammarly.com and superhuman.com:**
- Transcend consent bundle UUID `1c1f8e90-47d0-4bba-a1a2-472d59b002a2` (inferred from investigation)
- `static-web.grammarly.com/web-heartbeat/latest/index.js` — Superhuman.com loads Grammarly's heartbeat script
- Cookies with `gr-` prefix set on superhuman.com: `gr-wc-st`, `gr-wc-cs`, `gr-wc-tkn`

The plans page React bundle contains "Superhuman Go" as a navigation item and "Superhuman Logo" elements — the product suite navigation includes Superhuman Go, Grammarly, Coda, and Mail. The `use_mail_gateway_instead_of_mail` Statsig gate (`enabled_1` on plans page) signals an active infrastructure migration of the email product routing.

---

## Consent Architecture

Grammarly uses Transcend's airgap.js consent manager (UUID: `1c1f8e90-47d0-4bba-a1a2-472d59b002a2`). They previously used OneTrust — the `onetrust_disabled` gate (Statsig, `enabled_1` for both homepage and plans page) confirms the migration is complete.

The consent configuration in `airgap.js` specifies `initialViewStateByPrivacyRegime`:

```
USA:     "Hidden"
GDPR:    "AcceptOrRejectAll"
Unknown: "Hidden"
ATT:     "Hidden"
```

US visitors never see a consent banner. The `gdpr_inverted` gate (Manakin, `enabled_1` for US users) marks US visitors as not subject to GDPR regulation, confirming the banner suppression is intentional. This is reflected in every anonymous user's server model: `customFields["data-regulation"] = "false"`.

The `regimePurposeScopes` in airgap.js specifies that the USA regime requires opt-in consent for the `Advertising` scope only, while GDPR requires opt-in for `Advertising`, `Analytics`, and `Functional`. The `defaultConsent` for all purpose types is set to `"Auto"` — Transcend auto-fires trackers unless the user's privacy regime requires otherwise.

Here is where the configuration creates a structural gap: the USA regime requires opt-in for `Advertising` and `SaleOfInfo` trackers, but the consent banner is set to `"Hidden"` for US users. The opt-in is never solicited. The user has no mechanism to consent or deny. Network captures confirm that 6sense (`c.6sc.co`, `ipv6.6sc.co`) and ZoomInfo (`ws.zoominfo.com`) — both classified as `["Advertising","SaleOfInfo"]` in the purposeMap — appear in the homepage network log on first load without any user interaction.

**Full purpose inventory from airgap.js:**

*Advertising + SaleOfInfo:*
- 6sense: `c.6sc.co`, `j.6sc.co`, `b.6sc.co`, `ipv6.6sc.co`, `eps.6sc.co`, `epsilon.6sense.com`
- ZoomInfo: `ws.zoominfo.com`, `js.zi-scripts.com`, `ws-assets.zoominfo.com`
- TikTok: `analytics.tiktok.com`, `analytics-ipv6.tiktokw.us`
- LinkedIn: `px.ads.linkedin.com`, `snap.licdn.com`, `dc.ads.linkedin.com`, `rp.liadm.com`, `idx.liadm.com`, `i.liadm.com`, `d-code.liadm.com`
- Google: `ad.doubleclick.net`, `td.doubleclick.net`, `fls.doubleclick.net`, `googleads.g.doubleclick.net`, `securepubads.g.doubleclick.net`, `www.googleadservices.com`
- Taboola: `cdn.taboola.com`, `pips.taboola.com`, `psb.taboola.com`, `trc.taboola.com`
- Facebook: `connect.facebook.net`, `www.facebook.com`
- Microsoft: `bat.bing.net`, `bat.bing.com`
- The Trade Desk: `js.adsrvr.org`, `tags.w55c.net`
- Amazon: `c.amazon-adsystem.com`, `s.amazon-adsystem.com`, `aax-eu.amazon-adsystem.com`
- Spotify: `pixels.spotify.com`
- Reddit: `pixel-config.reddit.com`, `www.redditstatic.com`
- Pinterest: `s.pinimg.com`
- Quora: `a.quora.com`, `q.quora.com`
- LiveRamp: `rp.liadm.com`, `idx.liadm.com`
- Tapad: `pixel.tapad.com`
- GumGum: `px.gumgum.com`
- Podscribe: `verifi.podscribe.com`, `ipv4.podscribe.com`
- Impact: `utt.impactcdn.com`, `grammarly.pxf.io`
- AppNexus/Xandr: `ib.adnxs.com`, `secure.adnxs.com`
- Plus: Adswizz, TVSquared, Research Now, AdXcel, PDST

*Analytics (fires without consent for US users):*
- Google Analytics 4: `region1.google-analytics.com`

*Functional (fires without consent for US users):*
- `sessions.bugsnag.com` — error monitoring
- `app.launchdarkly.com` — feature flags
- `f-log-assistant.grammarly.io` — AI assistant telemetry

*Blog-specific:*
- `api.vector.co` — IP-to-company resolution (confirmed: returns ISP, city, coordinates for every request)
- `o565714.ingest.sentry.io` — Sentry error tracking

**Cookies and storage written without consent (US users):**
- `taboola global:user-id` (localStorage) — persistent cross-site Taboola ID
- `li_adsId` (localStorage) — LinkedIn ads ID
- `_uetsid`, `_uetvid` — Microsoft UET session and visitor IDs
- `ziwsSession`, `ziwsSessionId`, `ziScriptSession` (sessionStorage) — ZoomInfo session tracking
- `tt_appInfo`, `tt_sessionId`, `tt_pixel_session_index` (sessionStorage) — TikTok pixel session
- `1155799:session-data`, `1326138:session-data` (localStorage) — Grammarly internal container session data
- `gnar_containerId` (localStorage) — persistent container ID across sessions
- `lastExternalReferrer`, `lastExternalReferrerTime` (localStorage) — referral tracking

---

## The Server-Injected User Model

Every Grammarly page load — including the first visit from an anonymous user — results in a server-side profile being injected into `window.Grammarly`. This is an SSR optimization that avoids a client-side fetch, but the result is a comprehensive anonymous visitor record embedded in the page source before any JavaScript executes.

For an anonymous US visitor, the server model contains:

```json
{
  "user": {
    "id": "-384947650293682944",
    "type": "Free",
    "email": "-384947650293682944@anonymous",
    "anonymous": true,
    "customFields": { "data-regulation": "false" },
    "freemiumRegDate": "2026-04-07T21:22:54.704",
    "editorFeatures": {
      "plagiarismDisabled": true,
      "msWordEnabled": true,
      "msOutlookEnabled": true
    }
  },
  "geoLocation": {
    "countryName": "United States",
    "countryCode": "US",
    "subdivisionName": "California",
    "cityName": "San Francisco",
    "postalCode": "94123"
  },
  "treatments": [ "...35 experiment assignments..." ],
  "proPlans": [ "...full pricing catalog..." ],
  "isBot": false
}
```

The numeric user ID is a negative 64-bit integer assigned on first request. The `freemiumRegDate` is set to the exact time of first contact — a timestamped creation record for an anonymous visitor. The `editorFeatures` object reflects current feature access: for anonymous users, plagiarism is disabled while MS Word and Outlook integrations are enabled. The `data-regulation: "false"` field is the per-user flag that drives consent banner suppression.

The `treatments` array embeds the user's complete A/B test assignment across all active Statsig and Manakin experiments — 35 on the homepage, additional ones on the plans page (different containerId). `geoLocation` resolves to city level with postal code. All of this is in the initial HTML response, visible to any crawler or network observer before JavaScript runs.

---

## B2B Intent Stack

Grammarly runs four simultaneous B2B visitor identification platforms:

1. **ZoomInfo WebSights** — `ws.zoominfo.com`, `js.zi-scripts.com`, `ws-assets.zoominfo.com`. Identifies visiting companies by IP address. Project key `424ca30c451669227969` is exposed in `window.ZIProjectKey`.

2. **6sense** — `c.6sc.co`, `j.6sc.co`, `b.6sc.co`, `ipv6.6sc.co`, `eps.6sc.co`, `epsilon.6sense.com`. Six endpoints. 6sense's ABM platform combines IP identification with predictive intent scoring. The `epsilon` endpoint routes through 6sense's acquisition of Epsilon for additional identity resolution. The `window._6si` object is initialized in the page globals.

3. **Vector** — `api.vector.co` (blog only). IP-to-company resolution. The evidence confirms the endpoint returns structured IP intelligence — ISP, city, coordinates, and company attribution — for every request. Vector fires on the blog but not the main marketing site, indicating a separate tracker configuration for the WordPress install.

4. **LinkedIn Insight Tag** — `px.ads.linkedin.com`, `snap.licdn.com`, `dc.ads.linkedin.com`, `rp.liadm.com`, `idx.liadm.com`, `i.liadm.com`, `d-code.liadm.com`. Seven endpoints. Partner ID `429908` is in `window._linkedin_data_partner_id`.

This B2B intent stack is consistent with Grammarly's enterprise sales motion — identifying which companies visit the site, what pages they view, and feeding that data into sales CRM workflows. The stack runs on the consumer-facing marketing site alongside the enterprise pages, meaning individual users checking their grammar are having their employer identified in the background.

---

## Experiment Signals & Product Direction

The treatments arrays across the homepage and plans page expose the current state of Grammarly's product and growth roadmap.

**Active experiments (test_1 group):**
- `inkwell_grammar_checker_v1` (Statsig, exp ID 61939536) — "Inkwell" is a codename for a new or redesigned grammar checker interface being A/B tested against the current version
- `tools_aichat_in_secondary_nav` (Statsig, exp ID 62058225) — AI Chat being tested in the secondary navigation
- `exit_intent_modal_v2` (Statsig, exp ID 61709164) — second iteration of an exit intent modal on tool pages
- `tool_soft_signup_wall` (Statsig, exp ID 60738025) — testing a soft (dismissible) signup wall on tool pages vs. a hard gate
- `remove_fb_signup_option` (Statsig, exp ID 26331) — Facebook login being removed from signup
- `social_first_signup_v2` (group: `social_signup_first_1`) — social signup options prioritized in the flow
- `browser_page_signup_first_flow` (Manakin) — signup-first flow on the browser extension landing page
- `trial_first_for_anonymous_users` (Statsig, exp ID 57520848) — free trial as the primary conversion path

**Active gates (enabled_1):**
- `gb_selfserve_price_increase` (Manakin, exp ID 4058) — self-serve business price increase is live
- `px_premium_to_plus_redirect` (Statsig, exp ID 60836314) — product tier renamed from Premium to Plus, redirect active
- `use_mail_gateway_instead_of_mail` (Statsig, exp ID 516023, plans page) — email product routing through a new mail gateway
- `airgap_att_regime` (Statsig, plans page) — ATT consent regime active for iOS app tracking
- `ninetailed_enabled` (Statsig) — Ninetailed personalization layer active (Contentful-native content variants by user segment)
- `sprig_tracking` — Sprig in-app survey/feedback active
- `dynamic_banner_v2` — dynamic promotional banner system active

**The Cheetah signal:**

The Manakin gate `cheetah_geolaunch_anonymous` (qualifiedName: `cheetah_us_prelaunch_shadow`, experiment ID 5326, `groupName: enabled_1`) is enabled for all US anonymous visitors on the plans page. The naming pattern: "cheetah" as a codename, "geolaunch" indicating a geographic rollout mechanism, "anonymous" meaning it applies to pre-login users, and "prelaunch_shadow" indicating the feature is in shadow mode — running in the background, measuring impact without visible user-facing changes.

No public announcement, blog post, or product page references "Cheetah." Given the "geolaunch" component and US-only activation, this is a product or feature being staged for a US launch. The timing (early 2026) and Superhuman Platform context suggest it may be related to Coda or Superhuman Mail integration into the Grammarly product. Shadow mode typically precedes a percentage rollout.

**Signup signals:**

The signup page labels the email field "Work or school email" — a deliberate B2B acquisition signal. The `remove_fb_signup_option` experiment in `test_1` confirms Facebook login is being removed. Only Google and Apple SSO remain. The `marketing_email_control` gate (Manakin, `enabled_1`) controls whether users are opted into marketing emails by default — the signup TOS text confirms they are: "You also agree to receive product-related marketing emails from Grammarly, which you can unsubscribe from at any time."

---

## Plans & Pricing

The plans page (`/plans`) injects a complete pricing catalog via a blocking `<script>` tag before any JavaScript renders. The full data is in the raw HTML, readable by fetching the page source. This is SSR for faster render, but it means the complete pricing structure — including tiers not shown in the UI — is visible in page source.

**Grammarly Pro:**
- Monthly: $30/month (plan ID 10203085)
- Quarterly: $60/quarter (plan ID 10203908)
- Annual: $144/year (plan ID 10203084)

**bundleProPlans — same prices, different IDs:**
- Monthly: $30/month (plan ID 10206275)
- Quarterly: $60/quarter (plan ID 10206274)
- Annual: $144/year (plan ID 10206273)

The bundle Pro plans carry identical pricing to standard Pro but distinct product IDs with stripped-down descriptions ("Monthly plan" / "Quarterly plan" / "Annual plan" vs. "Monthly Grammarly Pro plan"). This likely represents a "Pro + something" bundle product that has not been publicly announced.

**bundleBusinessPlans — not shown in the UI:**
- Monthly: $40/seat/month (plan ID 10206541)
- Annual: $396/seat/year (plan ID 10206540, $33/seat/month equivalent)

The `bundleBusinessPlans` appear in the page source data but are not displayed in the published plans comparison table. The price differential from `institutionDynamicPlans` and the "bundle" prefix suggest these include additional products — possibly Coda or Mail.

**institutionDynamicPlans — volume-tiered enterprise:**
- 0-9 seats: $180/seat/year (plan IDs 10201490, 10201491 with 7-day trial variant)
- 10-49 seats: $174/seat/year
- 50-149 seats: $150/seat/year

**institutionEduPlans:**
- Annual: $50/seat/year (plan ID 10201059, flat pricing)

Legacy `institutionPlans` (monthly $25/seat, plan IDs 10200462 and 10200487 with trial) appear in the source but are separate from the current dynamic tiers.

Supported locales for the funnel: `en-US`, `es-US`, `de-DE`, `fr-FR`, `pt-BR`, `it-IT`.

---

## API Surface

**`gnar.grammarly.com` — Session Heartbeat**

The `web-heartbeat.js` script (`static-web.grammarly.com/web-heartbeat/latest/index.js`) sends periodic heartbeat events to `gnar.grammarly.com/events`. The event payload:

```json
{
  "events": [{
    "eventName": "web-heartbeat",
    "batchId": "...",
    "instanceId": "...",
    "pageHeartbeatSeconds": 30,
    "pageSlug": "/",
    "clientName": "marketing-web",
    "pageUrl": "https://www.grammarly.com/",
    "domainName": "grammarly.com",
    "pageViewId": "...",
    "timestamp": "...",
    "webSessionId": "...",
    "referrer": "...",
    "containerId": "yhraalsrr4oe0ko2",
    "isUnload": false
  }]
}
```

The endpoint accepts POST without authentication (inferred from the script's behavior — no auth headers set). The `gnar_containerId` in localStorage (`yhraalsrr4oe0ko2` for homepage, `dnlkalss9mvp0ko2` for plans) is the sharding key that ties sessions to specific app surfaces. This heartbeat fires on both Grammarly and Superhuman properties.

**`f-log-at.grammarly.io/log` — Analytics Logging**

Response headers confirm `access-control-allow-origin: *` — any domain can POST to this analytics endpoint. The endpoint returns 405 for GET but accepts POST and OPTIONS.

**WordPress Blog API**

`www.grammarly.com/blog/wp-json/grammarly/contenthub/posts/` and `.../sticky/` return post metadata via a custom WP REST plugin. Both endpoints serve unauthenticated reads.

**`/experimentation/treatment/log`**

Internal first-party endpoint that fires twice on homepage load. Logs experiment impressions via `gateway.grammarly.com/experimentation`.

**Reachable subdomains:**
- `api.grammarly.com` — returns `{"status":404,"message":"client error 404: "}` (alive, no public routes)
- `gates.grammarly.com` — returns `{"error_msg":"404 Route Not Found"}` (feature gate API, not documented)
- `app.grammarly.com` — 301 redirect

**Security headers:**
- `content-security-policy: frame-ancestors 'self' *.grammarly.com`
- `cross-origin-opener-policy: same-origin-allow-popups`
- No `x-powered-by`, no server disclosure

**HackerOne:** `security.txt` references their HackerOne program at `security@grammarly.com`.

---

## Open Threads

**Cheetah identity:** The `cheetah_us_prelaunch_shadow` gate cannot be connected to any public product or announcement. The shadow/prelaunch pattern suggests active staging, not abandonment.

**bundleProPlans contents:** Identical pricing to standard Pro but different product IDs. What product the bundle includes is not determinable from the plans page data.

**`api.cr-relay.com`** (site ID `9b7d1450-...`, blog only) — returns 403. Possibly a Customer.io relay for email event tracking.

**`mail.staging-superhuman.com`** in the airgap Essential category — a staging domain in the production consent config, indicating active Superhuman Mail integration testing.

---

## Machine Briefing

### Access & Auth

No auth required for all endpoints listed below. The marketing site and plans page are fully server-rendered — fetch the HTML and parse `window.Grammarly` from the `<script>` tag to get the full user model, experiment assignments, and pricing data. The blog WordPress endpoints require no auth for read access.

The plans page injects data via `handleFacadeExperimentInfo(...)` in a blocking script tag — the JSON is in the raw HTML, not loaded asynchronously. Parse directly from source.

User-Agent matters: the plans page `clientCapabilities.browser` reflects "Downloading Tool" when fetched without a browser UA. Data is returned regardless, but experiment assignments may differ.

### Endpoints

**Open — no auth required:**

```
# Full server-side user model, geo, A/B experiments, pricing (homepage)
GET https://www.grammarly.com/
# Parse: <script id="__NEXT_DATA__">...</script> -> JSON -> window.Grammarly embedded

# Full pricing catalog (Pro, bundle, enterprise) + experiment assignments (plans page)
GET https://www.grammarly.com/plans
# Parse: handleFacadeExperimentInfo({...}) in first blocking <script> tag

# Blog posts — custom WordPress REST API
GET https://www.grammarly.com/blog/wp-json/grammarly/contenthub/posts/
GET https://www.grammarly.com/blog/wp-json/grammarly/contenthub/sticky/

# Transcend consent config — full purposeMap with 60+ tracker domains, regime rules
GET https://transcend-cdn.com/cm/1c1f8e90-47d0-4bba-a1a2-472d59b002a2/airgap.js
GET https://transcend-cdn.com/cm/1c1f8e90-47d0-4bba-a1a2-472d59b002a2/translations/en.json

# Session heartbeat — unauthenticated POST
POST https://gnar.grammarly.com/events
Content-Type: application/json
Body: {"events":[{"eventName":"web-heartbeat","pageSlug":"/","clientName":"marketing-web","domainName":"grammarly.com","containerId":"yhraalsrr4oe0ko2","isUnload":false}]}

# Analytics logging — CORS wildcard, accepts POST from any origin
POST https://f-log-at.grammarly.io/log
Content-Type: application/json

# IP-to-company resolution (blog only — Vector API)
# Returns: ISP, city, lat/lon, org for the requesting IP
GET https://api.vector.co/...

# Feature gate API — alive, returns JSON 404 for unknown routes
GET https://gates.grammarly.com/
```

**Auth-gated (locked down):**

```
GET https://irbis.grammarly.com/          # 403
GET https://api.payments.grammarly.com/   # 403
POST https://gateway.grammarly.com/...    # requires session
```

### Gotchas

- **Pricing is in the HTML, not an API.** The plans page server-renders pricing into `handleFacadeExperimentInfo()` in the HTML. Fetch the page, parse the script tag.

- **Two containerIds.** Homepage uses `yhraalsrr4oe0ko2`; plans/funnel uses `dnlkalss9mvp0ko2` or `cklqalss91ki0k02`. Experiment assignments differ between surfaces.

- **`gnar_containerId` in localStorage.** The heartbeat system persists a container ID across sessions via localStorage.

- **`__NEXT_DATA__` is 1MB+.** The homepage Next.js payload includes the full Contentful page entry. Parse selectively — user model and experiments are in `props.pageProps`.

- **Blog is separate infrastructure.** The WordPress install has different tracking (adds Vector, different Sentry project), different response headers, and a separate cookie/session context.

- **`f-log-at.grammarly.io` returns 405 for GET.** The CORS wildcard is confirmed but the endpoint only accepts POST/OPTIONS.

- **`api.grammarly.com` and `gates.grammarly.com` are alive.** Both return structured JSON error responses. No public route documentation exists.
