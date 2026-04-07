/**
 * base.js - Razorpay checkout for The Batra Numerology
 * 
 * PLUG AND PLAY — load this script once globally on any WordPress page.
 * Zero per-page JS configuration needed.
 *
 * HOW TO USE ON ANY PAGE:
 *
 *   Step 1 — Add a trigger button anywhere:
 *     <button class="form-cta" data-product-id="numerology-basic">
 *       Buy Now
 *     </button>
 *
 *   Step 2 — Make sure your modal HTML is on the page (copy from template).
 *
 *   That's it. data-product-id is the only thing that changes per funnel.
 *
 * FLOW:
 *   form-cta click
 *     -> stores product_id
 *     -> opens modal form
 *   Form submit
 *     -> POST /api/create-order { product_id, customer }
 *     -> server looks up price + pabbly_webhook from catalog
 *     -> opens Razorpay popup (prefilled with customer data)
 *   Payment success
 *     -> POST /api/verify-payment
 *     -> redirect to thank-you page with all data in URL params
 *   Webhook (server-to-server, async)
 *     -> fires product-specific Pabbly webhook
 */

(function () {
  "use strict";

  var VERCEL_BASE_URL       = "https://batra-razorpay.vercel.app";
  var RAZORPAY_CHECKOUT_URL = "https://checkout.razorpay.com/v1/checkout.js";
  var PENDING_ORDER_KEY     = "rzp_pending_order";

  // Active product_id — set when a form-cta button is clicked
  var activeProductId   = null;
  var activeRedirectUrl = null;

  // Boot — safe for both early and late (footer) script loading
  function boot() {
    hookFormCtaButtons();
    hookModalForm();
    recoverCrashedPayment();

    // PageView — fires once on load (no dedup needed)
    var pvId = "pv-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6);
    trackEvent("PageView", pvId, {});
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  // -------------------------------------------------------
  // STEP 1: form-cta buttons open the modal
  // Reads data-product-id from the clicked button.
  // data-redirect-url is optional — falls back to /thank-you/
  // -------------------------------------------------------
  function hookFormCtaButtons() {
    // Use event delegation — works even if buttons are added dynamically
    document.addEventListener("click", function (e) {
      var btn = e.target.closest(".form-cta");
      if (!btn) return;

      e.preventDefault();

      activeProductId   = btn.getAttribute("data-product-id") || "";
      activeRedirectUrl = btn.getAttribute("data-redirect-url") || "/thank-you/";

      if (!activeProductId) {
        console.error("[rzp] .form-cta button is missing data-product-id");
        return;
      }

      // InitiateCheckout — CTA clicked (no dedup needed)
      var icId = "ic-" + activeProductId + "-" + Date.now();
      trackEvent("InitiateCheckout", icId, { content_ids: [activeProductId] }, { product_id: activeProductId });

      // Open the modal (your existing modal logic)
      var modal = document.getElementById("leadFormModal");
      if (modal) {
        modal.classList.add("active");
        document.body.style.overflow = "hidden";
        // Trigger your existing resetForm if available
        if (typeof resetForm === "function") resetForm();
      } else {
        console.error("[rzp] #leadFormModal not found on this page");
      }
    });
  }

  // -------------------------------------------------------
  // STEP 2: Modal form submit -> create order -> open popup
  // Hooks into the existing form without breaking its
  // validation logic (step navigation, error messages etc).
  // -------------------------------------------------------
  function hookModalForm() {
    var form = document.getElementById("leadForm");
    if (!form) return;

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      e.stopImmediatePropagation(); // prevent other submit handlers firing twice

      // Run validation from the existing script by checking for errors
      // The existing script shows .error-message.show on invalid fields
      var hasErrors = form.querySelector(".error-message.show");
      if (hasErrors) return;

      // Collect customer data from the form
      var customer = {
        first_name: getVal("firstName"),
        last_name:  getVal("lastName"),
        email:      getVal("email"),
        phone:      getVal("phone"),
        dob:        getVal("dob"),
        gender:     getVal("gender"),
      };

      // Validate required customer fields exist
      if (!customer.first_name || !customer.email || !customer.phone) {
        console.error("[rzp] Missing required customer fields");
        return;
      }

      // Show loading on submit button
      var submitBtn = document.getElementById("submitBtn");
      if (submitBtn) submitBtn.classList.add("loading");

      // Close modal
      var modal = document.getElementById("leadFormModal");
      if (modal) {
        modal.classList.remove("active");
        document.body.style.overflow = "";
      }

      // Start payment with the product_id from the clicked form-cta button
      startPayment(activeProductId, customer, activeRedirectUrl, submitBtn);
    });
  }

  // -------------------------------------------------------
  // CORE: POST to create-order then open Razorpay popup
  // -------------------------------------------------------
  function startPayment(productId, customer, redirectUrl, triggerEl) {
    if (!productId) {
      console.error("[rzp] No product_id set. Did you click a .form-cta button?");
      if (triggerEl) triggerEl.classList.remove("loading");
      return;
    }

    fetchJson(VERCEL_BASE_URL + "/api/create-order", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ product_id: productId, customer: customer }),
    })
      .then(function (orderData) {
        // AddToCart — order created, order_id available for dedup
        var atcId = "atc-" + orderData.order_id;
        trackEvent(
          "AddToCart",
          atcId,
          { value: orderData.amount / 100, currency: "INR", content_ids: [productId] },
          { product_id: productId, amount_paise: orderData.amount, customer: customer }
        );

        return loadRazorpayScript().then(function () {
          openCheckout(orderData, redirectUrl, triggerEl);
        });
      })
      .catch(function (err) {
        console.error("[rzp] create-order failed:", err);
        if (triggerEl) triggerEl.classList.remove("loading");
        alert("Could not start payment. Please try again.");
      });
  }

  // -------------------------------------------------------
  // RAZORPAY POPUP
  // -------------------------------------------------------
  function openCheckout(orderData, redirectUrl, triggerEl) {
    sessionStorage.setItem(
      PENDING_ORDER_KEY,
      JSON.stringify({
        order_id:     orderData.order_id,
        redirect_url: redirectUrl,
        ts:           Date.now(),
      })
    );

    var rzp = new window.Razorpay({
      key:         orderData.key_id,
      amount:      orderData.amount,
      currency:    orderData.currency,
      name:        "The Batra Numerology",
      description: orderData.description,
      order_id:    orderData.order_id,

      // Prefilled from form data — improves conversion
      prefill: {
        name:    orderData.customer ? orderData.customer.name    : "",
        email:   orderData.customer ? orderData.customer.email   : "",
        contact: orderData.customer ? orderData.customer.contact : "",
      },

      theme: { color: "#B8860B" },

      handler: function (paymentResponse) {
        // Purchase browser fbq — CAPI fires from webhook.js (server-authoritative)
        var purchId = "purch-" + paymentResponse.razorpay_order_id;
        if (typeof fbq !== "undefined") {
          fbq("track", "Purchase",
            { value: orderData.amount / 100, currency: orderData.currency || "INR",
              content_ids: [orderData.order_id] },
            { eventID: purchId }
          );
        }

        verifyAndRedirect(paymentResponse, redirectUrl, triggerEl);
      },

      modal: {
        ondismiss: function () {
          sessionStorage.removeItem(PENDING_ORDER_KEY);
          if (triggerEl) triggerEl.classList.remove("loading");
        },
        escape:    true,
        animation: true,
      },
    });

    rzp.on("payment.failed", function (response) {
      sessionStorage.removeItem(PENDING_ORDER_KEY);
      if (triggerEl) triggerEl.classList.remove("loading");
      alert("Payment failed: " + (response.error.description || "Please try again."));
    });

    rzp.open();
  }

  // -------------------------------------------------------
  // VERIFY + REDIRECT TO TY PAGE WITH ALL PARAMS
  // -------------------------------------------------------
  function verifyAndRedirect(paymentResponse, redirectUrl, triggerEl) {
    fetchJson(VERCEL_BASE_URL + "/api/verify-payment", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        razorpay_payment_id: paymentResponse.razorpay_payment_id,
        razorpay_order_id:   paymentResponse.razorpay_order_id,
        razorpay_signature:  paymentResponse.razorpay_signature,
      }),
    })
      .then(function (data) {
        sessionStorage.removeItem(PENDING_ORDER_KEY);
        // redirect_url from server contains all customer + payment params
        window.location.href = data.redirect_url || redirectUrl;
      })
      .catch(function (err) {
        console.error("[rzp] verify-payment failed:", err);
        if (triggerEl) triggerEl.classList.remove("loading");
        sessionStorage.removeItem(PENDING_ORDER_KEY);
        alert("Payment received but verification failed. Please contact us with your payment ID.");
      });
  }

  // -------------------------------------------------------
  // CRASH RECOVERY
  // -------------------------------------------------------
  function recoverCrashedPayment() {
    var raw = sessionStorage.getItem(PENDING_ORDER_KEY);
    if (!raw) return;

    var pending;
    try { pending = JSON.parse(raw); } catch (e) {
      sessionStorage.removeItem(PENDING_ORDER_KEY);
      return;
    }

    // Ignore entries older than 1 hour
    if (!pending.order_id || Date.now() - pending.ts > 3600000) {
      sessionStorage.removeItem(PENDING_ORDER_KEY);
      return;
    }

    fetchJson(
      VERCEL_BASE_URL + "/api/check-order?order_id=" +
        encodeURIComponent(pending.order_id)
    )
      .then(function (data) {
        if (data.status === "paid") {
          sessionStorage.removeItem(PENDING_ORDER_KEY);
          window.location.href =
            (pending.redirect_url || "/thank-you/") +
            "?ref=" + pending.order_id + "&recovered=1";
        } else {
          sessionStorage.removeItem(PENDING_ORDER_KEY);
        }
      })
      .catch(function () { /* try again next load */ });
  }

  // -------------------------------------------------------
  // META CAPI HELPERS
  // -------------------------------------------------------

  function getCookie(name) {
    var match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
    return match ? match[2] : null;
  }

  // Fire browser fbq event AND CAPI proxy in parallel (fire-and-forget)
  function trackEvent(eventName, eventId, fbqData, capiExtra) {
    if (typeof fbq !== "undefined") {
      fbq("track", eventName, fbqData || {}, { eventID: eventId });
    }
    var payload = Object.assign(
      {
        event_name:       eventName,
        event_id:         eventId,
        event_source_url: window.location.href,
        fbp:              getCookie("_fbp"),
        fbc:              getCookie("_fbc"),
      },
      capiExtra || {}
    );
    fetch(VERCEL_BASE_URL + "/api/meta-events", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    }).catch(function () {});
  }

  // -------------------------------------------------------
  // UTILITIES
  // -------------------------------------------------------

  function loadRazorpayScript() {
    return new Promise(function (resolve, reject) {
      if (window.Razorpay) { resolve(); return; }
      var s    = document.createElement("script");
      s.src    = RAZORPAY_CHECKOUT_URL;
      s.onload = resolve;
      s.onerror = function () { reject(new Error("Failed to load Razorpay script")); };
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

  function getVal(id) {
    var el = document.getElementById(id);
    return el ? el.value.trim() : "";
  }

})();