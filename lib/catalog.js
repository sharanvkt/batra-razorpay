/**
 * PRODUCT CATALOG — SERVER SIDE ONLY
 *
 * This file never reaches the browser.
 * Amounts are in paise (1 INR = 100 paise).
 *   ₹499  → 49900
 *   ₹999  → 99900
 *   ₹1999 → 199900
 *
 * To add a product:
 *   1. Add an entry below with a unique snake-case key.
 *   2. git push → Vercel redeploys automatically.
 *
 * The key here must exactly match data-product-id on the WordPress button.
 */

const CATALOG = {
  "numerology-basic": {
    name: "Numerology Basic Report",
    description: "Personal numerology reading — core numbers",
    amount: 49900,        // ₹499
    currency: "INR",
    thankyou_path: "/thank-you/",
  },
  "numerology-pro": {
    name: "Numerology Pro Report",
    description: "Full numerology analysis with yearly forecast",
    amount: 99900,        // ₹999
    currency: "INR",
    thankyou_path: "/thank-you/",
  },
  "numerology-vip": {
    name: "Numerology VIP Consultation",
    description: "90-min live consultation + full written report",
    amount: 199900,       // ₹1,999
    currency: "INR",
    thankyou_path: "/thank-you/",
  },
};

/**
 * Returns the product object for a given ID, or null if not found.
 * Input is sanitised — only alphanumeric + hyphens are allowed.
 * @param {string} productId
 * @returns {object|null}
 */
function getProduct(productId) {
  if (!productId || typeof productId !== "string") return null;
  const safe = productId.replace(/[^a-z0-9-]/gi, "").toLowerCase();
  return CATALOG[safe] || null;
}

module.exports = { getProduct };
