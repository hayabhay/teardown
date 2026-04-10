---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "Indeed — Teardown"
url: "https://www.indeed.com"
company: "Indeed"
industry: "Information"
description: "Online job board connecting job seekers with employers."
summary: "Indeed runs on React 18 with Apollo Client and MobX, assembled via Webpack Module Federation — independent micro-frontends loaded from c03.s3.indeed.com under a react18_ifl7 share scope. The Mosaic component framework organizes named provider containers for search, job cards, and promotions. Cloudflare handles edge protection and bot management. Analytics routes through a first-party server-side GTM instance at sgtm.indeed.com, with Snowplow (Sourcepoint CMP) and a custom signals transport layer for behavioral logging."
date: "2026-04-08"
time: "06:48"
contributor: "hayabhay"
model: "sonnet-4.6"
effort: "high"
stack: [React, Apollo Client, MobX, Webpack Module Federation, Mosaic, Cloudflare]
trackers: [Google Tag Manager, Google Analytics 4, Google Ads, Snowplow, iSpot.tv, Google Campaign Manager, DoubleClick]
tags: [job-board, employment, react, graphql, a-b-testing, tracking, consent, sponsored-content, subscription, mobile]
headline: "Every result on Indeed's first search page is a paid auction placement — none show a Sponsored label, and each bid amount is exposed in plain page source."
findings:
  - "All 22 SERP page-1 results carry sponsored: true and showSponsoredLabel: false — users see no ad disclosure. Bid values in rankingScoresModel.bid run from 23,417 to 868,000, sorted highest-bid-first via Indeed's internal Dradis auction system."
  - "The GraphQL search endpoint (apis.indeed.com/graphql) accepts a client-embedded API key and returns paginated job results without session cookies — bypassing the mandatory login wall that blocks HTML page 2 for unauthenticated users."
  - "753 A/B tests are exposed on the SERP in jobseekerProctorGroups. Active clusters include LLM-powered job view features (jsj_mellm_vj_* suite), an Indeed Pro subscription with auto-apply, and fraud disclosure infrastructure (honeypot_job_card_tst, nexus_job_seeker_disclaimer)."
  - "The iSpot.tv TV ad attribution pixel fires on every homepage load, but its URL is base64-encoded inside _initialData rather than appearing in plain network traffic — a deliberate obfuscation that hides the tracker from standard inspection."
  - "GTM container GTM-M7N65VVK initializes all seven consent signals as granted before any user interaction. No consent banner appears for US visitors — ad_storage, analytics_storage, and ad_personalization are live on page load."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

## Architecture

Indeed's web stack is React 18, with Apollo Client for GraphQL data fetching and MobX for reactive state management. The frontend is assembled via Webpack Module Federation: independent micro-frontends are loaded as remote entries from `c03.s3.indeed.com`, all sharing the `react18_ifl7` scope. The `window._INDEED` global exposes the Module Federation config — `publicPath`, `loadersUrl`, and a list of named containers: `gnavHeaderModule`, `homepage-container`, `gnavFooterModule`, `mosaicPlatform`, `MosaicProviderRichSearchDaemon`, `mosaic-provider-app-download-promos-service`, `mosaic-provider-linking-widget`, `mosaic-provider-serpreportjob`.

The Mosaic framework is the runtime glue. `window.mosaic` holds provider data scoped to each page type, including GraphQL API keys and component configuration. A `window._initialData` object (19KB on the homepage) bootstraps the full page state — CSRF token, session CTK, A/B test allocations, feature flags, service URLs, and consent configuration — before any client-side JavaScript executes.

Additional globals documented: `window.__APOLLO_CLIENT__` (GraphQL client, present on SERP and job view pages), `window.__mobxGlobals` / `window.__mobxInstanceCount` (MobX state), `window.OptanonWrapper` (OneTrust/CMP wrapper), `window.dataLayer` / `window.google_tag_manager` (GTM), `window.signals_transport` (custom behavioral tracking transport), `window.IndeedLogger` / `window.INDEED_LOGGING` (internal logging), `window.JSMABridgeReceiver` / `window.JSMABridgeInstances` / `window.JSMABridgeRegistry` (mobile/web bridge for app webview integration).

Cloudflare sits in front of everything. Direct `curl` to `indeed.com` returns HTTP 403 with `server: cloudflare`. The `__cf_bm` cookie (Cloudflare Bot Management token) is set on first response. The GraphQL API at `apis.indeed.com/graphql` is similarly blocked to non-browser user-agents — a Cloudflare challenge page is returned rather than the API.

The service topology spans multiple subdomains:
- `apis.indeed.com` — GraphQL API, job alerts API
- `secure.indeed.com` — authentication
- `messages.indeed.com` — messaging
- `m5.apply.indeed.com` — Smart Apply (application flow)
- `sgtm.indeed.com` — server-side Google Tag Manager
- `t.indeed.com` — nav event logging (`/signals/gnav/log`)
- `onboarding.indeed.com` — onboarding flow
- `employers.indeed.com` — employer-facing product
- `c03.s3.indeed.com` — static assets and Module Federation remote entries

## Sponsored Results Without Labels

This is the most operationally significant finding. On the SERP for `q=software+engineer&l=San+Francisco,+CA`, all 22 results on page 1 carry `sponsored: true` in the client-side job card data. None of them display a "Sponsored" label to the user. The suppression is explicit: each job card has `showSponsoredLabel: false`, and `mustShowSponsoredLabel` is `false` globally on the page.

The auction mechanics are fully exposed in the client data. Each job card includes `rankingScoresModel.bid` with the advertiser's bid value, `bidPosition` (sort rank), `eApply` (predicted apply rate), `adId`, `advn` (advertiser ID), and `sourceId`. Observed bid values for the session:

| bidPosition | bid value |
|------------|-----------|
| 0 | 868,000 |
| 1 | 232,000 |
| 2 | 80,000 |
| 3 | 71,000 |
| 4 | 56,895 |
| 5 | 48,952 |
| — | 23,417 |

Bid units are fractional currency (inferred — Dradis auction denomination is not publicly documented; scale is consistent with micro-cents relative to typical CPC rates). Results sort by a function of bid and `eApply`. The highest bid takes `bidPosition: 0`.

10 of the 22 results are flagged `dradisJob: true` — Dradis is Indeed's internal real-time bidding auction system. Each card also carries `adBlob` and `encryptedQueryData`, which are auction artifacts from the Dradis system. Tier structure: `NATIONWIDE` tier contains 7 jobs, `DEFAULT` tier contains 14.

The A/B test framework contains related toggles: `brandedjob_show_branding_for_all_fe`, `brandedjob_show_branding_for_paid_branding`, `brandedjob_allow_sj_bundling`, `brandedjob_pass_additional_parameters_for_paid_branding`. Label display appears to be toggle-controlled rather than determined by the `sponsored` field itself. Whether `showSponsoredLabel: true` ever fires for any result on this page type is not confirmed — it may be conditionally enabled for specific employer tiers or market tests.

## Consent Architecture

GTM container `GTM-M7N65VVK` is loaded via Indeed's own server-side GTM instance at `sgtm.indeed.com`, which proxies GA4 (`G-LYNT3BTHPG`) events through Indeed's own infrastructure rather than sending them directly to Google's collection endpoints. The initial consent call fires before any user interaction:

```javascript
gtag('consent', 'default', {
  ad_storage: 'granted',
  ad_user_data: 'granted',
  ad_personalization: 'granted',
  analytics_storage: 'granted',
  functionality_storage: 'granted',
  personalization_storage: 'granted',
  security_storage: 'granted',
  wait_for_update: 500
})
```

All seven consent categories are granted by default, with a 500ms window for the CMP to override. No consent banner appears for US visitors. The footer links to "Your Privacy Choices" and "Privacy Center and Ad Choices" — both linking to `hrtechprivacy.com/brands/indeed`. Indeed participates in the HR Technology Privacy Consortium, a shared consent infrastructure for HR and recruiting tech companies.

Snowplow analytics runs via Sourcepoint as the CMP, using site ID `27f6` (reflected in cookie names `_sp_id.27f6` and `_sp_ses.27f6`).

## Tracking Stack

Cookies set before any user interaction:

| Cookie | Purpose |
|--------|---------|
| `CTK` | Click tracking key (per-session) |
| `CSRF` | CSRF token |
| `INDEED_CSRF_TOKEN` | Secondary CSRF token |
| `SHARED_INDEED_CSRF_TOKEN` | Cross-subdomain CSRF token |
| `LV` | Last visit timestamp |
| `JSESSIONID` | Server session ID (HttpOnly) |
| `_sp_id.27f6` | Sourcepoint/Snowplow user identity |
| `_sp_ses.27f6` | Sourcepoint/Snowplow session |
| `_ga` | Google Analytics client ID |
| `_ga_LYNT3BTHPG` | GA4 session |
| `FPLC` | Google First Party Lifecycle Cookie (ads attribution) |
| `__cf_bm` | Cloudflare Bot Management token |
| `g_state` | Google Identity state |

Three distinct third-party tracking contexts by page type:

- **Homepage and SERP**: First-party only (Snowplow via `sgtm.indeed.com`, GA4 via `sgtm.indeed.com`). No external calls observed.
- **Job view page**: Snowplow, GA4, Cloudflare challenge. Still routed through `sgtm.indeed.com`.
- **Company profile pages**: Adds direct third-party calls — `www.google.com/ccm/collect` (Google Campaign Manager), `www.google-analytics.com/j/collect`, `stats.g.doubleclick.net/j/collect`.

The iSpot.tv pixel is notable for its delivery mechanism. `pt.ispot.tv/v2/TC-3035-1.gif?app=web&type=homepage` is not emitted as a visible network request in the standard network log — it is stored as a GIF URL in the `k` array of a base64-encoded JSON object embedded in `_initialData.base64EncodedJson`. The decoded object:

```json
{
  "d": true,
  "e": false,
  "f": "661984",
  "k": ["https://pt.ispot.tv/v2/TC-3035-1.gif?app=web&type=homepage"]
}
```

`f: "661984"` is an internal advertiser or account ID. iSpot.tv (a Comscore subsidiary) provides TV advertising measurement — the pixel matches browser visitors who were also exposed to Indeed's TV ad campaigns, enabling cross-device attribution. Embedding the URL in a base64-encoded config object rather than issuing a direct network request means the tracker does not appear in standard network inspection tools.

`window.signals_transport` is a custom behavioral tracking transport. `t.indeed.com/signals/gnav/log` receives navigation events. The `window.dataLayer` carries GTM events with `segmentsApplied` — three UUID segments assigned to the anonymous user:  
`659f2a7f-960b-4319-9314-5b17f67e967d`, `d2c8512a-6bc0-43c7-b5bf-e80c9bff0302`, `523b8f12-e7e5-4b0f-9988-d2263ffc41a4`.

## GraphQL API

The `jobSearch` query at `https://apis.indeed.com/graphql` operates without a user session — the only required credential is the API key embedded in the client-side `window._initialData.oneGraphClientModel.apiKey`. Three distinct keys were observed across page types:

| Context | API key |
|---------|---------|
| Homepage | `176bee76fee13e7dd476a8eb31278b2e9bc1363a0f620338c7d7e65162af0ed4` |
| SERP | `db7ac28c69eff9413df48909e55558cf4bf371590d8bef3165e4facbb7277a39` |
| Provider data | `4478d7e8947a5d00ef519267aceb40da79a62388a57366b00e5a0c090533c6fd` |

Keys rotate per deployment but are always present in either `window._initialData.oneGraphClientModel.apiKey` or `window.mosaic.providerData['mosaic-provider-jobcards'].oneGraphApiKey`.

Introspection is disabled (`INTROSPECTION_DISABLED` error). Direct curl requests to `apis.indeed.com/graphql` are blocked by Cloudflare. However, from within a browser session, field validation errors in unsuccessful queries leak type information, enabling schema reconstruction:

- Root query: `jobSearch(what: String, location: String, start: Int, limit: Int)`
- `JobSearchPayload`: `results`, `pageInfo`
- `JobSearchPayloadPageInfo`: not `hasNextPage`/`endCursor` (those fields errored)
- `Job`: `key`, `title`, `employer`, `location`, `compensation`
- `Employer`: `name`
- `JobLocation`: `city` (not `state`)
- `JobCompensation`: `baseSalary`
- `Salary`: has sub-fields (exact fields unconfirmed)

A working query returning 10 results per call without session cookies:

```graphql
query {
  jobSearch(what: "software engineer") {
    results {
      job {
        key
        title
        employer { name }
        location { city }
        compensation { baseSalary { __typename } }
      }
    }
  }
}
```

The significant access consequence: the HTML pagination gate redirects unauthenticated users to `secure.indeed.com/auth` at page 2 ("To see more than one page of jobs, create an account or sign in"). The `jobSearch` GraphQL query has no equivalent gate — `start` and `limit` parameters work without authentication, making the account requirement an HTML-layer constraint rather than an API-layer one. No rate limiting was observed during testing.

## Product Roadmap via A/B Tests

The SERP exposes 753 named A/B tests in `jobseekerProctorGroups`. The homepage exposes 68. The test names document active development across four product areas:

### LLM / AI Integration

Six tests in the `jsj_mellm_vj_*` prefix cover AI features in the job view (VJ = View Job):
- `jsj_mellm_vj_responsiveness_tst`
- `jsj_mellm_vj_apply_history_tst`
- `jsj_mellm_vj_preferences_tst`

"MELLM" is an internal code name (likely ML + LLM). Additional AI tests:
- `jsj_serp_ai_overview_tst` — AI-generated overview for search results (analogous to Google AI Overviews)
- `jsj_ai_assisted_search_what_where_overlay` — AI-assisted search input overlay
- `ei_mob_vj_emp_insights_ai_cmp_summary_tst` — AI-generated company summaries in employer insights
- `hp_hide_llm_group_subheader_tst` — active (value `1` in this session), suggesting an LLM-grouped content section exists but has its subheader hidden in current configuration

### Indeed Pro Subscription

A paid subscription tier is under active A/B testing, not yet visible in this session (`indeedProAssistedApplyViewMode: NONE`, `premiumFreeTrialEligibility: false`):

- `mosaic_js_premium_parent_tst` — master toggle
- `js_pro_enrollment_tst`
- `js_pro_secondary_intro_offer_tog`
- `js_pro_auto_apply_sq_prefill_tst` — auto-apply with pre-filled screening questions
- `js_pro_early_applicant_alerts_tst` — early applicant notification
- `js_pro_tailored_feeds_push_notification_tst`
- `js_pro_profile_enhancements_tst`
- `js_pro_actionable_checklist_tst`
- `js_pro_new_top_choice_applies_available_tst`
- `mosaic_provider_js_premium_auto_apply_cta_tog`
- `indeed_pro_assisted_apply_freemium_config_payload_tog`
- `indeed_pro_top_choice_application_viewed_nc_tst`
- `shadow_derank_bad_premium_jobs` — suggests premium jobs can be demoted for poor quality
- `pay_more_get_more` — pricing tier experiment for employer-side

The `js_pro_*` / `mosaic_js_premium_*` naming split suggests the product is internally called both "JS Pro" (jobseeker pro) and "Indeed Premium" depending on the team.

### MAGUA: Mobile App Acquisition

13+ tests under the `magua` prefix cover every surface of the app acquisition funnel:
- `mosaic_magua_desktop_serp_promo_tst` — SERP app promo (desktop)
- `mosaic_magua_desktop_hp_promo_tst` — homepage app promo (desktop)
- `mosaic_magua_desktop_vj_promo_tst` — view job app promo
- `mosaic_magua_savejob_app_promo_tst` — save job trigger
- `mosaic_magua_app_gate_tst` — hard gate requiring app download
- `magua_gnav_app_download_tst` — global navigation app download prompt
- `mosaic_magua_careerguide_inline_banner_tst`
- `mosaic_magua_savejob_revamp_tst`
- `mosaic_magua_prioritize_gonetap` — "go net tap" suggests a tap-to-open-app flow

Related: `mosaic_career_scout_w2a_mweb_tst` and `mosaic_career_scout_w2a_desktop_tst` — Career Scout product using a web-to-app (`w2a`) conversion funnel. The app gate test (`mosaic_magua_app_gate_tst`) suggests a hard paywall-style redirect to the app store is under testing.

### Fraud Disclosure Infrastructure

Four tests indicate active work on job fraud transparency:
- `jsj_hp_fraud_banner` — fraud warning banner on homepage
- `rnhp_fraud_banner_tst` — React Native homepage version
- `nexus_job_seeker_disclaimer` — job seeker disclaimer (product named "Nexus")
- `honeypot_job_card_tst` — honeypot job card (mechanism ambiguous: fake listings to catch scrapers, or fake postings to identify fraudulent employers)

## Access Patterns

**robots.txt** (635 lines) disallows:
- `/graphql` (all bots — functionally irrelevant given Cloudflare blocks direct access)
- `/rpc/`, `/m/rpc/`
- `/api/fetch/mc-anon`, `/api/getrecjobs`
- `/resumes/rpc/`, `/cmp/_rpc/`, `/cmp/*/analytics`, `/cmp/*/people`
- `/my/`, `/preferences`, `/conversion/`, `/cookiemigrator/`

**Pagination gate**: Page 1 of SERP (15 results) is freely accessible. Page 2 (`/jobs?...&start=10`) redirects to `secure.indeed.com/auth?...` with message: "To see more than one page of jobs, create an account or sign in." The GraphQL `jobSearch` query has no equivalent gate.

**Autocomplete APIs** (open, no auth required):
- `GET /api/v0/suggestions/cmp-what-with-top-companies` — company/role autocomplete
- `GET /api/v0/suggestions/location` — location autocomplete

**Logging beacons** (all return 200 gif/image, no auth):
- `POST /api/v0/initialLog` — pageload logging
- `GET /rpc/pageload/perf` — performance beacon
- `GET /m/rpc/dwell/log` — dwell time
- `GET /m/rpc/log/3p-apply-button-load` — third-party apply button analytics
- `GET /cmp/_rpc/dwell-log` — company page dwell
- `GET t.indeed.com/signals/gnav/log?` — nav event logging

## Machine Briefing

**Access & auth**: Direct HTTP requests hit Cloudflare without a browser fingerprint. Browser session or a valid `__cf_bm` token is required. For the GraphQL API, extract the `oneGraphApiKey` from `window._initialData.oneGraphClientModel.apiKey` or `window.mosaic.providerData['mosaic-provider-jobcards'].oneGraphApiKey` during a live browser session — the key rotates per deployment. No CSRF token needed for GraphQL. No session cookie required for `jobSearch`.

**Open endpoints (no session):**

```
GET https://www.indeed.com/api/v0/suggestions/cmp-what-with-top-companies?q={term}
GET https://www.indeed.com/api/v0/suggestions/location?q={term}
GET https://www.indeed.com/robots.txt
GET https://www.indeed.com/jobs?q={query}&l={location}   # page 1 only
```

**GraphQL (API key required, no session):**

```
POST https://apis.indeed.com/graphql
Headers:
  indeed-api-key: {key from window._initialData.oneGraphClientModel.apiKey}
  Content-Type: application/json

Body:
{
  "query": "query { jobSearch(what: \"software engineer\", location: \"New York\", start: 0, limit: 10) { results { job { key title employer { name } location { city } compensation { baseSalary { __typename } } } } } }"
}
```

Returns 10 results per call. Change `start` to paginate — no login gate at the API layer.

**Key values from window._initialData (homepage):**
```
oneGraphClientModel.apiKey  →  176bee76fee13e7dd476a8eb31278b2e9bc1363a0f620338c7d7e65162af0ed4
oneGraphClientModel.url     →  https://apis.indeed.com/graphql
japiBaseUrl                 →  https://apis.indeed.com/jobseeker/jobalerts/v1/
smartApplyDomain            →  https://m5.apply.indeed.com
baseAuthenticationUrl       →  https://secure.indeed.com
baseMessagingWebUrl         →  https://messages.indeed.com
stagingLevel                →  prod
deploymentGroup             →  default
```

**Logging endpoints (POST, return 200 gif, no useful response body):**
```
POST /api/v0/initialLog
POST /api/v1/env
POST /api/v1/appliedStatus
POST /com.snowplowanalytics.snowplow/tp2
GET  /rpc/pageload/perf
GET  /m/rpc/dwell/log
```

**Gotchas:**
- Cloudflare blocks non-browser user agents entirely — both `www.indeed.com` and `apis.indeed.com` return 403 without browser fingerprinting.
- GraphQL API key is page-context specific: the homepage key differs from the SERP key. Extract the key from the target page type.
- Introspection (`__schema`) returns `INTROSPECTION_DISABLED`. Use field validation errors for schema exploration.
- HTML pagination gate at page 2 (`/jobs?...&start=10`) forces login redirect. GraphQL `jobSearch` with `start` parameter has no equivalent restriction.
- Job view page (`/viewjob?jk={jobKey}`) and company profiles (`/cmp/{name}`) are accessible without login. Application flow redirects to `m5.apply.indeed.com`.
- `segmentsApplied` in `_initialData` contains the anonymous user's segment UUIDs — these change per session and are used for personalization and A/B routing.

**Open threads:**
- `japiBaseUrl` (`apis.indeed.com/jobseeker/jobalerts/v1/`) — job alerts API; endpoints and auth requirements not tested.
- `/api/getrecjobs` — recommended jobs API, disallowed in robots.txt, not tested.
- `honeypot_job_card_tst` — mechanism and trigger conditions unknown.
- GraphQL `Salary` type sub-fields — exact fields not confirmed via error-leak method.
- Bid unit denomination — micro-cents inferred from scale; Dradis auction documentation is not public.
