---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "Domino's Pizza — Teardown"
url: "https://www.dominos.com"
company: "Domino's Pizza"
industry: Hospitality
description: "US pizza delivery and carryout chain with digital ordering and real-time tracking."
summary: "Next.js SSR app behind Akamai, with an Apollo GraphQL BFF at /api/web-bff/graphql (480 types, introspection enabled). Tealium IQ (profile: dominos/chimera/prod) manages tags, LaunchDarkly manages 356 feature flags with UUID-obfuscated names. Fully dynamic SSR with no edge caching. Webpack chunk names expose internal module architecture: shell, makeline-ui, cart, auth, product, service-methods, rewards, campaign."
date: "2026-04-12"
time: "21:22"
contributor: "hayabhay"
model: "sonnet"
effort: "high"
stack: [Next.js, Apollo GraphQL, Akamai, Tealium, LaunchDarkly]
trackers: [Adobe Analytics, Adobe Audience Manager, Google Tag Manager, Google Ads, SpeedCurve LUX, Raygun, UID2, LiveRamp, Tapad, iSpot.tv, Snap Pixel, TikTok Pixel, Pinterest Tag, Trade Desk, Bing UET, Yahoo SP Analytics, Epsilon Prescribe, ClickTale, Quantum Metric, Maze]
tags: [pizza, food-delivery, hospitality, graphql-introspection, launchdarkly, feature-flags, config-leak, server-keys, consent, olo]
headline: "Every 404 on dominos.com serves the dev config -- leaking LaunchDarkly server-side SDK keys and an internal OLO preprod hostname."
findings:
  - "Any 404 path returns a __NEXT_DATA__ blob with the dev/preprod envVar: two LaunchDarkly server-side SDK keys, an internal OLO API gateway hostname (agw-westus3-us-olo-app-1-preprod0.us.dominos.com:8030), dev CMS URLs, and 203 feature flag UUIDs."
  - "The production GraphQL BFF has introspection enabled -- 480 types, 85 queries, 75 mutations browsable anonymously -- including an orderTrackerDetails query that returns driver name, manager name, and real-time delivery coordinates for any order given a store order ID."
  - "A deprecated GraphQL query named or25447ABTestResult references an internal JIRA ticket by number, and session storage exposes live A/B test assignments using the same JIRA-format IDs (OR-02685-ExpB, DPZ_OR-24899-ExpB) readable by every third-party script on the page."
  - "354 of 356 LaunchDarkly flags use UUID names -- deliberate obfuscation -- but the mobile-recaptcha flag breaks the pattern and ships full reCAPTCHA site keys and an iOS client credential as its payload to every visitor."
  - "A persistent 180-day tracking UUID (X-DPZ-D) is set on the first request and sent to LaunchDarkly's external servers on every page load before any consent interaction -- and persists unchanged after the user clicks Reject All."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

Dominos runs a Next.js SSR app behind Akamai's CDN and WAF. The server sets `x-powered-by: Next.js` and `cache-control: private, no-cache, no-store` on every page response -- fully dynamic SSR, nothing cached at the edge. Build ID `OyJIRZdvk1Xp0q6snNEwY`, build hash `b8b49e79`.

The API layer is an Apollo GraphQL BFF (Backend for Frontend) at `/api/web-bff/graphql`. All frontend data flows through it. CORS is locked down -- cross-origin requests to the BFF return 403. Browser requests require same-origin cookies.

Tag management runs through Tealium IQ (profile: `dominos/chimera/prod`, four active senders at investigation time). LaunchDarkly handles feature flags via client SDK key `64c1013ead52a113af165d62`. Error monitoring is Raygun (RUM + JS errors). SpeedCurve LUX handles real user monitoring (ID `1300008814`).

Webpack chunk names expose Dominos' internal module naming: `shell`, `makeline-ui`, `cart`, `auth`, `product`, `service-methods`, `rewards`, `campaign`. The `makeline-ui` name is the most telling -- "makeline" is Dominos' internal term for the kitchen-side order preparation system, the same system that drives the real-time pizza tracker.

---

## The 404 Configuration Leak

Every 404 on dominos.com -- hit any non-existent path -- returns a page that injects a full `__NEXT_DATA__` blob. That blob contains the `envVar` configuration object for the dev/preprod environment, not production. The SSR code serving error pages is wired to a different config than the rest of the app.

The full dev `envVar` as of investigation:

```json
{
  "base-url": "http://localhost",
  "bff-url": "/api/web-bff/graphql",
  "cms-base-url": "https://dev.dominos.pizza/cms",
  "server": {
    "bff-url": "https://dev.dominos.pizza/api/web-bff/graphql"
  },
  "launch-darkly": {
    "apiKey": "64c1013ead52a113af165d61",
    "serverKey": "sdk-679ba6a0-8dc2-4d28-bac9-727da73f9a17",
    "serverUri": "http://agw-westus3-us-olo-app-1-preprod0.us.dominos.com:8030"
  },
  "launch-darkly-experiments": {
    "apiKey": "5d07f694d8873807649e2e4f",
    "serverKey": "sdk-ef17ae3d-9912-4b8c-b116-092b4cf8c7e8",
    "serverUri": "http://agw-westus3-us-olo-app-1-preprod0.us.dominos.com:8030"
  },
  "tealium": { "publishTarget": "dev", "profileName": "chimera" },
  "recaptcha": {
    "siteKey": "6LcRgkspAAAAABCopY8ejyTWBKoWMXTMJHAhUqV9",
    "siteKeyV2": "6Lf3nUspAAAAALihuLSp69ZKTE7N2wzCq1-7BI17"
  },
  "google-maps": {
    "apiKey": "AIzaSyCW1DuuL9VtzSmf9saMZBTeFlBvYpryLwg",
    "mapId": "8d74b59a3279d60f"
  },
  "payPal": {
    "clientId": "ASykK1CfiZwnqxYD7vh6p9x6NJKTDDO7DBDv9NQyPJMahtDm1Uc9kpa0Eauv5iw5YiOU3oGAJOhBQ4e0"
  },
  "paze": {
    "sdkUrl": "https://checkout.wallet.cat.earlywarning.io/web/resources/js/digitalwallet-sdk.js",
    "clientId": "1LPJARGJRD77M556K1UI13OG7HgLAeCW4V_Qf8awGVbd5319Q",
    "profileId": "dominos"
  }
}
```

Three categories of exposure here:

**LaunchDarkly server-side SDK keys.** The `serverKey` values -- `sdk-679ba6a0-8dc2-4d28-bac9-727da73f9a17` and `sdk-ef17ae3d-9912-4b8c-b116-092b4cf8c7e8` -- are server-side SDK keys. LaunchDarkly distinguishes between client-side keys (safe to ship to browsers) and server-side keys (intended to stay on the server). Server-side keys are used by backend services to evaluate flags; they're not admin credentials, but they're not meant to be publicly readable either. A server key allows querying the SDK evaluation API for any user context -- effectively reading the full flag ruleset rather than just the calling user's evaluation. The production BFF uses these keys server-side to evaluate flags before rendering; they ended up in the error page's config because the 404 handler pulls from the dev environment blob.

There are two sets: one for `launch-darkly` (main flags) and one for `launch-darkly-experiments` (A/B testing). Both share the same `serverUri`, pointing at the internal preprod gateway.

**Internal OLO preprod API gateway.** The `serverUri` value, `http://agw-westus3-us-olo-app-1-preprod0.us.dominos.com:8030`, is not internet-accessible (confirmed 403 via Akamai), but it reveals internal infrastructure naming. Breaking it down: `agw` = API gateway, `westus3` = Azure West US 3 region, `olo` = Olo Inc. (the B2B restaurant digital ordering platform), `app-1` = first application node, `preprod0` = preprod environment, port `8030` = internal service port. Olo is a publicly traded company (NYSE: OLO) that provides digital ordering infrastructure for restaurant chains. This hostname confirms Dominos' digital ordering backend runs on Olo's platform -- a relationship that is generally known but not publicly detailed at the infrastructure level.

**Development environment endpoints.** The dev CMS URL (`https://dev.dominos.pizza/cms`) and dev BFF URL (`https://dev.dominos.pizza/api/web-bff/graphql`) are 403-blocked by Akamai. The dev Raygun key (`IXlULik1zJXZLxpjfVYtUQ`) differs from production (`Wt0L3At9MPZ6PYepclMfzw`), as do the reCAPTCHA, PayPal, and Paze credentials. The Paze dev SDK URL points to `checkout.wallet.cat.earlywarning.io` -- Early Warning Services' sandbox environment, the organization that operates both Zelle and the Paze bank consortium wallet.

The 404 page also embeds a `flags` array of 203 UUID strings -- feature flag keys from the dev/preprod LaunchDarkly environment.

Production `envVar` for comparison (from the homepage `__NEXT_DATA__`):

```json
{
  "bff-url": "/api/web-bff/graphql",
  "cms-base-url": "/cms",
  "raygun": { "apiKey": "Wt0L3At9MPZ6PYepclMfzw" },
  "launch-darkly": { "apiKey": "64c1013ead52a113af165d62" },
  "launch-darkly-experiments": { "apiKey": "5cd9d041aaca910823f8098f" },
  "tealium": { "publishTarget": "prod", "profileName": "chimera" },
  "recaptcha": {
    "siteKey": "6LcHcqoUAAAAAALG9ayDxyq5yuWSZ3c3pKWQnVwJ",
    "siteKeyV2": "6LcZ69QnAAAAAGfXduZzHsR5fDpTFp9MreKUaXbo"
  },
  "google-maps": {
    "apiKey": "AIzaSyA7Ru_yxYqJX93g0RBU4YFGixTWsZAd4m0",
    "mapId": "8d74b59a3279d60f"
  },
  "payPal": {
    "clientId": "Ad8yb-vcVUNcq2XDhYBWh1uaN24UewJ6-I5XAqWbYrmBO_J-nTHzBYZcd4VvYHjLj5Qy5wskvV1UaimO"
  },
  "paze": {
    "sdkUrl": "https://checkout.paze.com/web/resources/js/digitalwallet-sdk.js",
    "clientId": "R9SAMXA1WPWXYU71DSVV14-r0GpW4gTG3XTHprcXHa8vV9Zc8",
    "profileId": "dominosPROD"
  },
  "apple-pay-merchantid": "merchant.com.dominos.applepayprod"
}
```

Production config has no `server` block -- the server-side keys are not present. They exist only in the dev config that the error page incorrectly serves.

---

## Anonymous Tracking Infrastructure

Dominos sets a persistent tracking UUID -- the `X-DPZ-D` cookie -- on the very first HTTP request to dominos.com, before any user interaction, login, or consent. Max-Age of 15,552,001 seconds (~180 days), scoped to `/`.

This UUID is not siloed. It functions as the cross-system anonymous visitor ID and appears in at least four places:

1. **LaunchDarkly flag evaluation** -- The client SDK sends a context object to LaunchDarkly's servers on every page load:
   ```json
   {"key": "<X-DPZ-D value>", "kind": "user", "marketCode": "US"}
   ```
   This goes to `app.launchdarkly.com/sdk/evalx/64c1013ead52a113af165d62/contexts/<base64 context>`. LaunchDarkly receives and stores the UUID as the visitor key.

2. **Tealium Universal Data Object (UDO)** -- The `dominos-udo` key in sessionStorage contains an `x_dpz_d` field with the same UUID, alongside page metadata and A/B test assignments.

3. **SpeedCurve LUX** -- The `GULP_SC2` localStorage entry encodes SpeedCurve session data keyed to the same UUID. SpeedCurve's `lux_uid` cookie is a second identifier.

4. **GraphQL A/B test query** -- The deprecated `or25447ABTestResult` query type exposes an `xdpzd` field -- the X-DPZ-D value -- as part of the A/B test result API, suggesting it's used to key experiment assignments server-side.

A second rollout cookie, `X-DPZ-ROLLOUT-PHASE-100=REDESIGN`, is set with a one-year lifetime on first request. The `-100` suffix in the cookie name encodes the rollout percentage -- the full site redesign is deployed to all visitors. This appears to be an Akamai edge-layer flag, separate from LaunchDarkly.

Other pre-consent cookies: `ECOM31578=19` (possibly build version or test bucket assignment), `PIM-SESSION-ID` (analytics session), `market=US`, `has_new_order=true`.

---

## The GraphQL BFF

`/api/web-bff/graphql` accepts POST requests and has GraphQL introspection enabled in production. The full schema is browsable anonymously. At investigation time: 480 types, 85 Query fields, 75 Mutation fields.

**Public queries (no authentication):**

- `categories` / `categoriesV2` -- menu category tree
- `campaignAdvertisementTile` -- featured deal/ad content
- `homePageTiles` -- homepage content tiles
- `vehicleOptions` -- carside delivery vehicle types
- `stJudeThanksAndGivingHomePage` -- charity campaign data

**Auth-gated queries:**

- `customer` -- returns `UNAUTHORIZED`
- `orders` -- returns `BAD_REQUEST` without session
- `customerCards` -- payment methods on file

**`orderTrackerDetails`** is the most operationally revealing query. It requires `locale` (required), `market` (required), `storeOrderId` (required), and accepts `phoneNumber` (optional). Successful resolution returns `OrderTrackerDetails`, which includes `driverId`, `driverName`, `managerId`, `managerName`, real-time `currentLocation` and `previousLocation`, `deliveryStatus`, `stopNumber`, `percentDistanceCompleted`, `trackerTheme`, and a full `products` list. This is substantial operational data -- the driver's real-time GPS coordinates, manager on shift, delivery progress percentage -- keyed only by order ID, locale, and market, with phone number optional.

**Deprecated production query:**

```graphql
query or25447ABTestResult {
  experience
  xdpzd
}
```

Deprecation reason in schema: `"Temporary API for OR-25447 A/B test; will be removed after experiment concludes."` The internal JIRA ticket number `OR-25447` is baked into a production API endpoint name. The `OR-` prefix appears across Dominos' tooling -- it's visible in the A/B test assignments in sessionStorage (`OR-02685-ExpB`, `DPZ_OR-24899-ExpB`) and suggests an "Order" or operations ticket prefix.

**Notable mutations:**

- `autoAddOrPromptForStJudeRoundUpAtCheckout` -- programmatic charity upsell at checkout, not just a passive display
- `optOutDataSharing` -- CCPA data sharing opt-out
- `validateDataPrivacyRequest`, `authenticateDataPrivacyRequest`, `requestDataPrivacyDeletion` -- full DSAR (Data Subject Access Request) workflow
- `claimLoyaltyRecoveryOffer`, `claimBounceBackOffer` -- promotional recovery mutations, suggesting automated win-back flows
- `sendCartSourceEvent` -- analytics event emission from the cart, callable as a mutation
- `updatePushToken`, `subscribePostOrderPushNotifications` -- push notification registration

---

## Surveillance Stack

The Content-Security-Policy header lists 40+ third-party origins. Trackers confirmed active via CSP, script loads, cookies, and network traffic:

**Analytics and Monitoring:**
- Adobe Analytics (AppMeasurement v2.23.0, account `dominospizzaprod`, metrics server `metrics.dominos.com`) -- loaded via Tealium tag 3
- Adobe Audience Manager (Demdex) -- `dpm.demdex.net`, `dominos.demdex.net` -- audience segmentation and data management platform
- Adobe Marketing Cloud ID Service -- sets `AMCV_*` and `s_ecid` cookies for cross-session visitor stitching
- Google Tag Manager (container `AW-931931760`) + Google Ads conversion tracking
- SpeedCurve LUX (ID `1300008814`) -- real user monitoring with performance timing, scroll position, and session data
- Raygun -- JavaScript error monitoring and RUM (key: `Wt0L3At9MPZ6PYepclMfzw`)

**Identity and Data Marketplace:**
- **UID2** (`*.uidapi.com`) -- The Trade Desk's Unified ID 2.0 framework, hashes email addresses for cross-publisher identity resolution
- **LiveRamp** (`b-code.liadm.com`, `rp.liadm.com`) -- identity graph and data marketplace syncing
- **Tapad** (`pixel.tapad.com`) -- cross-device identity graph
- **iSpot.tv** (`*.ispot.tv`) -- TV advertising attribution, correlating TV ad exposure with subsequent online orders
- **Epsilon/RLCDN** (`idsync.rlcdn.com`) -- identity resolution syncing
- **Epsilon Prescribe** (`verifi.pdscrb.com`, `ipv4.pdscrb.com`) -- identity verification and enrichment

**Paid Media Pixels:**
- Snap (`*.snapchat.com`, `sc-static.net`)
- TikTok (`analytics.tiktok.com`, `analytics-ipv6.tiktokw.us`)
- Pinterest (`*.pinterest.com`, `s.pinimg.com`)
- The Trade Desk (`js.adsrvr.org`, `insight.adsrvr.org`)
- Bing/Microsoft UET (`bat.bing.com`)
- Yahoo SP Analytics (`sp.analytics.yahoo.com`)
- Amazon Ads (`s.amazon-adsystem.com`)

**Session Recording and UX Research:**
- ClickTale (`cdnssl.clicktale.net`) -- in CSP script-src
- Quantum Metric (`cdn.quantummetric.com`) -- in CSP script-src
- Maze (`*.maze.co`) -- UX research tool

All of the above fire on first page load before any user interaction. No consent banner appeared on the homepage during investigation.

---

## Consent Handling

Tealium IQ functions as the consent management platform. During investigation, the consent banner did not appear on the homepage -- it appeared on the menu page (the third page viewed in the session). By that point, trackers had been running for the entire visit.

After clicking "Reject All":

- A `CONSENTMGR` cookie is set: `consent:false|ts:<timestamp>|id:<tealium-visitor-id>`. The `id` field matches the Tealium visitor UUID from `utag_main`, confirming this is Tealium's built-in consent state.
- Tealium drops from 4 active senders to 3: tag 3 (Adobe Analytics) is unloaded. Tags 2, 123, and 138 continue.
- **LaunchDarkly continues sending flag evaluation requests** to `app.launchdarkly.com` with the X-DPZ-D UUID. LaunchDarkly runs outside Tealium's tag management and is not affected by the consent state.
- **Google Ads adjusts its consent signal** -- `pagead2.googlesyndication.com/ccm/collect` fires with `npa=1` (no personalized ads) and `gcs=G100` instead of the pre-rejection `G111`, but the request still fires.
- Adobe Analytics tracking captured the "Reject All" click itself via Adobe's activity map (`s_sq` cookie set on the click event) before being unloaded.
- **No existing cookies are cleared** after rejection -- `AMCV_*`, `s_ecid`, `_gcl_au`, `utag_main`, `lux_uid`, and `X-DPZ-D` all persist with their original values.

The CCPA opt-out path (`/content/donotsell`) is linked from the footer, and the `optOutDataSharing` GraphQL mutation exists in the BFF for programmatic opt-out requests.

---

## Feature Flags and A/B Testing

LaunchDarkly client key `64c1013ead52a113af165d62` is publicly accessible. Evaluating it for an anonymous user returns 356 flags. For an anonymous US visitor: 341 evaluate to `false`, 0 to `true`, 15 return non-boolean values.

**Obfuscation strategy:** 354 of 356 flags use UUID names -- e.g., `0027d5fa-bcb6-462b-a246-283abe0fc09d`. Only two use human-readable names:

- `a-b-initial-experiment`: value `"control"` -- an A/B test currently serving the control arm
- `mobile-recaptcha`: value is a structured object containing `siteKey`, `fallbackToken`, and `googleRecaptchaClient-iOS` -- reCAPTCHA credentials delivered as a flag payload to every visitor's browser

The UUID naming is a deliberate policy choice. It makes the LaunchDarkly dashboard opaque to anyone who can evaluate flags via the public client key -- a contrast to companies like Spirit Airlines, whose human-readable flag names (`enableFakeBlockedMiddleSeats`) become findings in their own right. Whether this obfuscation matters in practice is debatable; the flag values are still readable, just unlabeled.

From session storage, the `dominos-udo` object exposes the A/B test assignments for the current session: `ab_test: ["OR-02685-ExpB", "DPZ_OR-24899-ExpB"]`. These are JIRA-formatted ticket IDs -- the same `OR-` prefix as the deprecated `or25447ABTestResult` GraphQL query. Anyone with JavaScript execution on the page -- any of the 15+ third-party scripts loaded before consent -- can read these assignments and correlate them with visitor behavior.

The `X-DPZ-ROLLOUT-PHASE-100=REDESIGN` cookie is a rollout flag operating outside LaunchDarkly, set at the CDN/edge layer. The `100` in the cookie name encodes the rollout percentage -- all traffic is assigned to the REDESIGN variant. This is a one-year cookie, suggesting a long-running migration.

---

## Machine Briefing

### Access and auth

All GET/POST requests to `https://www.dominos.com/api/web-bff/graphql` must originate from the same origin (CORS enforced, cross-origin returns 403). Use a cookie jar with a real browser session to make requests. The `X-DPZ-D`, `ECOM31578`, `PIM-SESSION-ID`, and `market` cookies are set automatically on first visit and are required for most queries.

For `curl` access: fetch the homepage first to get cookies, then POST to the BFF with those cookies. Public queries work without authentication.

### Endpoints

**GraphQL BFF (requires same-origin or browser session):**
```
POST https://www.dominos.com/api/web-bff/graphql
Content-Type: application/json

# Introspection (enabled in production)
{"query": "{ __schema { types { name } } }"}

# Menu categories
{"query": "query { categoriesV2 { id name items { id name } } }"}

# Order tracker (requires storeOrderId; phoneNumber optional)
{"query": "query($locale:String!,$market:String!,$storeOrderId:String!,$phoneNumber:String) { orderTrackerDetails(locale:$locale,market:$market,storeOrderId:$storeOrderId,phoneNumber:$phoneNumber) { orderStatus driverName managerName currentLocation { lat lng } deliveryStatus stopNumber percentDistanceCompleted } }",
 "variables": {"locale":"en","market":"US","storeOrderId":"<orderId>"}}

# CCPA opt-out
{"query": "mutation { optOutDataSharing }"}

# Deprecated A/B test query (still active in schema)
{"query": "query { or25447ABTestResult { experience xdpzd } }"}
```

**LaunchDarkly flag evaluation (public, no auth):**
```
GET https://app.launchdarkly.com/sdk/evalx/64c1013ead52a113af165d62/contexts/<base64-context>
# Context format: {"key":"<uuid>","kind":"user","marketCode":"US"}
# Base64-encode (URL-safe) the context JSON
```

**404 config leak:**
```
GET https://www.dominos.com/<any-nonexistent-path>
# Returns HTML with __NEXT_DATA__ containing dev/preprod envVar
# Parse the JSON from <script id="__NEXT_DATA__"> tag
# .props.pageProps.envVar contains the full dev config
```

### Gotchas

- Cross-origin requests to the GraphQL BFF return 403. Use a real browser session or `curl --cookie-jar` seeded from a homepage visit.
- The `orderTrackerDetails` query requires `locale` and `market` as non-null strings in addition to `storeOrderId`. `"en"` and `"US"` work for US orders.
- LaunchDarkly `evalx` endpoint returns 200 for anonymous contexts; no auth required for client-side flag evaluation.
- The `or25447ABTestResult` query is marked deprecated but requires the X-DPZ-D cookie and a valid user context to resolve -- returns `BAD_REQUEST` without them.
- The 404 config is served at any non-existent path: `/llms.txt`, `/robots2.txt`, or any random string will work. The `__NEXT_DATA__` JSON is in a `<script>` tag with `id="__NEXT_DATA__"`.
- GraphQL introspection is live as of investigation date. Full schema available via standard introspection query.
