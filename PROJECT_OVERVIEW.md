# Trace — Product Overview

> **Every buyer. Every step. Traced.**

> Base knowledge document for building Trace — a multi-website payment and funnel attribution dashboard.
> Source repo: `batra-numerology-razorpay` — deployed at `https://batra-razorpay.vercel.app`

---

## What This Is

**Trace** is a funnel attribution and payment CRM — it tracks every customer from their first payment (e.g. Rs.99 webinar) through to their upgrade (e.g. Rs.5999 premium product), so you always know who bought what, at which stage, and when.

The foundation is a **serverless Razorpay payment backend** built on Vercel, integrated into WordPress sites via vanilla JS. No database required for payments — everything is passed through Razorpay order `notes`. Supports multiple products (funnels) from a single backend deployment, with per-product Pabbly webhook automation.

**Currently hardcoded for one client:** The Batra Numerology (`thebatraanumerology.org` / `.in`). Trace will make this multi-tenant — agencies and businesses onboard their own sites, products, and credentials through the dashboard.

---

## Full Payment Flow

```
WordPress page
  → .form-cta button click (data-product-id="...")
  → Modal form collects customer info (client-side validation only)
  → POST /api/create-order       ← price from catalog, NEVER from browser
  → Razorpay popup (checkout.js CDN)
  → POST /api/verify-payment     ← HMAC-SHA256 — non-negotiable
  → Redirect to thank-you page   ← URL params carry all customer + payment data
  → POST /api/webhook (async)    ← Razorpay server-to-server → Pabbly + Firestore
```

---

## File Map

```
api/
  create-order.js    POST — validates product_id, creates Razorpay order
  verify-payment.js  POST — HMAC-SHA256 verification, builds TY redirect URL
  webhook.js         POST — Razorpay server-to-server → Pabbly + Firestore
  check-order.js     GET  — crash recovery: returns order status only

lib/
  catalog.js         THE single config for all products / funnels
  cors.js            CORS allowlist (currently hardcoded to .org + .in domains)
  razorpay.js        SDK singleton (initialized from env vars)
  firebase.js        Firestore client (optional — gracefully skips if not configured)

base.js              Frontend — loaded globally on WordPress, handles entire checkout flow
popup-form.html      Modal form HTML — paste into Elementor HTML widget
thankyou-guard.js    TY page guard
```

---

## API Contracts

### `POST /api/create-order`

**Request:**
```json
{
  "product_id": "numerology-basic",
  "customer": {
    "first_name": "Rahul",
    "last_name": "Sharma",
    "email": "rahul@example.com",
    "phone": "9876543210",
    "dob": "15/08/1990",
    "gender": "Male"
  },
  "utm_params": "utm_source=facebook&utm_medium=cpc"
}
```

**Response (200):**
```json
{
  "order_id": "order_xxx",
  "key_id": "rzp_live_xxx",
  "amount": 49900,
  "currency": "INR",
  "product_name": "Numerology Basic",
  "description": "...",
  "customer": { "name": "Rahul Sharma", "email": "...", "contact": "+919876543210" }
}
```

**What it does:**
- Looks up `product_id` in `lib/catalog.js` — price and `pabbly_webhook` always come from here
- Sanitizes all customer fields (strips HTML, limits length)
- Creates Razorpay order with all customer data stored in `notes` (max 15 keys, 256 chars each)
- Returns `key_id` so the browser can open the Razorpay popup

---

### `POST /api/verify-payment`

**Request:**
```json
{
  "razorpay_payment_id": "pay_xxx",
  "razorpay_order_id": "order_xxx",
  "razorpay_signature": "abc123"
}
```

**Response (200):**
```json
{ "redirect_url": "https://thebatraanumerology.org/thank-you/?ref=order_xxx&payment_id=pay_xxx&amount=499&..." }
```

**What it does:**
- HMAC-SHA256 verification using `RAZORPAY_KEY_SECRET` with `timingSafeEqual`
- Fetches the order from Razorpay to read `notes` (customer data, product info)
- Builds the thank-you redirect URL with all params
- Amount converted from paise → INR in the URL

**Thank-you URL params:**
`ref`, `payment_id`, `amount` (INR), `currency`, `product`, `product_name`, `cname`, `email`, `phone`, plus any extra `customer_*` fields (e.g., `dob`, `gender`)

> Note: uses `cname` not `name` — WordPress hijacks `?name=` for page routing.

---

### `POST /api/webhook`

Razorpay fires this server-to-server. Handles `payment.captured`, `order.paid`, `payment.failed`.

**Security:** Must consume raw body before HMAC check. `module.exports.config = { api: { bodyParser: false } }` is mandatory.

**What it does on `payment.captured` / `order.paid`:**
1. Validates HMAC-SHA256 using `RAZORPAY_WEBHOOK_SECRET` (different key from `KEY_SECRET`)
2. Reads `notes` from event payload (set at order creation, no DB needed)
3. Validates `product_id` is in catalog — ignores non-catalog payments silently
4. Fires **Pabbly webhook** (per-product URL from catalog, with 3 retries)
5. Writes transaction to **Firestore** (if `FIREBASE_SERVICE_ACCOUNT` configured)

**Always returns 200** — non-200 triggers Razorpay retries (idempotency needed).

---

### `GET /api/check-order?order_id=order_xxx`

Crash recovery endpoint. Called by `base.js` on page load if a pending order is found in `sessionStorage`. Returns only `{ "status": "paid" | "created" | "attempted" }` — no redirect URL.

---

## The Catalog Pattern (`lib/catalog.js`)

This is **the only file that changes when adding a new funnel**:

```js
const CATALOG = {
  "product-id-slug": {
    name: "Product Display Name",
    description: "Short description shown in Razorpay popup",
    amount: 49900,            // paise (Rs.499 = 49900)
    currency: "INR",
    thankyou_path: "/thank-you/",             // relative or full URL
    pabbly_webhook: "https://connect.pabbly.com/workflow/...",
  },
};
```

`getProduct(productId)` sanitizes the ID (strips non-alphanumeric/dash chars) before lookup — prevents injection.

**Razorpay order notes** (set at create-order, read by webhook and verify-payment):
```
product_id, product_name, customer_name, customer_email, customer_phone,
customer_<extra_fields>, utm_params
```
Max 15 keys, 256 chars each. Currently uses ~9-10.

---

## Security Model

### Two Absolute Laws
1. **Amount never comes from the browser.** Always from `lib/catalog.js` via `product_id`.
2. **Payment is never trusted without HMAC-SHA256 verification.**

### Signature Verification
- `verify-payment`: HMAC of `order_id|payment_id` using `RAZORPAY_KEY_SECRET`
- `webhook`: HMAC of raw request body using `RAZORPAY_WEBHOOK_SECRET` (separate secret)
- Both use `crypto.timingSafeEqual` — buffers must match length, wrapped in try/catch

### CORS
`lib/cors.js` — allowlist checked against `req.headers.origin`. Currently hardcoded to `.org` and `.in` domains. Can be overridden with `ALLOWED_ORIGINS` env var (comma-separated). Dev mode (`NODE_ENV !== "production"`) allows all origins.

### Input Sanitization
- HTML stripped from all string fields: `val.replace(/<[^>]*>/g, "")`
- Phone: digits only, max 10
- All fields capped at 200 chars
- Product ID: `/[^a-z0-9-]/gi` stripped before catalog lookup

---

## Frontend Integration (`base.js`)

Single global script. No per-page configuration. Uses `data-product-id` attribute to drive the entire flow.

**Button pattern:**
```html
<button class="form-cta" data-product-id="numerology-basic">Buy Now</button>
<!-- Optional: override redirect -->
<button class="form-cta" data-product-id="numerology-pro" data-redirect-url="https://example.com/ty/">Buy Pro</button>
```

**Flow inside `base.js`:**
1. `hookFormCtaButtons()` — event delegation on `document`, captures `data-product-id`
2. `hookModalForm()` — intercepts `#leadForm` submit, collects all `input[name]` values
3. `startPayment()` → `POST /api/create-order` → load Razorpay CDN script → `openCheckout()`
4. On payment success → `verifyAndRedirect()` → `POST /api/verify-payment` → `window.location.href`
5. `recoverCrashedPayment()` — runs on every page load, checks `sessionStorage` for pending orders > 1hr old gets discarded

**VERCEL_BASE_URL** is hardcoded in `base.js`:
```js
var VERCEL_BASE_URL = "https://batra-razorpay.vercel.app";
```
This is the primary thing to parameterize for multi-tenant.

---

## Integrations

### Razorpay
- SDK: `razorpay` npm package, singleton in `lib/razorpay.js`
- Checkout JS: loaded from CDN (`https://checkout.razorpay.com/v1/checkout.js`)
- Two separate webhook configs needed: Test mode + Live mode in Razorpay dashboard
- Auto-capture must be ON (Settings → Payment Capture)
- Webhook events: `payment.captured`, `order.paid`, `payment.failed`

### Pabbly Connect
- No SDK, no env var — just a `fetch` POST to the webhook URL stored in `catalog.js`
- Per-product webhook URL, fired from `webhook.js` only (not `verify-payment`)
- 3-retry logic with 1s/2s backoff
- Payload includes: event, order_id, payment_id, amount (paise + INR), currency, method, product_id, product_name, all customer fields, UTMs

### Firebase Firestore
- Optional — gracefully disabled if `FIREBASE_SERVICE_ACCOUNT` not set
- Writes one document per transaction to `transactions` collection, keyed by `order_id`
- Service account JSON stored as a single env var (stringified)

---

## Environment Variables

| Variable | Where Set | Purpose |
|---|---|---|
| `RAZORPAY_KEY_ID` | Vercel | Public — returned to browser in create-order response |
| `RAZORPAY_KEY_SECRET` | Vercel | Signs orders, verifies payment signatures. NEVER in browser |
| `RAZORPAY_WEBHOOK_SECRET` | Vercel | Verifies webhook payload HMAC. Separate from KEY_SECRET |
| `ALLOWED_ORIGINS` | Vercel | Comma-separated allowed CORS origins (optional — has fallback) |
| `FIREBASE_SERVICE_ACCOUNT` | Vercel | Stringified Firebase service account JSON (optional) |

---

## What's Hardcoded (Must Parameterize for Multi-Tenant)

| Hardcoded Value | Location | Needs to Become |
|---|---|---|
| `VERCEL_BASE_URL = "https://batra-razorpay.vercel.app"` | `base.js:36` | Per-client API base URL |
| `"The Batra Numerology"` (Razorpay popup name) | `base.js:209` | Per-client business name |
| `theme: { color: "#2371ec" }` | `base.js:213` | Per-client brand color |
| CORS allowlist | `lib/cors.js:13-19` | Per-client domain list |
| Catalog products | `lib/catalog.js` | Per-client product catalog |
| All Razorpay credentials | env vars | Per-client Razorpay account |
| Firebase project | env var | Per-client or shared DB |

---

## Key Gotchas (Hard-Won)

1. **`webhook.js` raw body** — `bodyParser: false` is mandatory. Parse body before HMAC and the signature will never match.

2. **`base.js` is at repo root** — served at `batra-razorpay.vercel.app/base.js`. Not `/public/base.js`. Vercel doesn't auto-serve `public/` for plain Node projects.

3. **Razorpay notes limits** — max 15 keys, 256 chars each. Currently uses ~9-10. Don't exceed.

4. **`timingSafeEqual` buffer length** — both buffers must be the same byte length or it throws. The try/catch handles this. Never remove it.

5. **Pabbly fires from webhook, not verify-payment** — webhook is the authoritative fulfillment path. `verify-payment` only redirects the browser. Pabbly must never depend on the browser reaching verify-payment.

6. **Two separate Razorpay webhook configs** — Test mode and Live mode each need their own webhook setup in the Razorpay dashboard. Forgetting live-mode means Pabbly/Firebase never fire on real payments.

7. **Amount in paise everywhere except TY URL** — Rs.499 = 49900 paise internally. The `/thank-you/` URL gets `amount=499` (rupees). Conversion in `verify-payment.js`.

8. **`cname` not `name` in TY URL** — WordPress hijacks `?name=` for page routing.

9. **Webhook always returns 200** — non-200 causes Razorpay to retry, leading to duplicate Pabbly fires. Always return 200, even on handler errors.

---

## Multi-Tenant Architecture — What to Extract

When building the dashboard, each "client" (website) needs:
- Its own Razorpay credentials (`KEY_ID`, `KEY_SECRET`, `WEBHOOK_SECRET`)
- Its own product catalog (products, prices, pabbly URLs)
- Its own allowed CORS origins
- Its own business name / brand color / base URL for `base.js`
- Optionally: its own Firestore collection or separate Firebase project

The core API logic (`create-order`, `verify-payment`, `webhook`, `check-order`) is **client-agnostic** — it just needs to be parameterized at the tenant level rather than hardcoded.

The **catalog pattern** (one config object → price lookup by product_id → pabbly URL per product) is the cleanest thing to keep. Scale it to a per-tenant config instead of a per-project file.
