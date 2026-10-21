// Vercel Routing Middleware: a password gate in front of the whole site
// (pages, files and /api routes). It is off until SITE_PASSWORD is set in
// Vercel. Visitors without the unlock cookie get a small password page; the
// right password sets an HttpOnly cookie for 30 days. Changing SITE_PASSWORD
// signs everyone out, because the cookie is derived from the password.
import { next } from "@vercel/functions";

// Plain (no-framework) Vercel projects run Routing Middleware on Node.js.
export const config = { runtime: "nodejs" };

const COOKIE = "haa_gate";
const MAX_AGE = 30 * 24 * 60 * 60;
const UNLOCK = "/__unlock";

async function token(password) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(password), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode("haa-gate-v1"));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Compares without stopping at the first difference.
function same(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function cookie(req, name) {
  const m = (req.headers.get("cookie") || "").match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)"));
  return m ? m[1] : null;
}

// Only same-site paths, so the form cannot send a visitor elsewhere.
function safeNext(v) {
  return typeof v === "string" && v.startsWith("/") && !v.startsWith("//") ? v : "/";
}

function page(wrong) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Landy Montiel | Portfolio</title>
<style>
*{box-sizing:border-box}html,body{height:100%}
body{margin:0;display:grid;place-items:center;padding:24px;color:#f7f8f8;font:16px/1.6 Inter,system-ui,-apple-system,"Segoe UI",sans-serif;
background:radial-gradient(60vmax 40vmax at 20% 20%,rgba(31,85,241,.35),transparent 60%),radial-gradient(50vmax 40vmax at 85% 30%,rgba(139,92,246,.3),transparent 60%),radial-gradient(50vmax 40vmax at 60% 95%,rgba(236,72,153,.22),transparent 60%),#07071a}
form{width:100%;max-width:380px;padding:28px;border-radius:20px;background:rgba(8,9,10,.72);border:1px solid rgba(255,255,255,.12);box-shadow:0 30px 80px rgba(0,0,0,.5)}
h1{margin:0 0 6px;font-size:28px;letter-spacing:-.04em;font-weight:600}
p{margin:0 0 18px;color:#aab0bb;font-size:14px}
label{display:block;font-size:13px;color:#d0d6e0;margin-bottom:6px}
input{width:100%;font:inherit;color:#fff;background:#101113;border:1px solid #34343a;border-radius:12px;padding:12px 14px;outline:none}
input:focus{border-color:#a5b4fc;box-shadow:0 0 0 3px rgba(165,180,252,.25)}
button{margin-top:14px;width:100%;font:600 15px Inter,system-ui,sans-serif;color:#08090a;background:#fff;border:0;border-radius:999px;padding:12px;cursor:pointer}
button:focus-visible{outline:2px solid #fff;outline-offset:3px}
.err{color:#fca5a5;font-size:13px;margin:10px 0 0}
</style></head><body>
<form method="post" action="${UNLOCK}">
<h1>Landy Montiel</h1>
<p>This portfolio is private. Enter the password to continue.</p>
<label for="pw">Password</label>
<input id="pw" name="password" type="password" autocomplete="current-password" required autofocus>
<input type="hidden" name="next" id="next" value="/">
<button type="submit">Continue</button>
${wrong ? '<p class="err" role="alert">That password is not right. Try again.</p>' : ""}
</form>
<script>document.getElementById("next").value = location.pathname + location.search + location.hash;</script>
</body></html>`;
  return new Response(html, {
    status: 401,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" },
  });
}

export default async function middleware(request) {
  const password = process.env.SITE_PASSWORD;
  const url = new URL(request.url);

  // Status check: says whether the gate runs and has a password, never the password.
  if (url.pathname === "/__gate") {
    return new Response(JSON.stringify({ middleware: true, passwordSet: Boolean(password) }), {
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }
  if (!password) return next(); // gate off

  const want = await token(password);

  if (url.pathname === UNLOCK && request.method === "POST") {
    let form;
    try { form = await request.formData(); } catch (_) { return page(true); }
    const dest = safeNext(form.get("next"));
    if (!same(await token(String(form.get("password") || "")), want)) return page(true);
    return new Response(null, {
      status: 303,
      headers: {
        location: dest,
        "cache-control": "no-store",
        "set-cookie": `${COOKIE}=${want}; Max-Age=${MAX_AGE}; Path=/; HttpOnly; Secure; SameSite=Lax`,
      },
    });
  }

  if (same(cookie(request, COOKIE), want)) return next();

  if (url.pathname.startsWith("/api/")) {
    return new Response(JSON.stringify({ error: "Password required." }), {
      status: 401,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }
  return page(false);
}
