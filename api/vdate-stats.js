// Vercel serverless function: GET /api/vdate-stats
// Reads VDate's public counts (https://vdate-livid.vercel.app/api/public-stats)
// and passes on only the fields this site shows. VDate answers only requests
// that carry this site's Origin, so the request sets it.
//
// VDate recounts once its copy is 15 minutes old, so a count older than 20
// minutes means VDate stopped updating: the route answers 502 and the page
// shows "n/a". Vercel then caches this response for up to 15 minutes, and the
// page itself refuses counts older than 40 minutes.

const SOURCE = "https://vdate-livid.vercel.app/api/public-stats";
const ORIGIN = "https://haa-portfolio-three.vercel.app";
const TIMEOUT_MS = 8000;
const MAX_AGE_MS = 20 * 60 * 1000;

const COUNTS = [
  "real_accounts",
  "finished_profiles",
  "active_accounts_last_24_hours",
  "accounts_active_on_2_plus_days",
  "crush_lists_created",
  "likes_sent",
  "mutual_matches",
  "conversations_with_reply",
];

const count = (v) => (Number.isInteger(v) && v >= 0 ? v : null);

function perDay(list) {
  if (!Array.isArray(list)) return null;
  return list
    .filter((d) => d && /^\d{4}-\d{2}-\d{2}$/.test(d.date) && count(d.count) != null)
    .map((d) => ({ date: d.date, count: d.count }));
}

function fail(res, status, error) {
  res.setHeader("Cache-Control", "public, s-maxage=60");
  return res.status(status).json({ error });
}

module.exports = async function handler(req, res) {
  let data;
  try {
    const r = await fetch(SOURCE, { headers: { Origin: ORIGIN, Accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!r.ok) throw new Error(`VDate ${r.status}`);
    data = await r.json();
  } catch (err) {
    console.error("[vdate-stats] fetch failed:", err.message);
    return fail(res, 502, "VDate unavailable");
  }

  const updated = Date.parse(data && data.updated_at);
  if (!Number.isFinite(updated)) {
    console.error("[vdate-stats] response has no valid updated_at");
    return fail(res, 502, "VDate unavailable");
  }
  if (Date.now() - updated > MAX_AGE_MS) {
    console.error("[vdate-stats] counts are stale:", data.updated_at);
    return fail(res, 502, "VDate counts are out of date");
  }

  const out = { updatedAt: new Date(updated).toISOString(), timezone: typeof data.timezone === "string" ? data.timezone : null };
  for (const k of COUNTS) out[k] = count(data[k]);
  out.new_accounts_per_day = perDay(data.new_accounts_per_day);

  // No stale-while-revalidate: an expired copy is never served as live.
  res.setHeader("Cache-Control", "public, s-maxage=900");
  res.status(200).json(out);
};
