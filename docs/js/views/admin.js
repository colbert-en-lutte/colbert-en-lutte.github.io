import { S, isAdmin, isMod, prof, pseudoOf, activeCheckins, site, logAction, SITE_IDS } from "../state.js";
import { ROLES } from "../defaults.js";
import { loaders } from "../data.js";
import { esc, icon, ago, fmtDate, fmtDateTime, startOfWeek, addDays, toast, errToast, confirmDialog, openModal, closeModal, avatar, downloadText, copyText, csv, $ } from "../ui.js";

let tab = "membres", query = "", filter = "all";

export async function renderAdmin(view) {
  if (!isMod()) { view.innerHTML = `<p class="empty">Accès réservé à la modération.</p>`; return; }
  const tabs = [["membres", "Membres"], ...(isAdmin() ? [["reglages", "Réglages"], ["journal", "Journal"], ["donnees", "Données & RGPD"]] : [])];
  if (!tabs.some((t) => t[0] === tab)) tab = "membres";
  view.innerHTML = `<div class="page-head"><div><h1>Espace <em>${isAdmin() ? "admin" : "modération"}</em></h1><p>${isAdmin() ? "Tu es le seul à voir les noms et prénoms." : "Les noms réels ne sont visibles que par l'admin."}</p></div></div>
    <div class="tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" data-tab="${k}" aria-selected="${k === tab}">${l}</button>`).join("")}</div><div id="admin-body"></div>`;
  view.querySelectorAll("[data-tab]").forEach((b) => (b.onclick = () => { tab = b.dataset.tab; view.querySelectorAll("[data-tab]").forEach((x) => x.setAttribute("aria-selected", x === b)); updateAdmin("tab"); }));
  if (isAdmin()) { try { await Promise.all([loaders.identities(), loaders.audit()]); } catch (e) { console.warn(e); } }
  updateAdmin("tab");
}

export function updateAdmin(domain) {
  const body = $("#admin-body"); if (!body) return;
  if (tab === "membres") { if (domain === "tab" || !body.querySelector("#mem-table")) renderMembers(body); else fillMembers(); }
  else if (tab === "reglages") { if (domain === "tab" || domain === "settings") renderSettings(body); }
  else if (tab === "journal") renderJournal(body);
  else if (tab === "donnees") { if (domain === "tab") renderData(body); }
}

// ---------------- Membres ----------------
function renderMembers(body) {
  const all = [...S.profiles.values()];
  const wk = startOfWeek(new Date()), wkEnd = addDays(wk, 7);
  const weekUsers = new Set(S.shifts.filter((s) => +new Date(s.starts_at) < +wkEnd && +new Date(s.ends_at) > +wk).map((s) => s.user_id));
  const pending = all.filter((p) => p.status === "pending");
  body.innerHTML = `<div class="kpis">
      <div class="kpi"><b>${all.filter((p) => p.status === "active").length}</b><span>Membres actifs</span></div>
      <div class="kpi"><b style="color:var(--mid)">${pending.length}</b><span>En attente</span></div>
      <div class="kpi"><b style="color:var(--low)">${all.filter((p) => p.status === "banned").length}</b><span>Exclus</span></div>
      <div class="kpi"><b style="color:var(--ok)">${activeCheckins().length}</b><span>Sur place now</span></div>
      <div class="kpi"><b>${weekUsers.size}</b><span>Inscrits cette semaine</span></div>
    </div>
    ${pending.length ? `<div class="card" style="margin-bottom:1.2em;border-color:var(--mid)"><h3 style="margin-bottom:.6em">${icon("clock")} Comptes en attente de validation</h3><div style="display:grid;gap:.5em">${pending.map((p) => `<div class="row" style="justify-content:space-between">
      <span class="row">${avatar(p, "sm")}<b>${esc(p.pseudo)}</b>${isAdmin() ? `<span class="muted">${esc(identity(p.id))}</span>` : ""}<small class="muted">${ago(p.created_at)}</small></span>
      <span class="row"><button class="btn sm primary" data-status="${p.id}|active">${icon("check")} Valider</button><button class="btn sm danger" data-status="${p.id}|banned">Refuser</button></span></div>`).join("")}</div></div>` : ""}
    <div class="row" style="margin-bottom:.8em"><input class="input" id="mem-q" placeholder="Rechercher un pseudo${isAdmin() ? " ou un nom" : ""}…" value="${esc(query)}" style="max-width:320px">
      <select class="input" id="mem-f" style="max-width:200px">${[["all", "Tous"], ["active", "Actifs"], ["pending", "En attente"], ["banned", "Exclus"], ["staff", "Modération"]].map(([k, l]) => `<option value="${k}" ${k === filter ? "selected" : ""}>${l}</option>`).join("")}</select></div>
    <div class="table-wrap"><table class="tbl" id="mem-table"><thead><tr><th>Pseudo</th>${isAdmin() ? "<th>Identité (privé)</th>" : ""}<th>Rôle</th><th>Statut</th><th>Créneaux</th><th>Inscrit</th><th>Vu</th><th>Actions</th></tr></thead><tbody></tbody></table></div>`;
  $("#mem-q").oninput = (e) => { query = e.target.value; fillMembers(); };
  $("#mem-f").onchange = (e) => { filter = e.target.value; fillMembers(); };
  bindStatus(body);
  fillMembers();
}

function identity(uid) {
  const i = S.identities?.find((x) => x.user_id === uid);
  if (!i) return "—";
  return i.prenom || i.nom ? `${i.prenom || ""} ${i.nom || ""}`.trim() : "(purgé)";
}

function fillMembers() {
  const tb = $("#mem-table tbody"); if (!tb) return;
  const q = query.trim().toLowerCase();
  const now = Date.now();
  const rows = [...S.profiles.values()].filter((p) => {
    if (filter === "staff" && !["admin", "modo", "referent"].includes(p.role)) return false;
    if (["active", "pending", "banned"].includes(filter) && p.status !== filter) return false;
    if (!q) return true;
    return p.pseudo.toLowerCase().includes(q) || (isAdmin() && identity(p.id).toLowerCase().includes(q));
  }).sort((a, b) => (a.status === "pending" ? -1 : 0) - (b.status === "pending" ? -1 : 0) || a.pseudo.localeCompare(b.pseudo));
  tb.innerHTML = rows.map((p) => {
    const nShifts = S.shifts.filter((s) => s.user_id === p.id && +new Date(s.ends_at) > now).length;
    const self = p.id === S.me.id;
    const roleVal = p.role === "referent" ? `referent:${p.referent_site}` : p.role;
    const roleCell = isAdmin() && !self
      ? `<select data-role="${p.id}" aria-label="Rôle de ${esc(p.pseudo)}">${[["membre", "Membre"], ["referent:colbert", "Référent·e " + site("colbert").short], ["referent:ibd", "Référent·e " + site("ibd").short], ["modo", "Modo"], ["admin", "Admin"]].map(([v, l]) => `<option value="${v}" ${v === roleVal ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`
      : `<span class="badge role-${p.role}">${ROLES[p.role].label}${p.role === "referent" ? " · " + esc(site(p.referent_site).short) : ""}</span>`;
    const canAct = !self && (isAdmin() || !["admin", "modo"].includes(p.role));
    return `<tr><td><span class="row" style="flex-wrap:nowrap">${avatar(p, "sm")}<b>${esc(p.pseudo)}</b>${self ? ' <span class="muted">(toi)</span>' : ""}</span></td>
      ${isAdmin() ? `<td class="secret">${esc(identity(p.id))}</td>` : ""}
      <td>${roleCell}</td><td class="st-${p.status}">${{ active: "Actif", pending: "En attente", banned: "Exclu" }[p.status]}</td>
      <td class="mono">${nShifts}</td><td>${fmtDate(p.created_at)}</td><td class="muted">${p.last_seen ? ago(p.last_seen) : "—"}</td>
      <td>${canAct ? `<span class="row" style="flex-wrap:nowrap;gap:.3em">${p.status === "banned" ? `<button class="btn sm" data-status="${p.id}|active">Réintégrer</button>` : p.status === "pending" ? `<button class="btn sm primary" data-status="${p.id}|active">Valider</button>` : `<button class="btn sm danger" data-status="${p.id}|banned">Exclure</button>`}
        <button class="icon-btn sm" data-purge-msgs="${p.id}" title="Supprimer tous ses messages" aria-label="Supprimer tous les messages de ${esc(p.pseudo)}">${icon("trash")}</button></span>` : ""}</td></tr>`;
  }).join("") || `<tr><td colspan="8" class="muted">Aucun résultat.</td></tr>`;
  tb.querySelectorAll("[data-role]").forEach((s) => (s.onchange = async () => {
    const [role, st] = s.value.split(":");
    if (role === "admin" && !(await confirmDialog(`Donner le rôle ADMIN à ${pseudoOf(s.dataset.role)} ? Cette personne pourra tout faire, y compris voir les identités.`, { ok: "Oui, nommer admin", danger: true }))) { fillMembers(); return; }
    try { await S.store.rpc("set_role", { uid: s.dataset.role, new_role: role, site: st || null }); toast("Rôle mis à jour", "ok"); } catch (e) { errToast(e); fillMembers(); }
  }));
  bindStatus(tb);
  tb.querySelectorAll("[data-purge-msgs]").forEach((b) => (b.onclick = async () => {
    const uid = b.dataset.purgeMsgs;
    if (!(await confirmDialog(`Supprimer TOUS les messages de ${pseudoOf(uid)} ?`, { ok: "Tout supprimer", danger: true }))) return;
    try { await S.store.remove("messages", { user_id: uid }); for (const arr of S.messages.values()) for (let i = arr.length - 1; i >= 0; i--) if (arr[i].user_id === uid) arr.splice(i, 1); logAction("messages_purge", uid); toast("Messages supprimés", "ok"); } catch (e) { errToast(e); }
  }));
}

function bindStatus(root) {
  root.querySelectorAll("[data-status]").forEach((b) => (b.onclick = async () => {
    const [uid, st] = b.dataset.status.split("|");
    if (st === "banned" && !(await confirmDialog(`Exclure ${pseudoOf(uid)} ? La personne ne pourra plus rien voir ni écrire.`, { ok: "Exclure", danger: true }))) return;
    try { await S.store.rpc("set_status", { uid, new_status: st }); toast(st === "banned" ? "Membre exclu·e" : "Compte activé", "ok"); } catch (e) { errToast(e); }
  }));
}

// ---------------- Réglages ----------------
function renderSettings(body) {
  const st = S.settings;
  const hours = (sel) => [...Array(25).keys()].map((h) => `<option value="${h}" ${h === sel ? "selected" : ""}>${h}h</option>`).join("");
  body.innerHTML = `<form id="set-form"><div class="settings-grid">
    <section class="card"><h3 style="margin-bottom:.8em">Général</h3>
      <label class="field"><span>Nom de la mobilisation</span><input class="input" name="name" value="${esc(st.name)}" maxlength="40"></label>
      <label class="field"><span>Slogan</span><input class="input" name="tagline" value="${esc(st.tagline || "")}" maxlength="80"></label>
      <label class="switch" style="margin-bottom:.8em"><input type="checkbox" name="manual_validation" ${st.manual_validation ? "checked" : ""}> Valider manuellement les nouveaux comptes</label>
      <label class="switch" style="margin-bottom:.8em"><input type="checkbox" name="member_polls" ${st.member_polls ? "checked" : ""}> Les membres peuvent créer des sondages</label>
      <label class="field"><span>Mode lent du chat</span><select class="input" name="slow_mode">${[0, 5, 15, 30, 60].map((v) => `<option value="${v}" ${v === st.slow_mode ? "selected" : ""}>${v ? `1 message / ${v} s` : "Désactivé"}</option>`).join("")}</select></label>
      <div class="grid2"><label class="field"><span>Planning : début</span><select class="input" name="day_start">${hours(st.day_start)}</select></label><label class="field"><span>Planning : fin</span><select class="input" name="day_end">${hours(st.day_end)}</select></label></div>
    </section>
    ${SITE_IDS.map((id) => `<section class="card"><h3 style="margin-bottom:.8em"><span class="site-tag ${id}">${esc(site(id).short)}</span></h3>
      <label class="field"><span>Nom complet</span><input class="input" name="${id}.name" value="${esc(site(id).name)}"></label>
      <div class="grid2"><label class="field"><span>Nom court</span><input class="input" name="${id}.short" value="${esc(site(id).short)}"></label><label class="field"><span>Adresse</span><input class="input" name="${id}.address" value="${esc(site(id).address || "")}"></label></div>
      <div class="grid2"><label class="field"><span>Minimum de personnes</span><input class="input" type="number" min="1" name="${id}.min" value="${site(id).min}"></label><label class="field"><span>Objectif</span><input class="input" type="number" min="1" name="${id}.target" value="${site(id).target}"></label></div>
      <div class="grid2"><label class="field"><span>Latitude</span><input class="input" name="${id}.lat" value="${site(id).lat}"></label><label class="field"><span>Longitude</span><input class="input" name="${id}.lng" value="${site(id).lng}"></label></div>
      <button type="button" class="btn sm" data-pick="${id}">${icon("target")} Placer sur la carte</button>
    </section>`).join("")}
  </div><div class="form-actions"><button class="btn primary">${icon("check")} Enregistrer les réglages</button></div></form>`;
  body.querySelectorAll("[data-pick]").forEach((b) => (b.onclick = () => { S.pickSite = b.dataset.pick; location.hash = "#carte"; toast("Clique sur la carte à l'emplacement exact du site", "info"); }));
  $("#set-form").onsubmit = async (e) => {
    e.preventDefault(); const f = e.target;
    const v = (n) => f.elements[n].value;
    const sites = {};
    for (const id of SITE_IDS) sites[id] = { name: v(`${id}.name`), short: v(`${id}.short`), address: v(`${id}.address`), min: Math.max(1, +v(`${id}.min`)), target: Math.max(1, +v(`${id}.target`)), lat: +v(`${id}.lat`), lng: +v(`${id}.lng`) };
    const data = { ...S.settings, name: v("name").trim() || "Colbert en lutte", tagline: v("tagline").trim(), manual_validation: f.manual_validation.checked, member_polls: f.member_polls.checked, slow_mode: +v("slow_mode"), day_start: +v("day_start"), day_end: Math.max(+v("day_start") + 1, +v("day_end")), sites };
    try { await S.store.update("settings", { id: 1 }, { data }); logAction("settings", "réglages"); toast("Réglages enregistrés", "ok"); } catch (er) { errToast(er); }
  };
}

// ---------------- Journal ----------------
const ACTIONS = { role: "Changement de rôle", status: "Changement de statut", site_status: "Statut d'un site", message_delete: "Message supprimé", messages_purge: "Messages d'un membre purgés", shift_delete: "Créneau supprimé (d'un autre)", shift_edit: "Créneau modifié (d'un autre)", shift_add_for: "Inscription pour un autre", announcement: "Annonce publiée", announcement_delete: "Annonce retirée", poll_add: "Sondage créé", poll_close: "Sondage clôturé", poll_delete: "Sondage supprimé", page_add: "Page créée", page_edit: "Page modifiée", page_delete: "Page supprimée", event_add: "Événement ajouté", event_edit: "Événement modifié", event_delete: "Événement supprimé", material_add: "Besoin ajouté", material_delete: "Besoin supprimé", channel_add: "Salon créé", channel_edit: "Salon modifié", channel_delete: "Salon supprimé", settings: "Réglages modifiés", purge_identities: "Identités purgées", checkins_reset: "Présences remises à zéro" };
function renderJournal(body) {
  const tgt = (t) => (prof(t) ? "@" + prof(t).pseudo : t || "");
  body.innerHTML = S.audit.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>Quand</th><th>Qui</th><th>Action</th><th>Cible</th><th>Détails</th></tr></thead><tbody>
    ${S.audit.map((a) => `<tr><td>${esc(fmtDateTime(a.created_at))}</td><td>${esc(pseudoOf(a.actor))}</td><td>${esc(ACTIONS[a.action] || a.action)}</td><td>${esc(tgt(a.target))}</td><td class="muted" style="white-space:normal;max-width:360px">${esc(a.details ? Object.entries(a.details).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`).join(" · ") : "")}</td></tr>`).join("")}
    </tbody></table></div>` : `<p class="empty">Aucune action de modération pour l'instant.</p>`;
}

// ---------------- Données ----------------
function renderData(body) {
  const st = S.settings;
  body.innerHTML = `<div class="settings-grid">
    <section class="privacy-box"><h3>${icon("shield")} Ce que la plateforme stocke</h3>
      <p><b>Visible par tous les membres :</b> pseudo, rôle, créneaux, messages, signalements, présence sur place.</p>
      <p><b>Visible par toi seul :</b> prénom et nom (table séparée, protégée côté serveur).</p>
      <p><b>Jamais stocké :</b> email, téléphone, adresse IP en clair dans l'appli.</p>
      <p>Base de données hébergée dans l'Union européenne. Les votes sont anonymes pour tout le monde, toi compris dans l'interface.</p></section>
    <section class="card"><h3 style="margin-bottom:.6em">Liste nominative</h3>
      <p class="muted">À utiliser uniquement pour l'organisation. Ne la partage pas.</p>
      <div class="row"><button class="btn" data-export-id>${icon("download")} Télécharger (CSV)</button><button class="btn ghost" data-copy-id>${icon("copy")} Copier</button></div></section>
    <section class="card"><h3 style="margin-bottom:.6em">Fin de mobilisation</h3>
      <label class="field"><span>Date prévue de suppression des identités</span><input class="input" type="date" id="purge-date" value="${esc(st.purge_date || "")}"><small>Un rappel s'affichera pour toi à cette date.</small></label>
      <div class="row"><button class="btn sm" data-save-date>Enregistrer la date</button><button class="btn danger" data-purge>${icon("trash")} Effacer tous les noms et prénoms</button></div></section>
    <section class="card"><h3 style="margin-bottom:.6em">Remises à zéro</h3>
      <div class="row"><button class="btn" data-reset-checkins>${icon("rotate")} Vider les présences « sur place »</button></div>
      ${S.store.mode === "demo" ? `<div class="row" style="margin-top:.8em"><button class="btn danger" data-reset-demo>Réinitialiser la démo</button></div>` : ""}</section>
  </div>`;
  const rows = () => [["Pseudo", "Prénom", "Nom", "Rôle", "Statut", "Inscrit le"], ...[...S.profiles.values()].map((p) => { const i = S.identities?.find((x) => x.user_id === p.id) || {}; return [p.pseudo, i.prenom || "", i.nom || "", ROLES[p.role].label, p.status, fmtDate(p.created_at)]; })];
  body.querySelector("[data-export-id]").onclick = () => downloadText("membres-confidentiel.csv", csv(rows()));
  body.querySelector("[data-copy-id]").onclick = () => copyText(rows().map((r) => r.join("\t")).join("\n"));
  body.querySelector("[data-save-date]").onclick = async () => { try { await S.store.update("settings", { id: 1 }, { data: { ...S.settings, purge_date: $("#purge-date").value || null } }); toast("Date enregistrée", "ok"); } catch (e) { errToast(e); } };
  body.querySelector("[data-purge]").onclick = async () => {
    if (!(await confirmDialog("Effacer définitivement TOUS les noms et prénoms ? Les comptes et pseudos restent actifs. Action irréversible.", { ok: "Effacer définitivement", danger: true }))) return;
    try { await S.store.rpc("purge_identities"); await loaders.identities(); toast("Identités effacées", "ok"); } catch (e) { errToast(e); }
  };
  body.querySelector("[data-reset-checkins]").onclick = async () => {
    if (!(await confirmDialog("Retirer toutes les présences « sur place » ?", { ok: "Vider" }))) return;
    try { for (const c of [...S.checkins]) await S.store.remove("checkins", { user_id: c.user_id }); logAction("checkins_reset", "all"); toast("Présences remises à zéro", "ok"); } catch (e) { errToast(e); }
  };
  const rd = body.querySelector("[data-reset-demo]"); if (rd) rd.onclick = async () => { if (await confirmDialog("Remettre la démo à zéro ? Tu devras recréer ton compte.", { ok: "Réinitialiser", danger: true })) S.store.resetDemo(); };
  void openModal; void closeModal;
}
