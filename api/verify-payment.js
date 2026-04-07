/**
 * POST /api/verify-payment
 *
 * Verifies HMAC-SHA256 signature after Razorpay popup closes.
 * On success, builds a thank-you redirect URL with all payment
 * and customer data as query params (for Meta Pixel etc).
 *
 * SECURITY:
 * - Signature verified with timingSafeEqual
 * - Redirect URL built from server-side order notes only
 * - No sensitive data (card details, secrets) in URL params
 */

const crypto = require("crypto");
const { setCors } = require("../lib/cors");
const razorpay = require("../lib/razorpay");

module.exports = async function handler(req, res) {
  if (setCors(req, res)) return;

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { razorpay_payment_id, razorpay_order_id, razorpay_signature } =
    req.body || {};

  if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
    return res.status(400).json({ error: "Missing payment details" });
  }

  // HMAC-SHA256 verification
  const expectedSig = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");

  let signaturesMatch = false;
  try {
    signaturesMatch = crypto.timingSafeEqual(
      Buffer.from(expectedSig, "hex"),
      Buffer.from(razorpay_signature, "hex"),
    );
  } catch {
    signaturesMatch = false;
  }

  if (!signaturesMatch) {
    console.warn("[verify-payment] Signature mismatch:", razorpay_order_id);
    return res.status(400).json({ error: "Payment verification failed" });
  }

  // Fetch order to read notes (customer data + thankyou_path)
  let order;
  try {
    order = await razorpay.orders.fetch(razorpay_order_id);
  } catch (err) {
    console.error("[verify-payment] Could not fetch order:", err?.error || err);
    return res
      .status(502)
      .json({ error: "Could not verify order. Please contact support." });
  }

  const notes = order.notes || {};

  // Build thank-you URL with all data as params
  // These are available on the TY page for Meta Pixel, GTM etc.
  const origin = req.headers.origin || "https://thebatraanumerology.org";
  const thankyouPath = (notes.thankyou_path || "/thank-you/").replace(/\/?$/, "/");

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

  const redirectUrl = `${origin}${thankyouPath}?${params.toString()}`;

  console.log("[verify-payment] Verified, redirecting:", razorpay_order_id);

  return res.status(200).json({ redirect_url: redirectUrl });
};
