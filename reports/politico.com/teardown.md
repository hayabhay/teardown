---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "POLITICO — Teardown"
url: "https://www.politico.com"
company: "POLITICO"
industry: "Information"
description: "US political news organization and B2B intelligence platform owned by Axel Springer."
summary: "POLITICO runs Brightspot CMS with a Nuxt 3 (Vue) SSR frontend behind Cloudflare and Varnish 8.0, with Piano for subscription metering and Tealium as the primary tag manager and CDP. Ad delivery runs through Axel Springer's proprietary platform (asadcdn.com) with Prebid.js header bidding across 14+ demand partners. A subscriber enrichment form collects professional identity data -- employer, title, industry, seniority -- routed directly to the Tealium CDP for audience segmentation."
date: "2026-04-13"
time: "20:07"
contributor: "hayabhay"
model: "sonnet-4.6"
effort: "high"
stack: [Brightspot CMS, Nuxt 3, Varnish, Cloudflare, Piano, Tealium, Prebid.js]
trackers: [Adobe Analytics, Chartbeat, Tealium, Lotame, Piano, Sourcepoint, LinkedIn Insight Tag, Google Ads, ComScore, Nielsen DCR, Marketo, Amazon APS, LiveRamp ATS, 33Across, Outbrain, Twitter Pixel, Cxense, Everest Analytics, Google Tag Manager, Insiad]
tags: [news-media, political, b2b, identity-resolution, ad-tech, subscription, axel-springer, chartbeat, prebid, consent]
headline: "POLITICO's subscriber form asks for employer, industry, and seniority -- with options like Congress and Foreign Government -- routing political identity straight to the ad-targeting CDP."
findings:
  - "The public utag.js maps 25 internal dev subdomains and still names the Adobe Analytics account 'allbrittonpolitico2' -- five years after Allbritton Communications sold to Axel Springer."
  - "Axel Springer's proprietary ad server (asadcdn.com) runs on POLITICO with a political ad disclosure module in German and a utiq.js conditional referencing Bild tabloid hardcoded in the US site's code."
  - "Amazon Publisher Services activates 23 identity resolution vendors per anonymous session -- LiveRamp, Lotame, Criteo, id5, 33Across, Merkle, and 17 more running simultaneously on first page load."
  - "Subscriber enrichment fields collect employer, job title, industry (Congress, Foreign Government, Law/Lobbying, Think Tank), and seniority (C-Level, Legislative Role), each mapped to a Tealium AudienceStream attribute ID for ad segmentation."
  - "Chartbeat Heads Up runs continuous headline A/B testing across the site -- every article headline is a potential experiment, with the chosen variant tracked against click-lift."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

POLITICO is a political news site built for two audiences: the readers who consume the reporting and the advertisers who want to reach Washington insiders. The technical infrastructure reflects this dual purpose. Underneath the Nuxt 3 frontend is a dense identity resolution stack, a subscriber enrichment pipeline that explicitly categorizes readers by their role in the political economy, and an ad delivery platform inherited from the German parent company. The site fires 68 third-party requests across 42 domains on the homepage alone, coordinated through Tealium's CDP and Axel Springer's proprietary ad server.

## Architecture

POLITICO runs Brightspot CMS (Java-based enterprise CMS) with a Nuxt 3 (Vue) SSR frontend, delivered through Cloudflare CDN and a Varnish 8.0 caching layer. The double-layered setup is visible in response headers: `server: cloudflare` alongside `via: 1.1 varnish-64b765f794-... (Varnish/8.0)` and `x-varnish-cache: HIT/MISS`. Every page carries `<meta name="brightspot.contentId">` with Brightspot object IDs in the format `0000XXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX` -- the 404 page returns its own contentId (`0000014d-919b-d9bc-a36f-959b45e50000`). Piano handles subscription metering (`passportThreshold: 100`, account ID `SGPIPyCUiM`). Tealium (account: `politico/main/prod`) is the primary tag manager and CDP. The backend API at `api.politico.com` returns 401 with Spring Security characteristics; paths like `/spring/cms-api/v1/piano/register` point to a Spring Boot backend layer behind the Nuxt frontend.

Cloudflare blocks headless Playwright at the CDN layer -- the site serves a "Just a moment..." JavaScript challenge to automated requests. The SSL certificate is narrowly scoped to `www.politico.com` as the only SAN.

The response headers carry a CORS misconfiguration: `access-control-allow-origin: *` and `access-control-allow-credentials: true` appear simultaneously on every response. Per the browser spec, this combination is rejected -- credentials cannot be sent to a wildcard origin -- so it is not exploitable via browser XHR. It indicates the backend does not validate the Origin header at all, returning `ACAO: *` unconditionally regardless of the requesting origin. A misconfiguration, not a vulnerability, but architecturally sloppy for a site handling subscriber sessions.

## Multi-Site Architecture

POLITICO runs four distinct properties on different stacks:

- **politico.com** -- Brightspot CMS + Nuxt 3 (Vue), Cloudflare + Varnish. The main editorial and subscriber stack.
- **politicopro.com** -- WordPress 6.x on WP Engine. The POLITICO Pro marketing and lead-gen site. A public WP REST API at `/wp-json/wp/v2/` returns teaser and landing pages for Pro Analysis and Pro News content -- designed to surface in search and funnel subscription conversions. Actual Pro subscriber content lives behind the main Brightspot stack.
- **politico.eu** -- WordPress on WP Engine. The European edition, separate infrastructure.
- **eenews.net** -- WordPress with WP Rocket cache. An acquired environmental news property.

Only the main editorial site runs the full Axel Springer stack. Every subsidiary and marketing property defaults to WordPress. The editorial CMS at `cms.politico.com` is protected by Cloudflare Zero Trust Access, redirecting to `politicocfa.cloudflareaccess.com` for SSO. The `/_styleguide` path (internal design system) similarly routes to Cloudflare Access. `/_preview` returns 404 but exists in the robots.txt Disallow list.

The sitemaps reveal 19+ years of content: `sitemap.xml` is a sitemapindex with one sub-sitemap per month from `sitemap-200701.xml` (January 2007) through the current month. `news-sitemap.xml` feeds into `news-sitemap-content.xml` and `news-sitemap-latest.xml` for Google News.

## The Axel Springer Ad Platform

Ad delivery on politico.com runs through `asadcdn.com`, Axel Springer's proprietary CDN-based ad platform. Version 8.16.37 is served from Akamai NetStorage. The platform is modular -- 150+ JS files assembled at runtime -- with POLITICO-specific extensions: `politicalAds`, `politicoNative`, `politicoEUNative`, and `vicki` (POLITICO's video ad integration).

The `politicalAds` extension includes a political advertising disclosure module that labels ads "Politische Anzeige" (German: "Political Advertisement") with a transparency link pointing to `axelspringer.github.io/politicalads-transparency`. This is Axel Springer's German-market compliance code running on the US editorial property.

The `utiq.js` module within asadcdn.com contains hardcoded logic: `"sportbild.de" === ASCDP.pageSet.siteDomain ? "bild.de"`. The German tabloid Bild and its sports sister Sportbild are domain references in the same codebase serving politico.com -- a direct artifact of shared infrastructure across the Axel Springer portfolio.

Integrated ad-tech partners within asadcdn.com: `ada`, `admantx`, `amazon`, `confiant`, `contactimpact`, `cxsense`, `doubleverify`, `id5`, `lotame`, `netId`, `permutive`, `prebid`, `ps`, `teads`, `utiq`. Confiant (publisher ID: `VQj_mDSOCf-iL2iwpqQhj4-0nkA`) handles ad malware and fraud scanning. DoubleVerify handles viewability and brand safety.

Header bidding runs via Prebid.js with 14 demand partners: 3lift, Rubicon, OpenX, Criteo, PubMatic, SmartAdServer, Media.net, Teads, AppNexus (Xandr), YellowBlue, MinuteMedia, Amazon AAX, Sharethrough, and 33Across. AppNexus tag (`apntag`) and Google Publisher Tags (`googletag`) run alongside Prebid. Custom functions `politicoAds`, `displayAds`, and `generateAdSlot` handle ad slot configuration.

## Professional Identity Data Collection

`POLITICO_CONFIG` -- embedded as a global on every page load -- contains a `fpdConfig` block that defines a first-party data collection form with six fields:

| Field | Type | Tealium AudienceStream ID | Tealium Key |
|---|---|---|---|
| Employer | text | 55707 | job_employer |
| Job Title | text | 49199 | job_title |
| Industry | select | 49201 | job_industry |
| Job Seniority | select | 57356 | job_seniority |
| First Name | text | 62699 | first_name |
| Last Name | text | 62701 | last_name |

Each field has an `audienceStreamId` -- these are Tealium AudienceStream attribute IDs. When a registered user fills out this form, their data writes directly into POLITICO's Tealium CDP as named audience attributes.

The Industry dropdown options include: Congress, Foreign Government, Law/Lobbying, Think Tank. Job Seniority options include: C-Level/C-Suite, Legislative Role. These are not generic demographic categories -- they are a professional taxonomy mapped to the Washington, DC political economy. POLITICO explicitly asks whether a subscriber works for Congress, a lobbying firm, a foreign government, or a think tank, and stores that answer as a trackable, targetable attribute.

This is POLITICO's "Passport" subscriber enrichment system (the metering system is called Passport internally, threshold: 100 points). When a registered subscriber fills it in, their verified professional identity -- employer, title, industry category, seniority level -- flows into the CDP and becomes available for audience segmentation and ad targeting. The presence of first_name/last_name fields suggests this is post-registration enrichment rather than a pre-login gate. The fields are defined in client-side config loaded on all pages.

## Surveillance & Identity Graph

The homepage fires 72 total requests: 4 first-party, 68 third-party across 42 domains.

**Cookie inventory** (JavaScript-accessible on homepage load):

- Tealium session: `utag_main__*` (6 cookies tracking session state, previous page, timestamps)
- Piano: `__pat`, `__pvi`, `__tbc`, `xbc`, `_pctx` -- consent and visitor tracking
- LiveRamp ATS: `_cc_id`, `_cc_cc`, `_cc_aud` -- authenticated traffic solution, identity matching
- Lotame: `panoramaId`, `panoramaIdType`, `panoramaId_expiry` -- cross-publisher Panorama identity (90-day expiry)
- Google: `_gcl_au` -- click attribution
- Chartbeat: `_cb`, `_chartbeat2`, `_cb_svref` -- engagement tracking
- Nielsen: `nol_fpid` -- Nielsen Digital Ad Ratings
- Cxense/Piano DMP: `cX_P` -- content intelligence
- Publisher Common ID: `_pubcid` -- cross-publisher identity
- Twitter: `_twpid` -- Twitter pixel ID
- A/B tests: `_t_tests` -- Chartbeat Heads Up experiment assignments
- CMP: `_sp_user_consent_35511` (Sourcepoint), `alienWasCalled` (internal flag confirming CMP ran)

**localStorage identity graph:**

- `petra`, `petra_cst` -- Amazon Petra, cross-site identity resolution UUID (1-year expiry)
- `li_adsId` -- LinkedIn Ads ID
- `lotame_2641_auds` -- Lotame audience segment IDs
- `panoramaId` -- Lotame Panorama ID
- `33acrossId` -- 33Across identity (base64 value, 90-day expiry)
- `aps:3875:*` -- Amazon Publisher Services session state

**Amazon Publisher Services** (publisher ID: 3875) activates 23 identity resolution vendors per session via `aps:3875:idVendors/enabled`: liveintent, merkle, intimateMerger, pair, amx, 33across, fTrack, captify, publink, anonymised, quantcast, idPlus, unifiedid, ddb_key_638, fabrick, uid, criteo, yahoo, liveRamp, id5, pubcommon, audigent, lightPublisherAudiences, lotame. Each vendor SDK attempts to match the current anonymous visitor to its own identity graph on every page load.

**Full tracker inventory:**

1. **Google Tag Manager** (`www.googletagmanager.com`)
2. **Adobe Analytics** -- AppMeasurement via Tealium (account: `allbrittonpolitico2`)
3. **Chartbeat** -- engagement + Heads Up A/B headline testing (uid: 33430)
4. **Tealium** -- tag manager + CDP (`politico/main/prod`)
5. **Lotame DMP** -- audience data (client 2641), Panorama cross-publisher ID (`bcp.crwdcntrl.net`)
6. **Piano** -- subscription metering and CRM (account: `SGPIPyCUiM`)
7. **Sourcepoint** -- consent management (accountId: 1962, propertyId: 35511)
8. **LinkedIn Insight Tag** -- conversion tracking (partner: 150684)
9. **Google Ads** -- remarketing (ID: 825814891) + Consent Mode
10. **ComScore** (utag.96, c2: 8298892)
11. **Nielsen DCR** (utag.206, apid: `PE72C6984-84A4-4249-898F-414DD7A977DB`, apn: "POLITICO")
12. **Marketo** (utag.276, account: 966-KHF-533) -- B2B marketing automation
13. **Amazon APS** -- header bidding + 23-vendor identity resolution (publisher: 3875)
14. **33Across** -- ID graph (`lexicon.33across.com`)
15. **LiveRamp ATS** -- authenticated traffic identity
16. **Prebid.js** -- header bidding orchestration
17. **Outbrain** -- native ads/recommendations (`mcdp-wndc1.outbrain.com`)
18. **Twitter/X Syndication** -- embed + pixel (`syndication.twitter.com`)
19. **Cxense/Piano DMP** -- content intelligence (`cX_P` cookie)
20. **Insiad** -- international ad tech, device detection and currency rates (`events.insiad.com`, `dd.insiad.com/geodevicedetect`, `dd.insiad.com/currency-rates`)
21. **Everest Analytics** (`www.everestjs.net`)
22. **Snap/LinkedIn Analytics** (`snap.licdn.com`)

**Consent behavior:** Sourcepoint CMP is configured for USNAT (US National Privacy, `applicableSections: [7]`). On first visit, `_sp_user_consent_35511` is auto-created with `consentedToAll: true` and `consentedToAny: false` -- a logically inconsistent state (if consented to all, consented to any should also be true). The `alienWasCalled` cookie confirms the CMP ran. No user interaction is required for all trackers to fire from the first request. No TCFV2 (EU) consent framework is configured on politico.com despite politico.eu existing as a separate European property.

**Marketo B2B pipeline:** Tealium tag utag.276 (Marketo, account `966-KHF-533`) fires on `/registration`, `/profile-settings`, `/_login`, and `/settings`. Any user on these pages with a `_mkto_trk` cookie builds a Marketo person record from their activity -- viewed login page, visited settings, completed registration. Combined with the fpdConfig professional profile, POLITICO can score inbound leads for POLITICO Pro subscription conversion. This is B2B SaaS marketing infrastructure running on a consumer news site.

## The utag.js Dev Environment Exposure

The publicly served `utag.js` contains the logic that maps domains to Adobe Analytics account names. Every non-production subdomain routes to `allbrittonpoliticodev`; all other traffic falls back to `allbrittonpolitico2`. The conditional mapping exposes 25 internal environment names in production JavaScript:

```
qa.politico.psdops.com        → allbrittonpoliticodev
pro.qa.politico.psdops.com    → allbrittonpoliticodev
local.politicopro.com          → allbrittonpoliticodev
local.politico.com             → allbrittonpoliticodev
qa.ops.politico.com            → allbrittonpoliticodev
politico.localhost.com         → allbrittonpoliticodev
stage.ops.politico.com         → allbrittonpoliticodev
beta.ops.politico.com          → allbrittonpoliticodev
devbranch1.ops.politico.com    → allbrittonpoliticodev
iat.ops.politico.com           → allbrittonpoliticodev
devbranch2.ops.politico.com    → allbrittonpoliticodev
devbranch3.ops.politico.com    → allbrittonpoliticodev
devbranch4.ops.politico.com    → allbrittonpoliticodev
dev.ops.politico.com           → allbrittonpoliticodev
west.ops.politico.com          → allbrittonpoliticodev
qa-ops.politico.com            → allbrittonpoliticodev
localhost:8080                 → allbrittonpoliticodev
qablue.ops.politico.com        → allbrittonpoliticodev
qared.ops.politico.com         → allbrittonpoliticodev
qaorange.ops.politico.com      → allbrittonpoliticodev
qaorange.politico.com          → allbrittonpoliticodev
qablue.politico.com            → allbrittonpoliticodev
qared.politico.com             → allbrittonpoliticodev
int-staging.politico.com       → allbrittonpoliticodev
cms.politico.com               → allbrittonpoliticodev
```

"Allbritton" is Allbritton Communications Company, the media family that founded POLITICO and owned it until selling to Axel Springer in 2021. The Adobe Analytics account name -- both dev and production -- has not been rebranded in five years under new ownership. The full environment naming convention is readable in production JavaScript served to every visitor: `*.ops.politico.com` for operations, `qa/dev/stage/beta/iat` for deployment stages, `qablue/qared/qaorange` for blue-green-orange deploy slots, and four numbered `devbranch` environments.

Also visible: `metrics.politico.com` and `smetrics.politico.com` as the Adobe Analytics first-party tracking endpoints, confirming a CNAME-based first-party data collection setup.

## Headline A/B Testing

Chartbeat Heads Up (MAB -- Multi-Armed Bandit) runs continuously. The endpoint `mab.chartbeat.com/mab_strategy/headline_testing/get_strategy/` fires on every page load. The `_t_tests` cookie stores the visitor's experiment assignments:

```json
{
  "jo93o7WeqsDhw": {"chosenVariant": "A", "specificLocation": ["CdjkvZ", "CY8pC3"]},
  "8fR14SZaiJ0N7": {"chosenVariant": "A", "specificLocation": ["Dcg1sW"]},
  "lift_exp": "m"
}
```

Three active experiments during the observation session. `lift_exp: "m"` indicates lift measurement mode -- click-lift is being measured against a baseline. The headline a reader sees for any given article may be one of several variants being tested for click-through optimization. The assigned variant is tracked through the Chartbeat engagement pipeline.

For a news organization, this is a meaningful editorial choice: the headline is not fixed by the writer or editor but optimized by algorithm against engagement metrics. Whether the "best" headline for clicks is the most accurate or informative headline is an editorial question Chartbeat's MAB system does not ask.

## AI Crawler Block

POLITICO's robots.txt blocks 94 named user agents. The list covers the current AI landscape comprehensively:

- **Anthropic:** `anthropic-ai`, `Claude-SearchBot`, `Claude-User`, `Claude-Web`, `ClaudeBot`
- **OpenAI:** `GPTBot`, `ChatGPT-User`, `ChatGPT Agent`, `OAI-SearchBot`
- **Google AI:** `Google-Extended`, `Gemini-Deep-Research`, `Google-CloudVertexBot`, `GoogleAgent-Mariner`
- **Meta:** `meta-externalagent`, `Meta-ExternalAgent`, `meta-externalfetcher`, `FacebookBot`
- **Long tail:** `PerplexityBot`, `Perplexity-User`, `MistralAI-User`, `cohere-ai`, `cohere-training-data-crawler`, `Devin`, `NovaAct`, `Operator`, `Bytespider`, `Diffbot`, `Scrapy`, `FirecrawlAgent`, `img2dataset`, `omgili`, `QuillBot`, `PhindBot`, `YouBot`, `Amazonbot`, `bedrockbot`, and 40+ others.

The historical Disallow paths are an accidental archive of abandoned products: `/ryan` (a Paul Ryan congressional tracker), `/campaigntrailnotused`, `/CandidateRanking`, `/candidates`, `/debate`, `/2014-election/results/mobile/iphone` -- relics from election coverage experiments that were never cleaned from robots.txt.

## Open Threads

**FPD form trigger:** The `fpdConfig` fields load in `POLITICO_CONFIG` on all pages, but whether the enrichment form surfaces before or after registration is unconfirmed. The first_name/last_name fields suggest post-registration. Unconfirmed without an authenticated session.

**Full Industry option list:** Evidence shows 4 industry options (Congress, Foreign Government, Law/Lobbying, Think Tank); investigator notes documented more. The evidence file may be truncated. The core finding holds at any count.

**bild.de code reference:** The `utiq.js` conditional referencing sportbild.de/bild.de was observed by the investigator during the live session. The Axel Springer ownership of asadcdn.com is confirmed through multiple other vectors -- the German-language disclosure module, the `axelspringer.github.io` transparency URL, and the `politicoEUNative` extension name.

## Machine Briefing

### Access & Auth

Most content is accessible without authentication via standard HTTP. Cloudflare blocks headless browsers but curl with default headers works fine. Article content is fully server-side rendered -- the full article body is embedded in inline Nuxt SSR state before any JavaScript executes.

`api.politico.com` requires Bearer authentication. `cms.politico.com` requires Cloudflare Zero Trust SSO. The Piano metering endpoint (`/public-api/v1/passport/id`) is POST-only. politicopro.com WP REST API is fully open.

### Endpoints

**Open, no auth:**

```bash
# Real-time editorial top 9 stories (live data, no caching)
GET https://www.politico.com/_storyModuleServlet
# Returns: [{id, permalink, headline, timestamp, icon}] -- always 9 items

# Full article SSR -- complete body in inline JSON, no JS needed
GET https://www.politico.com/news/{year}/{month}/{slug}

# Sitemap index -- monthly sub-sitemaps from 2007
GET https://www.politico.com/sitemap.xml

# Latest news sitemap
GET https://www.politico.com/news-sitemap.xml

# POLITICO Pro WP REST API (marketing/teaser content)
GET https://www.politicopro.com/wp-json/wp/v2/pages
GET https://www.politicopro.com/wp-json/wp/v2/posts
```

**POST only:**

```bash
# Piano metering -- fires on every page
POST https://www.politico.com/public-api/v1/passport/id

# Piano registration
POST https://www.politico.com/spring/cms-api/v1/piano/register
```

**Blocked / Auth required:**

```bash
# Internal API -- 401, Bearer token required
GET https://api.politico.com/

# Brightspot CMS -- Cloudflare Zero Trust redirect
GET https://cms.politico.com/

# Design system -- Cloudflare Access
GET https://www.politico.com/_styleguide
```

### Gotchas

- Cloudflare bot challenge blocks headless browsers (Playwright without headed mode). Curl with default headers passes.
- `/_storyModuleServlet` always returns exactly 9 items regardless of query params -- hardcoded batch size.
- Piano endpoints are POST-only; GET returns 405 with `{"type":"about:blank","title":"Method Not Allowed","status":405}`.
- Article body content is in the Nuxt SSR inline state -- `window.__NUXT__` payload as a ShallowReactive structure with 1152+ elements including HTML fragments.
- `POLITICO_CONFIG` is embedded as a JSON object in a global script on every page -- contains the full fpdConfig field definitions with Tealium AudienceStream IDs.
- The WP REST API at politicopro.com returns lead-gen and marketing pages only -- actual Pro subscriber content is not on this stack.
