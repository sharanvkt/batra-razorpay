# LP Form → New Payment System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `lp-popup-form.html`'s self-contained inline JS (which bypasses the API and redirects to a Razorpay payment page) with the proper payment flow driven by `base.js`, while making `base.js` field-agnostic so any funnel can collect any fields without code changes.

**Architecture:** `lp-popup-form.html` becomes a passive HTML+CSS shell — all JS removed. `base.js` dynamically reads whatever named inputs are in the form and passes them to the API. `create-order.js` and `verify-payment.js` handle flexible customer fields by iterating keys rather than destructuring.

**Tech Stack:** Vanilla JS (ES5 in base.js for browser compatibility), Node.js serverless (Vercel), Razorpay SDK

---

## File Map

| File | Action | What changes |
|------|--------|--------------|
| `lp-popup-form.html` | Modify | Delete the entire `<script>` block (lines 644–905) |
| `base.js` | Modify | `hookModalForm()` — replace hardcoded field reads with dynamic input collector |
| `api/create-order.js` | Modify | Replace destructured customer fields with dynamic key iteration + flexible name composition |
| `api/verify-payment.js` | Modify | Add loop to pass through any `customer_*` note keys not already in the standard params |

---

## Task 1: Strip inline JS from `lp-popup-form.html`

**Files:**
- Modify: `lp-popup-form.html` (lines 644–905 — the entire `<script>` block)

- [ ] **Step 1: Delete the `<script>` block**

Open `lp-popup-form.html`. Remove everything from line 644 (`<script>`) through line 905 (`</script>`), inclusive. The file should end after the closing `</style>` tag at line 642.

The remaining file is pure HTML + CSS — modal structure, 2-step form, all styling. No JS whatsoever.

- [ ] **Step 2: Verify**

The file should have no `<script>` tags. Check:
```bash
grep -n "<script" lp-popup-form.html
```
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add lp-popup-form.html
git commit -m "feat: remove inline JS from lp-popup-form — now driven by base.js"
```

---

## Task 2: Make `base.js` field-agnostic

**Files:**
- Modify: `base.js` — `hookModalForm()` function (lines 107–152)

- [ ] **Step 1: Replace the hardcoded customer object**

In `base.js`, inside `hookModalForm()`, find this block (around line 121):

```js
// Collect customer data from the form
var customer = {
  first_name: getVal("firstName"),
  last_name:  getVal("lastName"),
  email:      getVal("email"),
  phone:      getVal("phone"),
  dob:        getVal("dob"),
  gender:     getVal("gender"),
};

// Validate required customer fields exist
if (!customer.first_name || !customer.email || !customer.phone) {
  console.error("[rzp] Missing required customer fields");
  return;
}
```

Replace it with:

```js
// Collect all named inputs from the form — field-agnostic
var inputs = form.querySelectorAll("input[name], select[name], textarea[name]");
var customer = {};
inputs.forEach(function (el) {
  if (el.value.trim()) customer[el.name] = el.value.trim();
});

// email and phone are always required (needed for Razorpay prefill)
if (!customer.email || !customer.phone) {
  console.error("[rzp] Missing required customer fields (email, phone)");
  return;
}
```

- [ ] **Step 2: Verify no other references to hardcoded field IDs in `hookModalForm`**

```bash
grep -n "firstName\|lastName\|getVal" base.js
```

The only `getVal` calls remaining should be outside `hookModalForm` (there are none — `getVal` is only used in that function). Expected: no output after the replacement.

- [ ] **Step 3: Commit**

```bash
git add base.js
git commit -m "feat: make base.js field-agnostic — reads any named form inputs dynamically"
```

---

## Task 3: Make `create-order.js` handle flexible customer fields

**Files:**
- Modify: `api/create-order.js`

The current code destructures specific fields (`customer.first_name`, `customer.last_name`, etc.) and hardcodes the notes keys. We replace this with dynamic key handling.

- [ ] **Step 1: Replace the customer sanitisation and notes block**

Find this section (around lines 50–85):

```js
// Sanitise customer fields
const sanitise = (val) =>
  typeof val === "string" ? val.replace(/<[^>]*>/g, "").slice(0, 200) : "";

const c = {
  first_name: sanitise(customer.first_name),
  last_name: sanitise(customer.last_name),
  email: sanitise(customer.email),
  phone: sanitise(customer.phone).replace(/\D/g, "").slice(0, 10),
  dob: sanitise(customer.dob),
  gender: sanitise(customer.gender),
};

const fullName = [c.first_name, c.last_name].filter(Boolean).join(" ");
```

Replace with:

```js
const sanitise = (val) =>
  typeof val === "string" ? val.replace(/<[^>]*>/g, "").slice(0, 200) : "";

// Sanitise all incoming customer fields dynamically
const c = {};
Object.keys(customer).forEach((key) => {
  const val = sanitise(customer[key]);
  if (key === "phone") {
    c.phone = val.replace(/\D/g, "").slice(0, 10);
  } else if (val) {
    c[key] = val;
  }
});

// Compose a display name from full_name OR first_name + last_name
const fullName = c.full_name ||
  [c.first_name, c.last_name].filter(Boolean).join(" ") ||
  "";
```

- [ ] **Step 2: Replace the hardcoded notes object**

Find the `notes` object inside `razorpay.orders.create(...)` (around lines 70–84):

```js
notes: {
  product_id,
  product_name: product.name,
  customer_name: fullName,
  customer_email: c.email,
  customer_phone: c.phone,
  customer_dob: c.dob,
  customer_gender: c.gender,
  ...(utm_params && typeof utm_params === "string"
    ? { utm_params: utm_params.replace(/<[^>]*>/g, "").slice(0, 500) }
    : {}),
},
```

Replace with:

```js
notes: (function () {
  // Start with standard keys
  const n = {
    product_id,
    product_name: product.name,
    customer_name: fullName,
    customer_email: c.email || "",
    customer_phone: c.phone || "",
  };

  // Add remaining customer fields as customer_<fieldname>
  // Skip fields already covered above and name-composition fields
  const skip = new Set(["email", "phone", "full_name", "first_name", "last_name"]);
  Object.keys(c).forEach((key) => {
    if (!skip.has(key) && c[key]) {
      const noteKey = "customer_" + key;
      // Razorpay notes: max 15 keys total — only add if room
      if (Object.keys(n).length < 14) {
        n[noteKey] = c[key];
      }
    }
  });

  if (utm_params && typeof utm_params === "string" && Object.keys(n).length < 15) {
    n.utm_params = utm_params.replace(/<[^>]*>/g, "").slice(0, 500);
  }

  return n;
})(),
```

- [ ] **Step 3: Update the prefill customer returned in the response**

Find (around lines 93–106):

```js
return res.status(200).json({
  order_id: order.id,
  key_id: process.env.RAZORPAY_KEY_ID,
  amount: order.amount,
  currency: order.currency,
  product_name: product.name,
  description: product.description,
  // Return customer data for Razorpay popup prefill
  customer: {
    name: fullName,
    email: c.email,
    contact: c.phone ? "+91" + c.phone : "",
  },
});
```

This block is already correct — it uses `fullName`, `c.email`, `c.phone` which are still set the same way. No change needed here.

- [ ] **Step 4: Local smoke test**

```bash
npm run dev
```

In a separate terminal:
```bash
curl -s -X POST http://localhost:3000/api/create-order \
  -H "Content-Type: application/json" \
  -d '{"product_id":"mobile-numerology-webinar-fb","customer":{"full_name":"Test User","email":"test@test.com","phone":"9876543210","city":"Mumbai"}}' \
  | python3 -m json.tool
```

Expected response contains: `order_id`, `key_id`, `amount: 100`, `customer.name: "Test User"`.

- [ ] **Step 5: Commit**

```bash
git add api/create-order.js
git commit -m "feat: create-order accepts flexible customer fields dynamically"
```

---

## Task 4: Make `verify-payment.js` pass through extra customer fields to TY URL

**Files:**
- Modify: `api/verify-payment.js` (lines 73–90)

- [ ] **Step 1: Replace the hardcoded params block**

Find this block (lines 73–90):

```js
const params = new URLSearchParams({
  // Payment info
  ref: razorpay_order_id,
  payment_id: razorpay_payment_id,
  amount: ((order.amount || 0) / 100).toFixed(0), // Rs. not paise
  currency: order.currency || "INR",

  // Product info
  product: notes.product_id || "",
  product_name: notes.product_name || "",

  // Customer info (note: "name" is a WordPress reserved query var — use "cname")
  cname: notes.customer_name || "",
  email: notes.customer_email || "",
  phone: notes.customer_phone || "",
  dob: notes.customer_dob || "",
  gender: notes.customer_gender || "",
});
```

Replace with:

```js
const params = new URLSearchParams({
  // Payment info
  ref: razorpay_order_id,
  payment_id: razorpay_payment_id,
  amount: ((order.amount || 0) / 100).toFixed(0), // Rs. not paise
  currency: order.currency || "INR",

  // Product info
  product: notes.product_id || "",
  product_name: notes.product_name || "",

  // Standard customer fields
  // "name" is a WordPress reserved query var — always use "cname"
  cname: notes.customer_name || "",
  email: notes.customer_email || "",
  phone: notes.customer_phone || "",
});

// Pass through any extra customer_* note keys (e.g. customer_city → city=...)
const standardKeys = new Set([
  "customer_name", "customer_email", "customer_phone",
  "product_id", "product_name", "utm_params",
]);
Object.keys(notes).forEach((key) => {
  if (key.startsWith("customer_") && !standardKeys.has(key)) {
    const paramKey = key.replace("customer_", "");
    if (notes[key]) params.set(paramKey, notes[key]);
  }
});
```

- [ ] **Step 2: Verify no broken references**

The rest of `verify-payment.js` uses `params` only to build `redirectUrl` — no other references to `dob` or `gender`. Check:

```bash
grep -n "dob\|gender\|customer_dob\|customer_gender" api/verify-payment.js
```

Expected: no output (we removed those hardcoded refs).

- [ ] **Step 3: Commit**

```bash
git add api/verify-payment.js
git commit -m "feat: verify-payment passes through extra customer_* note keys to TY URL"
```

---

## Task 5: End-to-end verification

No code changes — this is a manual test checklist.

- [ ] **Step 1: Start local dev server**

```bash
npm run dev
```

- [ ] **Step 2: Load the LP form**

Paste `lp-popup-form.html` contents into a test page that also loads `base.js` and has a button:
```html
<button class="form-cta" data-product-id="mobile-numerology-webinar-fb">
  Secure My Spot
</button>
```

- [ ] **Step 3: Test the happy path**

1. Click the button → modal opens
2. Fill Step 1: Full Name = "Rahul Sharma", Email = "rahul@test.com" → Continue
3. Fill Step 2: Phone = "9876543210", City = "Mumbai" → Submit
4. Razorpay popup opens, prefilled with name/email/phone
5. Complete Rs.1 test payment
6. Verify redirect lands on `/insfb-ty/` with params: `cname=Rahul+Sharma`, `email=rahul%40test.com`, `phone=9876543210`, `city=Mumbai`

- [ ] **Step 4: Check Razorpay dashboard**

In Razorpay test dashboard → Orders → most recent order → Notes:
- `product_id`: `mobile-numerology-webinar-fb`
- `customer_name`: `Rahul Sharma`
- `customer_email`: `rahul@test.com`
- `customer_phone`: `9876543210`
- `customer_city`: `Mumbai`

- [ ] **Step 5: Verify existing funnel not broken**

Test any other funnel that uses `base.js` (e.g. `lucky-yantra-fb` with its own form). Confirm it still opens the modal, submits, and reaches TY page correctly.
