---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "CVS — Teardown"
url: "https://www.cvs.com"
company: CVS
industry: Healthcare
description: "US pharmacy chain, PBM, and retail health services operator."
summary: "CVS.com runs a multi-app architecture: Next.js for the main site and benefits portal, a separate React micro-frontend for shop pages (webpackChunk_brandingbrand_fsweb), and legacy apps for MinuteClinic and Caremark PBM. Tealium (utag v4.51, account=cvs, profile=cvs) orchestrates all tag firing. Akamai provides CDN, WAF (reese84/_abck bot management), and mPulse RUM. The RETAG API gateway (RETAGPV1/V2/V3) routes microservices behind Envoy proxy on a GKE+Rancher hybrid Kubernetes cluster. Vantiv/Worldpay eProtect handles payment iframes, and Flutter Web is deployed in production for PLP transfer flows."
date: 2026-04-07
time: "01:26"
contributor: hayabhay
model: sonnet-4.6
effort: high
stack:
  - Next.js
  - React
  - Tealium
  - Akamai
  - Envoy
  - Kubernetes
  - Flutter Web
  - Vantiv eProtect
trackers:
  - Google Tag Manager
  - DoubleClick
  - Google Ads
  - Adobe Experience Platform
  - Quantum Metric
  - OneTrust
  - Bluecore
  - Criteo
  - The Trade Desk
  - Medallia
  - Monetate
  - Akamai mPulse
  - AppDynamics
  - Impact Radius
tags:
  - pharmacy
  - healthcare
  - launchdarkly
  - pre-consent-tracking
  - feature-flags
  - specialty-pharmacy
  - flutter-web
  - retail
  - opt-out-consent
  - acquisition-artifacts
headline: "Every CVS.com search — including for insulin, antidepressants, and GLP-1 drugs — is forwarded to an email marketing company for follow-up campaigns before any consent interaction."
findings:
  - "Bluecore's email retargeting fires on every search including health-sensitive queries -- searches for insulin, GLP-1 drugs, or mental health medications are sent to api.bluecore.com for email campaigns, with the tracking cookie not even marked Secure (secureCookie: false)."
  - "A production feature flag (spc-enable-sprx-coram-careplus-data, version 368) stores two CVS employee test emails as its value -- ryanmccvs+sprxtesting@icloud.com and esbulkley+sprxtest@gmail.com -- while a companion flag exposes 14 Salesforce CRM account IDs for Coram specialty pharmacy health accounts."
  - "The pharmacist-pal-chat flag's exclusion list names 13 internal service accounts by drug -- SRV_ADPBOTADEMPAS (pulmonary hypertension), SRV_ADPBOTXIAFLEX (Peyronie's disease), SRV_ADPBOTOPSUMIT and SRV_ADPBOTAMBRISEN (both pulmonary arterial hypertension) -- exposing the specialty infusion automation bots Coram runs for each high-cost medication."
  - "All consent groups default to active on first page load -- 14 DoubleClick conversion pixels, 10 Google Campaign Manager requests, and 25 Quantum Metric session replay frames fire before any user interaction, while Global Privacy Control signals are silently ignored (browserGpcFlag=0, isGpcEnabled=0)."
  - "CVS deploys Flutter Web in production for pharmacy list transfer flows -- plp_flutter_transfer is enabled with canary/live version tracking (1.0.98-prod-1), an architecturally unusual choice for a high-traffic retail pharmacy site."
---

## Architecture

CVS.com is not one site -- it is at least four, running in parallel on shared infrastructure. The main consumer site uses Next.js (`webpackChunk_N_E` global). The shop and product pages use a separate React bundle (`webpackChunk_brandingbrand_fsweb`) -- a distinct micro-frontend identified by a different webpack namespace. MinuteClinic and the Caremark PBM experience are separate apps with their own routing. The benefits and OTCHS (Over-The-Counter Health Solutions, CVS's Medicare OTC benefit program) portal is another Next.js application with its own LaunchDarkly project.

All four share Tealium as the tag orchestration layer: `utag v4.51.202604071647`, account=`cvs`, profile=`cvs`, env=`prod`. Tealium acts as the single control point for firing all tracking vendors based on consent state. The `x-envoy-upstream-service-time` response header on API calls confirms Envoy proxy -- the microservices layer. A feature flag in the LaunchDarkly dataset (`acct-X-route: "account-gke-rke"`) names the cluster routing strategy: GKE (Google Kubernetes Engine) + RKE (Rancher Kubernetes Engine), a hybrid cloud deployment.

API routing uses the internally named RETAG gateway (Retail Enterprise Transaction API Gateway), with three active versions: RETAGPV1, RETAGPV2, RETAGPV3. The naming convention `/{RETAGPV{n}}/{ServiceName}/{ServiceVersion}/{operation}` is consistent -- `CartModifierActor/V2/getCartCount`, `OnlineShopService/V2/getSKUInventoryAndPrice`, `ExtraCare/V4/getCouponDefinitions`. The `Actor` pattern in CartModifierActor suggests an actor-model architecture (consistent with Akka or similar reactive frameworks).

Payment processing uses Vantiv/Worldpay eProtect -- the `initializeProtection` global on cart pages, with the CSP whitelisting `request.eprotect.vantivprelive.com` (a pre-production endpoint) alongside the production Vantiv domain. That pre-production endpoint in the production CSP suggests the policy was copied from a lower environment and never trimmed.

The CSP's `img-src` directive includes `http://images.ctfassets.net` -- Contentful's asset CDN -- alongside the `https://` version, indicating Contentful is the CMS for some content and the HTTP/HTTPS inconsistency is an oversight. Syndigo (`content.syndigo.com`) handles rich product content enrichment, with per-SKU JSON served at `/page/{siteId}/{skuId}.json` using site ID `b6b02051-cb12-4f9e-a3c7-f1477cd586aa`.

Flutter Web ships in production for pharmacy list (PLP) transfer flows, tracked by the `plp_flutter_transfer` flag (currently `true`) and `plp_consume_flutter_published` (`true`). The version management flag `plp_flutter_transfer_version` tracks both canary and live channels: `{"canary":"1.0.98-prod-1","live":"1.0.98-prod-1"}`. Running Flutter Web on a high-traffic retail site is architecturally unusual -- Flutter Web is rarely used outside Google's own properties and mobile-first startups.

**Response security headers (from production homepage):**
- `Content-Security-Policy`: present, extensive (see above for notable entries)
- `X-Frame-Options: SAMEORIGIN`
- `X-Content-Type-Options: nosniff`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `X-XSS-Protection: 1; mode=block`

The `x-req` header on every response exposes Akamai EdgeGrid metadata: `a=a;c=www.cvs.com-blocks-ui;d=desktop;g=0.922d3e17...;l=usw;t=ut;u=bot` -- the `c=www.cvs.com-blocks-ui` field names the Akamai configuration tag, and `u=bot` on the investigation session indicates Akamai's bot classification.

---

## The LaunchDarkly Key

CVS's LaunchDarkly client SDK key (`6553de691ae0a812e7ba8dea`) is loaded into every page via the Adobe ID (`{"type":"adobeId","key":"..."}`) stored in localStorage as the evaluation context. The key is intentionally public -- LaunchDarkly's client-side SDK model is designed this way. The problem is what the key returns when queried.

```
GET https://app.launchdarkly.com/sdk/evalx/6553de691ae0a812e7ba8dea/contexts/{base64-context}
```

This returns 791 feature flags for any context, authenticated or not. That count alone is a signal -- 791 flags in a single LaunchDarkly project means multiple microservices share one project rather than maintaining separate flag namespaces per service. The result is a complete enumeration of CVS's internal feature state, release roadmap, and operational configuration in a single unauthenticated call.

The OTCHS/benefits experience uses a separate LaunchDarkly key (`645e92d426e615119ab21f99`), returning 102 flags for the Caremark PBM and benefits systems. That project uses real-time streaming via `clientstream.launchdarkly.com` rather than batch evaluation.

### What the flags reveal about the roadmap

Disabled flags that signal upcoming or staged features:

- `ff-pdp-medication-info-ai-chat-bot: false` -- AI chatbot for drug product detail pages, built but not launched
- `ff-pdp-medication-info-ai-summary: false` -- AI-generated medication summaries on PDPs, built but not launched
- `LONG_TERM_SHORTAGE_MAIN_WORKFLOW: false` -- a complete national drug shortage workflow, disabled; context given the GLP-1/Ozempic shortage
- `ALLOW_BIOSIMILAR_PARTIAL_FILL_REWRITE: false` -- biosimilar substitution partial-fill logic, pending
- `STARTER_DOSE_RX_TITRATION_SWITCH: false` -- GLP-1 starter dose titration workflow (title-case naming suggests it originated in older Java code)
- `enable_retail_lockerPickup: false` -- pharmacy locker pickup, disabled
- `retail_rx_order_fastPickup: false` -- fast pickup ordering, disabled
- `enable_cnc_national_shortage: false` -- national shortage workflow for click-and-collect, disabled

By contrast, one AI feature is already live: `sprx-calltracking-ai-summary: true` -- AI-generated call summaries are active for specialty pharmacy (Coram/sprx) call center operations, while the consumer-facing AI features remain staged.

The flag `retail_rx_order_confirmToFill_statusCode: "CONFIRM_TO_FILL_PAUSED"` signals a temporarily paused workflow -- the confirm-to-fill flow (where a pharmacist confirms a prescription before dispensing) is suspended across the system.

The prompt engine program list gives a full enumeration of CVS's in-flight prescription programs: `AUTOFILL,NINETYDAY,FASTPICKUP,SCRIPTSYNC,VAXGAP,CONTACTPREF,RRX,RRXEC,RRXP,RRXPW,RRXL` -- AutoFill, 90-day supply, Fast Pickup, Script Sync, Vaccine Gap, Contact Preference, and multiple RxRewards tiers.

### Test data in production flags

Two flags contain data that belongs in a test fixture, not a production feature flag store.

**`spc-enable-sprx-coram-careplus-data`** (flagVersion 368):
```
ryanmccvs+sprxtesting@icloud.com;esbulkley+sprxtest@gmail.com;
```

Two employee test email addresses in a production feature flag, iterated 368 times without cleanup. The `+sprxtesting` and `+sprxtest` subaddress patterns confirm these are developer test accounts, not real patients. FlagVersion 368 means this flag has been updated 368 times -- the email addresses have survived hundreds of production deployments across however many years this flag has existed.

**`spc-enable-sprx-coram-care-plus-data-for-health-accounts`** (flagVersion 68):
```
001A000001Qg3LGIAZ;001A000000yAXnSIAW;0011H00001msB0TQAU;001A000000yAXnSIAW;
001A0000018qnTfIAI;0011H00001kmk6TQAQ;001A000001IyMFnIAN;001A000001NT01fIAD;
001A000000xYf99IAC;001A000000xYdd0IAC;001A000000xYfBtIAK;001A000000xYf3fIAC;
SC_9ALSB1UXPNEX6I0;001A0000014VLLXIA4
```

14 Salesforce record IDs (Coram health account identifiers) used as a whitelist for the specialty pharmacy Care Plus feature. Salesforce IDs beginning with `001A` and `0011H` are Account object IDs; the `SC_` prefix is non-standard and may be from a custom namespace.

### The pharmacist-pal-chat exclusion list

The `pharmacist-pal-chat` flag controls which users see the Pharmacist Pal internal chat tool. The user exclusion list names service accounts by drug:

```json
{
  "roles": ["all"],
  "userIds": [
    "all",
    "!SRV_ADPBOTADEMPAS01", "!SRV_ADPBOTADEMPAS02",
    "!SRV_ADPBOTOPSUMIT03", "!SRV_ADPBOTOPSUMIT04",
    "!SRV_ADPBOTOPSUMIT05", "!SRV_ADPBOTOPSUMIT06",
    "!SRV_ADPBOTOPSUMIT07", "!SRV_ADPBOTOPSUMIT08",
    "!SRV_ADPBOTXIAFLEX01", "!SRV_ADPBOTXIAFLEX02",
    "!SRV_ADPBOTAMBRISEN01", "!SRV_ADPBOTAMBRISEN02",
    "!SRV_ADPBOTAMBRISEN03"
  ],
  "pages": ["all", "!logout", "!pharmacist-pal"]
}
```

Decoding the bot names by drug:
- `ADEMPAS` -- Riociguat (pulmonary hypertension, Bayer specialty drug)
- `OPSUMIT` -- Macitentan (pulmonary arterial hypertension, Janssen specialty)
- `XIAFLEX` -- Collagenase clostridium histolyticum (Peyronie's disease / Dupuytren's contracture, Endo specialty)
- `AMBRISEN` -- Ambrisentan (pulmonary arterial hypertension, GSK specialty)

These are all high-cost specialty infusion/injection drugs managed through Coram, CVS's specialty pharmacy subsidiary. The flag is excluding automated dispensing/processing bots from the human pharmacist chat interface. The `ADP` prefix in each bot name likely stands for Automated Dispensing Process. The exclusion list -- naming each bot by the drug it handles and using sequential instance numbers (OPSUMIT03 through OPSUMIT08, six instances) -- reveals both the scale of the automation and the specific drugs it covers.

---

## Cookie-Based Feature Flag System

On the very first HTTP response -- before any JavaScript runs, before any browser fingerprinting completes -- the CVS server sets the following cookies in a single response header block:

```
hp_c=off
hp_t=ab30
mca1=on
newPDP=on
s2c_transactionsphr=on
rxe=i1
mvpe=gr
mcpe=gr
mdpe=gr
pe=p1
fspe=p1
ccse=p1
kcpe=e
hdnew=on
aat1=off-p0
aat2=on
aat4=off-p2
```

These are server-assigned A/B variant identifiers, not preferences. `hp_t=ab30` is the homepage template variant (a different session got `hp_t=b5`). `rxe=i1` is a pharmacy experience variant. `mvpe`, `mcpe`, `mdpe` are module variants for different product page components. `kcpe=e` likely means "known customer page experience" variant E. The server determines the variant before the browser sends any cookies or fingerprint data -- the assignment is made at the edge.

Tealium captures all of these via the `cp.*` namespace in `window.utag_data`, making them available to every downstream tag vendor as first-party cookie data. A tracker reading `utag_data.cp.hp_t` knows which homepage variant this visitor is in. A tracker reading `utag_data.cp.rxe` knows which pharmacy experience they're assigned to.

The full cookie list runs to 50+ entries per fresh session. Three simultaneous A/B testing systems operate on cvs.com: LaunchDarkly (feature flags), Monetate (`monetateQ` global, used for product/content personalization on PLPs with "Interrupter" placeholder positions for sponsored products), and Adobe Target (via `mcapi` experience slots with `plp_adobe_target_load="5"`). Active tests observed include a "DSM 11/22 PDP Shelves Test - FBT Algo V1 vs. V2 50/50" (Frequently Bought Together algorithm comparison), an "MKTG/CVS HP" homepage marketing test, and a "Manage Rx Destination Link AB Test" for pharmacy navigation.

---

## Surveillance and Consent

### The consent model

OneTrust (version `202601.2.0`, consent config GUID `283c7078-bb2e-4027-97d1-8495f534e7df`) is configured as an opt-out system. On the first page load, before any user interaction with any consent UI, the OptanonConsent cookie is set with all categories active:

```
isGpcEnabled=0
browserGpcFlag=0
isIABGlobal=false
version=202601.2.0
```

The cookie contains no `groups=` parameter on fresh load -- all consent groups are implicitly active. Category definitions: C0001=Strictly Necessary, C0011=Business/Performance, C0012=First-Party Personalization, C0013=Third-Party Advertising, C0055=Google RDP.

Global Privacy Control (GPC) is not honored. `browserGpcFlag=0` and `isGpcEnabled=0` are set regardless of whether the browser signals GPC. Under CCPA, GPC has legal weight for California residents; CVS appears to treat it as advisory at most.

### Pre-consent tracking (fresh session, zero interaction)

On first page load, before any consent banner interaction, the network log records:

| Vendor | Endpoint | Requests |
|--------|----------|----------|
| Quantum Metric | `ingest.quantummetric.com/horizon/cvs`, `rl.quantummetric.com/cvs/hash-check` | 25 |
| DoubleClick (DV360) | `ad.doubleclick.net/activity;src=6615255;type=cvsna0;cat=cvssi00` | 14 |
| Google Campaign Manager | `www.google.com/ccm/collect`, `/gmp/conversion/` | 10 |
| Adobe Experience Platform | `edge.adobedc.net/ee/or2/v1/interact`, `adobedc.demdex.net/ee/v1/interact` | 7 |
| YouTube | `www.youtube.com/youtubei/v1/log_event` | 4 (no video visible) |
| LaunchDarkly | `app.launchdarkly.com/sdk/evalx/...`, `events.launchdarkly.com` | 4 |
| OneTrust | `geolocation.onetrust.com/cookieconsentpub/v1/geo/location` | 2 |
| The Trade Desk | `insight.adsrvr.org/track/realtimeconversion` | 1 |
| Akamai mPulse | `c.go-mpulse.net/api/config.json` | 1 |
| Impact Radius | `cvshealth.sjv.io/xc/5847972/2140040/27240` | 1 |
| AppDynamics | `pdx-col.eum-appdynamics.com/eumcollector/beacons/browser/v2/AD-AAB-ACK-SED/adrum` | 1 |

Total: 99 requests on first page load -- 12 first-party, 87 third-party.

YouTube fires 4 analytics events on page load despite no visible video -- the YouTube iframe API initializes on load regardless. The Trade Desk conversion pixel fires immediately without any purchase event.

### State-by-state compliance architecture

CVS has built 50+ per-state OneTrust consent groups (C0030 through approximately C0083), one per US state, specifically for Google's Restricted Data Processing (RDP) state compliance. This is more granular than most retailers -- rather than a single "US state privacy laws" toggle, CVS treats each state's privacy regime independently. The architecture suggests active compliance work is in progress, though the default-opt-out model means all these groups are active from page load regardless.

### Bluecore and health-sensitive search terms

Bluecore (triggermail.js, `api.bluecore.com/api/track/search`) fires on every search, sending the search term to Bluecore's email retargeting platform. This includes health-sensitive queries -- searches for insulin, GLP-1 drugs, mental health medications, or any prescription drug. Bluecore's configuration shows `sanitizeCustomerIdentifiers: true` (customer IDs are hashed before transmission) but `secureCookie: false` (the Bluecore tracking cookie is not marked Secure). When a user is authenticated, their search history is linked to their CVS account for email targeting.

CVS runs Bluecore alongside Criteo (display retargeting) -- both receive search term data via separate track endpoints.

---

## RETAG Gateway and API Surface

The RETAG (Retail Enterprise Transaction API Gateway) naming convention surfaces consistently across all observed endpoints. The version suffix (`PV1`, `PV2`, `PV3`) is not consistent with a single migration path -- all three versions appear active simultaneously, suggesting different services have been upgraded at different rates.

Observed RETAG endpoints:
```
POST /RETAGPV2/CartModifierActor/V2/getCartCount
POST /RETAGPV3/OnlineShopService/V2/getSKUInventoryAndPrice
GET  /RETAGPV3/Inventory/V1/getATPInventory
POST /RETAGPV3/ExtraCare/V4/getCouponDefinitions
POST /RETAGPV3/OnlineOrder/V3/getOrder
```

The `Actor` pattern in `CartModifierActor` is architecturally notable -- it implies the cart service uses a message-passing/actor model (consistent with Akka on the JVM, common in large Java microservice architectures). The error response format includes a `moreInfo` URL pointing to `developer.cvshealth.com`, the public API portal.

The developer portal (`developer.cvshealth.com`) runs Drupal 10 with PHP 8.3.20 on nginx 1.27.2, with the `X-Cookie-Domain: devportal-staging.cvshealth.com` header leaking the staging domain in production responses. The public API catalog includes: Auto-refill/renew, COVID vaccine inventory, MinuteClinic appointment booking, store locator, drug pricing, multi-pharmacy pricing comparison, and EDP (Enterprise Data Platform) member programs.

Micro-frontend components are served via:
```
GET /retail-component-server/v1/ui/header  (requires body[page_name], body[target_component])
GET /retail-component-server/v1/ui/footer  (same)
```

Without the required body parameters, both return explicit validation errors naming the required fields -- useful for reconstruction.

---

## SSL Certificate and Environment Exposure

The SSL certificate covering `cvs.com` contains 761 Subject Alternative Names. Notable entries:

**Development/test environments:**
- `dotcom-intertest.cvs.com` -- integration test for main www
- `artemis-dev.cvs.com` -- an internal platform named Artemis, in development
- `ciim-dev.cvs.com`, `ciim-uat.cvs.com` -- CIIM (Customer Identity / Integration Management, inferred)
- `apigw-service-{it1,it2,it3,it4,pt2,qa1,qa2,qa3,qa4,reg1,reg2,uat1,uat2,uat3,uat4}.cvs.com` -- a full environment ladder for the API gateway: IT (integration test) x4, PT (performance test) x1, QA x4, REG (regression) x2, UAT x4

**Color-coded clusters:**
- `amber-pnp-devrxc-{az,ri}.cvs.com`, `bronze-pnp-devrxc-{az,ri}.cvs.com` -- `pnp` likely "Pickup Now/Pharmacy", `az`/`ri` are Azure/region identifiers, color coding maps to environment tier

**Marketing and CRM:**
- `700goodreasons-dev.cvs.com`, `700goodreasons-uat.cvs.com` -- "700 Good Reasons" marketing campaign infrastructure in non-production
- `crm-oltp-test.cvs.com`, `crm-uat.cvs.com` -- CRM system environments

All of these are confirmed subdomains (not live investigation targets), but their presence in a production TLS certificate means they share the trust anchor with the main site.

---

## Acquisition Artifacts

The `robots.txt` (last updated 5/21/2024) disallows paths that reveal CVS's acquisition history:

```
Disallow: /bizcontent/target/
Disallow: /bizcontent/navarro/
Disallow: /bizcontent/vitaminshop/
```

- `/bizcontent/target/` -- Target pharmacy acquisition (2015, ~1,700 store pharmacies transferred to CVS)
- `/bizcontent/navarro/` -- Navarro Discount Pharmacy, acquired 2014 (South Florida chain)
- `/bizcontent/vitaminshop/` -- Vitamin Shoppe relationship (not a full acquisition -- likely a content partnership or pilot)

The paths persist in the robots.txt because the content likely still exists at those paths, being actively served or indexed. A disallow in robots.txt suggests the content is real, not a historical artifact.

The same robots.txt contains:
1. An ASCII art CVS heart logo
2. 30+ honeypot paths with randomized obfuscated strings (`/ruicket-of-Graue-on-Withou-when-Frogge-name-nors`) designed to detect scrapers that ignore robots.txt
3. A block on AI crawlers (GPTBot, ClaudeBot, anthropic-ai, Google-Extended) specifically for `/druginfo` only -- not the full site

The `/druginfo` block targeting AI crawlers while leaving the rest of the site open suggests CVS is specifically protecting the drug information database content from AI training, not the e-commerce catalog.

---

## Healthcare-Specific Flags

The OTCHS/benefits LaunchDarkly project (`645e92d426e615119ab21f99`, 102 flags) reveals Caremark PBM and specialty pharmacy internals distinct from the retail site:

- `minorTurning18: false` -- handling for minors aging into adult healthcare, a legal boundary with HIPAA implications
- `lexisNexisCGXID: false` -- LexisNexis Cross-Graph ID for identity verification, disabled
- `circle_of_friends: false` -- a caregiving network feature, disabled
- `otchs-app-enabled: false` and `otchsAppEnabled: false` -- duplicate flags for the same feature, both disabled (the duplicate naming suggests different teams or migration phases)
- `cmk-aem-static-pages` -- an object mapping page types to booleans, showing an in-progress content migration to Adobe Experience Manager
- `incomm-benefits-v2`, `solutran-benefits-v2` -- OTC benefit card integrations for Medicare members

State-specific healthcare flags in the main LD project: `retail_rx_phr_enroll_stateExclusion = "NY,NJ,AR"` -- Personal Health Record enrollment is blocked in New York, New Jersey, and Arkansas, likely reflecting the NY SHIELD Act, NJ health privacy laws, and Arkansas-specific requirements.

---

## Machine Briefing

**Access model:** Akamai bot management (`reese84` / `_abck` cookies, `bm_sz` challenge) is active. Direct curl requests are blocked on most endpoints. Browser-based access (with proper user-agent and session cookies) is required for the RETAG API. LaunchDarkly evaluation endpoints are publicly accessible without any session.

### Open Endpoints

```bash
# LaunchDarkly -- any unauthenticated context returns all 791 flags
# Construct a base64-encoded context JSON: {"kind":"user","key":"any-string"}
CONTEXT=$(echo -n '{"kind":"user","key":"test"}' | base64)
curl "https://app.launchdarkly.com/sdk/evalx/6553de691ae0a812e7ba8dea/contexts/${CONTEXT}"

# OTCHS/benefits LaunchDarkly key (102 flags, Caremark/specialty)
curl "https://app.launchdarkly.com/sdk/evalx/645e92d426e615119ab21f99/contexts/${CONTEXT}"

# Store locator (Akamai-gated but accessible via browser session)
GET /api/locator/v2/stores/search?lat={lat}&lng={lng}&radius={miles}

# Guest auth token
POST /api/guest/v1/token

# Micro-frontend components
POST /retail-component-server/v1/ui/header
POST /retail-component-server/v1/ui/footer
# Body required: {"page_name": "homepage", "target_component": "header"}
```

### RETAG Gateway Patterns

```
POST /RETAGPV2/CartModifierActor/V2/getCartCount
POST /RETAGPV3/OnlineShopService/V2/getSKUInventoryAndPrice
GET  /RETAGPV3/Inventory/V1/getATPInventory
POST /RETAGPV3/ExtraCare/V4/getCouponDefinitions
POST /RETAGPV3/OnlineOrder/V3/getOrder
POST /api/retail/feature/flags/v1/info
```

All RETAG endpoints require an authenticated session or guest token. Error responses reference `developer.cvshealth.com` for parameter documentation.

### Window Globals

```javascript
// Available on every page
window.utag_data        // Tealium data layer -- 150+ fields, all cp.* cookies, page metadata
window.utag             // Tealium tag container object
window.initialState     // Product categories tree (available on shop pages)
window.productSearchData // Search results with pricing, isSponsored flag (search pages)
window.globalPageDetail  // Page type string, e.g. "shop:pdp:Product(SKU)"

// Tracking
window.QuantumMetricAPI_cvs  // CVS-customized QM API
window.triggermail      // Bluecore/email retargeting config and track() method
window.ttdConversionEvents   // Trade Desk conversion events array
```

### Key Identifiers

```
LaunchDarkly retail key:  6553de691ae0a812e7ba8dea  (791 flags)
LaunchDarkly benefits key: 645e92d426e615119ab21f99  (102 flags, Caremark/OTCHS)
OneTrust consent GUID:    283c7078-bb2e-4027-97d1-8495f534e7df
Tealium account/profile:  cvs/cvs
AppDynamics RUM endpoint: pdx-col.eum-appdynamics.com
Syndigo site ID:          b6b02051-cb12-4f9e-a3c7-f1477cd586aa
Vantiv pre-prod endpoint: request.eprotect.vantivprelive.com (in prod CSP)
```

### Gotchas

- Akamai bot management aggressively blocks headless browsers; headed Playwright with a standard user-agent is required for session-dependent endpoints
- The LaunchDarkly evaluation endpoint is publicly accessible without cookies or session state -- it is the most accessible enumeration surface on the site
- Cookie-based A/B assignments are server-generated on first response; the same endpoint will return different variant cookies across sessions
- The LD flag `plp_flutter_transfer: true` means some PLP users are served Flutter Web -- if a scraper encounters PLP content behaving differently, this is why
- RETAG error responses include a `moreInfo` field with a `developer.cvshealth.com` URL that describes valid parameters
- The `x-req` header on every response contains the client IP as seen by Akamai's edge; useful for confirming whether you're going through the CDN or not
- `/bizcontent/target/`, `/bizcontent/navarro/`, `/bizcontent/vitaminshop/` are disallowed in robots.txt but may still be reachable
