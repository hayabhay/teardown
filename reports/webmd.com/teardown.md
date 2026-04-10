---
# agents: machine-friendly instructions in "## Machine Briefing"
title: WebMD — Teardown
url: "https://webmd.com"
company: WebMD
industry: Healthcare
description: "Consumer health information platform covering medical conditions, drugs, and symptoms."
summary: "WebMD runs a Vue.js 3 SSR frontend on Cloudflare CDN with Adobe Experience Platform as the analytics backbone and a first-party CNAME proxy (ssl.o.webmd.com). Backend is OpenResty/Nginx with Redis and Kubernetes/Rancher worker routing. Prebid.js runs header bidding across 20+ demand partners. The site is owned by Internet Brands, and its LaunchPad/LiveRamp identity configuration is shared across five health properties: medicinenet.com, emedicinehealth.com, onhealth.com, rxlist.com, and vitals.com."
date: 2026-04-07
time: "00:42"
contributor: hayabhay
model: sonnet-4.6
effort: high
stack: [Vue.js, Adobe Experience Platform, Cloudflare, Prebid.js, OpenResty, Kubernetes]
trackers: [Google Analytics, Google Ad Manager, Adobe Analytics, Adobe Audience Manager, Facebook Pixel, Twitter Pixel, Reddit Pixel, Pinterest Pixel, OneTrust, ID5, LiveRamp ATS, 33Across, LiveIntent, IntentIQ, Tapad, TruAudience, Criteo, Amazon Publisher Services, DoubleVerify, Lotame, Conversant, PubMatic, Rubicon]
tags: [health, advertising, identity-graph, consent, surveillance, ad-tech, internet-brands, prebid, cross-publisher]
headline: "Browsing a depression or diabetes page tags your ad profile with health-condition labels sent to 20+ bidders — most visitors never see a consent prompt."
findings:
  - "Health condition browsing encodes into Adobe Audience Manager segment IDs that accumulate as you navigate — 6 segments on the homepage, 35+ after visiting diabetes, depression, and drugs pages — and every segment is passed to programmatic bidders via GAM bid parameters, where media.net translates them into readable labels like iab_medical_health and iab_pharmaceutical_drugs."
  - "OneTrust is configured with an 'IB - Null' (no banner) template for all non-CCPA US states and non-EU countries, so the majority of visitors worldwide receive no consent prompt while 48 third-party tracking calls fire on first page load."
  - "A gtinfo cookie set on every response encodes the visitor's city, state, ZIP, lat/lon, and DMA as unprotected JSON with no HttpOnly flag — readable by every ad script on the page, and confirmed read by the Tapad/Experian identity script before setting a cross-device tracking ID."
  - "A single visit to webmd.com enrolls the visitor into ID5 identity instances for six Internet Brands properties simultaneously (medicinenet.com, emedicinehealth.com, onhealth.com, rxlist.com, vitals.com) via a shared LaunchPad configuration — one health search, six publisher profiles."
  - "The consent management scripts deployed to production carry a -dirty git suffix (gdpr-ccpa/HEAD@6a0b974-dirty, v3.3.0), and global-metrics.min.js embeds the internal GitLab URL (gitlab.webmd.com/WebMD/Consumer/global-metrics) and a build engineer's name in a publicly-served comment."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

WebMD is the highest-traffic consumer health information site in the United States. The teardown covers the homepage, condition pages (diabetes, depression, obesity, heart failure, Alzheimer's), the drugs index, the pill identifier, the drug interaction checker, and the symptoms subdomain. Investigation was conducted on a fresh session from a US-based IP.

## Architecture

WebMD's frontend is Vue.js 3 with server-side rendering. The presence of `window.__INITIAL_STATE__` on page load and hydration-related globals confirms SSR delivery. The webpack chunk namespace `window.webpackChunkpage_responsive_homepage_in_vue_091e9c5e823d0cb2` includes the asset hash ID directly in the global name, leaking the internal build fingerprint to any JavaScript running on the page.

The CMS is called "aspen." Analytics globals `s_datasource: aspen` and `s_pagedatasource: pb3` expose the CMS name and what appears to be a preview/build pipeline identifier. `s_account: webmdcom`, `s_company: webmd`, `s_site: core` round out the Omniture/Adobe Analytics configuration that is inlined into every page.

The backend is OpenResty 1.27.1.2 (confirmed from API 400 response) sitting behind Cloudflare CDN. Response headers expose the full infrastructure routing picture:

- `x-backend: default` / `x-backend-by: default` — backend tier name
- `x-datacenter: LA1` — origin datacenter in Los Angeles
- `x-redis: redis_server_2` — named Redis instance handling this request
- `x-route: pg` / `x-runtime: new` — routing and runtime designations
- `x-cache-control-by: override` — cache behavior is being overridden from defaults

The `lrt_wrk` cookie encodes the complete Kubernetes/Rancher worker configuration for the session as a plaintext string: `lrt_cached_consumer_worker_rancher_cluster_6_6R_4W_2026-04-02_13:50:56_gdbp_false_gtedgefrom_MA1_E_false_UC_false_UD_false_active_true_from_LA1_config_envName_active_active_envNameFound_undefined_actv_true_blk_N/A`. This includes cluster name, read/write replica counts, worker config timestamp, geo edge routing (MA1 vs LA1), and feature flags.

Adobe Experience Platform (Alloy v2.30.0) handles analytics and event streaming. WebMD has configured a first-party CNAME proxy: calls to `/ee/or2/v1/interact` are routed via `ssl.o.webmd.com`, appearing as first-party network traffic while terminating at Adobe's edge network. The LaunchPad configuration object (`window.launchPadConfiguration`, ID: `6b7861b9-e6a3-4234-b802-6136d561c1f6`, configVersion: 11) handles the LiveRamp ATS identity bridge. Adobe org ID `16AD4362526701720A490D45` appears in cookie names (`AMCV_16AD4362526701720A490D45@AdobeOrg`).

Header bidding runs on Prebid.js v9.45.0 via `window.pbjs`. Google Ad Manager (`window.googletag`) handles ad delivery. Secondary CDN for per-page JS config objects uses CloudFront backed by S3 (domain `dyv1bugovvq1g.cloudfront.net`, 300s TTL, 60-day S3 cleanup rule).

The SSL certificate covers only `www.webmd.com` and `*.www.webmd.com` — a narrow scope that means subdomains like `symptoms.webmd.com` use separate certificates.

WebMD is owned by Internet Brands. Bug bounty is run through Bugcrowd at `https://bugcrowd.com/internetbrands-public`.

## Consent Configuration

OneTrust manages consent under domain GUID `797d052a-d0f4-447d-b9ae-0a293fb5e41f`, tenant GUID `ebe19500-bc8d-487f-9d89-98fde8b270e2`. The ruleset has four entries:

| Rule | Scope | Template | Banner shown? |
|------|-------|----------|---------------|
| US Only / Non CCPA States | US visitors not in CCPA states | IB - Null | No |
| Global | All non-EU, non-CCPA countries | IB - Null | No |
| CCPA | 19 US states (CA, TX, VA, CO, CT, OR, TX, etc.) | (DNT) Current CCPA Template - All WebMD Sites | Opt-out banner |
| EU | EU/EEA + Brazil + Quebec | Test GDPR Template 2 | Opt-in banner |

"IB - Null" is a template with no visible UI component — it renders nothing. The `IB` prefix suggests this is an Internet Brands custom template. For a US visitor in a non-CCPA state (roughly 31 states), or for any visitor from Canada, Japan, India, Australia, Mexico, or the rest of the non-EU world, WebMD loads with all consent groups active (`C0001,BG645,C0002,C0004,C0003`) from the first request, before any page interaction.

On a fresh session (no cookies, US IP), 191 HTTP requests fire on homepage load. Of those, 188 are third-party across 48 domains. This includes identity enrollment, social pixels, analytics, and real-time bidding — all executing before any consent acknowledgment for the majority of the global visitor population.

The EU template name "Test GDPR Template 2" suggests EU consent handling is still under active development rather than a finalized production configuration.

The CCPA-specific configuration blob (`0199acdf-52f2-74d5-b481-eebcd0ea6788.json`) returns an Azure Blob Storage 404: `<Code>BlobNotFound</Code>`. The specific CCPA preference-record config is absent from the CDN; the banner can still render from cached configuration, but CCPA preference-record handling may be degraded.

## Health Data in the Ad Auction

The `aam` cookie stores Adobe Audience Manager segment IDs for the conditions visited in the current session. These are numeric identifiers that map to health-topic audience buckets within Adobe's DMP. On the homepage, a fresh session accumulates 6 segment IDs (e.g., `aam=999991,2792,32927,529440,2845,3319`). After visiting diabetes, depression, obesity, and drugs pages in sequence, the same cookie grows to 35+ segment IDs.

Every Google Ad Manager call includes a `cust_params` query string. The relevant parameters attached to each ad auction:

- `dmp=` — comma-separated AAM segment IDs representing health conditions browsed
- `dzip=` — ZIP code of the visitor (sourced from the gtinfo cookie)
- `dst=` — state abbreviation
- `ddma=` — DMA market code (e.g., 807 for San Francisco)
- `tuid=` — TruAudience user identifier
- `mnetSgmt=` — media.net's own segment encoding

The `mnetSgmt` parameter is notable: media.net translates the raw segment IDs into readable IAB Content Taxonomy labels before including them in its own bid requests. Observed labels include `iab_medical_health`, `iab_weight_loss`, `iab_pharmaceutical_drugs`, and `iab_healthy_living`. This means every media.net bid request on a WebMD health page includes a human-readable label of what health category the visitor was reading.

A `fipt` key in localStorage accumulates an array of topic IDs for pages visited in the current session. After browsing diabetes, depression, obesity, drugs, and pill identifier pages, the observed value was `["1728","7019","3630","4046","4030","1667","1626","1663","3570"]`. The current page's topic ID is passed to GAM as a bid parameter. Any third-party JavaScript running on WebMD pages — which includes all 20+ Prebid demand partners — can read localStorage and construct the in-session health topic browse history.

One sensitivity gate exists: `s_sensitive` is a boolean flag in `window.__INITIAL_STATE__`. When true, the Tapad/Experian identity script does not fire and no new `TapAd_DID` is set. The investigator mapped `s_sensitive` values across condition pages:

| Page | s_sensitive |
|------|------------|
| Diabetes | false |
| Depression | false |
| Mental Health (general) | false |
| Sexual Conditions | false |
| HIV/AIDS | true |

The gate is narrow. A `TapAd_DID` set on a depression page is subsequently passed in Adobe AEP events (`audience.tapid`) even when the visitor navigates to an HIV/AIDS page — the gate prevents new collection on sensitive pages but does not prevent continued attribution using IDs established on non-sensitive pages. The `s_sensitive` flag is itself exposed in `window.__INITIAL_STATE__` and is readable by any script on the page.

## Identity Graph

Eight identity systems fire on first page load of webmd.com:

**ID5 Universal ID** (`window.ID5`): Calls `id5-sync.com/gm/v3` and `/g/v2/787.json` (publisher ID 787). The network log also shows calls for publisher ID 1129. WebMD's LaunchPad configuration enrolls the visitor into ID5 instances for each Internet Brands property simultaneously — meaning a single visit to webmd.com creates `id5id_v2_*` localStorage keys for medicinenet.com, rxlist.com, and other portfolio properties. Eight or more distinct ID5 publisher ID instances were observed in per-page localStorage.

**LiveRamp ATS** (`window.ats`): Calls `api.rlcdn.com/api/identity/envelope` (5 requests observed on homepage alone). The LaunchPad config covers: `webmd.com`, `medicinenet.com`, `emedicinehealth.com`, `onhealth.com`, `rxlist.com`, `vitals.com`, and `staging.webmd.com`. LiveRamp's identity bridge is configured to recognize the same visitor across all Internet Brands health properties. Also writes `_sharedID` and `_lc2_fpi` (LiveConnect second-party ID) cookies.

**LiveIntent** (`rp.liadm.com/j`): Sets `HB_liveIntentId` cookie for header bidding identity. Also hits `idx.liadm.com/idex/prebid/25712`.

**33Across** (`lexicon.33across.com/v1/envelope`): Sets `33acrossIdTp` cookie.

**IntentIQ** (`sync.intentiq.com/profiles_engine/ProfilesEngineServlet`): Identity profile matching for programmatic.

**TruAudience**: Sets `truAudience_id` cookie. ID passed to GAM as `tuid=`.

**Criteo** (`window.criteo_pubtag`): Identity and retargeting.

**Amazon Publisher Services** (`window.apstag`): Calls `aax.amazon-adsystem.com/e/dtb/bid` for Amazon's demand-side bidding.

Additional: **Lotame** (`bcp.crwdcntrl.net/6/map`) for DMP sync; **Conversant/Dotomi** (`proc.ad.cpe.dotomi.com/cvx/client/direct/launcher`) for Epsilon identity resolution; **DoubleVerify** (`pub.doubleverify.com/dvtag/signals/*`) for brand safety signals.

`rtb.adentifi.com` handles cookie syncing with PubMatic. The request URL includes `us_privacy=1YNY` — the IAB CCPA consent string format indicating the user has not opted out and the caller acknowledges this is a sale of personal data.

Cookies set on first page load without user interaction:

| Cookie | Owner | Notes |
|--------|-------|-------|
| `_fbp` | Facebook Pixel | fb.1.{timestamp}.{random} |
| `_rdt_uuid` | Reddit Pixel | UUID |
| `_pin_unauth` | Pinterest | encoded ID |
| `_twpid` | Twitter/X Pixel | UUID |
| `_ga` / `_gid` | Google Analytics | GA1.1.{client_id} |
| `_sharedID` | LiveRamp/Prebid SharedID | UUID |
| `panoramaId` | LiveRamp | hashed ID |
| `ppid` | WebMD proprietary | publisher-generated ID |
| `TapAd_DID` | Tapad/Experian | UUID, set via hidden iframe postMessage |
| `truAudience_id` | TruAudience | UUID |
| `33acrossIdTp` | 33Across | UUID |
| `aam` | Adobe Audience Manager | comma-separated segment IDs |
| `AMCV_16AD4362526701720A490D45@AdobeOrg` | Adobe Marketing Cloud | Visitor ID |
| `OTGPPConsent` | OneTrust | Global Privacy Platform string |
| `VisitorId` | WebMD | UUID, 10-year expiry, no HttpOnly, no Secure |

The `VisitorId` cookie is domain-wide (`domain=webmd.com`), has a 10-year expiry, and is set without `HttpOnly` or `Secure` flags. It is accessible from JavaScript across all webmd.com subdomains and transmittable over HTTP connections.

## Build Artifacts and Infrastructure Exposure

`global-metrics.min.js` is served publicly at `https://img.lb.wbmdstatic.com/webmd_static_vue/file-explorer/webmd/global-metrics/global-metrics.min.js`. Its opening line:

```
/*! Build Date: 2/9/2026, 6:07:46 PM - Repo: https://gitlab.webmd.com/WebMD/Consumer/global-metrics - Package Version: "2.26.0" - User: Ryan Lu */
```

This embeds: the internal GitLab server hostname (`gitlab.webmd.com`), the project namespace (`WebMD/Consumer/`), repository name, build timestamp, version string, and the name of the engineer who ran the build. The GitLab host is not publicly accessible, but the path structure confirms WebMD's internal GitLab organization scheme.

Both consent management scripts (`otCCPAiab.min.js` and `webmd-ccm.min.js`) include:

```
/* repo: gdpr-ccpa/HEAD@6a0b974-dirty - Package Version: 3.3.0 - 2026-03-10 09:17 am - User: */
```

The `-dirty` suffix means the deployed build was compiled from a working tree with uncommitted changes. These are the scripts that control consent banner display and which tracking categories fire. The `User:` field is blank here, unlike global-metrics.

Response headers on every request:

- `x-datacenter: LA1` — origin datacenter
- `x-redis: redis_server_2` — named Redis instance
- `cfheader: {"cfbotscore":1,"cfja3":"0149f47eabf9a20d0893e2a44e5a6323","cfja4":"t13d3112h2_e8f1e7e78f70_b26ce05bbdd6","cfasn":7922,"cfray":"9e84d54dca58b828","tip":"73.223.27.123"}` — Cloudflare edge metadata including the visitor's true IP, JA3 and JA4 TLS fingerprints (which uniquely identify the TLS client configuration, effectively a device fingerprint at the transport layer), bot score, and ASN.
- `x-dbg-gt` — a debug geolocation header present on every response, containing what appears to be a backend or CDN node's geolocation rather than the visitor's

`gtinfo` cookie is set on every request with full visitor geolocation: `{"ct":"San Francisco","c":"San Francisco","cc":"6075","st":"CA","sc":"5","z":"94123","lat":"37.8","lon":"-122.44","dma":"807","cntr":"usa","cntrc":"840","tz":null,"ci":"73.223.27.123"}`. No `HttpOnly` flag, no `Secure` flag — readable by any JavaScript on the page, including all third-party ad scripts. The Tapad/Experian script reads `gtinfo` values before setting the cross-device `TapAd_DID` identifier.

## Supply Chain Anomalies

The symptom checker (`symptoms.webmd.com`) and the drug interaction checker (`/interaction-checker/default.htm`) run Prebid under a different supply chain entity. Network calls to `id.a-mx.com/sync/` from these pages include `vg=saambaa_pbjs` — identifying `saambaa.com` as the vendor group. The main content pages use a different configuration. The symptom checker also uses a distinct GAM publisher network ID (`/22784401475/` versus `/4312434/` on main content pages). `saambaa.com` redirects to `go.saambaa.com` and functions as an intermediate publisher in the RTB chain for these properties.

The presence of saambaa_pbjs on both `symptoms.webmd.com` and the interaction checker on the main domain suggests this is a programmatic arrangement covering WebMD's health tool inventory specifically, distinct from editorial health content monetization.

A WordPress endpoint (`/wp-json/pubcid/v1/extend/`) is called from the drugs and interaction checker pages and returns 404. This is a WordPress REST API path with no handler on WebMD's stack — a publisher content ID library calling a WordPress-specific endpoint that was never implemented.

## Robots.txt and AI Blocking

Robots.txt was updated 2026-03-04 under ticket reference CONSFE-362. The CONSFE Jira prefix likely stands for "Consumer Front End."

Full-site blocks applied to:
```
CCBot
ChatGPT-User
ClaudeBot
GPTBot
Doximity
```

Doximity is the largest physician professional network in the US. Its explicit block alongside AI crawlers suggests a deliberate content-protection posture against both AI training and competitor scraping.

Paths revealed by disallow rules: `/dna`, `/story/`, `/aim/`, `/static/`, `/mm/`, `/kapi/`.

## Machine Briefing

**Access and auth**: All content pages are publicly accessible without authentication. Cookie state builds across requests — `VisitorId` is set on first response. No bot detection triggers on standard GET requests. All endpoints return `Access-Control-Allow-Origin: *`, so cross-origin fetch works from any domain.

**Open endpoints (no auth required)**:

```bash
# Physician/provider finder — CORS wildcard, lat/lon required
curl "https://www.webmd.com/kapi/secure/phydir/carefinder?topicid=1728&capid=1&lat=37.8&lon=-122.44"

# Consent configuration (full OneTrust ruleset)
curl "https://cdn.cookielaw.org/consent/797d052a-d0f4-447d-b9ae-0a293fb5e41f/797d052a-d0f4-447d-b9ae-0a293fb5e41f.json"

# media.net segment config
curl "https://img.lb.wbmdstatic.com/webmd_static_vue/file-explorer/webmd/consumer_assets/site_images/mnet-config/mnet-config.json"

# Global metrics script (contains GitLab URL in comment)
curl "https://img.lb.wbmdstatic.com/webmd_static_vue/file-explorer/webmd/global-metrics/global-metrics.min.js"

# Consent management script (contains dirty git hash in comment)
curl "https://img.lb.wbmdstatic.com/webmd_static_vue/file-explorer/webmd/consumer_assets/site_images/webmd-ccm/webmd-ccm.min.js"
```

**Adobe AEP Edge**:

```bash
# First-party proxy (appears as WebMD origin in network logs)
POST https://ssl.o.webmd.com/ee/or2/v1/interact
# Requires properly formed Adobe XDM event payload and datastream config

# Direct AEP edge
POST https://www.webmd.com/ee/v1/interact
```

**Encrypted search (not accessible without key)**:

```
GET https://www.webmd.com/search/2/api/qa_program_meta?enc_data={encrypted_payload}
GET https://www.webmd.com/search/2/api/drug_news?enc_data={encrypted_payload}
# Response without key: enc_data invalid
```

**Cookies to capture on first request**:
- `gtinfo` — JSON geolocation blob (city, state, ZIP, lat/lon, DMA, IP), no HttpOnly, JavaScript-readable
- `lrt_wrk` — full Kubernetes/Rancher worker routing string including cluster ID and config state
- `VisitorId` — WebMD UUID, 10-year TTL, domain-wide
- `aam` — Adobe Audience Manager segment IDs (grows with browsing)

**Response headers to capture on every request**:
- `cfheader` — Cloudflare edge metadata: bot score, JA3/JA4 fingerprints, ASN, true IP
- `x-dbg-gt` — server-side geolocation debug (secondary/CDN node IP)
- `x-datacenter` — origin datacenter name (LA1)
- `x-redis` — backend Redis instance name

**Gotchas**:
- The carefinder endpoint is disallowed under `/kapi/` in robots.txt but is live and unauthenticated.
- `symptoms.webmd.com` and `/interaction-checker/` use `saambaa_pbjs` as the Prebid vendor group and a different GAM network ID (`/22784401475/`).
- `s_sensitive` in `window.__INITIAL_STATE__` gates Tapad/Experian identity collection — `"true"` on HIV/AIDS, `"false"` on most other health pages. TapAd_DID once set continues to be passed on sensitive pages.
- SSR initial state is in `window.__INITIAL_STATE__` (route, pagedata, cms, flow, quiz, launchpad objects).
- `/mm/choose` (A/B test assignment) returns Forbidden without session context.
