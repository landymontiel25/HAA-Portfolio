// Vercel serverless function: POST /api/edit
// The site's edit mode (edit.js) sends text changes here. The route checks the
// password, applies the changes to index.html on GitHub and commits to main,
// and Vercel redeploys the site (about a minute).
//
//   { password, action: "check" }                       -> { ok: true }
//   { password, action: "submit", changes, added, removed }
//     changes  { key: html }                 new text for a block (data-edit="key")
//     added    { key: [{ tag, html }, ...] }  new blocks to insert after block `key`
//     removed  [key, ...]                     blocks to delete
//
// Env: EDIT_PASSWORD (the password) and GITHUB_EDIT_TOKEN (a token that can
// write this repo's contents). Only text and simple inline formatting are
// accepted; anything else is refused, so an edit cannot break the page.

const crypto = require("crypto");
const { parse, parseFragment, serialize } = require("parse5");

const OWNER = "landymontiel25";
const REPO = "HAA-Portfolio";
const FILE = "index.html";
const BRANCH = "main";
const API = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE}`;

const INLINE = new Set(["strong", "em", "b", "i", "a", "code", "br"]);
const NEW_BLOCK = new Set(["p", "li"]);
const MAX_BLOCKS = 300;
const MAX_HTML = 20000;

const sha = (s) => crypto.createHash("sha256").update(String(s)).digest();
function passwordOk(given) {
  const want = process.env.EDIT_PASSWORD;
  if (!want || typeof given !== "string" || !given) return false;
  return crypto.timingSafeEqual(sha(given), sha(want));
}

class BadEdit extends Error {}

// Keeps text and simple inline tags; refuses anything else.
function cleanInline(html) {
  if (typeof html !== "string" || html.length > MAX_HTML) throw new BadEdit("A block is too long.");
  const frag = parseFragment(html);
  (function walk(n) {
    for (const c of n.childNodes || []) {
      if (c.nodeName === "#comment") throw new BadEdit("Comments are not allowed.");
      if (!c.tagName) continue;
      if (!INLINE.has(c.tagName)) throw new BadEdit(`<${c.tagName}> is not allowed in text.`);
      if (c.tagName === "a") {
        const href = (c.attrs.find((a) => a.name === "href") || {}).value || "";
        if (!/^(https?:|mailto:|#)/i.test(href)) throw new BadEdit("Links must start with http, https, mailto or #.");
        c.attrs = [{ name: "href", value: href }];
      } else c.attrs = [];
      walk(c);
    }
  })(frag);
  const out = serialize(frag).replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  if (!out) throw new BadEdit("A block cannot be empty.");
  return out;
}

// Every data-edit block in the page, with where it sits in the source.
function blocks(source) {
  const found = new Map();
  (function walk(n) {
    for (const c of n.childNodes || []) {
      if (!c.tagName) continue;
      const key = (c.attrs.find((a) => a.name === "data-edit") || {}).value;
      if (key) {
        const loc = c.sourceCodeLocation;
        found.set(key, { tag: c.tagName, start: loc.startOffset, end: loc.endOffset, innerStart: loc.startTag.endOffset, innerEnd: loc.endTag.startOffset });
      } else walk(c);
    }
  })(parse(source, { sourceCodeLocationInfo: true }));
  return found;
}

// Applies the edit to the page source. Pure, so it can be tested.
function applyEdit(source, { changes = {}, added = {}, removed = [] }) {
  const found = blocks(source);
  const keys = new Set([...Object.keys(changes), ...Object.keys(added), ...removed]);
  if (!keys.size) throw new BadEdit("Nothing to submit.");
  if (keys.size > MAX_BLOCKS) throw new BadEdit("Too many changes at once.");
  for (const k of keys) if (!found.has(k)) throw new BadEdit(`The page no longer has block ${k}. Reload and try again.`);
  let next = Math.max(0, ...[...found.keys()].map((k) => Number(String(k).replace(/^t/, "")) || 0)) + 1;
  const ops = [];
  for (const k of keys) {
    const b = found.get(k);
    const lineStart = source.lastIndexOf("\n", b.start) + 1;
    const indent = /^[ \t]*$/.test(source.slice(lineStart, b.start)) ? source.slice(lineStart, b.start) : "";
    let text = "";
    if (!removed.includes(k)) {
      const inner = k in changes ? cleanInline(changes[k]) : source.slice(b.innerStart, b.innerEnd);
      text = source.slice(b.start, b.innerStart) + inner + source.slice(b.innerEnd, b.end);
    }
    for (const a of added[k] || []) {
      if (!a || !NEW_BLOCK.has(a.tag)) throw new BadEdit("New blocks can only be paragraphs or list items.");
      if (a.tag === "li" && b.tag !== "li") throw new BadEdit("A list item can only follow a list item.");
      const el = `<${a.tag} data-edit="t${next++}">${cleanInline(a.html)}</${a.tag}>`;
      text += text ? `\n${indent}${el}` : el;
    }
    // A removed block with nothing after it takes its line with it.
    let start = b.start;
    if (!text && indent) start = lineStart - 1;
    ops.push({ start, end: b.end, text });
  }
  ops.sort((a, b) => b.start - a.start);
  let out = source;
  for (const o of ops) out = out.slice(0, o.start) + o.text + out.slice(o.end);
  return out;
}

async function github(method, url, body) {
  const r = await fetch(url, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "haa-portfolio-edit",
      Authorization: `Bearer ${process.env.GITHUB_EDIT_TOKEN}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await r.json(); } catch (_) {}
  return { status: r.status, ok: r.ok, data };
}

async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });
  const body = req.body || {};
  if (!process.env.EDIT_PASSWORD || !process.env.GITHUB_EDIT_TOKEN) {
    console.error("[edit] EDIT_PASSWORD or GITHUB_EDIT_TOKEN is not set");
    return res.status(503).json({ error: "Edit mode is not set up on the server yet." });
  }
  if (!passwordOk(body.password)) return res.status(401).json({ error: "Wrong password." });
  if (body.action === "check") return res.status(200).json({ ok: true });
  if (body.action !== "submit") return res.status(400).json({ error: "Unknown action." });

  const current = await github("GET", `${API}?ref=${BRANCH}`);
  if (!current.ok) {
    console.error("[edit] read failed:", current.status, current.data && current.data.message);
    return res.status(502).json({ error: "Could not read the page from GitHub." });
  }
  let page;
  try {
    page = applyEdit(Buffer.from(current.data.content, "base64").toString("utf8"), body);
  } catch (err) {
    if (err instanceof BadEdit) return res.status(400).json({ error: err.message });
    throw err;
  }
  const saved = await github("PUT", API, {
    message: "Edit page text from the site's edit mode",
    content: Buffer.from(page, "utf8").toString("base64"),
    sha: current.data.sha,
    branch: BRANCH,
  });
  if (saved.status === 409 || saved.status === 422) return res.status(409).json({ error: "The page changed while you were editing. Reload and try again." });
  if (!saved.ok) {
    console.error("[edit] commit failed:", saved.status, saved.data && saved.data.message);
    return res.status(502).json({ error: "Could not save to GitHub." });
  }
  return res.status(200).json({ ok: true, commit: saved.data.commit && saved.data.commit.html_url });
}

module.exports = handler;
module.exports.applyEdit = applyEdit;
module.exports.cleanInline = cleanInline;
