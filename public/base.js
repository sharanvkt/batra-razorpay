/**
 * base.js - Razorpay checkout for The Batra Numerology
 *
 * Load once globally. Activates on any page that has a button
 * with the [data-razorpay-product] attribute. Zero per-page config.
 *
 * BUTTON MARKUP:
 *
 *   <button
 *     data-razorpay-product
 *     data-product-id="numerology-basic"
 *     data-redirect-url="https://thebatraanumerology.org/thank-you/"
 *     class="rzp-buy-btn"
 *   >
 *     Buy Basic Report - Rs.499
 *   </button>
 *
 * Required attributes:
 *   data-razorpay-product  -- presence flag, no value needed
 *   data-product-id        -- must match a key in lib/catalog.js
 *   data-redirect-url      -- where to send the user after payment
 */

(function () {
  "use strict";

  // CONFIGURATION
  // Your Vercel deployment URL - no trailing slash
  var VERCEL_BASE_URL = "https://batra-razorpay.vercel.app";

  var RAZORPAY_CHECKOUT_URL = "https://checkout.razorpay.com/v1/checkout.js";
  var PENDING_ORDER_KEY = "rzp_pending_order";

  // BOOT
  // Handles both cases:
  //   1. Script loads early (before DOM ready) -> wait for DOMContentLoaded
  //   2. Script loads late via WordPress footer -> DOM already ready, run now
  function boot() {
    initButtons();
    recoverCrashedPayment();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  // BUTTON INITIALISATION
  function initButtons() {
    var buttons = document.querySelectorAll("[data-razorpay-product]");
    if (!buttons.length) return;

    buttons.forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        handleBuyClick(btn);
      });
    });
  }

  // CLICK HANDLER
  function handleBuyClick(btn) {
    var productId = btn.getAttribute("data-product-id");
    var redirectUrl = btn.getAttribute("data-redirect-url");

    if (!productId) {
      showError(btn, "Configuration error: data-product-id is missing.");
      return;
    }

    setLoading(btn, true);

    fetchJson(VERCEL_BASE_URL + "/api/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_id: productId }),
    })
      .then(function (orderData) {
        return loadRazorpayScript().then(function () {
          openCheckout(btn, orderData, redirectUrl);
        });
      })
      .catch(function (err) {
        console.error("[rzp] create-order failed:", err);
        setLoading(btn, false);
        showError(btn, "Could not start payment. Please try again.");
      });
  }

  // OPEN RAZORPAY POPUP
  function openCheckout(btn, orderData, redirectUrl) {
    sessionStorage.setItem(
      PENDING_ORDER_KEY,
      JSON.stringify({
        order_id: orderData.order_id,
        redirect_url: redirectUrl,
        ts: Date.now(),
      }),
    );

    var rzp = new window.Razorpay({
      key: orderData.key_id,
      amount: orderData.amount,
      currency: orderData.currency,
      name: "The Batra Numerology",
      description: orderData.description,
      order_id: orderData.order_id,

      handler: function (paymentResponse) {
        verifyAndRedirect(btn, paymentResponse, redirectUrl);
      },

      prefill: {
        name: "",
        email: "",
        contact: "",
      },

      theme: { color: "#B8860B" },

      modal: {
        ondismiss: function () {
          sessionStorage.removeItem(PENDING_ORDER_KEY);
          setLoading(btn, false);
        },
        escape: true,
        animation: true,
      },
    });

    rzp.on("payment.failed", function (response) {
      sessionStorage.removeItem(PENDING_ORDER_KEY);
      setLoading(btn, false);
      showError(
        btn,
        "Payment failed: " +
          (response.error.description || "Please try again."),
      );
    });

    rzp.open();
  }

  // SERVER-SIDE VERIFICATION + REDIRECT
  function verifyAndRedirect(btn, paymentResponse, redirectUrl) {
    fetchJson(VERCEL_BASE_URL + "/api/verify-payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        razorpay_payment_id: paymentResponse.razorpay_payment_id,
        razorpay_order_id: paymentResponse.razorpay_order_id,
        razorpay_signature: paymentResponse.razorpay_signature,
      }),
    })
      .then(function (data) {
        sessionStorage.removeItem(PENDING_ORDER_KEY);
        window.location.href = data.redirect_url || redirectUrl;
      })
      .catch(function (err) {
        console.error("[rzp] verify-payment failed:", err);
        setLoading(btn, false);
        sessionStorage.removeItem(PENDING_ORDER_KEY);
        showError(
          btn,
          "Payment received but verification failed. Please contact us with your payment ID.",
        );
      });
  }

  // CRASH RECOVERY
  function recoverCrashedPayment() {
    var raw = sessionStorage.getItem(PENDING_ORDER_KEY);
    if (!raw) return;

    var pending;
    try {
      pending = JSON.parse(raw);
    } catch (e) {
      sessionStorage.removeItem(PENDING_ORDER_KEY);
      return;
    }

    if (!pending.order_id || Date.now() - pending.ts > 3600000) {
      sessionStorage.removeItem(PENDING_ORDER_KEY);
      return;
    }

    fetchJson(
      VERCEL_BASE_URL +
        "/api/check-order?order_id=" +
        encodeURIComponent(pending.order_id),
    )
      .then(function (data) {
        if (data.status === "paid") {
          sessionStorage.removeItem(PENDING_ORDER_KEY);
          window.location.href =
            (pending.redirect_url || "/thank-you/") +
            "?ref=" +
            pending.order_id +
            "&recovered=1";
        } else {
          sessionStorage.removeItem(PENDING_ORDER_KEY);
        }
      })
      .catch(function () {
        /* Network error - try again next page load */
      });
  }

  // UTILITIES

  function loadRazorpayScript() {
    return new Promise(function (resolve, reject) {
      if (window.Razorpay) {
        resolve();
        return;
      }
      var s = document.createElement("script");
      s.src = RAZORPAY_CHECKOUT_URL;
      s.onload = resolve;
      s.onerror = function () {
        reject(new Error("Razorpay script failed to load"));
      };
      document.head.appendChild(s);
    });
  }

  function fetchJson(url, options) {
    return fetch(url, options).then(function (res) {
      if (!res.ok) {
        return res.json().then(function (body) {
          throw new Error(body.error || "HTTP " + res.status);
        });
      }
      return res.json();
    });
  }

  function setLoading(btn, isLoading) {
    btn.disabled = isLoading;
    if (isLoading) {
      btn._originalText = btn.textContent;
      btn.textContent = "Please wait...";
    } else {
      btn.textContent = btn._originalText || btn.textContent;
    }
  }

  function showError(btn, message) {
    var existing = btn.parentNode.querySelector(".rzp-error-msg");
    if (existing) existing.remove();

    var p = document.createElement("p");
    p.className = "rzp-error-msg";
    p.style.cssText =
      "color:#c0392b;font-size:14px;margin:8px 0 0;font-weight:500;";
    p.textContent = message;
    btn.parentNode.insertBefore(p, btn.nextSibling);

    setTimeout(function () {
      if (p.parentNode) p.remove();
    }, 8000);
  }
})();
