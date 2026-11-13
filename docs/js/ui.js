// Petits utilitaires d'interface : échappement, icônes, dates, modales, toasts, mini-markdown.

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ---------- Icônes (traits 24x24) ----------
const P = {
  map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  chat: '<path d="M4 5h16v11H9l-5 4V5z"/>',
  book: '<path d="M4 4h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4V4zM20 4h-5a2 2 0 0 0-2 2"/><path d="M20 4v14h-6"/>',
  poll: '<path d="M5 20V10M12 20V4M19 20v-7"/>',
  box: '<path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7M12 11v10"/>',
  agenda: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  logout: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  pinned: '<path d="M9 4h6l-1 6 4 3H6l4-3-1-6zM12 13v8"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  unlock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>',
  siren: '<path d="M6 18v-5a6 6 0 0 1 12 0v5M4 18h16v3H4zM12 3v2M4.2 6.2l1.4 1.4M19.8 6.2l-1.4 1.4"/>',
  mega: '<path d="M3 10v4h4l7 5V5L7 10H3zM18 8a5 5 0 0 1 0 8"/>',
  alert: '<path d="M12 3 2 20h20L12 3zM12 10v4M12 17v.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4l2-2zM10 21h4"/>',
  chevL: '<path d="M15 5l-7 7 7 7"/>', chevR: '<path d="M9 5l7 7-7 7"/>', chevD: '<path d="M5 9l7 7 7-7"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5 13 13l-4.5 2.5L11 11z"/>',
  rotate: '<path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"/>',
  cube: '<path d="M12 2l9 5v10l-9 5-9-5V7l9-5z"/><path d="M12 22V12M3 7l9 5 9-5"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
  send: '<path d="M4 12l16-8-6 16-3-7-7-1z"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M4 20h16"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/>',
  heart: '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>',
  fist: '<path d="M7 11V7.5a1.5 1.5 0 0 1 3 0V11M10 10V6.5a1.5 1.5 0 0 1 3 0V10M13 10V7a1.5 1.5 0 0 1 3 0v4"/><path d="M16 9.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-1a5 5 0 0 1-5-5v-3.5a1.5 1.5 0 0 1 3 0"/>',
  more: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
  walk: '<circle cx="13" cy="4" r="2"/><path d="M10 21l2-6 3 3v3M8 12l2-4 4 1 2 3h3M10 8l-2 6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/>',
};
export const icon = (name, cls = "") => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${P[name] || P.info}</svg>`;

// ---------- Dates ----------
const fmtCache = {};
const F = (opts) => (fmtCache[JSON.stringify(opts)] ||= new Intl.DateTimeFormat("fr-FR", opts));
export const fmtTime = (d) => F({ hour: "2-digit", minute: "2-digit" }).format(new Date(d));
export const fmtDay = (d) => F({ weekday: "long", day: "numeric", month: "long" }).format(new Date(d));
export const fmtDayShort = (d) => F({ weekday: "short", day: "numeric" }).format(new Date(d));
export const fmtDate = (d) => F({ day: "numeric", month: "short" }).format(new Date(d));
export const fmtDateTime = (d) => F({ weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(d));
export function ago(d) {
  const s = Math.max(0, (Date.now() - new Date(d)) / 1000);
  if (s < 50) return "à l'instant";
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  return `le ${fmtDate(d)}`;
}
export const sameDay = (a, b) => { a = new Date(a); b = new Date(b); return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); };
export function startOfWeek(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); const wd = (x.getDay() + 6) % 7; x.setDate(x.getDate() - wd); return x; }
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const toDateInput = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; };
export const hhmm = (mins) => `${String(Math.floor(mins / 60) % 24).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;

// ---------- Mini markdown (sûr : on échappe d'abord) ----------
function inline(s) {
  return s
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])_(.+?)_(?=[\s.,;:!?)]|$)/g, "$1<em>$2</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/(^|\s)@([A-Za-z0-9_.-]{3,20})/g, '$1<span class="mention">@$2</span>');
}
export function md(text) {
  const lines = esc(text).split("\n");
  let out = "", list = null;
  const close = () => { if (list) { out += `</${list}>`; list = null; } };
  for (const raw of lines) {
    const l = raw.trimEnd();
    let m;
    if ((m = l.match(/^#{2,3}\s+(.*)/))) { close(); out += `<h3>${inline(m[1])}</h3>`; }
    else if ((m = l.match(/^\s*[-•]\s+(.*)/))) { if (list !== "ul") { close(); out += "<ul>"; list = "ul"; } out += `<li>${inline(m[1])}</li>`; }
    else if ((m = l.match(/^\s*\d+[.)]\s+(.*)/))) { if (list !== "ol") { close(); out += "<ol>"; list = "ol"; } out += `<li>${inline(m[1])}</li>`; }
    else if (!l.trim()) { close(); }
    else { close(); out += `<p>${inline(l)}</p>`; }
  }
  close();
  return out;
}
export const mdInline = (text) => inline(esc(text)).replace(/\n/g, "<br>");

// ---------- Toasts ----------
export function toast(msg, kind = "info", opts = {}) {
  const box = $("#toasts");
  const el = document.createElement("div");
  el.className = `toast toast-${kind}`;
  el.setAttribute("role", kind === "error" || kind === "alert" ? "alert" : "status");
  el.innerHTML = `${icon(kind === "error" ? "alert" : kind === "ok" ? "check" : kind === "alert" ? "siren" : "info")}<div>${opts.title ? `<strong>${esc(opts.title)}</strong>` : ""}<span>${esc(msg)}</span></div><button class="icon-btn" aria-label="Fermer">${icon("x")}</button>`;
  el.querySelector("button").onclick = () => el.remove();
  if (opts.onClick) { el.style.cursor = "pointer"; el.addEventListener("click", (e) => { if (!e.target.closest("button")) { opts.onClick(); el.remove(); } }); }
  box.appendChild(el);
  setTimeout(() => el.classList.add("out"), (opts.duration || (kind === "alert" ? 9000 : 4200)));
  setTimeout(() => el.remove(), (opts.duration || (kind === "alert" ? 9000 : 4200)) + 400);
}
export const errToast = (e) => { console.error(e); toast(e?.message || String(e), "error"); };

// ---------- Modale ----------
let modalClose = null;
export function openModal({ title, body, wide = false, onMount, className = "" }) {
  const dlg = $("#modal");
  if (dlg.open) { const prev = modalClose; modalClose = null; dlg.close(); prev && prev(); }
  dlg.className = `modal ${wide ? "wide" : ""} ${className}`;
  dlg.innerHTML = `<div class="modal-head"><h2 id="modal-title">${title}</h2><button class="icon-btn" data-close aria-label="Fermer">${icon("x")}</button></div><div class="modal-body">${body}</div>`;
  dlg.setAttribute("aria-labelledby", "modal-title");
  dlg.querySelector("[data-close]").onclick = () => closeModal();
  dlg.onclick = (e) => { if (e.target === dlg) closeModal(); };
  dlg.showModal();
  onMount && onMount(dlg);
  const first = dlg.querySelector("input:not([type=hidden]):not([disabled]), select, textarea");
  if (first && window.matchMedia("(pointer:fine)").matches) first.focus();
  return new Promise((res) => { modalClose = res; dlg.onclose = () => { if (dlg.open) return; const f = modalClose; modalClose = null; f && f(); }; });
}
export function closeModal() { const d = $("#modal"); if (d.open) d.close(); }
export function confirmDialog(message, { ok = "Confirmer", danger = false } = {}) {
  return new Promise((res) => {
    let answered = false;
    openModal({
      title: "Confirmation",
      body: `<p class="confirm-msg">${esc(message)}</p><div class="form-actions"><button class="btn ghost" data-no>Annuler</button><button class="btn ${danger ? "danger" : "primary"}" data-yes>${esc(ok)}</button></div>`,
      onMount: (d) => {
        d.querySelector("[data-no]").onclick = () => { answered = true; res(false); closeModal(); };
        d.querySelector("[data-yes]").onclick = () => { answered = true; res(true); closeModal(); };
        d.querySelector("[data-yes]").focus();
      },
    }).then(() => { if (!answered) res(false); });
  });
}

// ---------- Divers ----------
export const initials = (p) => (p || "?").replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase() || "?";
export function avatar(profile, size = "") {
  const p = profile || { pseudo: "?", color: "#555" };
  return `<span class="avatar ${size}" style="--c:${esc(p.color || "#666")}" aria-hidden="true">${esc(initials(p.pseudo))}</span>`;
}
export function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
export function downloadText(filename, text, mime = "text/csv") {
  try {
    const url = URL.createObjectURL(new Blob(["﻿" + text], { type: mime + ";charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch (e) { errToast(e); }
}
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast("Copié dans le presse-papier", "ok"); }
  catch { toast("Copie impossible ici", "error"); }
}
export const csv = (rows) => rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
