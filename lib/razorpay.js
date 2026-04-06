/**
 * RAZORPAY SDK INSTANCE — shared singleton
 *
 * Initialised once per cold start. Vercel re-uses the same
 * execution context across warm invocations, so this is
 * effectively a module-level singleton.
 *
 * KEY_ID is the public key (safe to log).
 * KEY_SECRET is the private key — NEVER log or return to client.
 */

const Razorpay = require("razorpay");

if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
  throw new Error(
    "Missing RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET environment variables. " +
      "Set them in Vercel → Project Settings → Environment Variables."
  );
}

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

module.exports = razorpay;
