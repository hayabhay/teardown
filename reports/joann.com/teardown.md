---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "JOANN — Teardown"
url: "https://joann.com"
company: "JOANN"
industry: "Retail"
description: "Bankrupt craft retailer whose domain now redirects entirely to Michaels."
summary: "joann.com is a Michaels-owned redirect shell. The TLS cert is issued to Michaels Stores Inc., every URL returns a 301 to michaels.com with a ?joannweb attribution parameter, and zero first-party requests originate from the domain. The destination is a Next.js SSR app (build v4.4, April 2026) on Akamai CDN with ContentStack CMS, backed by a Kubernetes microservices platform internally codenamed '2C'."
date: 2026-04-13
time: "19:56"
contributor: hayabhay
model: "sonnet-4.6"
effort: medium
stack: [Next.js, Akamai, ContentStack, Optimizely, Kubernetes]
trackers: [Google Analytics, Google Tag Manager, Facebook Pixel, Criteo, TikTok Pixel, Wunderkind, BazaarVoice, Attentive, Treasure Data, Radar.io, ID5, Pinterest, Bing Ads, Reddit Ads, StackAdapt, CrazyEgg, Signifyd, AppNexus, SnapChat, Yahoo, Salesforce Marketing Cloud, NomiPix]
tags: [craft-retail, acquisition, bankruptcy, redirect, feature-flags, a-b-testing, kubernetes, next-js, gcs-bucket, surveillance]
headline: "Michaels' public GCS bucket has held a 738MB Java heap dump since August 2023 — discoverable by following a redirect from the bankrupt craft store it absorbed."
findings:
  - "storage.googleapis.com/mik-web-static is publicly listable without authentication — contents include a 738MB Java heap dump (m.hprof, public since August 2023), full site catalog exports, PLCC credit card demo recordings, and internal Python scripts."
  - "Every URL on joann.com redirects to michaels.com with a ?joannweb attribution tag — every old blog link, Pinterest pin, and Google result pointing at JOANN now feeds Michaels' analytics with exact conversion tracking on acquired traffic."
  - "Michaels' Next.js runtime config ships 25+ Kubernetes cluster-internal service URLs in every HTML response — search, commerce, user, financials, orders, ads, inventory, NLP — mapping the full production microservices topology for anyone who views source."
  - "A public Optimizely datafile exposes all 7 of Michaels' running A/B experiments — including conversational search on desktop and mobile, a PLP rewrite in its 7th mobile iteration, and social proofing on product and cart pages."
  - "Feature toggle files reveal an AI chatbot vendor shootout: Sierra is live (AiAgentSierra: true), Decagon is staged but off, and an explicit AiAgentNone kill switch treats the entire chatbot as optional infrastructure."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

JOANN closed its last stores in March 2025 after filing for bankruptcy for the second time in five years. By June 2025, joann.com had a new owner — technically and literally. Today visiting joann.com gets you a 301 redirect, a Michaels TLS cert, and a tracking parameter. There is no joann.com anymore. What follows is a teardown of what replaced it.

---

## The Domain Shell

The TLS certificate for `www.joann.com` is issued to **Michaels Stores Inc.**, out of Irving, Texas. It covers the full former JOANN subdomain fleet: `www.joann.com`, `joann.com`, `stores.joann.com`, `creativity.joann.com`, `search.joann.com`, `handmadewithjoann.com`, and `www.handmadewithjoann.com`. The cert was issued March 4, 2026, by DigiCert.

```
Subject: C=US; ST=Texas; L=Irving; O=Michaels Stores Inc.; CN=www.joann.com
SANs: www.joann.com, creativity.joann.com, handmadewithjoann.com, joann.com, 
      search.joann.com, stores.joann.com, www.handmadewithjoann.com
Issued: Mar 4 2026 — DigiCert Global G3 TLS ECC SHA384 2020 CA1
```

There are zero first-party joann.com requests when you load the site. Every byte served is either from michaels.com or a third-party vendor. The robots.txt is empty. No security.txt. No llms.txt. The site's entire job is to redirect.

---

## The Redirect Map

Every joann.com URL returns HTTP/2 301 to a Michaels equivalent. All redirects append `?joannweb`:

| joann.com path | Michaels destination |
|----------------|------------------------|
| `/` | `/lp/welcome-joann?joannweb` |
| `/c/fabric` | `/shop/fabric-sewing-shop/fabrics?joannweb` |
| `/c/sewing` | `/shop/fabric-sewing-shop?joannweb` |
| `/c/floral` | `/shop/floral?joannweb` |
| `/c/crafts` | `/lp/welcome-joann?joannweb` |
| `/c/yarn` | `/lp/welcome-joann?joannweb` |
| `/c/baking` | `/lp/welcome-joann?joannweb` |

Fabric and sewing have direct category mappings. Yarn, crafts, and baking don't — no equivalent Michaels category URL exists, so they fall through to the generic JOANN welcome landing page. `stores.joann.com` and `creativity.joann.com` both redirect to the welcome page. `search.joann.com` is on the TLS cert but returns 404 — dead subdomain, never redirected.

**`?joannweb` as attribution infrastructure:** every inbound link on the internet that once pointed at joann.com — blog posts, Pinterest boards, old affiliate links, Google Shopping results — now routes through a parameter that tags those visitors as JOANN-origin in Michaels' analytics. The acquisition value of the domain isn't just brand traffic; it's the ability to measure exactly how much of it converted.

One artifact appears in the redirect response headers: `access-control-allow-origin: mik.prod.platform.michaels.com`. This is Michaels' internal platform domain, surfacing in a CORS header on the 301 response — an artifact of routing infrastructure that exposes the internal platform hostname on every joann.com request.

---

## Michaels' Platform Architecture

Visitors who follow the redirect land on a Next.js application. Build: `public-ssr-2026.04.02.74899-release-v4.4-d05f6e9` (April 2, 2026). The platform is internally named **2C** — visible in the build environment (`APP_ENV: 2c-prd`, `APP_NAME: ssr-public`), in Kubernetes namespace prefixes, and in the GCS bucket paths.

Infrastructure as observed from the Michaels landing page:
- **CDN/WAF:** Akamai (`server-timing: ak_p` on every response)
- **SSR framework:** Next.js with `window.__NEXT_DATA__`
- **CMS:** ContentStack (page UIDs like `blt9854eba8fa4ff4d0`)
- **Search:** Constructor.io (`cnstrc.com` in CSP connect-src)
- **A/B testing:** Optimizely Full Stack
- **Personalization:** Algonomy (formerly RichRelevance)
- **Consent:** Securiti.ai (auto-blocking)
- **Performance RUM:** Akamai mPulse
- **IP geolocation:** Radar.io
- **Reviews:** BazaarVoice

### The JOANN Welcome Page

The landing page at `/lp/welcome-joann` is a purpose-built merchandising push. ContentStack CMS records it as version 35 of page UID `blt9854eba8fa4ff4d0`, titled internally "Welcome Joann Customers (CREATIVE UPDATE)". It was created June 10, 2025 — three months after JOANN's last stores closed — and last updated July 7, 2025. Version 35 means this page has been iterated 34 times since creation. It contains 26 content blocks: banners, featured categories, product carousels, recommendation carousels, side-by-side comparisons, and rich text.

Feature toggles show dedicated infrastructure for the JOANN acquisition pages. From the PDP toggle file (`/mft/2c-prd/released-featuretoggle/PDP.json`):
- `lp/welcomeStoreLocator: true` — JOANN welcome page gets a dedicated store locator showing nearby Michaels locations
- `lp/fabricsStoreLocator: true` — same for the fabric landing page
- `balloonsStoreLocator: true` — balloon inflation service locator (a Michaels-specific in-store service, not a JOANN carry-over)

---

## The Kubernetes Service Map in Every HTML Response

`window.__NEXT_DATA__.runtimeConfig.env.envServer` is populated server-side and injected into every page's HTML as part of Next.js's runtime config hydration. The value is a JSON object of 33 keys. Most are Kubernetes cluster-internal URLs — `*.svc.cluster.local` addresses that are unreachable from the public internet, but their names are now in every browser that visits michaels.com.

The full service map, as served in the HTML:

```
SEARCH_API:    http://sch-2c-prd-api-svc.sch-2c-prd-http.svc.cluster.local/api
CONTENT_API:   http://cms-2c-prd-api-svc.cms-2c-prd-http.svc.cluster.local/api
COMMERCE_API:  http://cpm-2c-prd-api-svc.cpm-2c-prd-http.svc.cluster.local/api
USER_API:      http://usr-2c-prd-api-svc.usr-2c-prd-http.svc.cluster.local/api
DEVELOPER_API: http://mda-2c-prd-api-svc.mda-2c-prd-http.svc.cluster.local/api
FINANCIALS_API:http://fin-2c-prd-api-svc.fin-2c-prd-http.svc.cluster.local/api
ARR_API:       http://arr-2c-prd-api-svc.arr-2c-prd-http.svc.cluster.local/api
FGM_API:       http://fgm-2c-prd-api-svc.fgm-2c-prd-http.svc.cluster.local/api
RSC_API:       http://rsc-2c-prd-api-svc.rsc-2c-prd-http.svc.cluster.local/api
MPE_API:       http://mpe-2c-prd-api-svc.mpe-2c-prd-http.svc.cluster.local/api
BRIDGE_API:    http://bridge-2c-prd-api-svc.bridge-2c-prd-http.svc.cluster.local/api
ORDERS_API:    http://moh-2c-prd-api-svc.moh-2c-prd-http.svc.cluster.local/api
MAP_API:       http://map-2c-prd-api-svc.map-2c-prd-http.svc.cluster.local/api
MIK_API:       http://mik-2c-prd-api-svc.mik-2c-prd-http.svc.cluster.local/api
IFR_API:       http://ifr-2c-prd-api-svc.ifr-2c-prd-http.svc.cluster.local/api
PUBTOOL_API:   http://pubtool-2c-prd-api-svc.pubtool-2c-prd-http.svc.cluster.local/api
RECANA_API:    http://rec-analysis-2c-prd-api-svc.rec-analysis-2c-prd-http.svc.cluster.local/api
REC_API:       http://rec-2c-prd-api-svc.rec-2c-prd-http.svc.cluster.local/api/rec
ABT_API:       http://ab-testing-2c-prd-api-svc.ab-testing-2c-prd-http.svc.cluster.local/api
ADS_API:       http://ads-2c-prd-api-svc.ads-2c-prd-http.svc.cluster.local/api
INV_API:       http://inv-2c-prd-api-svc.inv-2c-prd-http.svc.cluster.local/api
NLP_API:       http://inv-2c-prd-api-svc.inv-2c-prd-http.svc.cluster.local/api
RSC_WEB:       http://rsc-2c-prd-web-svc.rsc-2c-prd-http.svc.cluster.local
B2B_WEB:       http://b2b-2c-prd-web-svc.b2b-2c-prd-http.svc.cluster.local
IMG_WEB:       http://glb-2c-prd-imgproxy-svc.glb-2c-prd-http.svc.cluster.local
MIK01_WEB:     http://mik-2c-prd-web-svc.mik-2c-prd-http.svc.cluster.local
MAP_WEB:       http://map-2c-prd-web-svc.map-2c-prd-http.svc.cluster.local
MOH_RSC:       http://moh-rsc-2c-prd-api-svc.moh-rsc-2c-prd-http.svc.cluster.local/api
PUBTOOL_WS:    wss://pubtool-2c-prd-api-svc.pubtool-2c-prd-http.svc.cluster.local/api/ws
GOOGLE_BOT:    http://rsc-2c-prd-chat-api-svc.rsc-2c-prd-http.svc.cluster.local/api
MAP_STATIC_WEB:https://static.platform.michaels.com/map/2c-prd
STORAGE_MAP_STATIC: https://storage.googleapis.com/mik-web-static/map/2c-prd
SSR_COMMON_TOGGLE_API: https://static.platform.michaels.com/mft/2c-prd/released-featuretoggle/ssr-common.json
```

The naming convention is consistent: `{service}-2c-prd-{type}-svc.{service}-2c-prd-{protocol}.svc.cluster.local`. Services covered: search (sch), CMS (cms), commerce/product management (cpm), user (usr), developer API (mda), financials (fin), events bus (arr), recommendations (rsc, rec), recommendation analysis (rec-analysis), store locator (map), main platform (mik), inventory fulfillment (ifr), publishing tools (pubtool), A/B testing (ab-testing), ads, and inventory (inv). A B2B web interface is also present.

Two artifacts stand out. `NLP_API` and `INV_API` share the same cluster URL — either a misconfiguration in the runtime config or the NLP service is co-located in the inventory namespace. `GOOGLE_BOT` maps to `rsc-2c-prd-chat-api-svc` — the name suggests this is the backend for an AI chatbot integration, consistent with the Sierra/Decagon feature flags. `STORAGE_MAP_STATIC` references the GCS bucket directly in the runtime config.

These addresses are not reachable from outside the cluster. The operational consequence is that a complete picture of Michaels' production microservices topology — service names, namespace structure, deployment environment — ships in every HTML response.

---

## The Public GCS Bucket

`STORAGE_MAP_STATIC` in the runtime config points to `https://storage.googleapis.com/mik-web-static/map/2c-prd`. The bucket `mik-web-static` is publicly listable — GET requests to the bucket root return a full XML directory listing without authentication.

The bucket's top-level directories, as observed during the investigation:

```
dump/
PLCC-App-Recordings/
mik_runtime_config/
data-file/
IBM Business and Vendor Users/
ifr-product-cache-sc-stg/
Delta-load/
POC/
map/
```

**Java heap dump:** `https://storage.googleapis.com/mik-web-static/dump/m.hprof` — 738,975,555 bytes (~704 MiB). Last modified August 11, 2023. Verified as a valid Java heap dump by its `JAVA PROFILE 1.0.2` file header. Java heap dumps are memory snapshots of a running JVM process at a point in time: they contain all objects in memory, which depending on the application can include database credentials, API keys, session tokens, customer PII, cached query results, and internal application state. This file has been in a publicly accessible GCS bucket for over two and a half years.

**Other notable bucket contents:**
- `PLCC-App-Recordings/Guest.mp4`, `Rewards With PLCC Cards.mp4`, `Rewards Without PLCC Cards.mp4` — PLCC is Michaels' Private Label Credit Card. These appear to be internal demo or training recordings of the rewards checkout flow.
- `data-file/ifr-product-cache-sc_2022-07-06.json.gz` — 20MB compressed product catalog cache.
- `data-file/Export_siteCatalog_0506.zip`, `data-file/Export_siteCatalog_0523.xml` — full site catalog exports.
- `data-file/update_menu_type.py` — an internal Python script using SAX XML parsing for category assignment; contains Chinese-language comments.
- `mik_runtime_config/` — environment-specific runtime configs organized as `2c-prd/`, `2c-staging/`, `2c-uat/`, `2c-qa/`, `2c-lab/`, `2c-dev/`. The naming mirrors the internal 2C platform codename seen throughout the runtime config and service mesh.
- `mik_runtime_config/2c-prd/ssr-rewards-nextjs.json` — production rewards config containing `departmentId: 5258206`.

The `2c-prd`/`2c-staging`/`2c-uat` directory structure in this public bucket matches the Kubernetes namespace pattern `{service}-2c-prd-*` from the service mesh config — consistent internal platform namespacing across all systems.

---

## Experimentation Infrastructure

Two sets of public, unauthenticated configuration files define Michaels' live product experiments.

### Optimizely Datafile

`https://cdn.optimizely.com/datafiles/E2e4kxW3BrKx85EEn1vTz.json` — Michaels' full Optimizely Full Stack configuration. No auth required.

- Account: 24389681160, Project: 24524670280, Revision 4437
- **7 running experiments:**

| Experiment | Status |
|-----------|--------|
| `tile_based_navigation_desktop_4` | Running |
| `conversational_search_desktop_test1` | Running |
| `conversational_search_mweb` | Running |
| `plp_rewrite_desktop_4_copy1` | Running |
| `plp_rewrite_mweb_7` | Running |
| `social_proofing_desktop_pdp_cart_2` | Running |
| `social_proofing_mweb_pdp_cart_2` | Running |

- **39 feature flags** including: `algonomy_cart_desktop/mweb`, `conversational_search_desktop/mweb`, `fluent_desktop/mweb`, `plcc_rtps_desktop/mweb`, `cart_save_for_later_desktop/mweb`, `plp_guided_selling_desktop/mweb`, `spa_v4`, `sign_in_desktop/mweb`, `edd_desktop/mweb`, `dynamic_facet_desktop/mweb`, `pdp_recs_atc_desktop/mweb`, `reorder_desktop/mweb`, `cart_interstitial_desktop/mweb`, `header_nav_shop_desktop/mweb`, `header_nav_services_desktop/mweb`, `cart_account_modal_desktop/mweb`, `cart_performance_optimization_desktop/mweb`.

The experiment naming is readable: `plp_rewrite_mweb_7` is the seventh iteration of a mobile product listing page rewrite. `plp_rewrite_desktop_4_copy1` is a fork of the fourth desktop version. `tile_based_navigation_desktop_4` is the fourth version of tile-based navigation. `conversational_search_desktop_test1` is the first formal test of conversational search on desktop. The high iteration counts suggest Michaels has been aggressively iterating on navigation and search — likely to convert a new customer base that arrived from the JOANN acquisition with different browsing habits.

Audiences defined in the datafile: Desktop users, Mobile users, US users, CA users. Experiments are segmented by device type, not geography.

### Feature Toggle Files

`https://static.platform.michaels.com/mft/2c-prd/released-featuretoggle/ssr-common.json` — no auth required.

```json
{"featureName": "AiAgentNone",    "status": 0, "value": "false"},
{"featureName": "AiAgentSierra",  "status": 1, "value": "true"},
{"featureName": "AiAgentDecagon", "status": 0, "value": "false"},
{"featureName": "askMikeChat",    "status": 1, "value": "true"}
```

Three feature flags for AI agent backends, plus one for the chat UI. Sierra is the live AI agent vendor. Decagon is staged and off. `AiAgentNone` as an explicit flag — with its own toggle — indicates the chatbot is still treated as optional infrastructure with a kill switch. The chat feature is named "Ask Mike." `GOOGLE_BOT` in the runtime config pointing to a `chat-api-svc` cluster service may indicate a Google AI backend behind one of these agent vendors, though the connection is inferred.

The PDP toggle file (`/mft/2c-prd/released-featuretoggle/PDP.json`) also serves landing page flags:
- `lp/fabricsStoreLocator: true`, `lp/welcomeStoreLocator: true` — JOANN-specific landing pages get their own store locator feature flags
- `BalloonInflation: true`, `Balloon Inflation 2: true`, `Balloon Inflation 3: true`, `balloonsStoreLocator: true` — balloon inflation is a Michaels in-store service with four separate feature flags and a dedicated store locator

---

## Surveillance Stack

Michaels uses Securiti.ai as its consent management platform with auto-blocking. The consent template active for US visitors: `US - Opt Out Template_34 17.10.2025-1` — all tracking categories (Advertising, Analytics, Performance) default to "Granted" for US visitors without any user interaction. The template was configured October 17, 2025, seven months after JOANN's closure.

For non-US: `Everywhere - Opt In` (all Declined by default), `Canada - Opt Out Template_36`, `Quebec - Opt In Template_35`. Geo detection happens via Securiti's API before the consent UI appears — the appropriate regional template is applied automatically.

Google Tag Manager is classified as category 3 (Performance/Functionality) in the Securiti config, meaning it loads before consent. GTM then loads advertising pixels.

**Tracker inventory verified from the auto-blocking initiators list and CSP:**

| Vendor | Category | Notes |
|--------|----------|-------|
| Google Analytics | Analytics | |
| Google Tag Manager | Performance | Pre-consent; loads ad pixels |
| Facebook Pixel | Advertising | Via GTM |
| TikTok Pixel | Advertising | |
| Criteo | Advertising | Retargeting; sync frame via gum.criteo.com |
| Bing Ads | Advertising | `bat.bing.com` |
| Pinterest | Advertising | `ct.pinterest.com` |
| Reddit Ads | Advertising | `www.redditstatic.com/ads/pixel.js` |
| StackAdapt | Advertising | Programmatic DSP |
| AppNexus/XANDR | Advertising | `ib.adnxs.com/getuid` |
| Rubicon Project | Advertising | `pixel.rubiconproject.com/tap.php` |
| w55c.net | Advertising | Programmatic |
| Wunderkind/BounceX | Behavioral | Obfuscated subdomain `vnhonri2c.michaels.com`; path `POST /GVNORlcrn/U/A/...` |
| Treasure Data | CDP | Analytics + advertising |
| ID5.io | Identity | `cdn.id5-sync.com/api/1.0/id5-api.js` |
| Attentive | SMS Marketing | `cdn.attn.tv/tag/4-latest/unified-tag.js` |
| Salesforce Marketing Cloud | Email | `nova.collect.igodigital.com` |
| BazaarVoice | Reviews | `apps.bazaarvoice.com/bv.js` |
| Affirm | BNPL | `cdn1-sandbox.affirm.com` — sandbox domain in production |
| Signifyd | Fraud Detection | Category 3 (Performance); loads pre-consent |
| Vimeo | Video | `f.vimeocdn.com/js_opt/modules/utils/vuid.min.js` |
| CrazyEgg | Heatmaps | `script.crazyegg.com` |
| NomiPix | Visual AI | `cdn-prod.nomipix.com` |
| Google Sign-In | Auth | `accounts.google.com/gsi/client` |
| Optimizely | A/B Testing | `logx.optimizely.com/v1/events` |
| Akamai mPulse | RUM | `s.go-mpulse.net` |
| Radar.io | Geolocation | IP-to-location on every page load |
| Securiti.ai | Consent | Auto-blocking CMP |
| Yahoo/Oath | Analytics | `sp.analytics.yahoo.com/sp.pl` |
| SnapChat | Advertising | `sc-static.net/scevent.min.js` |
| track.securedvisit.com | Unknown | Pixel, vendor unclear |
| brand-sdk.kmsmep.com | Unknown | Vendor unclear |

**Radar.io geolocation:** Every page load triggers a GET to `api.radar.io/v1/geocode/ip` using the client-exposed key `prj_live_pk_d6d8910bfc36c1c81fc496a3c8c553d288b4d9fd`. This endpoint returns city, state, coordinates, DMA, ISP, and the requesting IP address. The key is a publishable (client-intended) key — its presence in the browser JS is architectural.

**Affirm sandbox domain in production:** The Securiti auto-blocking initiators list includes `cdn1-sandbox.affirm.com`. A sandbox domain in a production CSP suggests the Affirm BNPL integration was never fully migrated off the test environment, or sandbox is Affirm's CDN naming for this asset.

---

## Client-Exposed API Keys

All present in `window.__NEXT_DATA__.runtimeConfig.env`, served in HTML:

| Key | Value | Purpose |
|-----|-------|---------|
| `BAZAAR_VOICE_API_KEY` | `t5qmduaynq88g9jy3hz7gat71` | Product reviews read API |
| `BAZAAR_VOICE_REVIEW_ENCODING_KEY` | `0WTVwiN2lwLqDZnWXn2Twhy5p` | Review submission encoding |
| `GOOGLE_MAPS_API_KEY` | `AIzaSyCIfOOPPxFdgpKTlGd-vq2t-NrJ4A6tccc` | Maps embed |
| `PixleeWidget_API_KEY` | `bWwYKo2AhZ6Yy26EqEfw` | UGC photo widget |
| `TextDialogForm_API_KEY` | `trarz7oukux6p743t26gdfkow9jzd8bai9s2fnbrnil186eu` | Dialog form submissions |
| `Radar_API_KEY` | `prj_live_pk_d6d8910bfc36c1c81fc496a3c8c553d288b4d9fd` | IP geolocation |

These are client-intended publishable keys — their presence in the browser is by design. The Radar key is directly usable for IP geolocation lookups.

---

## Machine Briefing

### Access & Auth

joann.com itself requires no auth — it's a redirect. The Michaels destination is a Next.js SSR app. Most useful endpoints are publicly accessible without cookies. Session-required endpoints (cart, account, checkout) need auth against michaels.com.

For the public endpoints below, plain curl or fetch works. No CORS restrictions on the static asset endpoints. The Optimizely datafile and feature toggle files accept cross-origin requests.

### Endpoints

**Redirect chain (joann.com):**
```bash
# Confirm redirect chain and capture ?joannweb parameter
curl -sI https://www.joann.com/
curl -sI https://www.joann.com/c/fabric
```

**Feature toggles (no auth, static JSON):**
```bash
# SSR common toggles — AI agent flags, chat, nav
curl https://static.platform.michaels.com/mft/2c-prd/released-featuretoggle/ssr-common.json

# Landing page and PDP toggles — store locator flags, ATC variants
curl https://static.platform.michaels.com/mft/2c-prd/released-featuretoggle/PDP.json

# Navigation menu tree (full category structure)
curl https://static.platform.michaels.com/map/2c-prd/released-menu/michaels_menu_tree.json
```

**Optimizely datafile (no auth):**
```bash
# Full experiment and feature flag config
curl https://cdn.optimizely.com/datafiles/E2e4kxW3BrKx85EEn1vTz.json
```

**GCS bucket (no auth):**
```bash
# List bucket contents
curl "https://storage.googleapis.com/mik-web-static?max-results=1000"

# Java heap dump (738MB — don't download unless you need it)
# https://storage.googleapis.com/mik-web-static/dump/m.hprof
```

**Radar.io IP geolocation:**
```bash
# Returns city, state, coordinates, DMA, ISP for the requesting IP
curl -H "Authorization: prj_live_pk_d6d8910bfc36c1c81fc496a3c8c553d288b4d9fd" \
     https://api.radar.io/v1/geocode/ip
```

**BazaarVoice product reviews (no auth, public key):**
```bash
# Product review statistics — replace SKU as needed
curl "https://api.bazaarvoice.com/data/statistics.json?apiversion=5.4&passkey=t5qmduaynq88g9jy3hz7gat71&Filter=ProductId:EQ:{sku}"
```

**Michaels SSR endpoints (observed on landing page load):**
```bash
# CMS content (requires valid page slug)
curl "https://www.michaels.com/api/ssr/cms"

# IP-based store locator
curl "https://www.michaels.com/api/store-locator/getMichaelsbyIp"

# Optimizely decision bridge
curl -X POST "https://www.michaels.com/api/bridge/optimizely/decision"

# Product small info by SKU list
curl "https://www.michaels.com/api/product/smallInfo/skus?skuIds={sku1},{sku2}"
```

### Gotchas

- The `?joannweb` parameter is required for the welcome landing page to render in JOANN mode — without it, `michaels.com/lp/welcome-joann` loads but may not apply JOANN-specific feature flags.
- `api.radar.io/v1/geocode/ip` uses the client publishable key — it resolves the caller's IP, not a passed parameter. Rate limits apply per key.
- The store locator IP endpoint (`getMichaelsbyIp`) returned an error during investigation when called without a proper session context (`"IP and storeid must have a value"`), suggesting it requires either a session cookie or explicit parameters not obvious from the URL.
- Feature toggle files are served from `static.platform.michaels.com` — fully public static files at predictable paths, not behind CDN auth.
- The Optimizely datafile key `E2e4kxW3BrKx85EEn1vTz` is embedded in client JS. Datafiles are always public in Optimizely Full Stack by design.
- GCS bucket listing returns XML. Parse with `xmllint` or `python3 -c "import xml.etree.ElementTree as ET; ..."` — the response structure uses `<Contents>` elements with `<Key>`, `<Size>`, `<LastModified>`.
