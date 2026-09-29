// Vercel serverless function: GET /api/firestore-stats
// Returns document counts for a few Firestore collections. Only counts leave
// this function; no document contents are read or returned.
//
// Credentials: FIREBASE_SERVICE_ACCOUNT holds the full service account JSON as a string.

const { initializeApp, getApps, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const COLLECTIONS = ["checkins", "pick_feedback", "landmark_ratings"];

function db() {
  if (!getApps().length) {
    const account = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    // Tolerate a private_key stored with literal "\n" sequences.
    if (typeof account.private_key === "string") {
      account.private_key = account.private_key.replace(/\\n/g, "\n");
    }
    initializeApp({ credential: cert(account) });
  }
  return getFirestore();
}

module.exports = async function handler(req, res) {
  let firestore;
  try {
    if (!process.env.FIREBASE_SERVICE_ACCOUNT) throw new Error("FIREBASE_SERVICE_ACCOUNT is not set");
    firestore = db();
  } catch (err) {
    // Log the reason only; never echo credentials or parse output.
    console.error("[firestore-stats] init failed:", err.message);
    res.setHeader("Cache-Control", "public, s-maxage=60");
    return res.status(502).json({ error: "Firestore unavailable" });
  }

  const results = await Promise.allSettled(
    COLLECTIONS.map((name) => firestore.collection(name).count().get())
  );

  const counts = {};
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      counts[COLLECTIONS[i]] = r.value.data().count;
    } else {
      console.error(`[firestore-stats] ${COLLECTIONS[i]} failed:`, r.reason && r.reason.message);
      counts[COLLECTIONS[i]] = null;
    }
  });

  if (Object.values(counts).every((v) => v === null)) {
    res.setHeader("Cache-Control", "public, s-maxage=60");
    return res.status(502).json({ error: "Firestore unavailable" });
  }

  res.setHeader("Cache-Control", "public, s-maxage=900, stale-while-revalidate=600");
  res.status(200).json({ counts, updatedAt: new Date().toISOString() });
};
