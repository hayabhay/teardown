---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "LiveRamp -- Teardown"
url: "https://liveramp.com"
company: "LiveRamp"
industry: "Information"
description: "Data connectivity and identity resolution platform for advertisers and publishers."
summary: "liveramp.com is a Webflow-hosted marketing site running entirely on third-party infrastructure -- Cloudflare CDN, Google Tag Manager, Ketch for consent. All 71 homepage requests are third-party; zero first-party servers serve the marketing site. Secondary properties include a Rails/Spree partner directory on Heroku, a WPEngine WordPress staging site with an open REST API, and separate docs, status, and investor pages."
date: "2026-04-14"
time: "05:39"
contributor: "hayabhay"
model: "sonnet-4.6"
effort: "high"
stack: [Webflow, Cloudflare, Google Tag Manager, Ketch, Heroku, WordPress]
trackers: [LiveRamp SmartTag, Google Analytics 4, Google Tag Manager, Clearbit, SalesLoft Scout, Marketo RTP, Bizible, Dreamdata, Wistia, Intellimize, Google Ads, TrustArc]
tags: [adtech, identity-resolution, data-broker, b2b, webflow, wordpress, self-surveillance, rampid, consent, sales-intelligence]
headline: "LiveRamp runs its own RampID identity product on liveramp.com -- identity lookups fire on every page including the opt-out and privacy rights pages."
findings:
  - "liverampcomstg.wpenginepowered.com has an unauthenticated WordPress REST API exposing internal CRM terminology in page titles -- 'Closed Lost Program 01/02' (Salesforce pipeline stages), A/B test variants named 'Challenger B,' and private event scheduling pages for Cannes, CES, and G2E -- all readable without authentication."
  - "The status API at status.liveramp.com exposes 56 monitored product components -- RTIS, Envelope API (PII-based and cookie-based, US/EU/AU), ATS, Sidecar, CTVID Pixel, Habu API, Cleanroom -- mapping LiveRamp's full product taxonomy with operational status."
  - "LiveRamp classifies its own SmartTag identity cookie (_swb) as 'essential_services' in the Ketch consent config, placing it outside the scope of GPC suppression -- a browser sending a Global Privacy Control signal cannot stop LiveRamp's own tracker on liveramp.com."
  - "A publicly readable JavaScript file at middleware.rampedup.us lists LiveRamp's full domain inventory including staging environments, regional TLDs (AU, JP, DE, FR, ES, IT, UK, BR), event brands, and the Habu acquisition domain."
  - "LiveRamp's staging WordPress API exposes internal sales pages named 'Closed Lost Program 02' -- retargeting pages for churned customers who changed jobs, A/B test variants, and private event scheduling pages for Cannes, CES, and G2E."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

LiveRamp sells identity resolution to the advertising industry. Their product -- RampID -- lets advertisers match first-party data to people across the web without relying on third-party cookies. liveramp.com is where they market that product. It is also where they run it on their own visitors.

---

## Architecture

liveramp.com is a Webflow-hosted marketing site sitting behind Cloudflare's CDN. There are no first-party servers serving the marketing site -- all 71 requests on a homepage load are third-party, spread across 15 domains. Webflow is the CMS and rendering layer, confirmed by `x-wf-region: us-east-1` response headers and `wf`/`Webflow` globals on the window. Asset CDN URLs expose two Webflow workspace IDs: `68daaf51555d6adf0c767571` (primary) and `68e66ecef0944c871b2c50e1` (secondary). Page surrogate keys in response headers (`pageId:68daaf52555d6adf0c7675f2`) are Webflow CMS object IDs.

Google Tag Manager (`GTM-WVJNW76`) is the tag container, loading:
- `G-JY5CK6C64V` -- GA4 primary property
- `G-G5BH7SMBXF` -- GA4 secondary property
- `UA-23899090-1` -- Universal Analytics legacy reference (sunset but still in the container)
- `AW-874879263` -- Google Ads conversion tracking

Ketch (`website_smart_tag`) manages consent. The marketing site has no Content Security Policy beyond `frame-ancestors 'self'` -- no `script-src` restrictions. Scripts can load from any origin.

Additional JavaScript globals present on window: `Sentry` (error monitoring), `MktoForms2` (Marketo forms), `rtp`/`slscout` (Marketo RTP and SalesLoft Scout), `dreamdata` (B2B attribution), `Bizible`/`BizTrackingA` (Marketo attribution), `iiq`/`ibq` (Infolinks intent IQ), `AITag`/`AIConfig` (Intentwise), `InsighteraWidget` (Marketo web personalization), `intellimize` (AI personalization, project ID `117645514`), `Wistia`.

Segment is referenced via `analyticsWriteKey: "__WRITE_KEY__"` -- the write key is a literal placeholder string, not a real key. Segment cookies (`ajs_anonymous_id`, `ajs_user_id`) are registered in the Ketch consent config, suggesting Segment was either removed or was never properly initialized. It did not appear in observed network traffic.

The site's robots.txt is fully open (`Allow: /`) with a single sitemap listing 1,194 URLs across 36 path groups. There is no `/.well-known/security.txt` despite a bug bounty page at `/security/bug-bounty`.

**Secondary properties:**
- `docs.liveramp.com` -- documentation
- `status.liveramp.com` -- Atlassian Statuspage
- `connect.liveramp.com` -- 302 to Okta SSO at `sso.liveramp.com/oauth2/default`
- `partner-directory.liveramp.com` -- Ruby on Rails + Spree (marketplace framework) on Heroku, behind CloudFront. Issues `token` and `guest_token` JWTs. The `token` JWT has a 7,304-day (~20-year) expiry, confirmed in the Ketch consent config.
- `investors.liveramp.com` -- investor relations
- `launch.liveramp.com` -- conference/event site, served from S3/CloudFront

---

## The Self-Surveillance Apparatus

LiveRamp's identity product fires on every page of liveramp.com.

The mechanism operates in four layers. First, the Ketch `website_smart_tag` script sets the `_swb` cookie -- a UUID (`c6ea1852-5859-4047-b78d-ace6e44870e1` in the observed session) that is LiveRamp's SmartTag browser identifier. Ketch describes this as a managed identity: `{"swb_website_smart_tag":{"type":"managedCookie","variable":"_swb"}}`. Second, `api.rlcdn.com/api/identity/idl?pid=1343` fires on every page load -- this is LiveRamp's identity lookup endpoint, queried with the `_swb` cookie via credentialed cross-origin request (`access-control-allow-credentials: true`). PID `1343` is LiveRamp's own publisher ID in their network. For a fresh, unrecognized visitor it returns `{"idl":""}` -- an empty identity. For a returning visitor whose identity is in the graph, it would return a resolved ID. Third, `trwv.uid` (2-year duration, attributed to Adobe Marketo Engage in the consent config) and `trwsa.sid` (30-minute duration) are set as RampID Web Visitor tracking cookies. Fourth, `_gat_IdentityLink` is a Google Analytics cookie that links the GA session to LiveRamp's IdentityLink graph.

This stack fires identically on the homepage, the maturity assessment tool, and pages explicitly about data rights. The network capture of `/measurement-maturity-assessment/start` shows `api.rlcdn.com` querying the identity endpoint. The same calls fire on `/privacy/my-privacy-choices` (the page for exercising data rights) and `/opt-out/mobile` (the LiveRamp mobile opt-out page).

**Pre-consent identity enrollment:**

The Ketch log endpoint captures the SmartTag identity before any consent interaction:

```
https://global.ketchcdn.com/web/v2/log?hasConsent=false&url=https://liveramp.com/
  &property=website_smart_tag&environment=production&jurisdiction=US24
  &dver=1756072774&event_type=once_identities
  &ids=eyJzd2Jfd2Vic2l0ZV9zbWFydF90YWciOiJjNmVhMTg1Mi01ODU5LTQwNDctYjc4ZC1hY2U2ZTQ0ODcwZTEifQ%3D%3D
  &region=US-CA
```

The `ids` parameter decodes to `{"swb_website_smart_tag":"c6ea1852-5859-4047-b78d-ace6e44870e1"}` -- the `_swb` SmartTag ID, transmitted with an explicit `hasConsent=false` flag. The identity is enrolled in LiveRamp's system before the user has interacted with the consent banner.

**The GPC loophole:**

LiveRamp's Ketch consent config has GPC suppression active for US24 and CAN24 jurisdictions. GPC signals suppress both `analytics` and `behavioral_advertising` purposes. However, the `_swb` SmartTag cookie is classified under `essential_services` -- not analytics. GPC suppression does not cover `essential_services`. A browser sending a Global Privacy Control signal will have its analytics trackers suppressed, but LiveRamp's own identity tracker (`_swb`, `api.rlcdn.com` lookups, `trwv.uid`, `trwsa.sid`) will continue to fire.

The `essential_services` purpose's `legalBasisName` is "Consent - Opt Out" (`legalBasisCode: "consent_optout"`) -- technically still an opt-out model, but one that GPC does not reach.

---

## Consent Architecture

LiveRamp's Ketch consent configuration (`/web/v3/config/liveramp/website_smart_tag/production/US24/en/config.json`, 277KB) defines three purposes for US jurisdiction (US24):

**Analytics** -- `legalBasisCode: consent_optout`. Tracking is on by default. Users can opt out. Registers 19 service providers including: Google Analytics, Google Ads, Adobe Marketo Measure (`_biz_uid`, `_biz_nA`, `_biz_pendingA`, `_biz_flagsA`, `_biz_kvpA`), SalesLoft (`slireg`, `sliguid`, `site_identity`), Clearbit (`cb%3Atest`, `cb_anonymous_id`, `cb_group_id`, `cb_user_id`), Dreamdata (`dd_anonymous_id`, `dd_user_id`), Wistia (`authenticity_token`, `_w_session`), Crazy Egg, PostHog, 6sense (`_gd_session`, `_gd_visitor`), ZoomInfo (`visitorId`, `_zitok`), Qualified, Influ2 (`R`), Datadog.

**Essential Services** -- `legalBasisCode: consent_optout`. Also opt-out by default. Registers: Cloudflare, Ketch, LiveRamp (`eventguestside-service-session`, `_pf_session`, `token`), SalesLoft (`drift_aid`, `driftt_aid`), Crazy Egg, Adobe Marketo Measure, BugHerd, Facebook Ads, Cheq, Datadome. The classification of SalesLoft (a B2B sales engagement platform) and Drift (live chat/sales bot) as "essential services" is notable -- these are sales acceleration tools, not infrastructure. BugHerd, a QA annotation tool, is also classified here.

**Targeted Advertising** -- `legalBasisCode: consent_optin`. Off by default, requires explicit opt-in. Registers 20 providers including: LinkedIn Ads, Facebook Ads, Google Ads (`IDE`), Adobe Audience Manager (`demdex`), 6sense, ZoomInfo, Demandbase (`tuuid`), Neustar (`ab`), LiveRamp (`pxrc`, `rlas3`), OpenX (`i`), Sovrn (`ljt_reader`, `_ljtrtb_8112`), Live Intent (`_lc2_fpi`, `lidid`, `_li_ss`, `_li_dcdm_c`), Warmly (`_lc2_fpi_js`), Basis (`ssi`), Influ2.

The consent banner text: "When you visit our website, we may use cookies to collect personal information about you. To reject the use of cookies by this website for 'targeted advertising' or the 'selling' or 'sharing' of personal data, use the 'Reject All' button or use the toggles available by selecting 'Customize Settings.'" Three buttons: Customize Settings, Reject All, Accept All.

The `_ketch_consent_v1_` cookie (base64 encoded) stores current consent state: `{"analytics":{"status":"granted"},"essential_services":{"status":"granted"}}` for a new visitor who has not interacted with the banner. The `_swb_consent_` cookie stores a richer consent record including `"jurisdictionCode":"US24"`, `"propertyCode":"website_smart_tag"`, `"identities":{"swb_website_smart_tag":"[uuid]"}`, and purposes with `"legalBasisCode":"consent_optout"`.

The Global Privacy String is stored in localStorage under `_ketch_gpp_v1_` (USNat section 7). Default state for a new visitor: `SaleOptOut: 2`, `TargetedAdvertisingOptOut: 2`, `SharingOptOut: 2` -- the "2" value means "not opted out" (the user has not exercised their opt-out rights).

GPC is handled by a Ketch plugin covering `["CAN24","default","US24"]` and mapping to `analytics` and `behavioral_advertising` purposes. The `legIntPurposesEnabled: true` flag means some processing is justified without explicit consent under "legitimate interest."

The EU vendor list (`/gvl/eu/vendor-list.json`, 1,144 IAB TCF vendors) is fetched for all visitors regardless of jurisdiction -- a Ketch implementation detail for rendering the vendor preference center.

---

## B2B Deanonymization Stack

The 15 third-party domains on homepage load include a complete B2B sales intelligence pipeline:

**Step 1 -- Company identification:** `tag.clearbitscripts.com` loads Clearbit's reveal script, which performs a reverse IP lookup to identify the visiting company. Cookies: `cb:test`, `cb_anonymous_id`, `cb_group_id`, `cb_user_id`. The Intellimize integration includes a firmographic enrichment slot (`intellimize_integrations_117645514`), suggesting Clearbit feeds company data to Intellimize for personalization segmentation.

**Step 2 -- Real-time personalization:** `sjrtp6.marketo.com/gw1/rtp/api/v1_1/visitor` (Marketo RTP) and the `InsighteraWidget` global receive the company identification and trigger content and CTA variants targeted to that company's segment. The `rtp` global on window confirms Marketo RTP is initialized.

**Step 3 -- AI personalization layer:** `api.intellimize.co` receives visitor context via `POST /context-v2/117645514` and returns personalization decisions via `POST /prediction/117645514`. localStorage stores `intellimize_tracking_policy = "optOut"` (the platform-level default) and `intellimize_user_tracking_choice_117645514 = "allow"` (the current user setting). The `intellimize_server_context_117645514` key stores full geolocation: country, subdivision, city name, postal code, and DMA code -- accessible to any same-origin JavaScript.

**Step 4 -- Sales routing:** `scout.salesloft.com/r` (register) and `scout.salesloft.com/i` (identify) fire on every page load. SalesLoft Scout ingests the company identification from Clearbit and routes the visit to the appropriate sales representative. Cookies: `slireg`, `sliguid`, `slirequested`, `site_identity`.

**Step 5 -- Attribution:** `cdn.dreamdata.cloud/api/v1/p` (Dreamdata) and the Bizible globals (`Bizible`, `BizTrackingA`) track the full visit-to-revenue attribution chain. Bizible cookies: `_biz_uid`, `_biz_nA`, `_biz_pendingA`, `_biz_flagsA`. Dreamdata: `dd_anonymous_id`, `dd_user_id`.

A visitor's company is identified before they interact with anything on the page. Their content is personalized based on that identification. Their visit is assigned to a sales rep. If they convert at any point, the attribution is logged across multiple systems. This is the marketed LiveRamp use case -- running on LiveRamp's own site.

---

## WordPress Staging Site

`liverampcomstg.wpenginepowered.com` is a WordPress site on WPEngine -- discovered via a publicly accessible JavaScript file at `middleware.rampedup.us`. The WordPress REST API is unauthenticated and returns full page content:

```
GET https://liverampcomstg.wpenginepowered.com/wp-json/wp/v2/pages?per_page=100
```

Pages discovered in the staging API (with their internal titles and slugs):

| Slug | Internal Title |
|------|----------------|
| `value-of-data-collaboration` | Closed Lost Program 01 |
| `new-job-challenges` | Closed Lost Program 02 |
| `ces-2026-panel-ev-registration` | ces 2026 panel ev registration |
| `cannes-2025-la-mome-request` | (private dinner invite) |
| `cannes-2025-hh-chase-request` | (private dinner invite) |

The "Closed Lost" naming is Salesforce CRM pipeline terminology -- these are retargeting pages for opportunities that were marked "Closed Lost." Program 02 targets former LiveRamp users who have changed jobs: its title is "New Role. Same Challenges. A Proven Way to Solve Them." The page is live on production at `liveramp.com/new-job-challenges` (returns 200). Same for `liveramp.com/value-of-data-collaboration`. The internal CRM stage names are in the WordPress content metadata, visible through the staging API.

Other pages present in staging: G2E 2025, AWNY 2025 meeting request pages for private sales meetings at industry conferences, and "Challenger B" step 1/2/3 -- A/B test variant pages for the measurement maturity assessment (these redirect 301 to /resources on production). The staging environment is the content staging layer for all LiveRamp.com pages and acts as a full content index.

The production site runs on Webflow, but content and landing pages are still developed in WordPress and migrated or referenced. The staging site is the legacy CMS with its API still wide open.

---

## Domain Infrastructure & Product Surface

A JavaScript file at `middleware.rampedup.us` is publicly accessible and lists LiveRamp's full domain inventory:

**Marketing:** `liveramp.com`, `liveramp-com.webflow.io` (Webflow staging), `liverampcomstg.wpenginepowered.com` (WordPress staging)

**Regional:** `liveramp.com.au`, `liveramp.co.jp`, `liveramp.de`, `liveramp.fr`, `liveramp.es`, `liveramp.it`, `liveramp.uk`, `liverampbrasil.com.br`

**Acquisitions:** `habu.com` (data clean room, fully acquired -- redirects 301 to liveramp.com via a Pantheon/Styx origin)

**Internal/Events:** `rampedup.us`, `rampup-2026.webflow.io` (RampUp conference brand), `investors.liveramp.com`, `partner-directory.liveramp.com`, `launch.liveramp.com`

The file also shows that EU and US versions of the consent implementation exist per domain -- LiveRamp operates different consent modes across their regional TLDs.

`status.liveramp.com/api/v2/components.json` exposes 56 monitored infrastructure components, mapping LiveRamp's full product surface:

- **RTIS / LiveRamp API id** -- Real-Time Identity Service, their core identity resolution API
- **IDL API** -- IdentityLink lookup API
- **Envelope API** -- PII-based and cookie-based, deployed in US/EU/AU separately
- **ATS / ATS JS Library** -- Authenticated Traffic Solution (publisher-side identity for cookieless environments)
- **Sidecar / Sidecar Check-in Service** -- on-device identity product
- **CTVID Pixel** -- Connected TV device identification
- **Habu API** / **Habu Console (deprecated)** -- data clean room integration (console deprecated, API still active)
- **Cleanroom** -- clean room product component
- **Customer Profiles, Segmentation, Segments API** -- audience management
- **Activation API, Distribution API, Provider API** -- data distribution
- **Advanced TV DataSource, Advanced TV Taxonomy, Advanced TV Segmentation, Advanced TV Activation** -- CTV product stack
- **Analytics Environment** -- EU, AU, and US variants listed separately
- **Connect UI, Connect UI Website, Connect UI Login** -- partner portal

This is the complete LiveRamp product taxonomy with operational status visible to anyone who checks.

---

## Open Threads

**Segment status.** `analyticsWriteKey: "__WRITE_KEY__"` is present on the window object. Segment cookies are registered in the Ketch analytics purpose config. Segment was not observed in any network traffic. Whether this represents a removed integration with leftover config or a dormant but registered one is unresolved.

**di.rlcdn.com and rc.rlcdn.com.** Notes document `di.rlcdn.com/709953.html?pdata=site%3Dliveramp%2Ccategory%3Dhomepage` and `rc.rlcdn.com/709954.html` as RampID data-passing pixels. These were not captured in the Playwright network logs. They may require headed browser context or specific timing to fire. The `trwv.uid` and `trwsa.sid` cookie presence corroborates the broader self-surveillance picture regardless.

**6sense and ZoomInfo.** Both are registered in the Ketch analytics purpose with specific cookie definitions (`_gd_session`, `_gd_visitor` for 6sense; `visitorId`, `_zitok` for ZoomInfo). Neither was observed in network traffic. These may activate conditionally via GTM based on Clearbit company identification -- triggered for certain visitor profiles rather than all visitors.

**Partner directory JWT scope.** `partner-directory.liveramp.com` issues a `guest_token` JWT on first visit. The `token` cookie has a 20-year expiry. The authorization scope of these JWTs against the Spree API is uncharted.

---

## Machine Briefing

**Access & auth:** liveramp.com is fully public -- no auth required for the marketing site, blog, or resources pages. The WordPress staging site REST API is unauthenticated. The status API is unauthenticated. Direct curl/fetch works for all endpoints listed below.

**Endpoints:**

```bash
# Identity lookup -- returns {"idl":""} for unrecognized visitors
curl -s "https://api.rlcdn.com/api/identity/idl?pid=1343"

# Status API -- 56 monitored components
curl -s "https://status.liveramp.com/api/v2/components.json" | jq '.components[].name'

# Status summary
curl -s "https://status.liveramp.com/api/v2/summary.json" | jq '.components[] | {name, status}'

# WordPress staging REST API -- unauthenticated, returns full page content
curl -s "https://liverampcomstg.wpenginepowered.com/wp-json/wp/v2/pages?per_page=100" | jq '.[].slug'
curl -s "https://liverampcomstg.wpenginepowered.com/wp-json/wp/v2/pages?per_page=100" | jq '.[] | {slug, title: .title.rendered}'

# Ketch consent config (full, 277KB) -- US jurisdiction
curl -s "https://global.ketchcdn.com/web/v3/config/liveramp/website_smart_tag/production/US24/en/config.json" | jq '.purposes[].code'

# Ketch visitor geolocation
curl -s "https://global.ketchcdn.com/web/v3/ip"

# Intellimize visitor context (requires session cookie _swb from liveramp.com)
# POST /context-v2/117645514 -- sends visitor context
# POST /prediction/117645514 -- receives personalization decisions

# Wistia media embed -- open JSON endpoints, no auth required
curl -s "https://fast.wistia.com/embed/medias/0mu3ddx5ct.json"

# Sitemap -- 1194 URLs
curl -s "https://liveramp.com/sitemap.xml"

# Domain inventory script
curl -s "https://middleware.rampedup.us" | head -200
```

**Gotchas:**
- `api.rlcdn.com/api/identity/idl` requires the `_swb` cookie to be present in the request -- without it, the lookup is anonymous and returns `{"idl":""}`. This endpoint fires as a credentialed CORS request from the browser; a plain curl call without cookies will get the same empty response.
- The Ketch config URL is jurisdiction-specific: replace `US24` with `EU` or `AU24` for other regional configurations.
- The WordPress staging API at `wpenginepowered.com` returns pages with WP REST API format -- titles are nested under `.title.rendered`.
- `status.liveramp.com` is Atlassian Statuspage. The `/api/v2/` endpoints are the standard Statuspage API, not custom.
- The partner directory at `partner-directory.liveramp.com` issues cookies on first visit but all public API routes are behind Cloudflare WAF -- direct API probing is rate-limited.
