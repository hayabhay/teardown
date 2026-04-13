---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "Talkspace \u2014 Teardown"
url: "https://www.talkspace.com"
company: Talkspace
industry: Healthcare
description: "Online therapy and psychiatry platform serving individuals and employers."
summary: "Talkspace runs a Webflow marketing site (coverage.talkspace.com) fronted by Cloudflare, with separate React SPAs for matching (match.talkspace.com) and client sessions (app.talkspace.com) on CloudFront/S3. The API layer lives on matchapi.talkspace.com under openresty. All analytics -- GA4, Mixpanel, Segment -- are proxied through Talkspace-owned subdomains to bypass ad blockers, with an additional server-side GTM layer. Auth is AWS Cognito; video sessions use Agora WebRTC; mobile is Capacitor (hybrid web/native)."
date: 2026-04-13
time: "01:51"
contributor: hayabhay
model: opus-4.6
effort: high
stack: [Webflow, React, Cloudflare, CloudFront, AWS Cognito, Agora, Capacitor, OpenResty]
trackers: [Google Analytics 4, Mixpanel, Segment, Google Tag Manager, Visual Website Optimizer, Intellimize, New Relic, OneTrust, Zendesk, Trustpilot]
tags: [mental-health, telehealth, feature-flags, ai-therapy, session-recording, consent, launchdarkly, analytics-proxy, teens, credential-exposure]
headline: "The feature flag teen-user-can-skip-parental-consent is set to true in production on a platform where teens disclose mental health symptoms during onboarding."
findings:
  - "The feature flag teen-user-can-skip-parental-consent is set to true in production -- on a mental health platform that also runs a teen community feature and NYC-specific teen therapy flows."
  - "Talkspace's public Segment settings endpoint returns X Ads OAuth access tokens and consumer keys in plaintext -- server-side credentials that should never appear in a client-facing CDN response."
  - "Session recording is active during the onboarding flow where users disclose mental health concerns, symptoms, and reasons for seeking therapy -- the flag mba-client-web-onboarding-session-recording is true."
  - "A production LaunchDarkly conversion goal targets localhost:4001/room/4596514 -- a developer's local URL with what appears to be a real therapy room ID, now in a public API response."
  - "California users default into all consent categories including 'Share Or Sale of Personal Data' on a mental health platform, while Washington users under MHMDA default to opt-in required for all non-essential cookies."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

Talkspace is a mental health platform running therapy, psychiatry, and employer assistance programs at scale. Its technical surface is more complex than the consumer-facing product suggests: two distinct web applications, a custom analytics infrastructure designed to survive ad blocking, a 203-flag LaunchDarkly deployment visible to anonymous clients, and an AI layer branded as Luma that's actively writing therapy notes and generating between-session content. A few of those 203 flags point at things Talkspace probably didn't intend to be enumerable.

## Architecture

The marketing site (`www.talkspace.com`) is served from Webflow under the `coverage.talkspace.com` origin, identifiable from the `surrogate-key` response header: `coverage.talkspace.com 5f1b10a955e49d279bdc2192 pageId:677d78e8b8da788272810515`. The Webflow site ID is `5f1b10a955e49d279bdc2192`. Cloudflare CDN sits in front of both the marketing site and the API layer, and the actual hosting is Lambda in `us-east-1` (visible via the `x-lambda-id` response header on www).

The two application SPAs -- `match.talkspace.com` for the therapist matching and onboarding flow, and `app.talkspace.com` for authenticated client sessions -- are both React applications served from CloudFront/S3. The match app is a current React build; the client app is a legacy Create React App webpack build (chunk names and the `client-web` bundle identifier visible in source). Both apps share the same API origin: `matchapi.talkspace.com`, which runs openresty.

Mobile apps use Capacitor (`capacitor.talkspace.com` and `capacitor://localhost` both appear in the CSP on app/match subdomains) -- a hybrid web/native framework that wraps the web app in an iOS/Android shell.

Auth flows through AWS Cognito with AWS Amplify. Video sessions use Agora WebRTC. The custom response header `x-ts-bscore: 1` is Talkspace's own bot score field.

The CSP on the homepage has a duplicate `frame-ancestors` directive -- one with just `'self'` and one with `'self' *.talkspace.com` -- a minor but real misconfiguration.

## Analytics Infrastructure

Talkspace operates five analytics systems simultaneously: Google Analytics 4, Mixpanel, Segment, Google Tag Manager, and Visual Website Optimizer. The architectural choice that distinguishes them from most deployments: all five are proxied through Talkspace-owned subdomains.

| Proxy subdomain | Destination |
|---|---|
| `sgtm.talkspace.com` | Server-side Google Tag Manager (Google Cloud) |
| `apx.talkspace.com` | Mixpanel + New Relic |
| `apxsegc.talkspace.com` | Segment CDN |
| `apxsega.talkspace.com` | Segment API |

This setup defeats client-side ad blockers entirely -- the analytics traffic looks like first-party requests. The server-side GTM layer (`sgtm`) adds a second layer of persistence: even if a user blocks the GTM container script, the server-side instance continues to receive and forward events from Talkspace's own infrastructure.

Talkspace also uses Intellimize (an AI personalization platform Webflow acquired in 2022, and the source of the `data-wf-intellimize-customer-id: 117526738` attribute on the homepage). On page load, Intellimize makes calls to `api.intellimize.co/context-v2/117526738` and `/prediction/117526738`. The response populates the `intellimize_server_context_117526738` key in localStorage, which includes the visitor's `clientIp`, `location.cityName`, `countryIso`, `subdivision1Iso`, `postalCode`, and `dmaCode`. This data persists across sessions and is accessible to any JavaScript executing on the talkspace.com domain.

New Relic (App ID `1134565903`, production) is used for application performance monitoring. The app source configures NR with `ajax.deny_list: [apxDomain]` -- meaning New Relic is explicitly excluded from monitoring requests to the analytics proxy domain. Analytics proxy traffic is invisible to internal NR dashboards.

Cookies set before any user interaction on the marketing site: `__cf_bm` (Cloudflare bot management, HttpOnly), `ts_visitor` (Talkspace first-party visitor tracker storing `first_visit_referrer`, `first_visit_full_url`, timestamp, `last_visit`), `_gcl_au` (Google Click), `_ga` (GA4), `FPLC` (GA4 first-party linker), `ajs_anonymous_id` (Segment anonymous ID), `_vwo_uuid_v2` (VWO), `OptanonConsent` (OneTrust), and `mp_c18be99a..._mixpanel` (Mixpanel identity).

Additional systems: Zendesk support widget (`talkspace.zendesk.com`), configured with `conversationHistory: "forget"` (chat history not preserved per session) but `conversationTranscript: true` (transcripts stored globally). Trustpilot review widget. VWO A/B testing via `_vwo_uuid_v2`.

## Luma: The AI Layer

Talkspace's AI system is branded as Luma. The feature flag configuration confirms three Luma components are currently active in production:

- `luma-automatic-progress-note: true` -- AI generates draft therapy progress notes for therapist review after sessions
- `luma-ai-text-redaction: true` -- AI is actively redacting text from sessions (scope of what gets redacted is not specified in flag configuration)
- `talkcast-edits: true` -- Talkcast, a feature that generates personalized AI-produced "podcasts" for clients between sessions based on therapist-approved scripts tied to therapy objectives

Two transcription-related flags show the infrastructure exists but is disabled in production:

- `real-time-transcription: false` -- RTT disabled, but the flag has been through 13 version updates (`flagVersion: 13`), suggesting active development
- `rtt-profanity-filter: {captions: false, jsonResult: false, ai: false}` -- profanity filter for RTT exists in three modes (captions, JSON output, AI processing), all currently off

The client app bundle includes LameJS (`cdnjs.cloudflare.com/ajax/libs/lamejs/1.2.0/lame.min.js`), a browser-based MP3 encoder that enables in-browser audio recording and encoding. Combined with Agora WebRTC for video and the RTT infrastructure staged in flags, Talkspace has assembled all the components of client-side audio capture.

Talkspace has also published peer-reviewed research on NLP-based suicide risk detection applied to therapy message text. The model processes therapist-client message exchanges to flag self-harm risk. The `luma-ai-text-redaction` flag is likely related to this system.

One additional flag: `mba-client-web-onboarding-session-recording: true`. Session recording is active during the matching and onboarding flow -- the same flow where users enter their mental health concerns, symptoms, and reasons for seeking therapy. The session recording vendor is not identified in the flags, but the flag's presence indicates screen/interaction recording is running during intake disclosure.

## 203 Flags, Enumerable by Anyone

LaunchDarkly is configured with environment key `62c15ef8fe8f4a152d29e46d`. The `/sdk/evalx/{envKey}/contexts/{b64context}` endpoint returns all 203 flags for an anonymous user context. This is LaunchDarkly's standard client-side SDK architecture -- the env key is intended to be in client JavaScript -- but it makes the full flag set enumerable by anyone who reads the page source.

Selected flags and their current production values:

**Product state:**
- `diagnostic-intake: true` -- diagnostic intake flow active
- `closed-captions: true` -- closed captions for video therapy active
- `copay-at-time-of-service: true` -- copay charged at session time
- `hide-provider-photos-from-new-users: true` -- therapist photos hidden from new users (active test)
- `high-demand-banner: true` -- "high demand" banner active site-wide
- `pcp-in-intake: true` -- primary care physician field in intake

**Teen product:**
- `nyc-teens-ux: true` / `nyc-teens-quickmatch: true` / `nyc-teens-intake: true` -- NYC-specific teen therapy UI flows all active
- `teenspace-community: true` -- teen community feature active; `teenspace-community-beta: false`
- `teen-user-can-skip-parental-consent: true` -- teen users can bypass the parental consent requirement

**EAP-to-paid upsell mechanics:**
- `eap-to-bh-activation-ff: {variant: true, minPlanSessionsToPrompt: 3, remainingSessionsToPrompt: 2}` -- The upsell trigger fires when a user has consumed 3 EAP (employer-paid) sessions and has 2 remaining. BH = behavioral health (paid plan); EAP = employer assistance program (free sessions).

**Billing taxonomy:**
- `pending-invoices-charge-types: ["copay", "postSession", "noShow", "lateCancellation", "subscription", "BPOClaim"]` -- the full set of invoice event types in the billing system
- `single-room-client-side: "bh-bh,eap-bh"` -- internal product code combinations: `bh-bh` (BH to BH) and `eap-bh` (EAP to BH), the valid room type transitions
- `access-unsubmitted-sessions` reveals session note thresholds: minimum 640 words per session, maximum 2,100 words, polling interval 5 seconds for in-room sessions, dynamic progress note tasks enabled, subscription messaging alert at 7 days

**Active A/B experiments (25 total):**
- `bh-checkout-experiment: {experimentName: "bh-checkout", variant: "control", experimentActive: true}` -- behavioral health checkout flow
- `insurance-confirmation-step: {flowId: 132, variant: "treatment", experimentActive: true}` -- insurance confirmation step test
- `account-creation-copy-variation: {variant: "social-validation"}` -- social validation messaging during account creation
- `mba-booking-meet-now-or-book-later` (control, active) -- scheduling UX test
- `unified-flow-v2` / `unified-flow-for-direct-b2b` (treatment, active) -- B2B onboarding flow
- `remove-async-messaging-prompt` (treatment, active) -- removing async messaging upsell prompt
- `email-lead-capture-move: {variant: "screenReplacement"}` -- email capture UI test
- `billing-cycle-experiment` -- active

**Internal artifacts:**
- `banner-experiment: {enabled: true, name: "BOOP", text: "You can save $10 if you use coupon code BOOP"}` -- active promotional code stored in a feature flag, returned to any anonymous client
- `tyson-eligibility-check-payer-id: "87726"` -- internal codename "tyson" for a specific payer ID check (87726 maps to UnitedHealthCare)
- `tim-test: false` -- employee test flag committed to production environment

**Hardcoded development URL in production:**

The LaunchDarkly goals endpoint (`/sdk/goals/62c15ef8fe8f4a152d29e46d`) returns two conversion goals. One is a click goal on `#clickForConversion` at URLs containing `/my-account/show-flags` -- an internal feature flag debug page accessible within authenticated accounts. The second is a pageview goal targeting:

```
https://localhost:4001/room/4596514/my-account/personal-information
```

This is a development machine URL -- `localhost:4001` -- committed to the production LaunchDarkly environment as a conversion goal. The path includes `/room/4596514`, which is structured like a real therapy room identifier. The goal is inert in production (localhost URLs will never match), but the room ID is now present in a publicly accessible API response.

## The Segment Settings Endpoint

Talkspace's Segment configuration is accessible at:

```
https://apxsegc.talkspace.com/v1/projects/b83bS9bhuodC5sZ6XdNQbSJv8Wl7AVY0/settings
```

The write key (`b83bS9bhuodC5sZ6XdNQbSJv8Wl7AVY0`) is embedded in client JavaScript, making this URL constructible by anyone. The endpoint returns all Segment integration configurations, including server-side destinations. The `_lastModified` timestamp in the response: `2026-04-09T16:01:05.957Z`.

The integrations configured in the response: Facebook Conversions API, Pinterest Conversions API, Snap Conversions API, TikTok Conversions, StackAdapt Cloud, Reddit Conversions API, Quora Conversion API, Podscribe, Google Ads Conversions (Enhanced), Webflow Optimize Conversion Goals. All are gated on consent category C0004 (Targeting Cookies).

The Quora integration includes the account ID and the event mapping:

```json
{
  "quoraAccountId": "527765582693727",
  "eventMapping": {
    "QM Lead Info Captured": "GenerateLead",
    "QM Initiated": "Generic",
    "Plan Selected": "AddToCart",
    "QM Payment Completed": "Purchase",
    "QM Checked Coverage": "GenerateLead"
  }
}
```

The X Ads integration includes credentials that should not appear in a client-accessible endpoint:

```json
{
  "accessToken": "563357030-FyJsdxw8gZHsDfNt21HzpToMxW70qkVwLAPDWCHk",
  "consumerKey": "lMWetXjzAulp0La2EclqbqvAI",
  "adsAccountId": "o9qik",
  "conversionEventsMapping": {
    "QM Initiated": "tw-o9qik-pznhf",
    "QM Payment Completed": "tw-o9qik-l5uh8",
    "Page View": "tw-o9qik-q65ng",
    "QM Checked Coverage": "tw-o9qik-qpfqm"
  }
}
```

Segment's server-side destination credentials are normally processed server-side and would not appear in the client-facing CDN settings response. Their presence here indicates they've been configured as client-side integration settings rather than server-side, causing them to be served to every page load.

The event name taxonomy visible in the mappings (`QM Initiated`, `QM Checked Coverage`, `QM Lead Info Captured`, `Plan Selected`, `QM Payment Completed`) is Talkspace's internal funnel step naming -- QuickMatch Initiated through payment completion.

## Consent Configuration by State

Talkspace operates two distinct OneTrust consent configurations, determined by the user's state at page load via `geolocation.onetrust.com`.

**California (CCPA) -- Rule "US Audience":**

| Group | ID | Default |
|---|---|---|
| Strictly Necessary | C0001 | Always Active |
| Functional | C0003 | Active |
| Performance | C0002 | Active |
| Targeting | C0004 | Active |
| Social Media | C0005 | Active |
| Share Or Sale of Personal Data | SSPD_BG | Active |

All groups, including `SSPD_BG` (data sale opt-in), are active by default for California users. Users must actively opt out.

**Washington State (MHMDA) -- Rule "WA MHMDA":**

| Group | ID | Default |
|---|---|---|
| Strictly Necessary | C0001 | Always Active |
| Functional | C0003 | Inactive |
| Performance | C0002 | Inactive |
| Targeting | C0004 | Inactive |
| Social Media | C0005 | Inactive |

All non-essential categories are inactive by default for Washington users. The SSPD_BG group does not appear in the WA configuration. Washington's My Health My Data Act (MHMDA) applies specifically to consumer health data and requires opt-in consent.

The WA configuration does not have GPP (Global Privacy Platform) or GPC (Global Privacy Control) support enabled (`IsGPPEnabled: false`, `IsDntEnabled: false` on the relevant groups).

## API Surface

**Anonymous token issuance:**

```
POST https://matchapi.talkspace.com/api/v3/dispatcher/entrypoint
```

No auth, no body required. Returns a signed HS256 JWT:

```json
{
  "userID": "837b01e6-7b23-4c5a-b272-a32eeb8cfd04",
  "iat": 1776045045,
  "exp": 1807581045,
  "iss": "QM"
}
```

The `exp` is ~1 year from issuance (verified: April 2027 expiry). The `iss: "QM"` scopes these tokens to the QuickMatch pre-account flow. Authenticated endpoints requiring a real user session return 401 with a QM token. The response also includes a `sessionID` UUID and a redirect URL to `match.talkspace.com/dispatcher`.

**Insurance payers:**

```
GET https://matchapi.talkspace.com/api/v3/insurance-payers
```

Returns the full list of insurance payers. Requires a valid `__cf_bm` Cloudflare bot management cookie (the request must originate from a browser or pass Cloudflare's bot detection). The match flow network log confirms this endpoint was accessed without additional auth beyond the bot cookie.

**Flow configuration:**

```
GET https://matchapi.talkspace.com/api/v4/getFlowConfig/{flowId}
```

Flow 90 was observed in the network log. Returns flow configuration for the matching questionnaire steps.

**Admin config:**

```
GET https://matchapi.talkspace.com/public/v1/get-admin-config-value
```

Accessible without auth (observed in both app and match network logs). Parameters not documented -- likely key-based.

**CORS configuration:**

matchapi.talkspace.com sets both `Access-Control-Allow-Origin: *` and `Access-Control-Allow-Credentials: true` on OPTIONS responses. Per the CORS spec, browsers ignore the `credentials` directive when ACAO is a wildcard, so this is a configuration inconsistency rather than a functional credential bypass -- browsers will not send cookies to a wildcard ACAO endpoint in credentials mode. The wildcard ACAO does mean any origin can make non-credentialed requests to the API.

**Bare IP endpoint:**

```
GET http://52.71.121.170/is
```

Returns an encoded string (different value on each request). The string format and purpose are unknown -- could be a session nonce, encrypted identifier, or health check response. The endpoint is accessible without auth.

**LaunchDarkly feature flags:**

```
GET https://app.launchdarkly.com/sdk/evalx/62c15ef8fe8f4a152d29e46d/contexts/{b64_context}
GET https://app.launchdarkly.com/sdk/goals/62c15ef8fe8f4a152d29e46d
```

The context parameter is a base64-encoded JSON object. For an anonymous user, the context is `{"kind":"user","isAnonymous":true}` encoded to `eyJraW5kIjoidXNlciIsImlzQW5vbnltb3VzIjp0cnVlfQ==`. Returns all 203 flags.

**Segment settings:**

```
GET https://apxsegc.talkspace.com/v1/projects/b83bS9bhuodC5sZ6XdNQbSJv8Wl7AVY0/settings
```

No auth required.

**Subdomains:**

- `match.talkspace.com` -- matching SPA (CloudFront)
- `app.talkspace.com` -- client app SPA (CloudFront)
- `business.talkspace.com` -- B2B enterprise
- `matchapi.talkspace.com` -- API (openresty)
- `sgtm.talkspace.com` -- server-side GTM
- `apx.talkspace.com` -- Mixpanel + New Relic proxy
- `apxsegc.talkspace.com` -- Segment CDN proxy
- `apxsega.talkspace.com` -- Segment API proxy
- `blog.talkspace.com` -- returns 521 (Cloudflare error, origin down)

## Open Threads

**Bare IP at 52.71.121.170:** The `/is` endpoint returns a different encoded string on each call. The service behind it isn't identifiable from headers or the response format -- it's behind plain HTTP on an AWS IP in us-east-1 (same region as the marketing site). Could be a session token issuance service, a health check, or an internal fingerprinting endpoint.

**Room ID 4596514:** The hardcoded localhost URL in the production LaunchDarkly goal (`localhost:4001/room/4596514`) includes a room ID in the path. Whether this refers to an active therapy room is not verifiable without authentication. The goal conversion trigger will never fire in production, but the value is now in a public API response.

**X Ads credential validity:** The OAuth access token and consumer key returned by the Segment settings endpoint were not tested against the Twitter Ads API. Whether they are still active is unknown.

**`luma-ai-text-redaction` scope:** The flag is active but the specific content being redacted isn't documented in the flag configuration. The Luma AI documentation refers to self-harm risk detection -- redaction may mean message content is scrubbed from logs or from therapist-facing notes when flagged. The operational detail is not visible from the client surface.

## Machine Briefing

### Access & Auth

All unauthenticated endpoints work from a standard `fetch` or `curl`. The `matchapi.talkspace.com` endpoints require passing Cloudflare bot detection -- in practice this means a real browser or a session with a valid `__cf_bm` cookie. The anonymous JWT from the dispatcher endpoint is scoped to pre-account QM flows only.

To get a QM-scoped JWT (valid ~1 year):

```bash
curl -s -X POST https://matchapi.talkspace.com/api/v3/dispatcher/entrypoint \
  -H "Content-Type: application/json"
# Returns: {"data":{"goto":"REDIRECT_URL","params":{"sessionID":"...","accessToken":"eyJ..."}}}
```

Decode the token payload:
```bash
echo "eyJ..." | cut -d'.' -f2 | base64 -d
# {"userID":"...","iat":...,"exp":...,"iss":"QM"}
```

### Endpoints

**Open (no auth):**

```bash
# Feature flags (all 203)
GET https://app.launchdarkly.com/sdk/evalx/62c15ef8fe8f4a152d29e46d/contexts/eyJraW5kIjoidXNlciIsImlzQW5vbnltb3VzIjp0cnVlfQ==

# Conversion goals (includes hardcoded localhost URL)
GET https://app.launchdarkly.com/sdk/goals/62c15ef8fe8f4a152d29e46d

# Segment integration configs (includes X Ads credentials)
GET https://apxsegc.talkspace.com/v1/projects/b83bS9bhuodC5sZ6XdNQbSJv8Wl7AVY0/settings

# Bare IP endpoint
GET http://52.71.121.170/is
```

**Browser-context required (Cloudflare `__cf_bm` cookie):**

```bash
# Insurance payers list
GET https://matchapi.talkspace.com/api/v3/insurance-payers

# Flow configuration
GET https://matchapi.talkspace.com/api/v4/getFlowConfig/90

# Admin config values
GET https://matchapi.talkspace.com/public/v1/get-admin-config-value

# Mixpanel proxy (track events)
POST https://apx.talkspace.com/mp/track/

# Segment API proxy
POST https://apxsega.talkspace.com/v1/t
```

**Authenticated (real user session -- Cognito JWT required):**
All `/api/v3/` and `/api/v4/` endpoints beyond the dispatcher and public endpoints return 401 with a QM token.

### Gotchas

- `matchapi.talkspace.com` has `ACAO: *` which means `fetch` with `credentials: 'include'` will fail -- use `credentials: 'omit'` for cross-origin requests.
- The LaunchDarkly eval endpoint maintains a streaming SSE connection from `clientstream.launchdarkly.com` -- if you're polling flags, use the REST evalx endpoint, not the streaming endpoint.
- The Segment settings endpoint returns a 200 with the full config regardless of whether the write key is valid -- it's a CDN-cached response keyed on the project slug.
- Flow config endpoint (`/api/v4/getFlowConfig/{id}`) -- flow 90 was observed. Other flow IDs are not documented in the flag data.
- The anonymous dispatcher token has a 1-year TTL but only unlocks a small set of pre-account endpoints. Don't expect it to work on anything requiring real authentication.
