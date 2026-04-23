/**
 * POST /api/webhook
 *
 * Razorpay fires this server-to-server after every payment event.
 * Reads pabbly_webhook URL from order notes (set in create-order)
 * so each product/funnel gets its own Pabbly automation triggered.
 *
 * No env vars needed for Pabbly — it's all in the catalog via notes.
 */

const crypto = require("crypto");
const { sendCapiEvent } = require("../lib/meta-capi");
const { getProduct } = require("../lib/catalog");
const { db } = require("../lib/firebase");

// Raw body required for HMAC — disable Vercel body parser
module.exports.config = {
  api: { bodyParser: false },
};

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  // Read raw body
  let rawBody;
  try {
    rawBody = await getRawBody(req);
  } catch (err) {
    console.error("[webhook] Failed to read body:", err);
    return res.status(400).end();
  }

  // Verify signature
  const receivedSig = req.headers["x-razorpay-signature"];
  if (!receivedSig) {
    console.warn("[webhook] Missing signature header");
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
      Buffer.from(receivedSig, "hex"),
    );
  } catch {
    valid = false;
  }

  if (!valid) {
    console.warn("[webhook] Signature mismatch");
    return res.status(400).json({ error: "Invalid signature" });
  }

  // Parse
  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ error: "Invalid JSON" });
  }

  const eventId = req.headers["x-razorpay-event-id"] || "unknown";
  console.log(`[webhook] ${event.event} | eventId: ${eventId}`);

  try {
    if (event.event === "payment.captured" || event.event === "order.paid") {
      const payment = event.payload?.payment?.entity;
      const order = event.payload?.order?.entity;
      const notes = { ...(payment?.notes || {}), ...(order?.notes || {}) };
      console.log('[webhook] notes debug:', JSON.stringify({ payment_notes: payment?.notes, order_notes: order?.notes }));

      // Build Pabbly payload with all customer + payment data
      const payload = {
        event: event.event,
        order_id: payment?.order_id || order?.id || "",
        payment_id: payment?.id || "",
        amount_paise: payment?.amount || order?.amount || 0,
        amount_inr: ((payment?.amount || order?.amount || 0) / 100).toFixed(2),
        currency: payment?.currency || "INR",
        payment_method: payment?.method || "",

        // Product (from catalog via notes)
        product_id: notes.product_id || "",
        product_name: notes.product_name || "",

        // Customer (from form via notes)
        // Fallback to flat keys for payments made via old Razorpay payment page
        customer_name:  notes.customer_name  || notes.full_name || "",
        customer_email: notes.customer_email || notes.email     || "",
        customer_phone: notes.customer_phone || notes.phone     || "",
        customer_dob: notes.customer_dob || "",
        customer_gender: notes.customer_gender || "",

        timestamp: new Date().toISOString(),
        event_id: eventId,
      };

      // Unpack UTMs from notes into individual Pabbly fields
      if (notes.utm_params) {
        try {
          new URLSearchParams(notes.utm_params).forEach(function (value, key) {
            payload[key] = value;
          });
        } catch (e) {
          console.warn("[webhook] Could not parse utm_params:", e.message);
        }
      }

      // pabbly_webhook looked up from catalog (not stored in notes anymore)
      const product = getProduct(notes.product_id);
      const pabblyUrl = product?.pabbly_webhook || "";

      if (pabblyUrl && pabblyUrl.startsWith("https://")) {
        console.log(`[webhook] Firing Pabbly for product: ${notes.product_id}`);
        await firePabbly(pabblyUrl, payload);
      } else {
        console.warn(
          "[webhook] No valid pabbly_webhook in order notes for:",
          notes.product_id,
        );
      }

      // Firestore — only for orders that came through our create-order system
      if (db && payload.product_id) {
        db.collection("transactions")
          .doc(payload.order_id)
          .set({ ...payload, created_at: new Date().toISOString() })
          .catch((err) => console.error("[webhook] Firestore write failed:", err.message));
      }

      // Meta CAPI Purchase — server-authoritative, deduplicated via purch-{order_id}
      const nameParts = (notes.customer_name || notes.full_name || "").trim().split(" ");
      await sendCapiEvent({
        event_name: "Purchase",
        event_id: "purch-" + payload.order_id,
        event_source_url: "https://thebatraanumerology.org/",
        user_data: {
          email:      notes.customer_email || notes.email || undefined,
          phone:      notes.customer_phone || notes.phone || undefined,
          first_name: nameParts[0]          || undefined,
          last_name:  nameParts.slice(1).join(" ") || undefined,
          dob:        notes.customer_dob    || undefined,
          gender:     notes.customer_gender || undefined,
        },
        custom_data: {
          value:        parseFloat(payload.amount_inr),
          currency:     "INR",
          content_ids:  [notes.product_id],
          content_type: "product",
        },
        test_event_code: process.env.META_TEST_EVENT_CODE,
      }).catch((err) => {
        console.error("[webhook] Meta CAPI Purchase failed:", err.message);
      });
    }

    if (event.event === "payment.failed") {
      const payment = event.payload?.payment?.entity;
      console.log("[webhook] Payment failed:", {
        orderId: payment?.order_id,
        errorCode: payment?.error_code,
        errorReason: payment?.error_reason,
      });
    }
  } catch (err) {
    // Always return 200 — non-200 triggers Razorpay retries
    console.error("[webhook] Handler error:", err);
  }

  return res.status(200).json({ status: "ok" });
};

// Fire Pabbly with up to 3 retries
async function firePabbly(url, payload, attempt = 1) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      console.log(`[webhook] Pabbly OK (attempt ${attempt})`);
    } else {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch (err) {
    console.error(`[webhook] Pabbly error attempt ${attempt}:`, err.message);
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, 1000 * attempt));
      return firePabbly(url, payload, attempt + 1);
    }
    console.error("[webhook] Pabbly: all retries exhausted");
  }
}

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
