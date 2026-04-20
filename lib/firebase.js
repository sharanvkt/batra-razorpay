const admin = require("firebase-admin");

let db = null;

if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    if (!admin.apps.length) {
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    }
    db = admin.firestore();
  } catch (err) {
    console.error("[firebase] Init failed:", err.message);
  }
} else {
  console.warn("[firebase] FIREBASE_SERVICE_ACCOUNT not set — writes disabled");
}

module.exports = { db };
