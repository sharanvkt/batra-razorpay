/**
 * POST /api/create-order
 *
 * Receives a product_id from the browser.
 * Looks up the canonical price server-side.
 * Creates a Razorpay order and returns order details to the browser.
 *
 * ─── SECURITY NOTES ──────────────────────────────────────────────
 * • Amount is NEVER taken from the request body. Catalog is the
 *   single source of truth.
 * • KEY_SECRET is used by the Razorpay SDK internally — it is
 *   never returned to the browser.
 * • Only key_id (the public key) is returned.
 * ─────────────────────────────────────────────────────────────────
 *
 * Request body:
 *   { "product_id": "numerology-basic" }
 *
 * Success response 200:
 *   {
 *     "order_id":     "order_xxx",
 *     "key_id":       "rzp_test_xxx",
 *     "amount":       49900,
 *     "currency":     "INR",
 *     "product_name": "Numerology Basic Report",
 *     "description":  "Personal numerology reading — core numbers"
 *   }
 *
 * Error responses:
 *   400 — missing or unknown product_id
 *   405 — wrong HTTP method
 *   502 — Razorpay API error
 */

const { setCors }    = require("../lib/cors");
const { getProduct } = require("../lib/catalog");
const razorpay       = require("../lib/razorpay");

module.exports = async function handler(req, res) {
  // ── CORS ──────────────────────────────────────────────────────
  if (setCors(req, res)) return;          // handles OPTIONS preflight

  // ── METHOD GUARD ──────────────────────────────────────────────
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // ── INPUT VALIDATION ──────────────────────────────────────────
  const { product_id } = req.body || {};

  if (!product_id) {
    return res.status(400).json({ error: "product_id is required" });
  }

  // ── CATALOG LOOKUP ────────────────────────────────────────────
  // Amount comes from the server catalog — never from req.body.
  const product = getProduct(product_id);

  if (!product) {
    return res.status(400).json({ error: "Invalid product" });
  }

  // ── CREATE RAZORPAY ORDER ─────────────────────────────────────
  let order;
  try {
    order = await razorpay.orders.create({
      amount:   product.amount,           // paise, from server catalog
      currency: product.currency,
      receipt:  `rcpt_${Date.now()}`,     // internal ref, max 40 chars
      notes: {
        product_id,
        product_name:  product.name,
        thankyou_path: product.thankyou_path,
      },
    });
  } catch (err) {
    console.error("[create-order] Razorpay error:", err?.error || err);
    return res
      .status(502)
      .json({ error: "Could not create payment order. Please try again." });
  }

  // ── RESPOND ───────────────────────────────────────────────────
  // KEY_SECRET is intentionally absent from this response.
  return res.status(200).json({
    order_id:     order.id,
    key_id:       process.env.RAZORPAY_KEY_ID,   // public key — safe
    amount:       order.amount,
    currency:     order.currency,
    product_name: product.name,
    description:  product.description,
  });
};
