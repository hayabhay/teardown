---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "LexisNexis -- Teardown"
url: "https://www.lexisnexis.com"
company: "LexisNexis"
industry: "Professional Services"
description: "Legal research platform and data broker serving legal, government, and financial sectors."
summary: "Two distinct business lines split at a gateway page: legal research on Angular/CloudFront/OpenResty and a data broker division behind Cloudflare. The marketing site runs dual tag managers (GTM and Matomo Tag Manager) in parallel, with Pardot and Salesforce Messaging for lead capture. Legacy ASP.NET 4.0 surfaces in redirect headers. The Accurint people-search product runs a separate stack dating to the mid-2000s (Prototype.js, custom CAPTCHA, self-hosted ThreatMetrix)."
date: "2026-04-14"
time: "05:20"
contributor: "hayabhay"
model: "sonnet-4.6"
effort: "high"
stack:
  - Angular
  - CloudFront
  - OpenResty
  - ASP.NET
  - OneTrust
  - Salesforce
trackers:
  - Google Analytics 4
  - Google Tag Manager
  - Matomo
  - Matomo Tag Manager
  - Facebook Pixel
  - Twitter Pixel
  - LinkedIn Insight Tag
  - Microsoft Ads
  - FullStory
  - Pardot
  - Pendo
  - ABTasty
  - Terminus ABM
  - Demandbase
  - ORIBILI Disruptive
  - ThreatMetrix
tags:
  - data-broker
  - legal-research
  - surveillance
  - b2b
  - ai-policy
  - legacy-tech
  - enterprise
  - risk-solutions
  - fcra
  - identity-resolution
headline: "Terminus and Demandbase identify which company is browsing the free trial page by IP address before a single form field is touched -- the same category of identity resolution LexisNexis sells to its own clients."
findings:
  - "The free trial signup page fires Terminus (api.company-target.com) and Demandbase (tag-logger.demandbase.com) to resolve the visitor's employer from their IP address on page load -- LexisNexis sells identity resolution through Accurint and InstantID, and uses a B2B variant of that same capability on its own marketing site."
  - "llms.txt allows OAI-SearchBot, ChatGPT-User, and ClaudeBot while blocking GPTBot, CCBot, all Meta crawlers, Amazon, Apple, Microsoft, and Google-Extended -- a company whose entire revenue model is paid access to legal and news content drawing a precise line between AI as a citation channel and AI as a training source."
  - "The product login portal links to PatentAdvisor with an embedded HubSpot tracking URL whose session timestamp decodes to September 30, 2019 -- the same static tracking parameter has been shipping in the HTML for 6.5 years."
  - "Accurint, the people-search product used by law enforcement and background-check vendors, runs Prototype.js (circa 2005), custom image CAPTCHA, and self-hosted ThreatMetrix device fingerprinting at cdnfp.accurint.com -- the fingerprint fires before any credentials are entered."
  - "The US consent ruleset is explicitly named 'LNLP Opt-Out Banner (ADTECH USA IBA) 3.0' in OneTrust config -- all four cookie groups are active at interactionCount=0, with FullStory recording, Terminus IP lookup, and five Google Ads remarketing IDs all firing before the banner is acknowledged."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

LexisNexis is one of the few companies that could claim to be both a top-tier provider of surveillance tools and a subject worth surveilling back. The company sells identity resolution, people-search, AML screening, and court-record access to law enforcement, banks, and landlords. On the other side of the site, it sells legal research to law firms and law students. Both businesses run through the same domain -- separated at `www.lexisnexis.com/en-us/gateway.page` by a "Choose Your Path" screen -- and both turn out to be instrumented in ways that reflect exactly what the company does for a living.

## Site Architecture

The entry point is `www.lexisnexis.com`, which redirects to `/en-us/gateway.page`. That redirect response carries a set of legacy headers: `X-AspNet-Version: 4.0.30319` (ASP.NET 4, circa 2010) and a `P3P` header -- a privacy metadata standard effectively abandoned around 2012. The initial redirect is served through CloudFront; subsequent pages come from OpenResty 1.21.4.1, the commercial nginx distribution common in Java/enterprise stacks.

The marketing site itself (`/en-us`) is an Angular application. It loads jQuery, jQuery UI, Modernizr, GSAP, and Bodymovin (Lottie animations) alongside the Angular runtime. Two unauthenticated JSON endpoints serve the full site configuration:

```
GET https://www.lexisnexis.com/json/header.json
GET https://www.lexisnexis.com/json/corporatesite.json
```

`header.json` returns the complete navigation structure -- megamenu layout, CTAs, product links. `corporatesite.json` returns footer structure, country sites, and contact information. Both are production configuration endpoints with no auth requirement.

The gateway page bifurcation into `www.lexisnexis.com` (legal research) and `risk.lexisnexis.com` (data broker) is unusual for a company of this scale -- most enterprises merge their sub-businesses into a unified navigation. The explicit split reflects that these are operationally and reputationally distinct products.

### Subdomain map

The product login page (`signin.lexisnexis.com`) reveals the full portfolio without authentication:

- `advance.lexis.com` -- Lexis Advance (core legal research); sets a `LexisMachineId` persistent tracking cookie on first access; URL rewriting at `/api/search` to `/url-api/laapi/search` (LAAPI = Lexis Advance API); Microsoft IIS 10.0 + ASP.NET MVC 5.2
- `dev.lexisnexis.com` -- Developer Portal (Nexis DaaS API catalog); public Angular SPA, no auth to browse; `Access-Control-Allow-Origin: *` on assets
- `secure.accurint.com` -- Accurint people-search login (discussed separately)
- `risk.lexisnexis.com` -- Data broker division; Cloudflare-protected (403 + `cf-mitigated: challenge` on direct curl)
- `consumer.risk.lexisnexis.com` -- Consumer data rights portal (FCRA/CCPA access requests)
- `form.consumer.risk.lexisnexis.com` -- Consumer freeze/unfreeze forms (Salesforce-hosted, migrated from the now-expired `forms.consumer.risk.lexisnexis.com`)
- `bridger.lexisnexis.com` -- Bridger Insight XG (AML/sanctions screening)
- `amlinsight.lexisnexis.com` -- Anti-Money Laundering analytics
- `coplogicsolutions.lexisnexis.com/commandcenter/` -- Law enforcement command center
- `identitymanagement.lexisnexis.com/IRM/` -- Instant Authenticate/Verify (identity proofing)
- `worldcompliance.com` -- AML/sanctions screening (LexisNexis-owned); Azure App Service; `ARRAffinity` cookie domain `worldco-ost-svc-prd.azurewebsites.net` leaked in the response
- `newsdesk.lexisnexis.com`, `nexisnewswire.lexisnexis.com`, `diligence.lexisnexis.com` -- media monitoring and due diligence products

WorldCompliance is the only property in the LexisNexis portfolio observed running on Azure; everything else is AWS/CloudFront.

## AI Crawler Policy

LexisNexis maintains both a `robots.txt` and an `llms.txt` -- a relatively recent convention for stating AI-specific access rules. The two files serve different purposes and have different content.

`robots.txt` handles traditional crawlers. It explicitly allows `OAI-SearchBot` and `ChatGPT-User`, explicitly blocks `PerplexityBot`, and blocks several AI-adjacent bots (`Google-Extended`, `Bytespider`, `Bytedance`, `008`). GPTBot, CCBot, and ClaudeBot are not named in `robots.txt`.

`llms.txt` is the authoritative AI policy document. It expands the allow list to include `ClaudeBot` and expands the block list to include every major training crawler:

```
# --- Allow trusted LLM crawlers (search/discovery) ---
User-agent: OAI-SearchBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: ClaudeBot
Allow: /

# --- Block Perplexity ---
User-agent: PerplexityBot
Disallow: /

# --- Block known training/ingestion bots ---
User-agent: GPTBot
Disallow: /

User-agent: CCBot
Disallow: /

User-agent: Meta-ExternalAgent
Disallow: /

User-agent: Meta-ExternalFetcher
Disallow: /

User-agent: FacebookBot
Disallow: /

User-agent: Amazonbot
Disallow: /

User-agent: Applebot-Extended
Disallow: /

User-agent: Microsoft-Extended
Disallow: /

User-agent: Google-Extended
Disallow: /
```

The division is precise: discovery and citation bots (OpenAI search, ChatGPT browsing, ClaudeBot) are allowed. Training and ingestion bots (GPTBot, CCBot, all Meta variants, Amazon, Apple, Microsoft, Google extended training) are blocked. Perplexity is the only bot called out by name in both documents.

For most companies this is boilerplate. For LexisNexis, it's a commercial statement. Their entire business model is charging for access to legal documents, court records, news archives, and patent data that they've licensed, indexed, and organized. Allowing AI to discover and cite that content -- making LexisNexis a source AI search engines point to -- extends their distribution at no cost. Allowing AI to train on it gives competitors and open models access to their proprietary corpus without payment. The `llms.txt` is the digital expression of that position.

## ABM Identity Resolution on the Signup Page

The free trial signup page at `/en-us/products/lexis-plus-protege/free-trial` loads two account-based marketing (ABM) platforms that identify the visitor's employer by IP address -- before any form field is touched:

**Terminus** (`api.company-target.com/api/v3/ip.json`): An IP-to-company lookup that returns the organization that owns the requesting IP address. The endpoint fires as a POST with an embedded client key on page load.

**Demandbase** (`tag-logger.demandbase.com/bg9s`): A companion ABM identifier that fires alongside Terminus. The associated sync iframe at `s.company-target.com` allows Terminus to match visitor IPs to company profiles and feed that data into advertising graphs for account-level retargeting.

Both also load on product marketing pages, not just the signup page.

The signup form itself has additional hidden fields: `fax_text` is pre-populated with the visitor's Google Analytics client ID (a Pardot hidden-field pattern for linking anonymous ad-click IDs to lead records), alongside `gclid`, `msclkid`, `sfcid`, `gaterm`, `gacampaign`, `gamedium`, `gasource` -- full UTM capture and cross-channel click ID stitching. The form identifies both the individual (via GA client ID and click IDs) and the organization (via Terminus/Demandbase IP lookup). The Pardot form ID is 779042; Pardot account ID is 900751.

The self-referential dimension is hard to miss. LexisNexis Risk Solutions sells Accurint and InstantID -- products that identify individuals by aggregating public and licensed data. The marketing site uses a B2B variant of that same identity-resolution category to identify the organizations browsing their signup page before anyone fills in a name.

## Surveillance Footprint

Across the gateway page, main site, and signup page, 14+ distinct tracking vendors are active. The signup page alone logs requests to 15 third-party domains.

**Analytics:**
- Google Analytics 4 (`analytics.google.com/g/collect`)
- Matomo (`_paq`, cookie `_pk_id.79.7af8`, `_pk_ses.79.7af8` -- site ID 79)
- Matomo Tag Manager (`_mtm`, `MatomoTagManager` object) -- running in parallel with GTM

**Ad / Conversion tracking:**
- Google Ads: 5 separate remarketing conversion IDs firing on every page -- `691202064`, `17777612463`, `994977571`, `1047685741`, `978398205`
- Microsoft Ads: `bat.bing.com/p/insights`
- Facebook Pixel: `_fbp` cookie, `window.fbq`
- Twitter/X Pixel: `window.twttr`
- LinkedIn Insight Tag: partner ID `943025`, `px.ads.linkedin.com`
- ORIBILI/Disruptive (`capi.disruptive.co`): B2B conversion attribution, fires on every page -- 2 requests per page load

**Session recording:**
- FullStory: org `1E3NFY-na1`, active on gateway page, AI solutions page, and signup page -- session recording spans the primary user journey from landing to lead form

**B2B marketing automation:**
- Pardot/Salesforce: account `piAId=900751`, `piCId=3217`, visitor tracking cookies `visitor_id899751` and `visitor_id899751-hash`
- Terminus ABM / Demandbase (detailed above)
- Salesforce Messaging (live chat on signup): `lnlp.my.salesforce-scrt.com`

**Product analytics:**
- Pendo: two instances -- `window._pendo_F3nf0jhl` on the marketing site, key `85dad924-b58b-460c-5587-9e376cc78601` on the developer portal

**A/B testing:**
- ABTasty: `window.ABTasty`, `dcinfos-cache.abtasty.com`

**Legacy tracking still active:**
Five Google Universal Analytics cookies -- `__utma`, `__utmb`, `__utmc`, `__utmz`, `__utmt_sfga` -- are still being set. Google deprecated Universal Analytics in July 2023 and shut down data collection in July 2024. These cookies suggest the GTM container has never been cleaned of the old UA tags -- they're still being set in the browser as first-party cookies even though Google's servers stopped accepting the data.

## Consent Architecture

OneTrust CMP (tenant UUID `3517c230-6d84-4491-9d6b-3108c68fcd94`) manages cookie consent. Three rulesets handle different geographies:

1. **GDPR Opt-in banner** (`TemplateName: "LNLP GDPR Opt-In Banner (AD TECH) 3.0"`) -- applies to EU/EEA countries. Opt-in model, Google Consent Mode v2 enabled.
2. **Global** (`TemplateName: "LNLP Opt-Out Banner (AD TECH) 3.0"`) -- most countries outside EU and US. Opt-out model despite applying to a global audience.
3. **United States DAAP Compliant** (`TemplateName: "LNLP Opt-Out Banner (ADTECH USA IBA) 3.0"`) -- US visitors.

The US and Global rulesets are both opt-out. On first load, `OptanonConsent` is set with `groups=1:1,2:1,3:1,4:1` -- all four consent groups active -- and `interactionCount=0`. Every tracker enumerated above fires immediately on page load before any consent action is taken. Google Consent Mode v2 (`GCEnable: true`) is enabled across all three rulesets, which means Google's behavioral modeled conversions are active.

The banner offers an opt-out path, but the default state is full tracking. By the time a US visitor reads the banner and decides to opt out, FullStory has already started recording, Terminus has already identified their employer, and five Google remarketing IDs have already fired.

## Consumer Rights Portal

`consumer.risk.lexisnexis.com` hosts the portal where consumers can exercise FCRA and state-law rights: request a security freeze, lift a freeze, order a replacement PIN, or access their consumer disclosure report.

The portal itself is a legacy Bootstrap/jQuery application -- architecturally unrelated to the Angular marketing site. The freeze request page links to online forms that were originally hosted at `forms.consumer.risk.lexisnexis.com` (plural). That subdomain's SSL certificate expired on February 24, 2026 and was never renewed. The HTML source shows those old links have been commented out and replaced with new links pointing to `form.consumer.risk.lexisnexis.com` (singular) -- a Salesforce-hosted form at `sagestream.my.salesforce-scrt.com`.

The migration left the old `forms` subdomain abandoned with a dead certificate. The commented-out HTML preserving the old links alongside the new ones is a snapshot of the transition: the portal where consumers exercised FCRA freeze rights for years was left to expire while the replacement was stood up on Salesforce infrastructure. The security freeze is not a cosmetic feature -- under FCRA and state law, consumer reporting agencies are required to allow consumers to place and lift freezes, and LexisNexis Risk Solutions sells data to lenders, insurers, landlords, and debt collectors.

## Developer Portal and API Surface

`dev.lexisnexis.com` is a public Angular SPA requiring no authentication to browse the full API catalog. It documents the Nexis DaaS (Data as a Service) product line:

- **News Search & Retrieve** -- full-text news search by date, source, and language
- **Bulk Delivery** -- scheduled news feeds (SFTP, cloud storage)
- **Company Financial** -- company financials and filings
- **Sanctions / PEPs / Watchlists** -- global regulatory screening data
- **Patents** -- patent full-text and metadata
- **Court Dockets** -- US federal and state court records
- **US Case Law** -- full-text legal decisions
- **Custom Data Feeds / Data Lake** -- enterprise licensing

The portal is open-access by design -- it's a sales tool. What's notable is the Pendo initialization in `index.html`. When a user logs in, their `USER_SESSION` from `sessionStorage` is passed to Pendo:

```javascript
const userInfoString = sessionStorage.getItem('USER_SESSION')
const userInfo = JSON.parse(userInfoString);
pendo.initialize({
  visitor: {
    id: userInfo.userPermId,
    userId: userInfo.userLoginId,
    account: userInfo.account,
    customerName: userInfo.customerName,
    email: userInfo.email,
    userFirstName: userInfo.firstName,
    userLastName: userInfo.lastName
  },
  account: {
    id: userInfo.account,
    name: userInfo.customerName
  }
})
```

Every authenticated developer portal session -- API customers building on Nexis DaaS -- is individually tracked in Pendo with full name, email, account ID, and a permanent user identifier (`userPermId`). The Pendo API key (`85dad924-b58b-460c-5587-9e376cc78601`) is in the public source. This is standard Pendo usage; the API key is client-side by design. What it reveals: LexisNexis tracks individual behavioral signals from its API customers -- every API doc page visited, every filter selected, every code sample copied.

The dev portal assets serve with `Access-Control-Allow-Origin: *`, meaning any site can make cross-origin requests to `dev.lexisnexis.com` assets.

## Legacy Infrastructure

LexisNexis shows multiple layers of infrastructure vintage simultaneously:

**Accurint** (`secure.accurint.com`) -- the people-search product that law enforcement, skip tracers, and background-check vendors rely on -- runs a visibly unmodernized stack:
- **Prototype.js**: A JavaScript framework from around 2005, predating jQuery. Rarely seen in production today.
- **Custom image CAPTCHA**: Instead of reCAPTCHA, Accurint uses "security images" -- a legacy anti-phishing technique where a personalized image proves the user is on the real site. This is a pattern from the mid-2000s online banking era.
- **ThreatMetrix device fingerprinting**: Self-hosted under `cdnfp.accurint.com` (not loaded from a third-party CDN). The initialization call is `fleximport.sketch("cdnfp.accurint.com", "bsb71sid", "24e4e153d2db69ff1e4fd84173a89c24", "1001")`. Org ID `bsb71sid` fires before any credentials are entered. ThreatMetrix is a LexisNexis Risk product -- they're using their own fraud-detection technology to fingerprint users logging into their other products. Network evidence shows exactly one third-party request from the Accurint login page: `cdnfp.accurint.com`.

**PatentAdvisor**: The product login portal links to PatentAdvisor with a static HubSpot tracking URL that includes:
```
__hstc=126863762.e246c3b711c4ef1851ec9b0412a75312.1569872522532
```
`1569872522532` is a Unix millisecond timestamp for September 30, 2019. This tracking parameter has been embedded in the login page HTML, unchanged, for approximately 6.5 years. Every person who has clicked the PatentAdvisor link from the product portal during that period has sent a 2019 HubSpot session cookie value in their URL.

**Google Universal Analytics**: `__utma`, `__utmb`, `__utmc`, `__utmz`, and `__utmt_sfga` are all still being set on page load alongside GA4. Google shut down UA data collection in July 2024. The cookies are being set but the associated server-side collection has been terminated -- dead tags in a GTM container that hasn't been cleaned in over two years.

## Machine Briefing

### Access & auth

No authentication required to access the marketing site, developer portal, or JSON API endpoints. The developer portal (`dev.lexisnexis.com`) is a full-browse-without-login SPA. Risk products (`risk.lexisnexis.com`, `secure.accurint.com`) require credentials; `risk.lexisnexis.com` also applies Cloudflare bot mitigation that blocks bare curl requests.

For the marketing site, standard `curl` or `fetch` with a `User-Agent` header works. CloudFront is the CDN layer; no special headers required for public endpoints.

### Endpoints

**Open (no auth)**

```bash
# Full navigation/megamenu config
curl https://www.lexisnexis.com/json/header.json

# Footer, country sites, contact info
curl https://www.lexisnexis.com/json/corporatesite.json

# AI crawler policy
curl https://www.lexisnexis.com/llms.txt

# Robots
curl https://www.lexisnexis.com/robots.txt

# Sitemap index (20+ regional sitemaps)
curl https://www.lexisnexis.com/sitemap__index.xml
```

**Developer portal (no auth to browse catalog)**

```bash
# Dev portal home (Angular SPA -- scrape after JS render)
https://dev.lexisnexis.com/

# Trial registration
https://professional.lexisnexis.com/dev_portal/trial
```

**Consumer rights portal**

```bash
# Consumer freeze request page (renders; links to Salesforce-hosted forms)
curl https://consumer.risk.lexisnexis.com/freeze
```

**OneTrust consent config**

```bash
# Tenant consent config (includes rulesets, geo targeting, feature flags)
curl https://cdn.cookielaw.org/consent/3517c230-6d84-4491-9d6b-3108c68fcd94/3517c230-6d84-4491-9d6b-3108c68fcd94.json
```

**Terminus ABM (returns 401 without client key)**
```bash
# In-browser this fires with embedded client credentials; direct curl returns 401
POST https://api.company-target.com/api/v3/ip.json
```

### Gotchas

- `risk.lexisnexis.com` returns a Cloudflare JS challenge (403 + `cf-mitigated: challenge`) on direct curl; requires a browser with a valid JS fingerprint.
- The Angular marketing site renders some content client-side -- bare curl gets the shell HTML; product listing and navigation data comes from `/json/header.json` which is accessible directly.
- `advance.lexis.com` sets a `LexisMachineId` persistent cookie on first access -- machine-level identifier that persists across sessions.
- `forms.consumer.risk.lexisnexis.com` (plural) has an expired SSL certificate; the active forms have migrated to `form.consumer.risk.lexisnexis.com` (singular, Salesforce-hosted).
- The Pendo API key in the dev portal (`85dad924-b58b-460c-5587-9e376cc78601`) is client-side only -- it allows initializing Pendo in a browser but does not grant access to Pendo's backend data APIs.
- Legacy UA cookie names (`__utma` etc.) are set but the corresponding collection endpoints are dead -- Google shut down UA data collection in July 2024.
