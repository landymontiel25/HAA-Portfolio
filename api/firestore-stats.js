// Vercel serverless function: GET /api/firestore-stats
// Returns document counts for a few Firestore collections. Only counts leave
// this function; no document contents are read or returned.
//
// Credentials: FIREBASE_SERVICE_ACCOUNT holds the full service account JSON as a string.
//
// When it fails, the reply says why ("reason"), so the owner can check it in
// a browser: not_set, not_json, missing_fields, or query_failed with the
// Firestore error code. The reply never contains the key itself.

const { initializeApp, getApps, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const COLLECTIONS = ["checkins", "pick_feedback", "landmark_ratings"];
const TIMEOUT_MS = 8000;

class Setup extends Error {
  constructor(reason, project) { super(reason); this.reason = reason; this.project = project; }
}

function account() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Setup("not_set");
  let a;
  try { a = JSON.parse(raw); } catch (_) { throw new Setup("not_json"); }
  if (!a || !a.private_key || !a.client_email || !a.project_id) throw new Setup("missing_fields", a && a.project_id);
  return a;
}

function db() {
  if (!getApps().length) {
    const account = module.exports.account();
    // Tolerate a private_key stored with literal "\n" sequences.
    if (typeof account.private_key === "string") {
      account.private_key = account.private_key.replace(/\\n/g, "\n");
    }
    initializeApp({ credential: cert(account) });
  }
  return getFirestore();
}

module.exports = async function handler(req, res) {
  let firestore, project = null;
  try {
    project = account().project_id;
    firestore = db();
  } catch (err) {
    // The reason and project id only; never the key or the raw value.
    const reason = err instanceof Setup ? err.reason : "init_failed";
    console.error("[firestore-stats] init failed:", reason, err instanceof Setup ? "" : err.message);
    res.setHeader("Cache-Control", "no-store");
    return res.status(502).json({ error: "Firestore unavailable", reason, project: err.project || project });
  }

  const timeout = () => new Promise((_, no) => setTimeout(() => no(Object.assign(new Error("timeout"), { code: "timeout" })), TIMEOUT_MS));
  const results = await Promise.allSettled(
    COLLECTIONS.map((name) => Promise.race([firestore.collection(name).count().get(), timeout()]))
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
    const codes = [...new Set(results.map((r) => r.reason && (r.reason.code ?? r.reason.message)).filter(Boolean).map(String))];
    res.setHeader("Cache-Control", "no-store");
    return res.status(502).json({ error: "Firestore unavailable", reason: "query_failed", codes, project });
  }

  res.setHeader("Cache-Control", "public, s-maxage=900, stale-while-revalidate=600");
  res.status(200).json({ counts, updatedAt: new Date().toISOString() });
};
module.exports.account = account;
