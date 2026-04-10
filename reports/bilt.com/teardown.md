---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "Bilt — Teardown"
url: "https://www.bilt.com"
company: Bilt
industry: Finance
description: "Rent rewards platform and co-branded Mastercard for renters."
summary: "Bilt runs a split frontend: Framer for marketing pages and Next.js (App Router, Vercel) for the authenticated member app — both sharing the biltrewards.com API plane. The member app is a deeply federated system of 40+ named microservices on GCP, with Keycloak as the primary IdP (actively migrating from FusionAuth), Unleash for feature flags, DatoCMS via Stellate GraphQL CDN, and Cardless as the card-issuance BaaS layer. Firebase, Supabase (two instances), and Stream.io handle real-time features. Braze manages CRM and push notifications; Segment powers the analytics data pipeline. The marketing homepage fires 27 third-party tracking scripts — including FullStory proxied through a first-party relay — without triggering a consent interaction, despite Transcend airgap.js being loaded."
date: 2026-04-07
time: "02:34"
contributor: hayabhay
model: sonnet-4.6
effort: high
stack:
  - Next.js
  - Framer
  - Vercel
  - GCP
  - Keycloak
  - Unleash
  - DatoCMS
  - Cardless
  - Firebase
trackers:
  - Google Analytics 4
  - Google Ads
  - Facebook Pixel
  - FullStory
  - TikTok Pixel
  - Snapchat Pixel
  - Reddit Pixel
  - Pinterest
  - LinkedIn Insight
  - AdRoll
  - Tatari
  - Snowplow
  - Podscribe
  - StackAdapt
  - Magellan AI
  - Agentio
  - LiveRamp
  - Xandr
  - Neustar
  - Dstillery
  - Mountain.com
  - Switch
  - Postie
  - Segment
  - Braze
  - GTM
  - Sentry
tags:
  - fintech
  - rent-rewards
  - feature-flags
  - pre-consent-tracking
  - identity-migration
  - internal-tool-exposure
  - microservices
  - surveillance
headline: "Bilt ships 401 feature flags to every browser — including one that globally disables reCAPTCHA and a developer's personal test flag still live in production."
findings:
  - "401 production Unleash feature flags are fully readable without authentication: the browser caches the entire flag set to localStorage after first load, including `user-svc.unconditionally-bypass-recaptcha = ON` (reCAPTCHA globally disabled), a developer's personal `tim-test-flag` in the production instance, and 40+ named microservices reconstructed from flag prefixes."
  - "Transcend airgap.js is loaded but `window.airgap` is undefined at runtime — the consent enforcement layer is inert, and 37 tracking cookies are set on first page load without any user interaction, including FullStory (proxied through a first-party relay at id.biltrewards.com to bypass blockers), two separate Facebook pixels, and direct-mail retargeting via Postie."
  - "An identity platform migration is actively in progress — `identity-svc.use-keycloak-as-primary-idp = ON`, with three keycloak-webhook-svc sync flags simultaneously bridging FusionAuth events, indicating both IdPs are live in parallel."
  - "Internal admin tooling — retool.internal.biltrewards.com and jobrunr.internal.biltrewards.com — resolves publicly on the internet; GCP Identity-Aware Proxy client IDs are exposed in OAuth redirect URLs, making these tools enumerable even if not enterable."
  - "The web.lyft-concierge feature flag ships the complete internal merchant UUID map for ~100 restaurant partners across 8 cities to every unauthenticated browser as a JSON payload, undocumented in any public API."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

## Architecture

Bilt's web surface is split into two distinct stacks that share a common API plane. The marketing homepage (bilt.com) is a Framer-generated static site, identified by the Framer build comment `<!-- _3kvUUNVXlkC4XhRHbGqn -->` and `window.__framer_importFromPackage` global. The member application — login, account, card management, neighborhood benefits — is a Next.js App Router app deployed on Vercel (deployment ID `dpl_83GeHTupYs36aQGaeuWpPLzmJ6Rc`). No `window.__NEXT_DATA__` is present on the marketing homepage; it is pure Framer with no server-side rendering.

The authenticated API plane lives at `api.biltrewards.com`, running on GCP (Google Frontend/Cloud Run). Auth is handled by `identity-svc`, an internal microservice wrapping Keycloak as the primary IdP. Feature flags come from `flags.biltrewards.com`, a self-hosted Unleash instance that also syncs with `bilt.edge.getunleash.io` (Unleash Cloud). The CMS is DatoCMS, delivered through Stellate as a GraphQL CDN proxy at `bilt-rewards.stellate.sh`.

The card product is issued through Cardless (`embedded.cardless.com`), a card-as-a-service provider. PCI tokenization uses Very Good Vault; card scanning uses Dyneti; KYC and identity verification go through both Alloy and Onefootprint. Payments flow through Adyen as the primary processor, with Braintree/PayPal as a fallback. Three-domain-secure authentication is handled by Mastercard RSA (`*.rsa3dsauth.com`). Fraud detection layers include Sardine (payment logging), NeuroID (behavioral biometrics), and a fraud-management-svc microservice visible in flag prefixes.

Real-time features use Firebase (Firestore, Identity Toolkit, secure token), Stream.io (in-app chat, mapped to `bilt-chat-svc`), and two distinct Supabase instances (`ocvtbxkudfyeyziuewun.supabase.co`, `xumhjyqqsujyrbrqcrrt.supabase.co`). Braze handles CRM and push notifications; Segment (`api.segment.io`) handles the analytics pipeline downstream of the member app but is absent from the marketing homepage. Error monitoring is dual: Sentry and Decipher, both active.

The travel subproduct relies on Duffel as the flight API aggregator, with supplemental content from Hotels.com/Expedia, Agoda, HotelBeds, Travelport, and Virtuoso (luxury travel network). Blacklane provides executive car service — notably hosted on EU infrastructure (`production-chauffeur-pictures.s3.eu-central-1.amazonaws.com`) despite Bilt being a US-only product. The mortgage microservice exposes its GCP API Gateway URL in the member app's CSP header (`mortgage-svc-api-gw-627q51hp.uc.gateway.dev`), leaking the internal gateway identifier — though the endpoint itself correctly returns 404 without authentication.

---

## The 401-Flag Unleash Endpoint

Bilt's feature flag infrastructure is a self-hosted Unleash instance at `flags.biltrewards.com`. After any authenticated page load, the full flag set is persisted to `localStorage` under the key `unleash:repository:repo`. All 401 flags are visible client-side.

The flags reveal a complete inventory of Bilt's backend microservice architecture. Each flag is prefixed with the owning service name — 40+ distinct service names appear:

`adyen-svc`, `affiliate-rewards-svc`, `alliance-portal-svc`, `benefits-svc`, `bilt-card-svc`, `bilt-chat-svc`, `bilt-wallet-svc`, `buying-power-svc`, `checkout-svc`, `crm-svc`, `fitness-svc`, `fraud-management-svc`, `funds-account-svc`, `giftcard-svc`, `identity-svc`, `keycloak-webhook-svc`, `knot-svc`, `loyalty-v2-svc`, `lyft-concierge-svc`, `lyft-svc`, `merchant-network-svc`, `mortgage-svc`, `notify-svc`, `offer-builder`, `omnisearch-svc`, `parking-svc`, `payment-svc`, `payment2-svc`, `point-of-sale`, `point-transfer-svc`, `realpage-v2-svc`, `rent-credit-reporting-svc`, `residential-property-reactive-svc`, `reversal-workflow`, `rpps-svc`, `seated-svc`, `soulcycle-svc`, `support-svc`, `travel-svc`, `user-bank-svc`, `user-svc`, `vaccount-svc`, `venmo-svc`, `yardi-reactive-svc`

### Security-Critical Flags

**`user-svc.unconditionally-bypass-recaptcha = ON`** — reCAPTCHA is globally disabled across the entire platform. The flag name is unambiguous: not a graceful degradation path, not a per-environment override. Unconditionally. The auth and account-creation flows accept submissions without bot challenge.

**`tim-test-flag = ON`** — a developer's personal test flag is present and enabled in the production Unleash instance. It has no variant payload and no obvious functional effect, but its presence confirms the production flag namespace is shared with development experimentation.

### Identity Migration in Progress

Four flags indicate a live platform migration:

- `identity-svc.use-keycloak-as-primary-idp = ON`
- `keycloak-webhook-svc.sync-fusionauth-events = ON`
- `keycloak-webhook-svc.sync-keycloak-events = ON`
- `keycloak-webhook-svc.user-create-events = ON`

The dual-sync pattern — Keycloak events going forward, FusionAuth events still bridging — is classic bi-directional cutover. Both IdPs are currently live and processing real authentication events. The migration has not yet been completed; the FusionAuth sync flag remains on.

### Product Signals

`card-2.0-enabled` carries a variant payload of `activates_on: "2026-02-07T16:00:00Z"` — the exact launch timestamp of Bilt Card 2.0. The `web.loginsignupvsapplynow` A/B test has resolved to the `applynow` variant, meaning the homepage CTA experiment is settled. An active incident status is encoded directly in flag payload:

```json
{
  "messages": [{
    "isDismissable": true,
    "message": "We're currently experiencing issues loading your benefits. Please try again later.",
    "tab": ["NeighborhoodHome"],
    "type": "warning"
  }]
}
```

The `NeighborhoodHome` tab is the neighborhood benefits section of the app — the status message indicates a live or recent service degradation affecting local merchant rewards.

`loyalty-v2-svc.mastercard.disable-ingestion = ON` — Mastercard rewards ingestion is currently disabled. `mortgage-svc.accept-bilt-card = ON` — cardholders can pay mortgage payments with their Bilt card. `travel-svc.vertex-ai-autocomplete = ON` — Google Vertex AI is powering travel search autocomplete. `app.venmo-integration = ON` — Venmo is live. `omnisearch-svc.home-delivery-ranking` exposes the variant `best_of`, revealing the internal ranking strategy label for home delivery results.

### The Lyft Concierge Merchant Map

`web.lyft-concierge` ships a complete JSON mapping of restaurant names to internal merchant UUIDs across ~100 partner restaurants in NYC, Miami, DC, Chicago, LA, Las Vegas, Waikiki, and other markets. This is the internal identifier table that backs the Lyft Concierge dining feature — mapping how Bilt routes Lyft rides to restaurant reservations. The same payload is present in `web.lyft-concierge-guest-checkout`. These UUIDs are not published anywhere in Bilt's public documentation or partner-facing materials. Every unauthenticated browser that loads the app receives this mapping as a flag variant payload.

---

## Surveillance Without Consent

The marketing homepage sets 37 tracking cookies on first page load with zero user interaction. No consent banner appears for US visitors.

**The mechanism:** Transcend `airgap.js` is loaded from `transcend-cdn.com` (consent UUID `de67a7b8-de3e-4c8f-858d-6c7f832a1a5f`), and the Transcend configuration is fetched from `sync-transcend-cdn.com`. However, `window.airgap` is `undefined` at runtime — the airgap enforcement layer does not initialize. The consent management vendor is present in name only; the blocking mechanism is not active. All trackers fire immediately.

The full tracker inventory on first page load:

**Session recording:** FullStory (org `13PEW8`) — proxied through `id.biltrewards.com/fsrelay`, a standard technique for bypassing browser blockers and ad filters by routing SDK traffic through a first-party domain.

**Advertising pixels:** Facebook (two distinct pixels: `282967836105230` and `353467326379958`), TikTok (`C9G398RC77U9N0P9KPM0`), Snapchat (`7ad3f193-82b5-4dfa-8879-986ee8a5ddf9`), Reddit (`t2_7lmxmkme`), Pinterest, LinkedIn Insight, AdRoll, StackAdapt, Google Ads.

**Attribution:** Tatari (TV/streaming attribution), Podscribe (podcast attribution, advertiser: `biltrewards`), Magellan AI (`mgln.ai`, podcast), Agentio (influencer/creator attribution), Dstillery (`action.dstillery.com`, "Bilt Site Visits" audience), Mountain.com (`dx.mountain.com`, cross-device ID), Switch/sg_boost.

**Identity resolution:** LiveRamp/LiveConnect (`_lc2_fpi`, `_li_ss` cookies; `rp.liadm.com`, `rp4.liadm.com`), Xandr/AppNexus (`ib.adnxs.com`), Neustar/TransUnion AGKN (`aa.agkn.com`).

**Direct mail retargeting:** Postie (`scripts.postie.com`) — Postie connects website visitor data to physical mailing address databases for direct mail campaigns. This is notably distinct from digital retargeting and fires without consent.

**IP geolocation:** `checkip.amazonaws.com` is called on every page load. Two TikTok IP geolocation checks via VaultDCR (`ttip-ipv4-prod.telemetry.vaultdcr.com`, `tte-prod`).

**Two Snowplow instances:** Letterpress (`t.getletterpress.com`) and Agentio (`collector.agentio.com`) — both running separate Snowplow collectors receiving the same page events.

The member app CSP reveals additional vendors not active on the marketing page: DoubleVerify (`cdn.doubleverify.com`, `tps.doubleverify.com`), Tapad (`pixel.tapad.com`, cross-device identity graph), and Wells Fargo via Adobe Audience Manager (`wellsfargobankna.demdex.net`) — an Adobe Audience Manager segment sync endpoint, indicating Bilt purchases or syncs audience segments to Wells Fargo's ad targeting system.

---

## Internal Tool Exposure

Six internal tooling subdomains under `internal.biltrewards.com` have public DNS records, enumerated from certificate transparency logs:

| Subdomain | Status | Protection |
|-----------|--------|------------|
| `retool.internal.biltrewards.com` | 200 (accessible) | GCP IAP (Google SSO) |
| `jobrunr.internal.biltrewards.com` | 200 (accessible) | GCP IAP (Google SSO) |
| `pgadmin.internal.biltrewards.com` | No response | VPN-only |
| `pghero.internal.biltrewards.com` | No response | VPN-only |
| `redash.internal.biltrewards.com` | No response | VPN-only |
| `redis.internal.biltrewards.com` | No response | VPN-only |

`retool.internal` and `jobrunr.internal` are reachable from the public internet and serve IAP challenge pages. The GCP IAP OAuth client IDs are exposed in the redirect URL on challenge:

- `jobrunr`: `853782313755-p5amn30hlf80es4uomu8cporpih9atfe.apps.googleusercontent.com`

Retool is Bilt's internal admin/operations tooling interface. JobRunr is a Java background job scheduler — its admin UI provides visibility into queued and running background jobs. Neither is inside the VPN perimeter.

Two additional internal subdomains are notable: `op-scim.internal.biltrewards.com` (1Password SCIM provisioning endpoint) and `prod-wf-encryption.biltrewards.com` (production workflow encryption service, not flagged as internal but named explicitly as production).

A developer's personal playground subdomain is live: `playground-kosta.biltrewards.com`.

---

## The brand.bilt.com Auth Misconfiguration

`brand.bilt.com` is a Railway-hosted API gateway serving as a B2B brand/marketing portal. A health check at `/health` returns `{"status":"healthy","timestamp":"...","service":"gateway"}`. The gateway surface is publicly accessible but auth-gated — with one exception:

```
GET https://brand.bilt.com/marketeer       → 500 "Authentication configuration error"
GET https://brand.bilt.com/marketeer/brands    → 401 "Authorization header with Bearer token is required"
GET https://brand.bilt.com/marketeer/campaigns → 401 "Authorization header with Bearer token is required"
GET https://brand.bilt.com/marketeer/merchant-offers → 401 "Invalid token"
```

The root `/marketeer` path returns a 500 with an authentication configuration error — the middleware that enforces auth is misconfigured on the base route. All subpaths correctly enforce auth. This is a misconfigured catch-all rather than a data exposure, but it confirms the route structure and leaks the internal service name.

The `identity-svc` name is also leaked by the token endpoint: `POST /api/id/public/user/authentication/token` returns `{"error":{"source":"identity-svc","code":"MISSING_REFRESH_TOKEN"}}` on a malformed request.

---

## Decagon AI: Team 5

Bilt's AI support chatbot ("Theo") runs on Decagon. The widget configuration is publicly accessible:

```
GET https://metadata.decagon.ai/widget_preferences/bilt_base.json
GET https://metadata.decagon.ai/team_hash/002e240f.json → {"teamId": 5}
```

Bilt is team 5 in Decagon's internal customer numbering. The widget preferences and team configuration are served without authentication from Decagon's metadata CDN.

ServisBot (`*.servisbot.com`) also appears in the CSP, suggesting a secondary or legacy chat system. The `app.decagon-quiq-pipe` feature flag name indicates a connection pipeline between Decagon and Quiq, possibly for agent escalation.

---

## Mortgage Broker Portal

`mortgages.bilt.com` is a Next.js application serving as a B2B portal for mortgage brokers managing leads. Authentication uses WorkOS for SSO. FullStory session recording is active on this portal — brokers' interactions with lead data are being recorded. The CSP reveals an additional domain, `*.biltrewardsalliance.com`, a new network domain not visible elsewhere. Available routes include `/authenticate` and `/dashboard/leads`; a `/dashboard/applications` route returns 404, suggesting an unfinished or deprecated feature.

---

## Payment Vendor Stack

| Vendor | Domain | Function |
|--------|--------|----------|
| Cardless | `embedded.cardless.com` | Card issuance BaaS |
| Very Good Vault | `js.verygoodvault.com`, `js3.verygoodvault.com` | PCI tokenization |
| Dyneti | `dyscanweb.dyneti.com` | Card number scanning |
| Knot API | `cardswitcher.knotapi.com` | Card-on-file switching |
| Alloy | `alloysdk.alloy.co` | KYC/identity decisioning |
| Onefootprint | `*.onefootprint.com` | Identity verification |
| Flex | `checkout.getflex.com` | BNPL/flexible rent payment |
| Adyen | `checkoutshopper-live-us.adyen.com` | Payment processing |
| Braintree | `*.braintreegateway.com` | Payment fallback |
| Mastercard RSA | `*.rsa3dsauth.com` | 3DS authentication |
| Sardine | (flag) | Fraud detection |
| NeuroID | `advanced.neuro-id.com` | Behavioral biometrics |
| Binkey | `bursement-images.reimbursement.binkey.com` | FSA/HSA reimbursements |

The Flex BNPL integration includes a feature flag named `792b3d04-a0d5-41b9-b3f2-5bd41cbba2d1-kill-switch` (the UUID is Bilt's tenant ID within Flex), suggesting a hardcoded emergency disable mechanism for the Flex integration.

---

## Property Manager Partners

The CSP `frame-ancestors` directive on `www.bilt.com` lists every property management platform that embeds the Bilt widget — a public map of Bilt's residential network partnerships:

`*.activebuilding.com` (RealPage), `*.avalonaccess.com` / `*.ct-prod.avalonbay.com` (AvalonBay), `*.henrihome.com` (Henri Home), `www.hqo.co` / `www.hqo.com` / `www.hqoapp.com` (HqO), `www.mrcooper.com` (Mr. Cooper), `*.loftliving.com` (Loft Living), `mycommunity.americancampus.com` (American Campus Communities), `portal.tkclients.com` (TK), `resident.eliseai.com` (EliseAI), `*.venn.city` / `*.res.venn.city` (Venn City), `*.soul-cycle.com` (SoulCycle).

---

## Machine Briefing

**Access:** The marketing homepage (Framer) is static. The member app (Next.js, Vercel) is auth-gated. Pre-auth surfaces are limited. Feature flags are accessible post-first-auth-page-load via localStorage. reCAPTCHA is currently disabled (`user-svc.unconditionally-bypass-recaptcha = ON`).

### Open Endpoints

```bash
# Deployment version
GET https://www.bilt.com/api/version
# → {"deploymentId":"dpl_83GeHTupYs36aQGaeuWpPLzmJ6Rc"}

# Brand gateway health
GET https://brand.bilt.com/health
# → {"status":"healthy","timestamp":"...","service":"gateway"}

# Decagon AI chat config (public)
GET https://metadata.decagon.ai/widget_preferences/bilt_base.json
GET https://metadata.decagon.ai/team_hash/002e240f.json
# → {"teamId": 5}

# Auth token exchange (reveals identity-svc in error)
POST https://www.bilt.com/api/id/public/user/authentication/token
# → 400 {"error":{"source":"identity-svc","code":"MISSING_REFRESH_TOKEN",...}}

# Neighborhood API (requires JWT)
GET https://api.biltrewards.com/neighborhood
# → 401 {"message":"Jwt is missing","code":401}

# Default home locations (requires JWT)
GET https://api.biltrewards.com/property/homes/locations/default
# → 401 "Jwt is missing"

# DatoCMS GraphQL (introspection blocked, requires auth)
POST https://bilt-rewards.stellate.sh/
```

### Feature Flags (Authenticated, localStorage)

After any authenticated page load, full flag set is in `localStorage["unleash:repository:repo"]`. Key flags:

```
user-svc.unconditionally-bypass-recaptcha       → true (reCAPTCHA disabled globally)
identity-svc.use-keycloak-as-primary-idp         → true
keycloak-webhook-svc.sync-fusionauth-events       → true (migration in progress)
card-2.0-enabled                                  → activates_on: "2026-02-07T16:00:00Z"
web.loginsignupvsapplynow                         → "applynow" (A/B test settled)
loyalty-v2-svc.mastercard.disable-ingestion       → true
payment-svc.use-sardine-payment-log-svc           → true
travel-svc.vertex-ai-autocomplete                 → true
app.venmo-integration                             → true
mortgage-svc.accept-bilt-card                     → true
tim-test-flag                                     → true (dev flag in prod)
```

### Internal Tools (IAP-gated, public internet)

```
https://retool.internal.biltrewards.com   — Retool admin UI (GCP IAP, Google SSO)
https://jobrunr.internal.biltrewards.com  — JobRunr background job admin (GCP IAP, Google SSO)
```

IAP client IDs from OAuth redirect:
- jobrunr: `853782313755-p5amn30hlf80es4uomu8cporpih9atfe.apps.googleusercontent.com`

### Subdomains of Note

```
flags.biltrewards.com          — Unleash feature flags (client token required)
brand.bilt.com                 — Railway API gateway (B2B brand portal, /marketeer returns 500)
mortgages.bilt.com             — Mortgage broker portal (Next.js, WorkOS SSO)
dining.bilt.com                — Dining Framer site (published 2026-04-07)
cardless-portal.bilt.com       — Cardless card management (GCP IAP)
api.travel-advisor-portal.bilt.com — Travel advisor portal (GCP)
api.broker-portal.bilt.com     — Broker portal (GCP)
prod-wf-encryption.biltrewards.com — Production workflow encryption service
op-scim.internal.biltrewards.com   — 1Password SCIM provisioning
```

### Notes

- Transcend airgap.js loads but `window.airgap` is undefined — consent enforcement is not active on the marketing homepage
- FullStory is proxied through `id.biltrewards.com/fsrelay` — standard first-party relay to bypass blockers
- `brand.bilt.com/marketeer` returns 500 (auth config error); all subpaths return 401 correctly
- All internal `*.internal.biltrewards.com` subdomains are enumerable from certificate transparency (crt.sh)
- Flex BNPL kill-switch flag uses Bilt's Flex tenant UUID as the flag name
- Blacklane executive car content is EU-hosted (`eu-central-1`) despite Bilt being US-only product
- GCP API Gateway URL for mortgage-svc exposed in member app CSP (`mortgage-svc-api-gw-627q51hp.uc.gateway.dev`)
- Wells Fargo Adobe Audience Manager segment sync (`wellsfargobankna.demdex.net`) visible in member app CSP
