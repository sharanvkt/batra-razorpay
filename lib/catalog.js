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
  "lucky-yantra-fb": {
    name: "Lucky Yantra Report FB",
    description: "Lucky Yantra Report FB",
    amount: 100, // Rs.1
    currency: "INR",
    thankyou_path: "/lucky-yantra-predictions-report-ty-fb/",
    pabbly_webhook:
      "https://connect.pabbly.com/workflow/sendwebhookdata/IjU3NjcwNTZjMDYzNjA0M2M1MjY5NTUzNzUxMzQi_pc",
  },

  "mobile-numerology-webinar-fb": {
    name: "Mobile Numerology Webinar FB L1",
    description: "Full numerology analysis with yearly forecast",
    amount: 9900, // Rs.99
    currency: "INR",
    thankyou_path: "/mobile-numerology-webinar-ty-fb-rzp/",
    pabbly_webhook:
      "https://connect.pabbly.com/workflow/sendwebhookdata/IjU3NjcwNTZlMDYzNzA0MzM1MjZiNTUzNTUxMzMi_pc",
  },
  "mobile-numerology-webinar-mnw-fb": {
    name: "Mobile Numerology Webinar MNW FB",
    description: "Full numerology analysis with yearly forecast",
    amount: 9900, // Rs.99
    currency: "INR",
    thankyou_path: "/mobile-numerology-webinar-ty-fb-rzp/",
    pabbly_webhook:
      "https://connect.pabbly.com/workflow/sendwebhookdata/IjU3NjcwNTZlMDYzNzA0MzM1MjZiNTUzNTUxMzMi_pc",
  },

  "mobile-numerology-webinar-fb-v3": {
    name: "Mobile Numerology Webinar FB V3 L1",
    description: "Full numerology analysis with yearly forecast",
    amount: 9900, // Rs.99
    currency: "INR",
    thankyou_path: "/mobile-numerology-webinar-ty-fb-rzp/",
    pabbly_webhook:
      "https://connect.pabbly.com/workflow/sendwebhookdata/IjU3NjcwNTZlMDYzNzA0MzM1MjZiNTUzNTUxMzMi_pc",
  },

  "mobile-numerology-webinar-fb-v2": {
    name: "Mobile Numerology Webinar FB V2 L1",
    description: "Full numerology analysis with yearly forecast",
    amount: 9900, // Rs.99
    currency: "INR",
    thankyou_path: "/mobile-numerology-webinar-ty-fb-rzp/",
    pabbly_webhook:
      "https://connect.pabbly.com/workflow/sendwebhookdata/IjU3NjcwNTZlMDYzNzA0MzM1MjZiNTUzNTUxMzMi_pc",
  },

  "mnw-golden-l2": {
    name: "Mobile Numerology Golden Package",
    description: "Wealth Mastery through Mobile Numerology",
    amount: 100, // Rs.5999
    currency: "INR",
    thankyou_path: "https://hi.switchy.io/bnd",
    pabbly_webhook:
      "https://connect.pabbly.com/workflow/sendwebhookdata/IjU3NjYwNTY0MDYzNjA0MzY1MjZhNTUzNDUxMzYi_pc",
  },

  "lucky-yantra-2026": {
    name: "Lucky Yantra Predictions 2026",
    description: "Your personalised 2026 Yantra report",
    amount: 59900, // Rs.599
    currency: "INR",
    thankyou_path: "/thank-you-yantra/",
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
