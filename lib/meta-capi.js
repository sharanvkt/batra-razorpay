/**
 * lib/meta-capi.js
 *
 * Meta Conversions API client.
 * Normalizes + SHA-256 hashes PII, sends server events to Meta Graph API.
 *
 * IMPORTANT: Never throw — CAPI failure must never break the payment flow.
 * Callers should .catch() but this module also swallows internally.
 */

const crypto = require("crypto");

const GRAPH_API_VERSION = "v19.0";
const GRAPH_API_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

// -------------------------------------------------------
// Main export
// -------------------------------------------------------

/**
 * @param {object} params
 * @param {string} params.event_name        - "PageView" | "InitiateCheckout" | "AddToCart" | "Purchase"
 * @param {string} params.event_id          - deterministic dedup ID
 * @param {string} [params.event_source_url]- full page URL
 * @param {object} [params.user_data]       - raw (unhashed) customer fields
 * @param {object} [params.custom_data]     - value, currency, content_ids, content_type
 * @param {string} [params.test_event_code] - for Meta Test Events tool only
 */
async function sendCapiEvent(params) {
  const pixelId = process.env.META_PIXEL_ID;
  const accessToken = process.env.META_CAPI_ACCESS_TOKEN;

  if (!pixelId || !accessToken || accessToken === "PLACEHOLDER") {
    console.log("[meta-capi] Skipping — token not configured");
    return;
  }

  const { event_name, event_id, event_source_url, user_data = {}, custom_data, test_event_code } = params;

  const hashedUserData = buildUserData(user_data);

  const serverEvent = stripUndefined({
    event_name,
    event_time: Math.floor(Date.now() / 1000),
    event_id,
    event_source_url,
    action_source: "website",
    user_data: hashedUserData,
    custom_data: custom_data ? stripUndefined(custom_data) : undefined,
  });

  const body = stripUndefined({
    data: [serverEvent],
    test_event_code,
  });

  try {
    const url = `${GRAPH_API_URL}/${pixelId}/events?access_token=${accessToken}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error(`[meta-capi] ${event_name} failed:`, JSON.stringify(json));
    } else {
      console.log(`[meta-capi] ${event_name} sent | event_id: ${event_id} | events_received: ${json.events_received}`);
    }
  } catch (err) {
    console.error(`[meta-capi] ${event_name} network error:`, err.message);
  }
}

module.exports = { sendCapiEvent };

// -------------------------------------------------------
// Build hashed user_data object
// -------------------------------------------------------

function buildUserData(raw) {
  const ud = {};

  // Hashed PII
  if (raw.email)      ud.em  = hashField(normalizeEmail(raw.email));
  if (raw.phone)      ud.ph  = hashField(normalizePhone(raw.phone));
  if (raw.first_name) ud.fn  = hashField(raw.first_name.toLowerCase().trim());
  if (raw.last_name)  ud.ln  = hashField(raw.last_name.toLowerCase().trim());
  if (raw.dob)        ud.db  = hashField(normalizeDob(raw.dob));
  if (raw.gender)     ud.ge  = hashField(normalizeGender(raw.gender));

  // NOT hashed — passed raw
  if (raw.client_ip_address) ud.client_ip_address = raw.client_ip_address;
  if (raw.client_user_agent) ud.client_user_agent = raw.client_user_agent;
  if (raw.fbp)               ud.fbp = raw.fbp;
  if (raw.fbc)               ud.fbc = raw.fbc;

  return ud;
}

// -------------------------------------------------------
// Normalization helpers
// -------------------------------------------------------

function normalizeEmail(v) {
  return v.toLowerCase().trim();
}

function normalizePhone(v) {
  // Strip everything except digits
  let digits = v.replace(/\D/g, "");
  // Remove leading zeros
  digits = digits.replace(/^0+/, "");
  // Prepend country code 91 (India) if not already present
  if (!digits.startsWith("91") || digits.length <= 10) {
    // If 10 digits, it's a bare Indian number — prepend 91
    if (digits.length === 10) digits = "91" + digits;
  }
  return digits;
}

function normalizeDob(v) {
  // Accepts DD/MM/YYYY or YYYY-MM-DD or YYYYMMDD
  if (!v) return "";
  // DD/MM/YYYY → YYYYMMDD
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(v)) {
    const [d, m, y] = v.split("/");
    return y + m + d;
  }
  // YYYY-MM-DD → YYYYMMDD
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    return v.replace(/-/g, "");
  }
  // Already YYYYMMDD
  if (/^\d{8}$/.test(v)) return v;
  return v; // pass through unknown formats
}

function normalizeGender(v) {
  const lower = v.toLowerCase().trim();
  return lower.startsWith("m") ? "m" : "f";
}

// -------------------------------------------------------
// Utilities
// -------------------------------------------------------

function hashField(value) {
  if (!value) return undefined;
  return crypto.createHash("sha256").update(value).digest("hex");
}

function stripUndefined(obj) {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== "")
  );
}
