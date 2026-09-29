// Vercel serverless function: GET /api/github-stats
// Reads live repo numbers from the GitHub API using a token kept in the
// GITHUB_TOKEN environment variable. Responses are cached at Vercel's edge.

const OWNER = "landymontiel25";
const REPO = "Landmark-Hunters";
const API = "https://api.github.com";

function headers() {
  const h = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "haa-portfolio",
  };
  if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

async function gh(path) {
  const res = await fetch(`${API}${path}`, { headers: headers() });
  if (!res.ok) {
    let detail = "";
    try { detail = (await res.json()).message || ""; } catch (_) {}
    throw new Error(`GitHub ${res.status} for ${path.split("?")[0]}: ${detail}`);
  }
  return res;
}

// With per_page=1, the last page number in the Link header equals the total count.
async function countAndEnds(path) {
  const sep = path.includes("?") ? "&" : "?";
  const res = await gh(`${path}${sep}per_page=1`);
  const first = await res.json();
  if (!first.length) return { count: 0, newest: null, lastUrl: null };
  const link = res.headers.get("link") || "";
  const m = link.match(/[?&]page=(\d+)>; rel="last"/);
  const count = m ? Number(m[1]) : first.length;
  return { count, newest: first[0], lastUrl: m ? link.match(/<([^>]+)>; rel="last"/)[1] : null };
}

async function searchCount(q) {
  const res = await gh(`/search/issues?q=${encodeURIComponent(q)}&per_page=1`);
  return (await res.json()).total_count;
}

// Log why a call failed (visible in Vercel's function logs) and return null so
// the other numbers can still render.
function settle(name, result) {
  if (result.status === "fulfilled") return result.value;
  console.error(`[github-stats] ${name} failed (token set: ${Boolean(process.env.GITHUB_TOKEN)}):`, result.reason.message);
  return null;
}

module.exports = async function handler(req, res) {
  try {
    const base = `/repos/${OWNER}/${REPO}`;
    const results = await Promise.allSettled([
      countAndEnds(`${base}/commits`),
      countAndEnds(`${base}/deployments`),
      searchCount(`repo:${OWNER}/${REPO} type:pr is:open`),
      searchCount(`repo:${OWNER}/${REPO} type:pr is:merged`),
    ]);
    const commits = settle("commits", results[0]);
    const deployments = settle("deployments", results[1]);
    const open = settle("pulls-open", results[2]);
    const merged = settle("pulls-merged", results[3]);

    if (results.every((r) => r.status === "rejected")) {
      res.setHeader("Cache-Control", "public, s-maxage=60");
      return res.status(502).json({ error: "Could not reach GitHub" });
    }

    let firstCommitDate = null;
    if (commits && commits.count > 0) {
      try {
        const r = commits.lastUrl ? await fetch(commits.lastUrl, { headers: headers() }) : null;
        if (r && !r.ok) throw new Error(`GitHub ${r.status} for oldest commit`);
        const oldest = r ? await r.json() : [commits.newest];
        firstCommitDate = oldest[0]?.commit?.author?.date ?? null;
      } catch (err) {
        console.error("[github-stats] oldest commit failed:", err.message);
      }
    }

    res.setHeader("Cache-Control", "public, s-maxage=900, stale-while-revalidate=600");
    res.status(200).json({
      repo: `${OWNER}/${REPO}`,
      commits: commits && {
        count: commits.count,
        firstDate: firstCommitDate,
        lastDate: commits.newest?.commit?.author?.date ?? null,
      },
      deployments: deployments && deployments.count,
      pullRequests: open === null || merged === null ? null : { open, merged },
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[github-stats] unexpected:", err);
    res.setHeader("Cache-Control", "public, s-maxage=60");
    res.status(500).json({ error: "Unexpected error" });
  }
};
