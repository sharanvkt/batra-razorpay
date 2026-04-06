/**
 * GET /api/check-order?order_id=order_xxx
 *
 * Crash recovery endpoint. Called by base.js on page load when a
 * pending order_id is found in sessionStorage — meaning the browser
 * crashed or closed after payment but before the redirect completed.
 *
 * ─── SECURITY NOTE ───────────────────────────────────────────────
 * Returns order status only — not the redirect URL.
 * The redirect URL is only issued after a full verify-payment call.
 * ─────────────────────────────────────────────────────────────────
 *
 * Success response 200:
 *   { "status": "paid" | "created" | "attempted" }
 *
 * Error responses:
 *   400 — missing / malformed order_id
 *   404 — order not found in Razorpay
 *   405 — wrong method
 *   502 — Razorpay API error
 */

const { setCors } = require("../lib/cors");
const razorpay    = require("../lib/razorpay");

module.exports = async function handler(req, res) {
  if (setCors(req, res)) return;

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { order_id } = req.query;

  if (!order_id || typeof order_id !== "string") {
    return res.status(400).json({ error: "order_id query param required" });
  }

  // Razorpay order IDs are always "order_" + alphanumeric
  if (!/^order_[a-zA-Z0-9]+$/.test(order_id)) {
    return res.status(400).json({ error: "Invalid order_id format" });
  }

  let order;
  try {
    order = await razorpay.orders.fetch(order_id);
  } catch (err) {
    if (err?.statusCode === 404) {
      return res.status(404).json({ error: "Order not found" });
    }
    console.error("[check-order] Razorpay error:", err?.error || err);
    return res.status(502).json({ error: "Could not fetch order status" });
  }

  return res.status(200).json({ status: order.status });
};
