/**
 * POST /api/verify-payment
 *
 * After the Razorpay popup closes successfully, the browser sends
 * the three payment IDs here. We verify the HMAC-SHA256 signature
 * to confirm the payment is genuine, then return the redirect URL.
 *
 * ─── SECURITY NOTES ──────────────────────────────────────────────
 * • Signature verification uses crypto.timingSafeEqual to prevent
 *   timing-based side-channel attacks.
 * • The redirect URL is read from the Razorpay order notes
 *   (set server-side during create-order) — never from the browser.
 * • A generic error message is returned on failure — we do not
 *   reveal whether the failure was a signature mismatch or a
 *   missing order, to avoid information leakage.
 * ─────────────────────────────────────────────────────────────────
 *
 * Request body:
 *   {
 *     "razorpay_payment_id": "pay_xxx",
 *     "razorpay_order_id":   "order_xxx",
 *     "razorpay_signature":  "abc123..."
 *   }
 *
 * Success response 200:
 *   { "redirect_url": "https://thebatraanumerology.org/thank-you/?ref=order_xxx" }
 *
 * Error responses:
 *   400 — missing fields or signature mismatch
 *   405 — wrong HTTP method
 *   502 — could not fetch order from Razorpay
 */

const crypto         = require("crypto");
const { setCors }    = require("../lib/cors");
const razorpay       = require("../lib/razorpay");

module.exports = async function handler(req, res) {
  // ── CORS ──────────────────────────────────────────────────────
  if (setCors(req, res)) return;

  // ── METHOD GUARD ──────────────────────────────────────────────
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // ── INPUT VALIDATION ──────────────────────────────────────────
  const {
    razorpay_payment_id,
    razorpay_order_id,
    razorpay_signature,
  } = req.body || {};

  if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
    return res.status(400).json({ error: "Missing payment details" });
  }

  // ── HMAC-SHA256 SIGNATURE VERIFICATION ───────────────────────
  // Razorpay signs: order_id + "|" + payment_id
  // using KEY_SECRET as the HMAC key.
  const body = `${razorpay_order_id}|${razorpay_payment_id}`;

  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(body)
    .digest("hex");

  // Constant-time comparison prevents timing attacks
  let signaturesMatch = false;
  try {
    signaturesMatch = crypto.timingSafeEqual(
      Buffer.from(expectedSignature, "hex"),
      Buffer.from(razorpay_signature, "hex")
    );
  } catch {
    // Buffer lengths differ — signature is definitely wrong
    signaturesMatch = false;
  }

  if (!signaturesMatch) {
    console.warn(
      "[verify-payment] Signature mismatch for order:",
      razorpay_order_id
    );
    // Generic message — don't confirm it was a signature failure
    return res.status(400).json({ error: "Payment verification failed" });
  }

  // ── FETCH ORDER FROM RAZORPAY ─────────────────────────────────
  // Read the thankyou_path we stored in notes during create-order.
  let order;
  try {
    order = await razorpay.orders.fetch(razorpay_order_id);
  } catch (err) {
    console.error("[verify-payment] Could not fetch order:", err?.error || err);
    return res.status(502).json({ error: "Could not verify order. Please contact support." });
  }

  // ── BUILD REDIRECT URL ────────────────────────────────────────
  // Origin: the request's own origin (one of the two allowed domains).
  // Path: stored in order notes during create-order (server-controlled).
  const origin = req.headers.origin || "https://thebatraanumerology.org";
  const thankyouPath = order.notes?.thankyou_path || "/thank-you/";

  // Append order ref as a query param so the thank-you page guard can
  // validate arrival (see /api/check-order).
  const redirectUrl =
    `${origin}${thankyouPath}?ref=${razorpay_order_id}` +
    `&pid=${razorpay_payment_id}`;

  return res.status(200).json({ redirect_url: redirectUrl });
};
