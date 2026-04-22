/**
 * POST /api/create-order
 *
 * Accepts product_id + customer details.
 * Looks up price AND pabbly_webhook from server catalog.
 * Stores everything in Razorpay order notes so the webhook
 * handler can read them without any extra DB lookup.
 *
 * Request body:
 *   {
 *     "product_id": "numerology-basic",
 *     "customer": {
 *       "first_name": "Rahul",
 *       "last_name":  "Sharma",
 *       "email":      "rahul@example.com",
 *       "phone":      "9876543210",
 *       "dob":        "15/08/1990",
 *       "gender":     "Male"
 *     }
 *   }
 *
 * SECURITY: Amount and pabbly_webhook always come from server
 * catalog — never from the browser request.
 */

const { setCors } = require("../lib/cors");
const { getProduct } = require("../lib/catalog");
const razorpay = require("../lib/razorpay");

module.exports = async function handler(req, res) {
  if (setCors(req, res)) return;

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { product_id, customer = {}, utm_params } = req.body || {};

  if (!product_id) {
    return res.status(400).json({ error: "product_id is required" });
  }

  // Price + pabbly_webhook from server catalog — never from browser
  const product = getProduct(product_id);
  if (!product) {
    return res.status(400).json({ error: "Invalid product" });
  }

  const sanitise = (val) =>
    typeof val === "string" ? val.replace(/<[^>]*>/g, "").slice(0, 200) : "";

  // Sanitise all incoming customer fields dynamically
  const c = {};
  Object.keys(customer).forEach((key) => {
    const val = sanitise(customer[key]);
    if (key === "phone") {
      c.phone = val.replace(/\D/g, "").slice(0, 10);
    } else if (val) {
      c[key] = val;
    }
  });

  // Compose display name: full_name wins, else join first_name + last_name
  const fullName =
    c.full_name ||
    [c.first_name, c.last_name].filter(Boolean).join(" ") ||
    "";

  let order;
  try {
    order = await razorpay.orders.create({
      amount: product.amount,
      currency: product.currency,
      receipt: `rcpt_${Date.now()}`,
      notes: (function () {
        const n = {
          product_id,
          product_name: product.name,
          customer_name: fullName,
          customer_email: c.email || "",
          customer_phone: c.phone || "",
        };

        // Store extra customer fields as customer_<fieldname>
        // Skip fields already stored above and name-composition fields
        const skip = new Set(["email", "phone", "full_name", "first_name", "last_name"]);
        Object.keys(c).forEach((key) => {
          if (!skip.has(key) && c[key] && Object.keys(n).length < 14) {
            n["customer_" + key] = c[key];
          }
        });

        if (utm_params && typeof utm_params === "string" && Object.keys(n).length < 15) {
          n.utm_params = utm_params.replace(/<[^>]*>/g, "").slice(0, 500);
        }

        return n;
      })(),
    });
  } catch (err) {
    console.error("[create-order] Razorpay error:", err?.error || err);
    return res
      .status(502)
      .json({ error: "Could not create payment order. Please try again." });
  }

  return res.status(200).json({
    order_id: order.id,
    key_id: process.env.RAZORPAY_KEY_ID,
    amount: order.amount,
    currency: order.currency,
    product_name: product.name,
    description: product.description,
    // Return customer data for Razorpay popup prefill
    customer: {
      name: fullName,
      email: c.email,
      contact: c.phone ? "+91" + c.phone : "",
    },
  });
};
