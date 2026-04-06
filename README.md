# Batra Numerology — Razorpay Payment Integration

Vercel serverless backend for WordPress payment integration.
No WooCommerce. No PHP. No WordPress plugins beyond a script tag.

---

## Project Structure

```
razorpay-vercel/
├── api/
│   ├── create-order.js      # POST /api/create-order
│   ├── verify-payment.js    # POST /api/verify-payment
│   ├── webhook.js           # POST /api/webhook
│   └── check-order.js       # GET  /api/check-order
├── lib/
│   ├── catalog.js           # Product catalog (prices live here)
│   ├── cors.js              # CORS for .org and .in domains
│   └── razorpay.js          # SDK initialisation
├── public/
│   ├── base.js              # WordPress frontend script
│   └── thankyou-guard.js    # Thank-you page protection
├── .env.example             # Copy to .env.local for local dev
├── vercel.json
└── package.json
```

---

## Step-by-Step Deployment

### 1. Clone & Install

```bash
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git
cd YOUR_REPO
cp .env.example .env.local
# Fill in your TEST Razorpay keys in .env.local
npm install
```

### 2. Update VERCEL_BASE_URL in base.js and thankyou-guard.js

After you deploy to Vercel, you'll get a URL like:
`https://batra-numerology-payments.vercel.app`

Update this line in **both** `public/base.js` and `public/thankyou-guard.js`:
```js
const VERCEL_BASE_URL = "https://your-project.vercel.app"; // ← this
```

### 3. Set Environment Variables in Vercel

Go to: Vercel Dashboard → Your Project → Settings → Environment Variables

Add these (for Production + Preview + Development):

| Variable                  | Value                          |
|---------------------------|--------------------------------|
| `RAZORPAY_KEY_ID`         | `rzp_test_...` (test) or `rzp_live_...` (prod) |
| `RAZORPAY_KEY_SECRET`     | Your Razorpay secret key       |
| `RAZORPAY_WEBHOOK_SECRET` | A strong random string (≥32 chars). Generate: `openssl rand -hex 32` |

### 4. Deploy to Vercel

```bash
npx vercel --prod
```

Or push to GitHub — Vercel auto-deploys on push if connected.

### 5. Configure Razorpay Webhook

1. Go to Razorpay Dashboard (TEST mode first)
2. Developers → Webhooks → Add New Webhook
3. URL: `https://your-project.vercel.app/api/webhook`
4. Secret: **same value as your `RAZORPAY_WEBHOOK_SECRET` env var**
5. Events to subscribe: ✓ `payment.captured` ✓ `order.paid` ✓ `payment.failed`
6. Save

### 6. Add base.js to WordPress

In WordPress admin: Appearance → Theme Editor → functions.php
(or use a Code Snippets plugin):

```php
function enqueue_razorpay_script() {
    wp_enqueue_script(
        'razorpay-base',
        'https://your-project.vercel.app/base.js',
        array(),
        '1.0.0',
        true  // load in footer
    );
}
add_action('wp_enqueue_scripts', 'enqueue_razorpay_script');
```

### 7. Add a Buy Button to Any WordPress Page

Use a Custom HTML block:

```html
<button
  data-razorpay-product
  data-product-id="numerology-basic"
  class="rzp-buy-button"
>
  Buy Basic Report — ₹499
</button>
```

Available product IDs (see lib/catalog.js):
- `numerology-basic`      → ₹499
- `numerology-pro`        → ₹999
- `numerology-consultation` → ₹1,999

### 8. Add Guard to Thank-You Page

Add this Custom HTML block to your thank-you page in WordPress:
```html
<script src="https://your-project.vercel.app/thankyou-guard.js"></script>
```

### 9. Test with Razorpay Test Cards

Use these test card details in the payment popup:
- Card number: `4111 1111 1111 1111`
- Expiry: Any future date
- CVV: Any 3 digits
- OTP: `1234` (mock bank page)

UPI test: Use `success@razorpay` as the VPA.

### 10. Go Live

1. In Razorpay Dashboard → switch to Live Mode
2. Generate Live API Keys
3. Update `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` in Vercel env vars
4. Create a new webhook in Live Mode (repeat Step 5)
5. Update `RAZORPAY_WEBHOOK_SECRET` with the live webhook secret
6. Redeploy: `npx vercel --prod`
7. Make a real ₹1 test payment to confirm

---

## Adding a New Product

1. Open `lib/catalog.js`
2. Add a new entry:
```js
"your-product-id": {
  name: "Your Product Name",
  description: "Short description",
  amount: 29900,    // ₹299 in paise
  currency: "INR",
  thankyou_path: "/thank-you/",
},
```
3. Commit and push (Vercel auto-deploys)
4. Add a button on any WordPress page with `data-product-id="your-product-id"`

---

## Security Checklist

- [ ] `RAZORPAY_KEY_SECRET` is only in Vercel env vars — never in code or WordPress
- [ ] `RAZORPAY_WEBHOOK_SECRET` is different from `RAZORPAY_KEY_SECRET`
- [ ] `.env.local` is in `.gitignore` and never committed
- [ ] Test mode keys are replaced with live keys before going live
- [ ] Webhook URL is configured in Razorpay dashboard for both test and live modes
- [ ] CORS `ALLOWED_ORIGINS` in `lib/cors.js` lists only your domains
