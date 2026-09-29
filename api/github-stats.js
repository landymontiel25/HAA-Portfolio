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
  if (!res.ok) throw new Error(`GitHub ${res.status} for ${path}`);
  return res;
}

// With per_page=1, the last page number in the Link header equals the total count.
async function countAndEnds(path) {
  const sep = path.includes("?") ? "&" : "?";
  const res = await gh(`${path}${sep}per_page=1`);
  const first = await res.json();
  if (!first.length) return { count: 0, first: null, lastPage: null };
  const link = res.headers.get("link") || "";
  const m = link.match(/[?&]page=(\d+)>; rel="last"/);
  const count = m ? Number(m[1]) : first.length;
  return { count, newest: first[0], lastUrl: m ? link.match(/<([^>]+)>; rel="last"/)[1] : null };
}

async function searchCount(q) {
  const res = await gh(`/search/issues?q=${encodeURIComponent(q)}&per_page=1`);
  return (await res.json()).total_count;
}

module.exports = async function handler(req, res) {
  try {
    const base = `/repos/${OWNER}/${REPO}`;
    const [commits, deployments, open, merged] = await Promise.all([
      countAndEnds(`${base}/commits`),
      countAndEnds(`${base}/deployments`),
      searchCount(`repo:${OWNER}/${REPO} type:pr is:open`),
      searchCount(`repo:${OWNER}/${REPO} type:pr is:merged`),
    ]);

    let firstCommitDate = null;
    if (commits.count > 0) {
      const oldest = commits.lastUrl
        ? await (await fetch(commits.lastUrl, { headers: headers() })).json()
        : [commits.newest];
      firstCommitDate = oldest[0]?.commit?.author?.date ?? null;
    }

    res.setHeader("Cache-Control", "public, s-maxage=900, stale-while-revalidate=600");
    res.status(200).json({
      repo: `${OWNER}/${REPO}`,
      commits: {
        count: commits.count,
        firstDate: firstCommitDate,
        lastDate: commits.newest?.commit?.author?.date ?? null,
      },
      deployments: deployments.count,
      pullRequests: { open, merged },
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    res.setHeader("Cache-Control", "public, s-maxage=60");
    res.status(502).json({ error: "Could not reach GitHub" });
  }
};
