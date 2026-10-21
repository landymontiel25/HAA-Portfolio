// Edit mode. index.html loads this file when the Edit Mode switch (under the
// name) is first turned on, and drives it through window.HAAEdit.
// Edit mode makes every block of text with data-edit editable. Enter adds a
// new paragraph (or list item) below. Emptying a block removes it. Submit
// sends the changes to /api/edit, which commits them and the site redeploys.
(function () {
  var css = document.createElement("style");
  css.textContent = [
    ".edit-bar{position:fixed;right:1rem;bottom:1rem;z-index:50;display:flex;flex-wrap:wrap;align-items:center;gap:.5rem;max-width:calc(100vw - 2rem);padding:.6rem .75rem;background:var(--bg);border:1.5px solid var(--link);border-radius:8px;box-shadow:0 4px 18px rgba(0,0,0,.18);font-size:.9rem}",
    ".edit-bar button{font:inherit;font-weight:700;min-height:40px;padding:.4rem .9rem;border-radius:6px;border:1.5px solid var(--link);background:var(--link-bg);color:var(--link);cursor:pointer}",
    ".edit-bar button.primary{background:var(--link);color:var(--bg)}",
    ".edit-bar button:disabled{opacity:.5;cursor:default}",
    ".edit-bar .msg{color:var(--muted);max-width:22rem}",
    ".editing [data-edit],.editing [data-edit-new]{outline:1px dashed var(--link);outline-offset:3px;cursor:text}",
    ".editing [data-edit]:focus,.editing [data-edit-new]:focus{outline:2px solid var(--link)}",
    ".editing .edit-removed{opacity:.35;text-decoration:line-through}",
    ".edit-help{flex-basis:100%;color:var(--muted);font-size:.8rem}",
  ].join("");
  document.head.appendChild(css);

  var bar = document.createElement("div");
  bar.className = "edit-bar";
  bar.setAttribute("role", "region");
  bar.setAttribute("aria-label", "Edit mode");
  document.body.appendChild(bar);

  var original = new Map(); // element -> innerHTML when edit mode started
  var editing = false;
  var busy = false;
  var listeners = [];
  var hideTimer = null;
  function emit() { listeners.forEach(function (f) { f(editing); }); }

  function button(label, cls, fn) {
    var b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    if (cls) b.className = cls;
    b.addEventListener("click", fn);
    return b;
  }
  function msg(text) {
    var m = bar.querySelector(".msg");
    if (m) m.textContent = text;
  }

  function api(body) {
    return fetch("/api/edit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) {
          if (!r.ok) { var e = new Error(d.error || "Something went wrong (" + r.status + ")."); e.status = r.status; throw e; }
          return d;
        });
      });
  }

  // Text as it will be saved: no stray non-breaking or trailing spaces.
  function normalized(el) {
    return el.innerHTML.replace(/&nbsp;| /g, " ").replace(/<br>\s*$/, "").replace(/\s+/g, " ").trim();
  }
  function isEmpty(el) { return !el.textContent.replace(/ /g, " ").trim(); }

  function collect() {
    var changes = {}, added = {}, removed = [];
    var anchor = null; // the last existing block before a new one, in page order
    document.querySelectorAll("[data-edit],[data-edit-new]").forEach(function (el) {
      var key = el.getAttribute("data-edit");
      if (key) {
        anchor = key;
        if (isEmpty(el)) removed.push(key);
        else if (normalized(el) !== original.get(el)) changes[key] = normalized(el);
      } else if (anchor && !isEmpty(el)) {
        (added[anchor] = added[anchor] || []).push({ tag: el.tagName.toLowerCase(), html: normalized(el) });
      }
    });
    return { changes: changes, added: added, removed: removed };
  }
  function count(c) {
    var n = Object.keys(c.changes).length + c.removed.length;
    Object.keys(c.added).forEach(function (k) { n += c.added[k].length; });
    return n;
  }
  function refresh() {
    if (!editing || busy) return;
    var n = count(collect());
    bar.querySelector(".primary").disabled = n === 0;
    msg(n ? n + (n === 1 ? " change" : " changes") + " not submitted yet." : "Click any text to change it.");
    document.querySelectorAll("[data-edit]").forEach(function (el) { el.classList.toggle("edit-removed", isEmpty(el)); });
  }

  function makeEditable(el) {
    el.contentEditable = "true";
    el.spellcheck = true;
  }

  function onKey(e) {
    var el = e.target.closest && e.target.closest("[data-edit],[data-edit-new]");
    if (!el || !editing) return;
    if (e.key === "Enter" && !e.shiftKey) {
      // Enter starts a new paragraph (or list item) below; headings get a paragraph.
      e.preventDefault();
      var tag = el.tagName === "LI" ? "li" : el.tagName === "P" ? "p" : (el.tagName === "H2" || el.tagName === "H3") ? "p" : null;
      if (!tag) return;
      var fresh = document.createElement(tag);
      fresh.setAttribute("data-edit-new", "");
      makeEditable(fresh);
      el.after(fresh);
      fresh.focus();
      refresh();
    } else if (e.key === "Backspace" && el.hasAttribute("data-edit-new") && isEmpty(el)) {
      e.preventDefault();
      var prev = el.previousElementSibling;
      el.remove();
      if (prev && prev.isContentEditable) {
        prev.focus();
        var r = document.createRange(); r.selectNodeContents(prev); r.collapse(false);
        var s = getSelection(); s.removeAllRanges(); s.addRange(r);
      }
      refresh();
    }
  }
  function onPaste(e) {
    if (!editing || !(e.target.closest && e.target.closest("[data-edit],[data-edit-new]"))) return;
    e.preventDefault();
    var text = (e.clipboardData || window.clipboardData).getData("text/plain").replace(/\s+/g, " ");
    document.execCommand("insertText", false, text);
  }
  function onClick(e) {
    // Links inside text are for editing, not following, while in edit mode.
    if (editing && e.target.closest("[data-edit] a,[data-edit-new] a")) e.preventDefault();
  }
  function onLeave(e) {
    if (editing && count(collect())) { e.preventDefault(); e.returnValue = ""; }
  }

  function start() {
    editing = true;
    original.clear();
    document.querySelectorAll("[data-edit]").forEach(function (el) {
      original.set(el, normalized(el));
      makeEditable(el);
    });
    document.body.classList.add("editing");
    showEditing();
    refresh();
    emit();
  }
  function stop(restore) {
    editing = false;
    document.querySelectorAll("[data-edit-new]").forEach(function (el) {
      if (restore) el.remove();
      else el.removeAttribute("contenteditable");
    });
    document.querySelectorAll("[data-edit]").forEach(function (el) {
      if (restore && original.has(el)) el.innerHTML = original.get(el);
      el.removeAttribute("contenteditable");
      el.classList.remove("edit-removed");
    });
    document.body.classList.remove("editing");
    showIdle();
    emit();
  }

  function enter() {
    if (!editing) start();
  }
  // Turning the switch off: unsubmitted changes are thrown away only after asking.
  function exit() {
    if (!editing || busy) return emit();
    if (count(collect()) && !window.confirm("Throw away your changes?")) return emit();
    stop(true);
  }

  function submit() {
    var c = collect();
    var n = count(c);
    if (!n) return;
    if (c.removed.length && !window.confirm(c.removed.length + (c.removed.length === 1 ? " block is" : " blocks are") + " empty and will be removed from the page. Submit anyway?")) return;
    busy = true;
    bar.querySelectorAll("button").forEach(function (b) { b.disabled = true; });
    msg("Submitting…");
    api(Object.assign({ action: "submit" }, c))
      .then(function () {
        busy = false;
        document.querySelectorAll("[data-edit]").forEach(function (el) { if (isEmpty(el)) el.remove(); });
        stop(false);
        showIdle("Submitted. The page updates for everyone in about a minute.");
      })
      .catch(function (e) {
        busy = false;
        bar.querySelectorAll("button").forEach(function (b) { b.disabled = false; });
        msg(e.message);
      });
  }

  // Out of edit mode the bar is hidden, or briefly shows a message.
  function showIdle(text) {
    clearTimeout(hideTimer);
    bar.replaceChildren();
    bar.hidden = !text;
    if (!text) return;
    var m = document.createElement("span"); m.className = "msg"; m.textContent = text; bar.appendChild(m);
    bar.appendChild(button("OK", "", function () { showIdle(); }));
    if (!/…$/.test(text)) hideTimer = setTimeout(function () { if (!editing) showIdle(); }, 10000);
  }
  function showEditing() {
    clearTimeout(hideTimer);
    bar.hidden = false;
    bar.replaceChildren(
      button("Submit", "primary", submit),
      button("Cancel", "", exit)
    );
    var m = document.createElement("span"); m.className = "msg"; bar.appendChild(m);
    var help = document.createElement("span"); help.className = "edit-help";
    help.textContent = "Enter adds a paragraph below. Ctrl/⌘+B bold, Ctrl/⌘+I italic. Empty a block to remove it.";
    bar.appendChild(help);
  }

  document.addEventListener("keydown", onKey);
  document.addEventListener("paste", onPaste);
  document.addEventListener("input", refresh);
  document.addEventListener("click", onClick, true);
  window.addEventListener("beforeunload", onLeave);
  showIdle();

  window.HAAEdit = {
    enter: enter,
    exit: exit,
    isOn: function () { return editing; },
    onChange: function (f) { listeners.push(f); },
  };
})();
