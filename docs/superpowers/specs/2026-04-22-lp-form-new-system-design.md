# LP Form → New Payment System

**Date:** 2026-04-22  
**Status:** Approved

## Context

`lp-popup-form.html` was built as a self-contained form that redirects to a hardcoded Razorpay payment page link (`pages.razorpay.com`). It completely bypasses the project's API backend — no server-side order creation, no HMAC verification, no Pabbly webhook.

The goal is to make it a passive HTML+CSS shell driven by `base.js`, using the same verified payment flow every other funnel uses. As part of this, `base.js` should become field-agnostic so different funnels can collect different fields without touching base.js.

## Files Changed

| File | Change |
|------|--------|
| `lp-popup-form.html` | Remove `<script>` block (~260 lines). HTML/CSS untouched. |
| `base.js` | Make `hookModalForm()` read form fields dynamically instead of hardcoded IDs. |
| `api/create-order.js` | Handle flexible customer object instead of destructuring specific fields. |
| `api/verify-payment.js` | Pass through any `customer_*` notes keys to TY URL params. |
| `lib/catalog.js` | No change — `mobile-numerology-webinar-fb` is correct. |

## Architecture

```
.form-cta[data-product-id="mobile-numerology-webinar-fb"] click
  → base.js opens #leadFormModal
  → user fills full_name, email (step 1) → phone, city (step 2)
  → base.js collects all named inputs: { full_name, email, phone, city }
  → POST /api/create-order { product_id, customer: { full_name, email, phone, city } }
  → Razorpay popup (prefilled with name, email, phone)
  → HMAC-SHA256 verify → POST /api/verify-payment
  → TY redirect: /insfb-ty/?cname=...&email=...&phone=...&city=...
```

## Detailed Design

### 1. `lp-popup-form.html`

Remove the entire `<script>` block. No other changes.

The form already has correct `name` attributes on all inputs: `full_name`, `email`, `phone`, `city`. The dynamic reader in `base.js` picks these up automatically.

The `.form-cta` button on the WordPress page must have:
```html
<button class="form-cta" data-product-id="mobile-numerology-webinar-fb">
  Secure My Spot
</button>
```

### 2. `base.js` — `hookModalForm()`

Replace hardcoded field reads with a dynamic collector:

```js
var inputs = form.querySelectorAll('input[name], select[name], textarea[name]');
var customer = {};
inputs.forEach(function(el) {
  if (el.value.trim()) customer[el.name] = el.value.trim();
});
```

Hard guard (only these two, always): `if (!customer.email || !customer.phone)` — required for Razorpay prefill.

Remove the `customer.first_name` check — it was only true when field ID was `firstName`.

### 3. `api/create-order.js`

Stop destructuring named fields. Instead:

1. Iterate all keys of the incoming `customer` object
2. Sanitize each value (strip HTML, truncate to 200 chars)
3. Compose `customer_name`:
   - If `full_name` present → use it
   - Else if `first_name` present → join `[first_name, last_name]`
   - Else empty string
4. Store `customer_email`, `customer_phone`, `customer_name` as dedicated note keys
5. Store remaining customer fields (e.g. `city`, `dob`, `gender`) as `customer_<fieldname>` in notes
6. Cap: skip any key that would exceed the 15-note limit

Razorpay prefill returned in response:
```js
customer: {
  name:    composedName,
  email:   sanitised.email,
  contact: phone ? "+91" + phone : "",
}
```

### 4. `api/verify-payment.js`

Keep hardcoded standard params: `ref`, `payment_id`, `amount`, `currency`, `product`, `product_name`, `cname` (from `customer_name`), `email`, `phone`.

Add a loop to pass through any remaining `customer_*` note keys:
```js
Object.keys(notes).forEach(function(key) {
  if (key.startsWith('customer_') && !alreadyCovered.has(key)) {
    params.set(key.replace('customer_', ''), notes[key]);
  }
});
```

This means `customer_city` automatically becomes `city=...` in the TY URL — no per-funnel code needed.

## Constraints

- Razorpay notes: max 15 keys, 256 chars each. We use ~8 standard keys + 1 per extra field. Stay under 15 total.
- `name` is a WordPress reserved query var — always use `cname` on TY page (already handled).
- Both Laws unchanged: amount from catalog, HMAC verification non-negotiable.

## Verification

1. Click `.form-cta[data-product-id="mobile-numerology-webinar-fb"]` on the LP
2. Fill form → submit → Razorpay popup opens prefilled
3. Complete test payment (Rs.1) → verify redirect to `/insfb-ty/` with `cname`, `email`, `phone`, `city` in URL
4. Check Razorpay dashboard: order notes contain `customer_full_name`, `customer_email`, `customer_phone`, `customer_city`
5. Check Pabbly: webhook fires with those fields
6. Test existing funnel (e.g. `lucky-yantra-fb`) still works — different fields, same base.js
