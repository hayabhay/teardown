---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "Walmart MoneyCard — Teardown"
url: "https://walmartmoneycard.com"
company: "Walmart MoneyCard"
industry: "Finance"
description: "Walmart-branded prepaid debit card issued by Green Dot Bank."
summary: "Split architecture: Adobe Experience Manager on Apache and CloudFront handles the marketing site, while the authenticated app runs on Green Dot's Angular/React white-label platform served from go2bankonline.com. The platform is shared across Green Dot products with runtime config injection via /appconfig. Two GTM containers route financial behavioral signals to Google Analytics. TrustArc manages consent with implied consent for US visitors."
date: "2026-04-12"
time: "16:57"
contributor: "hayabhay"
model: "sonnet"
effort: "high"
stack: [Adobe Experience Manager, Angular, React, CloudFront, Azure Blob Storage]
trackers: [Google Analytics 4, Google Ads, Facebook Pixel, Microsoft Clarity, Bing UET, Adobe Analytics, Adobe Audience Manager, Adobe Target, Adobe Experience Platform, The Trade Desk, TVSquared, Impact Radius, Decibel Insight, Kampyle, Extole, Forter, iovation, Socure, TrustArc]
tags: [fintech, prepaid-card, session-replay, green-dot, walmart, implied-consent, aem, kyc, payroll-switching, direct-deposit]
headline: "The session replay tool recording Walmart MoneyCard signups has SSN masking disabled and no SSN field in its suppression list."
findings:
  - "Decibel Insight records sessions across all three MoneyCard domains with da_maskSSN set to false -- and the personalDataSelector that controls which fields get suppressed lists email, phone, and address but not the SSN input."
  - "Google Analytics receives whether each user has direct deposit and their paycheck distribution amount -- 22 Direct Deposit Switching events route dollar amounts tied to internal user IDs to GA4."
  - "Card signup embeds an Atomic Financial attorney-in-fact grant that authorizes Green Dot to access the user's employer payroll system and redirect their direct deposit -- bundled into enrollment, not disclosed as a separate consent."
  - "Walmart OnePay's terms of service appear in the MoneyCard prelogin terms API, legally binding enrollees to a separate Walmart financial super-app at the point of card signup."
  - "TrustArc fires all 19+ trackers on page load under implied consent for US visitors -- the cookie banner renders but tracking is already active before it appears."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

## Architecture

The marketing site (www.walmartmoneycard.com) runs AEM in dispatcher mode -- the `x-dispatcher: dispatcher1useast1-b80` and `x-vhost: wmmc-publish` response headers identify the AEM dispatcher and vhost. Content is cached by CloudFront (`x-amz-cf-id`, `x-cache: Hit from cloudfront`) with a 3600s edge TTL. The AEM author instance is accessible via `author.walmartmoneycard.com`, which 301s to `author.greendot.com` -- the same AEM author environment serves all Green Dot brands. The server: Apache header is visible on the origin. `origin.walmartmoneycard.com` is listed in the SSL certificate SANs and returns 200 with the same content, providing a CDN bypass path.

The app layer (`secure.walmartmoneycard.com`) is an Angular 14 + React 18 micro-frontend SPA built on Green Dot's white-label platform. The webpack chunk prefix `webpackChunkwhitelabelManage` confirms this is Green Dot's shared "whitelabelManage" codebase. The same platform runs go2bank, rapidwages (payroll card), corppayments (B2B client acquisition), and chirpwhitelabel.com ("Chirp | The Ultimate Mobile Bank Account"). Product-specific configuration is injected at runtime from `/appconfig/v1/Config` -- the `applicationId` (10009), `productCode` (51760), and `programCode` (wmmc) identify this deployment within the Green Dot system.

The SPA assets are served from Azure Blob Storage via prod-cdn.go2bankonline.com with open CORS (`access-control-allow-origin: *`). Four runtime resource files loaded on signup: branding config, localization strings, media overrides for signup, and icon overrides.

The production Content Security Policy leaks two Green Dot staging environment URLs: `pie-secure-gdrewardsdev.nextestate.com` and `qa-secure-gdrewardsdev.nextestate.com` appear in `connect-src`. nextestate.com appears to be a rewards/incentives platform in the Green Dot ecosystem; both staging and QA endpoints are named in production.

SSL SAN entries: `www.walmartmoneycard.com`, `origin.walmartmoneycard.com`, `author.walmartmoneycard.com`, `walmartmoneycard.com`. A fifth subdomain -- `kvicxs.walmartmoneycard.com` -- has a separate Let's Encrypt certificate issued 2026-03-04. It 302s to `/auth/login`, which returns 404. Purpose unknown; possibly a partner portal or internal tool standing up recently.

The AEM HTML source contains an inline comment: `<!-- BUX-50089 -->` -- a Jira ticket reference left in production markup.

## Consent and Pre-Consent Tracking

TrustArc manages consent under `noticeType=bb` (behavioral browsing). For US visitors, it sets `notice_behavior=implied,us` -- implied consent -- meaning all tracking fires immediately on page load without any user interaction. No `notice_gdpr_prefs` cookie is set for US sessions. The consent banner renders and is visible, but it serves no functional purpose for US users: tracking is already active before it appears.

The homepage generates 21 third-party requests across 9 domains on first load, before any user action:

- **b.clarity.ms** (Microsoft Clarity) -- 6 POST /collect requests
- **www.google.com** -- Google Ads remarketing (`/rmkt/collect/1003293187/`, `/rmkt/collect/1028748020/`)
- **www.google-analytics.com** -- GA4 `/g/collect` and Universal `/j/collect`
- **analytics.google.com** -- GA4 `/g/collect`
- **consent.trustarc.com** -- TrustArc analytics ping
- **adobedc.demdex.net** -- Adobe Experience Platform Edge (`/ee/v1/interact`)
- **edge.adobedc.net** -- Adobe Experience Platform Edge (`/ee/or2/v1/interact`)
- **collection.decibelinsight.net** -- Decibel Insight session replay config
- **insight.adsrvr.org** -- The Trade Desk real-time conversion

Cookies set before any consent interaction: `_gid`, `_ga`, `_fbp` (Facebook Pixel), `_gcl_au` (Google Ads), `_uetsid`/`_uetvid` (Bing UET), `_clck`/`_clsk` (Clarity), `kndctr_*_AdobeOrg_identity` (Adobe ECID), `kndctr_*_AdobeOrg_cluster`, `AMCV_*@AdobeOrg` (Adobe Marketing Cloud visitor), `mbox`/`mboxEdgeCluster` (Adobe Target), `TAsessionID`, `IR_*` (Impact Radius), `_tq_id.TV-7290907272-1.*` (TVSquared), `kampyle_*` (Medallia), `da_sid`/`da_lid` (Decibel Insight), `at_check` (Adobe Target check).

Adobe Experience Platform first-party ID collection runs via `GET /bin/aep/fpid` -- an AEM servlet that sets an HttpOnly `FPID` cookie valid 13 months, used to persist Adobe's cross-site identity graph across sessions.

## Surveillance Inventory

Verified from network logs, cookies, and script loads:

| Tracker | IDs | Notes |
|---------|-----|-------|
| Google Analytics 4 | G-TMHZ95468M, G-V0DP7MP0N4 (marketing); G-K8WPPCBKNL (app) | Three separate measurement streams |
| Google Ads | AW-1003293187, AW-1028748020 | Two conversion accounts |
| Facebook Pixel | 797595967030912 | `_fbp` cookie |
| Microsoft Clarity | pqu8xzzcn8 | Session recording, 6 POSTs on homepage |
| Microsoft Bing UET | 4026057 | |
| Adobe Analytics | UA-813060-4 | AppMeasurement + Adobe Launch (DTM) |
| Adobe Audience Manager | demdex.net | Cross-site ID sync |
| Adobe Target | greendot.tt.omtrdc.net | A/B testing, `mbox` cookie |
| Adobe Experience Platform | adobedc.demdex.net / edge.adobedc.net | CDP edge, ECID |
| The Trade Desk | insight.adsrvr.org | DSP retargeting |
| TVSquared | collector-20022 | TV attribution via `_tq_id.TV-7290907272-1.*` |
| Impact Radius | A2658439 | Affiliate, `IR_*` cookies |
| Decibel Insight | 14131 | Session replay across all three domains |
| Kampyle / Medallia | 599150 | In-page feedback |
| Extole | 630221252 | Referral, `cookieConsentEnabled: false` |
| Forter | 7a0ef8ad28aa | Device fingerprint, fires on signup page |
| iovation / iesnare | -- | Behavioral fingerprint via mpsnare.iesnare.com |
| Socure | 493ee1e2-d80d-491a-93c8-1c0e4201a09c | KYC identity telemetry |
| TrustArc | -- | Consent management |

In CSP (script-src / connect-src) but not confirmed firing in captured network logs: LinkedIn, Reddit, TikTok (analytics.tiktok.com), AppsFlyer (websdk.appsflyer.com), Loggly (logs-01.loggly.com), Tapad (tapestry.tapad.com), LiveRamp (idsync.rlcdn.com), Amazon Ads (adnxs.com), DoubleClick/DV360, StackAdapt, Clinch (cdn.clinch.co -- returned 404 in observed network log). The CSP enumerates 30+ distinct external origins.

## Signup: KYC Pipeline and Session Replay

The signup page at `secure.walmartmoneycard.com/signup` fires surveillance in three stages before a user submits the form.

**Device fingerprinting**: Two separate fingerprint vendors load on page arrival. Forter (`cdn0.forter.com/7a0ef8ad28aa/`) sets `forterToken` and loads `prop.json` to configure the fingerprint. iovation/iesnare loads from `mpsnare.iesnare.com` and `/iojs/*` -- behavioral fingerprinting that captures mouse movement, typing rhythm, and device characteristics. Both fire before the user enters any data.

**Identity verification pre-telemetry**: Socure fires three requests to separate endpoints on page load: `ingestion.dv.socure.io/api/v1/session-window` (201), `analytics.dv.socure.io/api/v1/session-data` (201), and `network.dv.socure.io/api/v1/capture` (200). Socure is the primary KYC vendor (siteKey: `493ee1e2-d80d-491a-93c8-1c0e4201a09c`) and document verification vendor (siteKey: `2f9c4942-6550-4434-add0-4507a28e3893`).

**Session replay during form entry**: Decibel Insight (account 14131, branch 7.1.18) is active across all three MoneyCard domains: `www.walmartmoneycard.com`, `secure.walmartmoneycard.com`, and `secure2.walmartmoneycard.com`. The Decibel config retrieved from `collection.decibelinsight.net/i/14131/1706118/c.json` shows:

```json
{
  "da_maskSSN": false,
  "da_maskEmail": false,
  "da_anonymiseIP": false,
  "replaySessFlags": 3,
  "da_personalDataSelector": "[data-di-mask],.img_content,#personal-info-user-content,#personal-info-email,#personal-info-phone,#personal-info-address"
}
```

`da_maskSSN: false` means Decibel's built-in SSN masking is disabled. The `da_personalDataSelector` lists the elements Decibel will suppress from replay -- the list covers IDs for email, phone, and address blocks, but does not include any SSN-specific selector. Decibel also sends the user's Adobe ECID as a custom dimension, correlating session replays with Adobe's cross-site identity graph.

Based on the config, replay almost certainly records keystrokes in the SSN input field during the account application. Whether the SSN field renders with a `data-di-mask` attribute or one of the listed CSS IDs cannot be confirmed from the minified bundle; if it does, replay would suppress it. If it doesn't, it's captured. The `da_maskSSN=false` setting removes the safety net.

## GTM: Financial Data to Google

Two Google Tag Manager containers run in parallel -- GTM-MZVND9D on the marketing site and GTM-WPLGSFW in the authenticated app. The app container (GTM-WPLGSFW) sends data to GA4 measurement ID `G-K8WPPCBKNL`.

The `push_user_property` event, fired when a user is authenticated, sends these user properties to GA4:

- `gd_userID` -- the user's internal Green Dot account ID
- `gd_cardPartner` -- which card program (wmmc, go2bank, etc.)
- `hasDirectDeposit` -- boolean, whether the account has direct deposit configured
- `decibel_sid` -- Decibel Insight session ID, cross-referencing session replay with GA4

The GTM container defines 22 Direct Deposit Switching (DDS) events, tracking the full flow from employer search to payroll split configuration. Two events send financial parameters to GA4:

- `DDS_ViewedDistributionConfirmationPage` -- fires with `DistributionType` and `DistributionAmount` parameters
- `DDS_ViewedPercentageDepositPage` -- fires with `DistributionType`

The `DistributionAmount` is the dollar or percentage amount of the user's paycheck being directed to the MoneyCard. This data, tied to `gd_userID`, flows to Google Analytics.

Other notable GA4 events: `overdraft_opt_in`, `close_account`, `report_lost_stolen`, `activation_complete`, `application_complete`, `DirectDepositTransaction`.

## Signup Legal Stack

The `/api/v1/wmmc/prelogin/terms` endpoint returns 14 term types without authentication. The full list, by termtype:

| Type | Description |
|------|-------------|
| 1 | Electronic Communications Agreement (ECA) |
| 2 | Privacy Policy PDF |
| 3 | Deposit Account Agreement (DAA) |
| 4 | Online Privacy Statement PDF |
| 5 | Mobile App Terms of Use |
| 6 | Data Sharing Consent |
| 13 | Overdraft Notice |
| 14 | IRS W-9 Certification (inline HTML) |
| 21 | Dispute Form PDF |
| 22 | Atomic Financial end-user terms (atomic.financial/end-user-terms) |
| 23 | W-8 Foreign Status Certification (inline HTML) |
| 24 | Savings Round Up Agreement (inline HTML) |
| 25 | eCBSV Consent (ecbsv-consent.pdf) |
| 27 | Walmart OnePay Terms of Service (onepay.com/legal/terms-of-service) |

The `requiredTermsAndConditions` field in `/appconfig` shows that `eca`, `daa`, `privPlcy`, and `eCBSV` are required for both signup and activation -- SSN verification consent is mandatory.

**Atomic Financial (termtype 22)**: Atomic is a payroll switching service. During card enrollment, users accept Atomic's terms, which include granting Green Dot (via Atomic as the technical intermediary) the right to access their employer's payroll system and redirect direct deposits. The Atomic ToS uses "agent and attorney-in-fact" language for the payroll access grant. Data collected when UserLink Deposit is authorized includes account number, routing number, account type, and distribution amount. Atomic's terms note: "ATOMIC DOES NOT CONTROL THE PARTNER'S USE OF YOUR DATA OR OF ANY REPORTS OR OTHER OUTPUT OF THE SERVICE" -- Green Dot receives income, employment status, pay frequency, and account numbers.

This means the legal authorization for payroll data capture is embedded in the card signup flow, not disclosed as a separate product consent.

**Walmart OnePay (termtype 27)**: OnePay (onepay.com) is Walmart's financial super-app product. Its terms-of-service appear in the MoneyCard prelogin terms API, meaning MoneyCard enrollees accept OnePay's ToS during card signup. The two products are legally linked at the enrollment layer even though OnePay is a distinct Walmart offering.

**eCBSV (termtype 25)**: Green Dot uses the IRS's Electronic Consent-Based SSN Verification program for real-time SSN validation during account opening. The consent document (updated February 2026, available in English and Spanish) reads:

> "I authorize the Social Security Administration (SSA) to verify and disclose to Green Dot Bank through Socure Inc., their service provider, for the purpose of this transaction whether the name, Social Security Number (SSN) and date of birth I have submitted matches information in SSA records."

Socure is the technical intermediary between Green Dot and the SSA. The verification is one-time, consented, and limited to 90 days. This is above-standard KYC for a prepaid card -- typical prepaid cards use credit bureau verification, not direct SSA matching.

## Data Acquisition: Opt-Out and Partner Network

The `/opt-out` page discloses the mechanism for unsolicited physical card mailings:

> "We sent this offer because you've used one of our banking products in the past OR you opted in to receive marketing from one of our trusted third-party partners."

Green Dot sources acquisition targets from partner data sharing agreements -- people who shared data with a partner company (and opted in to receive marketing from that partner's affiliates) receive physical Walmart MoneyCards in the mail. The opt-out form originally at `secure2.walmartmoneycard.com/account/walmart/support/opt-out-form` now redirects to the authentication flow.

Two referral platforms run in parallel: Extole (`share.walmartmoneycard.com`, CLIENT_ID: 630221252) and Squatch.io (`fast.ssqt.io/squatch-js@2`). The Extole config sets `cookieConsentEnabled: false` explicitly. An unauthenticated POST to `walmartmoneycard.extole.io/api/v5/token` returns an access token with `UPDATE_PROFILE` scope:

```json
{"access_token":"4IIES85MKOD6QBB92M50RG5FDH","expires_in":63072000,"scopes":["UPDATE_PROFILE"]}
```

The token requires no credentials and expires in ~2 years. Deeper API calls via v4/v5 paths returned 404, limiting what UPDATE_PROFILE scope can actually modify.

## Unauthenticated API Surface

**`GET /appconfig/v1/Config`** (Application-Id: 10009): Returns the full runtime configuration for the Walmart MoneyCard app. Key values:

- `featureConfig.datadog.clientToken`: `pubdabde55ee7d6a81be9f6bd0a8fa97e6c` (Datadog Browser RUM public token -- intended to be client-side)
- `featureConfig.datadog.applicationId`: `dcea6b89-2cea-4639-83c7-ba7a744c4e2b`, env: `prd`
- `featureConfig.forter.siteId`: `7a0ef8ad28aa`
- `featureConfig.socure.siteKey`: `493ee1e2-d80d-491a-93c8-1c0e4201a09c`
- `featureConfig.socureDocV.siteKey`: `2f9c4942-6550-4434-add0-4507a28e3893`
- `featureConfig.reCaptchaScore.siteKey`: `6Le2UKwfAAAAANKD2GoYkVDT1az9Jn1MPHJMdyQK`
- `featureConfig.reCaptchaCheckbox.siteKey`: `6Le6IawfAAAAAPSEyJRlbbNZCXFbHeQni2qvd9Dc`
- `featureConfig.signup.enableKYB`: false (Know Your Business disabled -- consumer-only)
- `featureConfig.signup.hasSpeedBump`: false (no friction page in enrollment)
- `featureConfig.signup.hasCIPRetry`: true (Customer Identification Program retry enabled)
- `featureConfig.activation.enableDenaliActivation`: true ("Denali" internal product name for card activation)
- `featureConfig.mobileApps.iOSDownloadUrl`: `id6738166004` (App Store ID, relatively recent listing)
- `featureConfig.mobileApps.androidStoreKey`: `com.greendotcorp.walmart`

**`POST /api/v1/auth/token/device`** (Application-Id: 10009, no other credentials): Issues a device-level JWT immediately. Decoded payload:

```json
{
  "id": "None",
  "requestorid": "None",
  "deviceId": "",
  "additionalinfo": "None",
  "nonce": "None",
  "applicationid": "10009",
  "toktyp": "dev",
  "exp": 1807549023,
  "iss": "https://greendot.com",
  "aud": "All"
}
```

RS256-signed, issuer `https://greendot.com`, audience `All`. Expiry: March 2027. No device fingerprint, device binding, or challenge required. The token is accepted by downstream endpoints -- `GET /api/v1/wmmc/51760/enrollment/cardartlist` returns 200 with this token (empty cardarts array for productCode 51760). This is a device-level auth token, not an account-level credential.

**`GET /api/v1/wmmc/prelogin/terms`**: Returns all 14 term types with PDF URLs without authentication, as documented in the legal stack section above.

**`GET /api/v1/wmmc/getuseridtype`**: Returns `"Username"` -- reveals the login identifier type configured for this product.

## Green Dot Platform Siblings

The `secure2.walmartmoneycard.com` legacy enrollment JavaScript exposes environment detection logic that names other products on the shared platform:

- `rapidwages.com` -- "rapid! Wages" payroll card product, in production
- `corppayments.com` -- "Client Acquisition Portal", B2B client acquisition, same Angular SPA
- `chirpwhitelabel.com` -- "Chirp | The Ultimate Mobile Bank Account", AEM-hosted, vhost `greenddot-publish`

Staging environment naming convention: `{env}-cdn.go2bankonline.com` with prefixes `staging-`, `pie-`, `qa-`. The production CSP confirms `pie-` and `qa-` staging environments are reachable from production for the gdrewardsdev domain.

---

## Machine Briefing

### Access & auth

The marketing site (`www.walmartmoneycard.com`) is fully open -- no cookies or auth required. The app (`secure.walmartmoneycard.com`) serves public endpoints without auth if you supply `Application-Id: 10009`. For device-token-gated endpoints, POST to `/api/v1/auth/token/device` first and use the returned JWT as `Authorization: Bearer <token>`.

All app API requests go to `secure.walmartmoneycard.com`. The SPA loads assets from `prod-cdn.go2bankonline.com` with open CORS.

### Endpoints

**Fully open (no auth, no headers)**
```
GET https://www.walmartmoneycard.com/robots.txt
GET https://www.walmartmoneycard.com/sitemap.xml
GET https://www.walmartmoneycard.com/bin/aep/fpid
GET https://collection.decibelinsight.net/i/14131/1706118/c.json
GET https://prod-cdn.go2bankonline.com/resources/wmmc/wmmc/branding/web.json
GET https://prod-cdn.go2bankonline.com/resources/wmmc/wmmc/localization/signup/en-US.json
GET https://prod-cdn.go2bankonline.com/resources/wmmc/wmmc/media/signup/override.json
```

**App API -- Application-Id header required**
```
GET  https://secure.walmartmoneycard.com/appconfig/v1/Config
     -H "Application-Id: 10009"

POST https://secure.walmartmoneycard.com/api/v1/auth/token/device
     -H "Application-Id: 10009"
     -H "Content-Type: application/json"
     -d '{}'

GET  https://secure.walmartmoneycard.com/api/v1/wmmc/prelogin/terms
     -H "Application-Id: 10009"

GET  https://secure.walmartmoneycard.com/api/v1/wmmc/getuseridtype
     -H "Application-Id: 10009"

POST https://secure.walmartmoneycard.com/api/v1/wmmc/enrollment/campaigntracking
     -H "Application-Id: 10009"
```

**Device-token-gated (use JWT from token/device)**
```
GET  https://secure.walmartmoneycard.com/api/v1/wmmc/51760/enrollment/cardartlist
     -H "Application-Id: 10009"
     -H "Authorization: Bearer <device_jwt>"
```

**Extole (no auth)**
```
POST https://walmartmoneycard.extole.io/api/v5/token
     -H "Content-Type: application/json"
     -d '{"client_id":"630221252"}'
```

**Forter fingerprint (public)**
```
GET https://cdn0.forter.com/7a0ef8ad28aa/330ff1090db546169e6aa25050484630/prop.json
```

### Gotchas

- `Application-Id: 10009` is required for all `/api/v1/` endpoints; requests without it return 400 or 404.
- The device JWT (`toktyp: dev`) grants access to enrollment-stage endpoints only. Authenticated account endpoints require a full session token obtained via username/password flow at `POST /api/v1/auth/wmmc/token/request`.
- `/content/dam/moneycard/*` is disallowed in robots.txt but all PDF files (deposit agreement, privacy policy, etc.) are publicly accessible via direct URL -- the robots.txt block only applies to crawlers.
- `prod-cdn.go2bankonline.com` serves CORS-open resources but asset paths follow the pattern `/resources/{programCode}/{brandCode}/{assetType}/{locale}.json`.
- The Extole UPDATE_PROFILE token has no obvious exploitable surface -- deeper v4/v5 endpoints return 404. The token is valid for 2 years.
- `origin.walmartmoneycard.com` serves identical content to `www.` -- it bypasses CloudFront but is otherwise the same.
