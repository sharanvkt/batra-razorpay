/**
 * CORS HELPER
 *
 * Allows requests from both Batra Numerology domains.
 * All Vercel API functions call setCors(req, res) before any logic.
 *
 * In production, requests from any other origin get a 403.
 * In local dev (no ALLOWED_ORIGINS env var) all origins are allowed
 * so you can test from localhost or a staging URL.
 */

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : [
      "https://thebatraanumerology.org",
      "https://www.thebatraanumerology.org",
      "https://thebatraanumerology.in",
      "https://www.thebatraanumerology.in",
    ];

/**
 * Sets CORS headers and handles preflight OPTIONS requests.
 * Returns true if the request was a preflight (caller should return early).
 *
 * @param {import('@vercel/node').VercelRequest} req
 * @param {import('@vercel/node').VercelResponse} res
 * @returns {boolean} true if this was a preflight request
 */
function setCors(req, res) {
  const origin = req.headers.origin || "";
  const isDev = process.env.NODE_ENV !== "production";

  if (isDev || ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
  } else {
    // Origin not allowed — do not set the ACAO header.
    // The browser will block the request.
  }

  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400"); // cache preflight 24h

  // Handle preflight
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true;
  }

  return false;
}

module.exports = { setCors };
