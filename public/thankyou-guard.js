/**
 * public/thankyou-guard.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Add this script to your WordPress thank-you page ONLY.
 * It prevents direct URL access (bookmarks, sharing) from bypassing the paywall.
 *
 * HOW TO ADD TO WORDPRESS:
 *   Method A (Custom HTML block on the thank-you page):
 *     <script src="https://your-project.vercel.app/thankyou-guard.js"></script>
 *
 *   Method B (functions.php — only on the thank-you page):
 *     add_action('wp_footer', function() {
 *       if (is_page('thank-you')) {
 *         echo '<script src="https://your-project.vercel.app/thankyou-guard.js"></script>';
 *       }
 *     });
 *
 * HOW IT WORKS:
 *   The verify-payment endpoint appends ?ref=order_xxx to the redirect URL.
 *   This script checks for that param + verifies the order actually paid.
 *   Direct visitors (no ref param) are sent back to the homepage.
 */

(function () {
  "use strict";

  const VERCEL_BASE_URL = "https://your-project.vercel.app"; // ← UPDATE THIS
  const REDIRECT_ON_FAIL = "https://thebatraanumerology.org/"; // ← homepage
  const GRACE_PERIOD_MS = 5 * 60 * 1000; // 5 minutes — for slow redirects

  // Hide page content immediately while we verify
  document.documentElement.style.visibility = "hidden";

  async function guardThankYouPage() {
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get("ref");
    const isRecovered = params.get("recovered") === "1";

    // ── No ref param → definitely not a valid redirect ────────────────────
    if (!orderId) {
      redirectAway("No payment reference found.");
      return;
    }

    // ── Validate order_id format (must look like a Razorpay order ID) ─────
    if (!/^order_[a-zA-Z0-9]+$/.test(orderId)) {
      redirectAway("Invalid payment reference.");
      return;
    }

    // ── Check sessionStorage for the payment breadcrumb ───────────────────
    // This was set by base.js when the popup was opened.
    let pending = null;
    try {
      const raw = sessionStorage.getItem("rzp_pending_order");
      if (raw) pending = JSON.parse(raw);
    } catch { /* ignore */ }

    // If we have a recent breadcrumb for this order — trust it (fast path)
    if (pending?.order_id === orderId && Date.now() - pending.created_at < GRACE_PERIOD_MS) {
      sessionStorage.removeItem("rzp_pending_order");
      showPage();
      return;
    }

    // ── No local breadcrumb → verify with server (recovered flow) ─────────
    // This handles the browser-crash recovery case where the user was
    // redirected by recoverPendingOrder() in base.js.
    try {
      const response = await fetch(
        `${VERCEL_BASE_URL}/api/check-order?order_id=${encodeURIComponent(orderId)}`
      );

      if (!response.ok) throw new Error("Server error");
      const data = await response.json();

      if (data.status === "paid") {
        showPage();
      } else {
        redirectAway(`Order status: ${data.status}`);
      }
    } catch (err) {
      // If the check itself fails (network error), show the page anyway.
      // The webhook has already recorded the payment — this is just a guard.
      // A false-positive (showing page to non-payer) is better than a
      // false-negative (blocking a real customer who just paid).
      console.warn("[thankyou-guard] Verification check failed, showing page:", err);
      showPage();
    }
  }

  function showPage() {
    document.documentElement.style.visibility = "";
  }

  function redirectAway(reason) {
    console.warn("[thankyou-guard] Redirecting away:", reason);
    window.location.replace(REDIRECT_ON_FAIL);
  }

  guardThankYouPage();
})();
