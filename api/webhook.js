/**
 * POST /api/webhook
 *
 * Receives payment lifecycle events from Razorpay.
 * This is the FALLBACK path — it fires even when the browser
 * crashes after payment, so fulfillment must be handled here.
 *
 * ─── SECURITY NOTES ──────────────────────────────────────────────
 * • Raw body MUST be read before any JSON parsing.
 *   Vercel body parser is disabled via module.exports.config.
 * • Uses RAZORPAY_WEBHOOK_SECRET — separate from KEY_SECRET.
 * • Always return 200 after signature check. Non-200 = retries.
 * ─────────────────────────────────────────────────────────────────
 *
 * Subscribe these events in Razorpay Dashboard → Webhooks:
 *   ✓ payment.captured
 *   ✓ order.paid
 *   ✓ payment.failed
 */

const crypto = require("crypto");

// CRITICAL: Disable Vercel body parser — raw body needed for HMAC
module.exports.config = {
  api: { bodyParser: false },
};

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).end();
  }

  // ── READ RAW BODY ─────────────────────────────────────────────
  let rawBody;
  try {
    rawBody = await getRawBody(req);
  } catch (err) {
    console.error("[webhook] Failed to read body:", err);
    return res.status(400).end();
  }

  // ── SIGNATURE VERIFICATION ────────────────────────────────────
  const receivedSig = req.headers["x-razorpay-signature"];

  if (!receivedSig) {
    console.warn("[webhook] Missing x-razorpay-signature header");
    return res.status(400).json({ error: "Missing signature" });
  }

  const expectedSig = crypto
    .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");

  let valid = false;
  try {
    valid = crypto.timingSafeEqual(
      Buffer.from(expectedSig, "hex"),
      Buffer.from(receivedSig, "hex")
    );
  } catch {
    valid = false;
  }

  if (!valid) {
    console.warn("[webhook] Signature mismatch — possible spoofed request");
    return res.status(400).json({ error: "Invalid signature" });
  }

  // ── PARSE ─────────────────────────────────────────────────────
  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ error: "Invalid JSON" });
  }

  // ── IDEMPOTENCY ───────────────────────────────────────────────
  // x-razorpay-event-id is unique per event. Log it now.
  // In production: store in DB/KV and skip if already seen.
  const eventId = req.headers["x-razorpay-event-id"] || "unknown";
  console.log(`[webhook] ${event.event} | eventId: ${eventId}`);

  // TODO (production — add before go-live):
  //   const seen = await kv.get(`whook:${eventId}`);
  //   if (seen) return res.status(200).json({ status: "duplicate" });
  //   await kv.set(`whook:${eventId}`, 1, { ex: 86400 });

  // ── EVENT HANDLING ────────────────────────────────────────────
  try {
    if (event.event === "payment.captured" || event.event === "order.paid") {
      const payment = event.payload?.payment?.entity;
      const order   = event.payload?.order?.entity;
      const notes   = payment?.notes || order?.notes || {};

      console.log("[webhook] Payment captured:", {
        orderId:     payment?.order_id || order?.id,
        paymentId:   payment?.id,
        amountPaise: payment?.amount || order?.amount,
        productId:   notes.product_id,
        productName: notes.product_name,
      });

      // ── YOUR FULFILLMENT LOGIC HERE ───────────────────────────
      //
      // Option A — Send email (e.g. via Resend / SendGrid):
      //   await sendConfirmationEmail({
      //     to:          payment.email,
      //     name:        payment.contact,
      //     productName: notes.product_name,
      //     orderId:     payment.order_id,
      //   });
      //
      // Option B — Trigger a Zapier / Make.com webhook:
      //   await fetch(process.env.ZAPIER_WEBHOOK_URL, {
      //     method: "POST",
      //     headers: { "Content-Type": "application/json" },
      //     body: JSON.stringify({
      //       orderId:   payment.order_id,
      //       paymentId: payment.id,
      //       productId: notes.product_id,
      //       email:     payment.email,
      //     }),
      //   });
      //
      // Option C — Write to Vercel KV / PlanetScale / Supabase:
      //   await db.insert({ orderId: payment.order_id, ... });
      //
      // Keep fulfillment under 8s total (Vercel free tier limit).
    }

    if (event.event === "payment.failed") {
      const payment = event.payload?.payment?.entity;
      console.log("[webhook] Payment failed:", {
        orderId:     payment?.order_id,
        errorCode:   payment?.error_code,
        errorReason: payment?.error_reason,
      });
      // Optional: notify yourself, mark order as failed in DB
    }
  } catch (err) {
    // Log but still return 200 — don't trigger unnecessary retries
    console.error("[webhook] Fulfillment error:", err);
  }

  // Always return 200 after valid signature
  return res.status(200).json({ status: "ok" });
};

// ── HELPER: read raw request body as Buffer ───────────────────────
function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data",  (chunk) => chunks.push(chunk));
    req.on("end",   ()      => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
