import { S, isMod, prof, pseudoOf, emit, logAction } from "../state.js";
import { ROLES } from "../defaults.js";
import { loadMessages } from "../data.js";
import { esc, icon, fmtTime, fmtDay, sameDay, mdInline, openModal, closeModal, toast, errToast, confirmDialog, avatar, $ } from "../ui.js";

let current = null;
let lastSent = 0;
const LS_CH = "cel_chan";

export const currentChannel = () => (location.hash === "#chat" ? current : null);

export function renderChat(view) {
  view.classList.add("full");
  if (!current || !S.channels.some((c) => c.id === current)) {
    let saved = null; try { saved = Number(localStorage.getItem(LS_CH)); } catch { }
    current = (S.channels.find((c) => c.id === saved) || S.channels.find((c) => c.slug === "general") || S.channels[0])?.id ?? null;
  }
  view.innerHTML = `<div class="chat">
    <aside class="chat-side" aria-label="Salons"><h2>Salons ${isMod() ? `<button class="icon-btn sm" data-new-chan aria-label="Nouveau salon">${icon("plus")}</button>` : ""}</h2><div id="chan-list"></div></aside>
    <section class="chat-main">
      <div class="chan-strip" id="chan-strip"></div>
      <header class="chat-head" id="chat-head"></header>
      <div id="pinned"></div>
      <div class="msgs" id="msgs" role="log" aria-live="polite" aria-label="Messages"></div>
      <div class="composer" id="composer"></div>
    </section></div>`;
  const nc = view.querySelector("[data-new-chan]"); if (nc) nc.onclick = () => channelModal();
  renderChannels();
  selectChannel(current);
}

function renderChannels() {
  const item = (c) => `<button class="chan" data-ch="${c.id}" aria-current="${c.id === current}"><span class="hash">${c.admin_only ? icon("mega") : "#"}</span>${esc(c.name)}${S.unread[c.id] ? `<span class="unread">${S.unread[c.id]}</span>` : ""}</button>`;
  const list = S.channels.map(item).join("");
  if ($("#chan-list")) $("#chan-list").innerHTML = list;
  if ($("#chan-strip")) $("#chan-strip").innerHTML = list;
  document.querySelectorAll("[data-ch]").forEach((b) => (b.onclick = () => selectChannel(Number(b.dataset.ch))));
}

async function selectChannel(id) {
  if (id == null) { $("#msgs").innerHTML = `<p class="empty">Aucun salon.</p>`; return; }
  current = id;
  try { localStorage.setItem(LS_CH, String(id)); } catch { }
  S.unread[id] = 0; emit("unread");
  renderChannels(); renderHead(); renderComposer();
  if (!S.messages.has(id)) { $("#msgs").innerHTML = `<div class="loader" style="margin-top:3em"></div>`; try { await loadMessages(id); } catch (e) { errToast(e); } }
  renderMessages(true);
}

function renderHead() {
  const c = S.channels.find((x) => x.id === current); if (!c) return;
  $("#chat-head").innerHTML = `<div style="flex:1;min-width:0"><h1>${c.admin_only ? icon("mega") : "#"} ${esc(c.name)}</h1>${c.description ? `<p>${esc(c.description)}</p>` : ""}</div>
    ${isMod() ? `<button class="icon-btn" data-edit-chan aria-label="Modifier le salon">${icon("settings")}</button>` : ""}`;
  const e = $("#chat-head [data-edit-chan]"); if (e) e.onclick = () => channelModal(c);
}

function renderComposer() {
  const c = S.channels.find((x) => x.id === current); if (!c) return;
  const locked = c.admin_only && !isMod();
  $("#composer").innerHTML = locked ? `<p class="muted" style="text-align:center;margin:.4em 0">${icon("mega")} Salon d'annonces : seuls l'admin et les modos peuvent écrire.</p>`
    : `<form id="msg-form"><label for="msg-input" class="sr-only">Message</label><textarea id="msg-input" rows="1" maxlength="2000" placeholder="Écrire dans #${esc(c.name)}…"></textarea><button class="btn primary sm" aria-label="Envoyer" style="min-height:40px">${icon("send")}</button></form>
       <div class="hint">Entrée pour envoyer · Maj+Entrée pour aller à la ligne · @pseudo pour mentionner · **gras**${S.settings.slow_mode && !isMod() ? ` · mode lent : 1 message / ${S.settings.slow_mode} s` : ""}</div>`;
  const f = $("#msg-form"); if (!f) return;
  const ta = $("#msg-input");
  const grow = () => { ta.style.height = "auto"; ta.style.height = Math.min(160, ta.scrollHeight) + "px"; };
  ta.addEventListener("input", grow);
  ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); f.requestSubmit(); } });
  f.onsubmit = async (e) => {
    e.preventDefault();
    const content = ta.value.trim(); if (!content) return;
    const slow = (S.settings.slow_mode || 0) * 1000;
    if (slow && !isMod() && Date.now() - lastSent < slow) { toast(`Mode lent : attends encore ${Math.ceil((slow - (Date.now() - lastSent)) / 1000)} s`, "error"); return; }
    ta.value = ""; grow();
    try { await S.store.insert("messages", { channel_id: current, content, user_id: S.me.id }); lastSent = Date.now(); }
    catch (er) { ta.value = content; grow(); errToast(er); }
  };
  if (window.matchMedia("(pointer:fine)").matches) ta.focus();
}

export function renderMessages(forceBottom = false) {
  const box = $("#msgs"); if (!box) return;
  const arr = S.messages.get(current) || [];
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 140;
  const myRe = new RegExp(`(^|\\s)@${S.me.pseudo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\b|$)`, "i");
  let html = "", prev = null;
  for (const m of arr) {
    if (!prev || !sameDay(prev.created_at, m.created_at)) html += `<div class="day-sep">${esc(fmtDay(m.created_at))}</div>`;
    const cont = prev && prev.user_id === m.user_id && sameDay(prev.created_at, m.created_at) && new Date(m.created_at) - new Date(prev.created_at) < 5 * 6e4;
    const p = prof(m.user_id);
    const role = p?.role && p.role !== "membre" ? `<span class="badge role-${p.role}">${ROLES[p.role].label}</span>` : "";
    const canDel = m.user_id === S.me.id || isMod();
    html += `<div class="msg ${cont ? "cont" : ""} ${m.user_id === S.me.id ? "me" : ""} ${myRe.test(m.content) ? "mention-me" : ""}">
      ${avatar(p)}<div class="mh"><b style="color:${esc(p?.color || "inherit")}">${esc(pseudoOf(m.user_id))}</b>${role}<time datetime="${esc(m.created_at)}">${fmtTime(m.created_at)}</time>${m.pinned ? `<span class="badge accent">${icon("pinned")} épinglé</span>` : ""}</div>
      <div class="mb">${mdInline(m.content)}</div>
      <div class="mtools">${isMod() ? `<button class="icon-btn sm" data-pin="${m.id}" aria-label="${m.pinned ? "Désépingler" : "Épingler"}" title="${m.pinned ? "Désépingler" : "Épingler"}">${icon("pinned")}</button>` : ""}${canDel ? `<button class="icon-btn sm" data-del="${m.id}" aria-label="Supprimer le message" title="Supprimer">${icon("trash")}</button>` : ""}</div></div>`;
    prev = m;
  }
  box.innerHTML = html || `<p class="empty" style="margin:auto">Aucun message. Lance la discussion !</p>`;
  if (forceBottom || nearBottom) box.scrollTop = box.scrollHeight;
  box.querySelectorAll(".msg").forEach((el) => el.addEventListener("click", (e) => { if (e.target.closest("button,a")) return; box.querySelectorAll(".msg.sel").forEach((x) => x !== el && x.classList.remove("sel")); el.classList.toggle("sel"); }));
  box.querySelectorAll("[data-del]").forEach((b) => (b.onclick = async () => {
    const m = arr.find((x) => x.id === Number(b.dataset.del));
    if (!(await confirmDialog("Supprimer ce message ?", { ok: "Supprimer", danger: true }))) return;
    try { await S.store.remove("messages", { id: m.id }); if (m.user_id !== S.me.id) logAction("message_delete", m.user_id, { content: m.content.slice(0, 120) }); } catch (e) { errToast(e); }
  }));
  box.querySelectorAll("[data-pin]").forEach((b) => (b.onclick = async () => {
    const m = arr.find((x) => x.id === Number(b.dataset.pin));
    try { await S.store.update("messages", { id: m.id }, { pinned: !m.pinned }); } catch (e) { errToast(e); }
  }));
  const pins = arr.filter((m) => m.pinned);
  $("#pinned").innerHTML = pins.length ? `<div class="pinned-bar">${icon("pinned")}<div><b>${esc(pseudoOf(pins[pins.length - 1].user_id))} :</b> ${mdInline(pins[pins.length - 1].content)}${pins.length > 1 ? ` <span class="muted">(+${pins.length - 1} autre${pins.length > 2 ? "s" : ""})</span>` : ""}</div></div>` : "";
}

export function updateChat(domain) {
  if (!$("#msgs")) return;
  if (domain === "channels" || domain === "all") {
    if (!S.channels.some((c) => c.id === current)) { selectChannel((S.channels.find((c) => c.slug === "general") || S.channels[0])?.id ?? null); return; }
    renderChannels(); renderHead();
    if (domain === "channels") renderComposer();
  }
  if (domain === "unread") renderChannels();
  if (domain === "messages" || domain === "profiles" || domain === "all") renderMessages();
}

function channelModal(c = null) {
  openModal({
    title: `${icon("chat")} ${c ? "Modifier le salon" : "Nouveau salon"}`,
    body: `<form id="chan-form">
      <label class="field"><span>Nom</span><input class="input" name="name" required maxlength="40" value="${esc(c?.name || "")}"></label>
      <label class="field"><span>Description</span><input class="input" name="description" maxlength="120" value="${esc(c?.description || "")}"></label>
      <label class="switch"><input type="checkbox" name="admin_only" ${c?.admin_only ? "checked" : ""}> Seuls l'admin et les modos peuvent écrire</label>
      <div class="form-actions">${c ? `<button type="button" class="btn danger" data-del>${icon("trash")} Supprimer</button>` : ""}<button type="button" class="btn ghost" data-cancel>Annuler</button><button class="btn primary">Enregistrer</button></div></form>`,
    onMount: (d) => {
      d.querySelector("[data-cancel]").onclick = closeModal;
      const del = d.querySelector("[data-del]");
      if (del) del.onclick = async () => {
        if (!(await confirmDialog(`Supprimer #${c.name} et tous ses messages ?`, { ok: "Supprimer", danger: true }))) return;
        try { await S.store.remove("channels", { id: c.id }); logAction("channel_delete", c.name); current = null; location.hash = "#chat"; } catch (e) { errToast(e); }
      };
      d.querySelector("form").onsubmit = async (e) => {
        e.preventDefault(); const f = e.target;
        const row = { name: f.name.value.trim(), description: f.description.value.trim() || null, admin_only: f.admin_only.checked };
        try {
          if (c) await S.store.update("channels", { id: c.id }, row);
          else { row.slug = row.name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + Date.now().toString(36).slice(-4); row.position = S.channels.length; await S.store.insert("channels", row); }
          logAction(c ? "channel_edit" : "channel_add", row.name); closeModal();
        } catch (er) { errToast(er); }
      };
    },
  });
}
