/**
 * PRODUCT CATALOG — SERVER SIDE ONLY
 *
 * This is the single config file for all funnels.
 * Each product has its own price, thank-you path, and Pabbly webhook.
 *
 * To add a new funnel:
 *   1. Add a new entry below
 *   2. git push — done. No other files need to change.
 *
 * Amounts are in paise (1 INR = 100 paise)
 *   Rs.499  -> 49900
 *   Rs.599  -> 59900
 *   Rs.999  -> 99900
 *   Rs.1999 -> 199900
 */

const CATALOG = {

  "numerology-basic": {
    name:           "Numerology Basic Report",
    description:    "Personal numerology reading - core numbers",
    amount:         49900,           // Rs.499
    currency:       "INR",
    thankyou_path:  "/thank-you/",
    pabbly_webhook: "https://connect.pabbly.com/workflow/REPLACE_WITH_YOUR_URL",
  },

  "numerology-pro": {
    name:           "Numerology Pro Report",
    description:    "Full numerology analysis with yearly forecast",
    amount:         99900,           // Rs.999
    currency:       "INR",
    thankyou_path:  "/thank-you/",
    pabbly_webhook: "https://connect.pabbly.com/workflow/REPLACE_WITH_YOUR_URL",
  },

  "numerology-vip": {
    name:           "Numerology VIP Consultation",
    description:    "90-min live consultation + full written report",
    amount:         199900,          // Rs.1999
    currency:       "INR",
    thankyou_path:  "/thank-you/",
    pabbly_webhook: "https://connect.pabbly.com/workflow/REPLACE_WITH_YOUR_URL",
  },

  "lucky-yantra-2026": {
    name:           "Lucky Yantra Predictions 2026",
    description:    "Your personalised 2026 Yantra report",
    amount:         59900,           // Rs.599
    currency:       "INR",
    thankyou_path:  "/thank-you-yantra/",
    pabbly_webhook: "https://connect.pabbly.com/workflow/REPLACE_WITH_YOUR_URL",
  },

};

/**
 * Returns the product object for a given ID, or null if not found.
 * @param {string} productId
 * @returns {object|null}
 */
function getProduct(productId) {
  if (!productId || typeof productId !== "string") return null;
  const safe = productId.replace(/[^a-z0-9-]/gi, "").toLowerCase();
  return CATALOG[safe] || null;
}

module.exports = { getProduct };