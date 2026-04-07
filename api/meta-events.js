/**
 * POST /api/meta-events
 *
 * CAPI proxy endpoint — receives browser-triggered events, enriches with
 * server-side IP + User-Agent, forwards to Meta Conversions API.
 *
 * Always returns 200 immediately (fire-and-forget from browser perspective).
 * CAPI errors are logged server-side and never surfaced to the browser.
 *
 * Expected body:
 * {
 *   event_name:       string   — "PageView" | "InitiateCheckout" | "AddToCart"
 *   event_id:         string   — deterministic dedup ID (matches browser fbq eventID)
 *   event_source_url: string   — current page URL from browser
 *   fbp:              string?  — _fbp cookie value
 *   fbc:              string?  — _fbc cookie value
 *   product_id:       string?  — for InitiateCheckout / AddToCart
 *   amount_paise:     number?  — for AddToCart (in paise)
 *   customer:         object?  — for AddToCart { first_name, last_name, email, phone, dob, gender }
 * }
 */

const { setCors } = require("../lib/cors");
const { sendCapiEvent } = require("../lib/meta-capi");

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).end();

  // Always respond 200 immediately — browser must not block on this
  res.status(200).json({ ok: true });

  const {
    event_name,
    event_id,
    event_source_url,
    fbp,
    fbc,
    product_id,
    amount_paise,
    customer = {},
  } = req.body || {};

  if (!event_name || !event_id) {
    console.warn("[meta-events] Missing event_name or event_id — skipping");
    return;
  }

  // Enrich with server-side signals
  const clientIp =
    (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    "";
  const userAgent = req.headers["user-agent"] || "";

  // Build custom_data when payment amount is present
  let custom_data;
  if (amount_paise) {
    custom_data = {
      value: parseFloat((amount_paise / 100).toFixed(2)),
      currency: "INR",
      content_ids: product_id ? [product_id] : undefined,
      content_type: "product",
    };
  } else if (product_id) {
    custom_data = {
      content_ids: [product_id],
      content_type: "product",
    };
  }

  await sendCapiEvent({
    event_name,
    event_id,
    event_source_url,
    user_data: {
      email:              customer.email      || undefined,
      phone:              customer.phone      || undefined,
      first_name:         customer.first_name || undefined,
      last_name:          customer.last_name  || undefined,
      dob:                customer.dob        || undefined,
      gender:             customer.gender     || undefined,
      client_ip_address:  clientIp            || undefined,
      client_user_agent:  userAgent           || undefined,
      fbp:                fbp                 || undefined,
      fbc:                fbc                 || undefined,
    },
    custom_data,
    test_event_code: process.env.META_TEST_EVENT_CODE,
  }).catch((err) => {
    console.error("[meta-events] sendCapiEvent error:", err.message);
  });
};
