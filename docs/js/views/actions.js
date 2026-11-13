// Fenêtres partagées : détail d'un site, inscription sur un créneau, présence sur place.
import { S, site, siteName, isMod, canSite, prof, pseudoOf, activeCheckins, myCheckin, countOverlap, peopleOverlap, level, logAction, SITE_IDS } from "../state.js";
import { STATUSES, OFFICIAL_STATUSES } from "../defaults.js";
import { esc, icon, ago, fmtTime, fmtDay, toDateInput, hhmm, openModal, closeModal, toast, errToast, confirmDialog, avatar, $ } from "../ui.js";

export function timelineHTML(siteId, day = new Date()) {
  const st = S.settings;
  const d0 = new Date(day); d0.setHours(0, 0, 0, 0);
  const now = Date.now();
  let cells = "";
  for (let m = st.day_start * 60; m < st.day_end * 60; m += 30) {
    const a = new Date(d0.getTime() + m * 6e4), b = new Date(a.getTime() + 30 * 6e4);
    const n = countOverlap(siteId, a, b);
    const cls = [level(siteId, n), b.getTime() < now ? "past" : "", a.getTime() <= now && now < b.getTime() ? "now" : ""].join(" ");
    cells += `<i class="${cls}" title="${hhmm(m)} – ${hhmm(m + 30)} : ${n} inscrit·e${n > 1 ? "s" : ""}"></i>`;
  }
  const mid = Math.round((st.day_start + st.day_end) / 2);
  return `<div class="timeline" role="img" aria-label="Couverture de la journée pour ${esc(site(siteId).short)}">${cells}</div>
    <div class="timeline-legend"><span>${st.day_start}h</span><span>${mid}h</span><span>${st.day_end}h</span></div>`;
}

export function nowStats(siteId) {
  const now = new Date();
  const inscrits = countOverlap(siteId, now, new Date(now.getTime() + 60 * 1000));
  const presents = activeCheckins(siteId).length;
  return { inscrits, presents, target: site(siteId).target, min: site(siteId).min };
}

// =====================================================================
//  Panneau détail d'un site
// =====================================================================
let panelSite = null, panelToken = 0;
export const currentPanel = () => panelSite;

export function openSitePanel(siteId) {
  const token = ++panelToken;
  panelSite = siteId;
  openModal({ title: `${icon("pin")} ${esc(site(siteId).name)}`, body: `<div id="site-panel"></div>`, wide: true, className: "site-panel-modal" })
    .then(() => { if (token === panelToken) panelSite = null; });
  renderSitePanel();
}

export function renderSitePanel() {
  const root = $("#site-panel");
  if (!root || !panelSite) return;
  const id = panelSite;
  const cur = S.statuses[id] || { status: "ouvert" };
  const stt = STATUSES[cur.status] || STATUSES.ouvert;
  const ns = nowStats(id);
  const presents = activeCheckins(id);
  const reports = S.reports.filter((r) => r.site === id).slice(0, 12);
  const mine = myCheckin();
  root.innerHTML = `
    <div class="sp-head">
      <div><div class="muted">${esc(site(id).address || "")}</div>
        ${cur.note ? `<p style="margin:.4em 0 0">${esc(cur.note)}</p>` : ""}
        ${cur.updated_at ? `<small class="muted">Statut mis à jour ${ago(cur.updated_at)}${cur.updated_by ? " par " + esc(pseudoOf(cur.updated_by)) : ""}</small>` : ""}</div>
      <span class="big-status" style="--c:${stt.color}">${icon(stt.icon)} ${esc(stt.short)}</span>
    </div>
    <div class="sc-stats">
      <div class="stat ${level(id, ns.presents)}"><b>${ns.presents}</b><span>Sur place</span></div>
      <div class="stat ${level(id, ns.inscrits)}"><b>${ns.inscrits}</b><span>Inscrits now</span></div>
      <div class="stat"><b>${ns.min}<small class="muted" style="font-size:.6em">/${ns.target}</small></b><span>Min / objectif</span></div>
    </div>
    ${timelineHTML(id)}
    <div class="sc-actions">
      <button class="btn primary" data-act="shift">${icon("calendar")} M'inscrire sur un créneau</button>
      ${mine?.site === id ? `<button class="btn checkin-btn on" data-act="checkout">${icon("check")} Je suis sur place — partir</button>`
        : `<button class="btn" data-act="checkin">${icon("pin")} Je suis sur place ici</button>`}
    </div>

    ${canSite(id) ? `<div class="sp-section"><h3>Statut officiel <span class="badge accent">${S.me.role === "referent" ? "Référent·e" : "Modération"}</span></h3>
      <div class="status-grid">${OFFICIAL_STATUSES.map((k) => `<button class="status-btn" style="--c:${STATUSES[k].color}" data-official="${k}" aria-pressed="${cur.status === k}">${icon(STATUSES[k].icon)}${esc(STATUSES[k].label)}</button>`).join("")}</div>
      <div class="row" style="margin-top:.6em"><input class="input" id="official-note" maxlength="140" placeholder="Précision (facultatif) — ex : entrée rue Colbert tenue" value="${esc(cur.note || "")}" style="flex:1"><button class="btn sm" data-act="save-note">Enregistrer la précision</button></div>
    </div>` : ""}

    <div class="sp-section"><h3>Signaler une info</h3>
      <div class="status-grid">${Object.entries(STATUSES).map(([k, v]) => `<button class="status-btn" style="--c:${v.color}" data-report="${k}">${icon(v.icon)}${esc(v.label)}</button>`).join("")}</div>
      <div id="report-form" hidden style="margin-top:.7em">
        <div class="row"><input class="input" id="report-note" maxlength="280" placeholder="Détail utile (combien, où, depuis quand…)" style="flex:1"><button class="btn primary" data-act="send-report">${icon("send")} Envoyer</button></div>
        <small class="muted">Ton pseudo et l'heure seront affichés. Les fausses alertes peuvent entraîner une exclusion.</small>
      </div>
    </div>

    <div class="sp-section"><h3>Sur place maintenant <span>${presents.length}</span></h3>
      ${presents.length ? `<div class="people">${presents.map((c) => `<span class="person">${avatar(prof(c.user_id), "sm")}${esc(pseudoOf(c.user_id))} <small class="muted">${fmtTime(c.since)}</small></span>`).join("")}</div>` : `<p class="muted">Personne ne s'est déclaré sur place.</p>`}
    </div>

    <div class="sp-section"><h3>Derniers signalements</h3>
      ${reports.length ? `<ul class="feed">${reports.map((r) => reportItem(r, true)).join("")}</ul>` : `<p class="muted">Aucun signalement récent.</p>`}
    </div>`;

  let reportKind = null;
  root.querySelectorAll("[data-report]").forEach((b) => (b.onclick = () => {
    reportKind = b.dataset.report;
    root.querySelectorAll("[data-report]").forEach((x) => x.setAttribute("aria-pressed", x === b));
    const f = $("#report-form", root); f.hidden = false; $("#report-note", root).focus();
  }));
  const send = async () => {
    if (!reportKind) return;
    try {
      await S.store.insert("reports", { site: id, kind: reportKind, note: $("#report-note", root).value.trim() || null, user_id: S.me.id });
      toast("Signalement envoyé, merci !", "ok");
    } catch (e) { errToast(e); }
  };
  root.querySelector("[data-act='send-report']").onclick = send;
  $("#report-note", root).onkeydown = (e) => { if (e.key === "Enter") send(); };
  root.querySelectorAll("[data-official]").forEach((b) => (b.onclick = () => setOfficial(id, b.dataset.official, $("#official-note", root)?.value.trim())));
  const sn = root.querySelector("[data-act='save-note']");
  if (sn) sn.onclick = () => setOfficial(id, cur.status, $("#official-note", root).value.trim());
  root.querySelector("[data-act='shift']").onclick = () => openShiftModal({ site: id });
  const ci = root.querySelector("[data-act='checkin']"); if (ci) ci.onclick = () => checkIn(id);
  const co = root.querySelector("[data-act='checkout']"); if (co) co.onclick = () => checkOut();
  bindReportTools(root);
}

export function reportItem(r, tools = false) {
  const v = STATUSES[r.kind] || STATUSES.autre;
  const canDel = r.user_id === S.me.id || canSite(r.site);
  return `<li><span class="fi" style="--c:${v.color}">${icon(v.icon)}</span>
    <div class="ft"><b>${esc(v.label)}</b> · <span class="site-tag ${r.site}">${esc(siteName(r.site))}</span>${r.validated ? ` <span class="badge accent">${icon("check")} confirmé</span>` : ""}
      ${r.note ? `<div>${esc(r.note)}</div>` : ""}<small>${esc(pseudoOf(r.user_id))} · ${ago(r.created_at)}</small></div>
    ${tools ? `<div class="row" style="gap:.1em">${canSite(r.site) && !r.validated ? `<button class="icon-btn sm" title="Confirmer" aria-label="Confirmer ce signalement" data-validate="${r.id}">${icon("check")}</button>` : ""}
      ${canDel ? `<button class="icon-btn sm" title="Supprimer" aria-label="Supprimer ce signalement" data-del-report="${r.id}">${icon("trash")}</button>` : ""}</div>` : ""}</li>`;
}
export function bindReportTools(root) {
  root.querySelectorAll("[data-validate]").forEach((b) => (b.onclick = async () => {
    try { await S.store.update("reports", { id: Number(b.dataset.validate) }, { validated: true }); } catch (e) { errToast(e); }
  }));
  root.querySelectorAll("[data-del-report]").forEach((b) => (b.onclick = async () => {
    const back = panelSite;
    if (!(await confirmDialog("Supprimer ce signalement ?", { ok: "Supprimer", danger: true }))) { if (back) openSitePanel(back); return; }
    try { await S.store.remove("reports", { id: Number(b.dataset.delReport) }); if (back) openSitePanel(back); } catch (e) { errToast(e); }
  }));
}

async function setOfficial(id, status, note) {
  try {
    const row = { site: id, status, note: note || null, updated_by: S.me.id, updated_at: new Date().toISOString() };
    await S.store.upsert("site_status", row, "site");
    logAction("site_status", id, { status, note });
    toast(`Statut de ${site(id).short} : ${STATUSES[status].label}`, "ok");
  } catch (e) { errToast(e); }
}

// =====================================================================
//  Présence sur place
// =====================================================================
export async function checkIn(siteId) {
  try {
    await S.store.upsert("checkins", { user_id: S.me.id, site: siteId, since: new Date().toISOString() }, "user_id");
    toast(`Tu es indiqué·e sur place à ${site(siteId).short}. Pense à cliquer « partir » en quittant.`, "ok");
  } catch (e) { errToast(e); }
}
export async function checkOut() {
  try { await S.store.remove("checkins", { user_id: S.me.id }); toast("Présence retirée. Merci pour ton temps !", "ok"); } catch (e) { errToast(e); }
}
export function openCheckin() {
  const mine = myCheckin();
  if (mine) {
    openModal({
      title: `${icon("pin")} Tu es sur place`,
      body: `<p>Tu es indiqué·e sur place à <b>${esc(site(mine.site).short)}</b> depuis ${fmtTime(mine.since)}.</p>
        <div class="form-actions"><button class="btn" data-sw>Changer de site</button><button class="btn primary" data-out>Je pars</button></div>`,
      onMount: (d) => {
        d.querySelector("[data-out]").onclick = () => { checkOut(); closeModal(); };
        d.querySelector("[data-sw]").onclick = () => { checkIn(mine.site === "colbert" ? "ibd" : "colbert"); closeModal(); };
      },
    });
    return;
  }
  openModal({
    title: `${icon("pin")} Je suis sur place`,
    body: `<p class="muted">Indique où tu es : ça met à jour le compteur en direct sur la carte.</p>
      <div class="grid2">${SITE_IDS.map((id) => `<button class="status-btn" style="--c:${id === "colbert" ? "#ff6b4a" : "#4da3ff"};min-height:72px" data-site="${id}">${icon("pin")}<span>${esc(site(id).name)}<br><small class="muted">${activeCheckins(id).length} sur place</small></span></button>`).join("")}</div>`,
    onMount: (d) => d.querySelectorAll("[data-site]").forEach((b) => (b.onclick = () => { checkIn(b.dataset.site); closeModal(); })),
  });
}

// =====================================================================
//  Inscription sur un créneau
// =====================================================================
function timeOptions(sel) {
  let o = "";
  for (let m = 0; m < 24 * 60; m += 30) o += `<option value="${m}" ${m === sel ? "selected" : ""}>${hhmm(m)}</option>`;
  return o;
}

export function openShiftModal({ site: siteId = "colbert", start = null, end = null, shift = null } = {}) {
  const editing = !!shift;
  const s0 = shift ? new Date(shift.starts_at) : start ? new Date(start) : roundNext();
  const e0 = shift ? new Date(shift.ends_at) : end ? new Date(end) : new Date(s0.getTime() + 3 * 36e5);
  const sMin = s0.getHours() * 60 + (s0.getMinutes() >= 30 ? 30 : 0);
  const eMin = e0.getHours() * 60 + (e0.getMinutes() >= 30 ? 30 : 0);
  const sid = shift?.site || siteId;
  const forWho = shift?.user_id || S.me.id;
  const members = [...S.profiles.values()].filter((p) => p.status === "active").sort((a, b) => a.pseudo.localeCompare(b.pseudo));
  const canPick = SITE_IDS.some((x) => canSite(x));

  openModal({
    title: `${icon("calendar")} ${editing ? "Modifier le créneau" : "M'inscrire sur un créneau"}`,
    body: `<form id="shift-form">
      <div class="field"><span>Site</span><div class="seg" role="group" aria-label="Site">${SITE_IDS.map((x) => `<button type="button" data-site="${x}" aria-pressed="${x === sid}">${esc(site(x).short)}</button>`).join("")}</div></div>
      <div class="field"><span>Jour</span><input class="input" type="date" name="day" value="${toDateInput(s0)}" required></div>
      <div class="grid2">
        <label class="field"><span>De</span><select class="input" name="from">${timeOptions(sMin)}</select></label>
        <label class="field"><span>À</span><select class="input" name="to">${timeOptions(eMin)}</select></label>
      </div>
      ${canPick ? `<label class="field"><span>Pour qui</span><select class="input" name="who">${members.map((p) => `<option value="${esc(p.id)}" ${p.id === forWho ? "selected" : ""}>${esc(p.pseudo)}${p.id === S.me.id ? " (moi)" : ""}</option>`).join("")}</select><small>En tant que ${isMod() ? "modo" : "référent·e"}, tu peux inscrire quelqu'un d'autre.</small></label>` : ""}
      <label class="field"><span>Note (facultatif)</span><input class="input" name="note" maxlength="140" value="${esc(shift?.note || "")}" placeholder="ex : j'amène du café, je peux tenir l'entrée nord…"></label>
      <div id="shift-summary" class="card" style="padding:.8em 1em"></div>
      <p class="form-error" id="shift-err" role="alert"></p>
      <div class="form-actions">
        ${editing ? `<button type="button" class="btn danger" data-del>${icon("trash")} Supprimer</button>` : ""}
        <button type="button" class="btn ghost" data-cancel>Annuler</button>
        <button class="btn primary" type="submit">${icon("check")} ${editing ? "Enregistrer" : "Je m'inscris"}</button>
      </div></form>`,
    onMount: (d) => {
      const f = d.querySelector("#shift-form");
      let cur = sid;
      const range = () => {
        const [y, mo, da] = f.day.value.split("-").map(Number);
        const a = new Date(y, mo - 1, da, 0, 0, 0, 0); a.setMinutes(Number(f.from.value));
        const b = new Date(y, mo - 1, da, 0, 0, 0, 0); b.setMinutes(Number(f.to.value));
        if (b <= a) b.setDate(b.getDate() + 1);
        return [a, b];
      };
      const summary = () => {
        if (!f.day.value) return;
        const [a, b] = range();
        const h = (b - a) / 36e5;
        const others = peopleOverlap(cur, a, b).filter((s) => !shift || s.id !== shift.id);
        const minN = (() => { let m = Infinity; for (let t = +a; t < +b; t += 30 * 6e4) m = Math.min(m, countOverlap(cur, new Date(t), new Date(t + 30 * 6e4)) - (shift && +new Date(shift.starts_at) <= t && +new Date(shift.ends_at) > t ? 1 : 0)); return m === Infinity ? 0 : m; })();
        d.querySelector("#shift-summary").innerHTML = `<b style="text-transform:capitalize">${esc(fmtDay(a))}</b>, ${hhmm(a.getHours() * 60 + a.getMinutes())} → ${hhmm(b.getHours() * 60 + b.getMinutes())}${!sameDate(a, b) ? " (lendemain)" : ""} · <b>${h.toLocaleString("fr-FR")} h</b> à ${esc(site(cur).short)}
          <div class="muted" style="font-size:.88rem;margin-top:.3em">${others.length ? `Déjà inscrit·es sur cette plage : ${[...new Set(others.map((s) => pseudoOf(s.user_id)))].slice(0, 8).map(esc).join(", ")}${others.length > 8 ? "…" : ""}` : "Personne d'autre pour l'instant."}
          ${minN < site(cur).min ? `<br><span style="color:var(--low);font-weight:600">Créneau en sous-effectif (au plus bas : ${minN} / ${site(cur).min} min.) — ta présence compte !</span>` : ""}</div>`;
      };
      d.querySelectorAll("[data-site]").forEach((b) => (b.onclick = () => { cur = b.dataset.site; d.querySelectorAll("[data-site]").forEach((x) => x.setAttribute("aria-pressed", x === b)); summary(); }));
      f.addEventListener("input", summary); f.addEventListener("change", summary); summary();
      d.querySelector("[data-cancel]").onclick = closeModal;
      const del = d.querySelector("[data-del]");
      if (del) del.onclick = async () => { if (await confirmDialog("Supprimer ce créneau ?", { ok: "Supprimer", danger: true })) { try { await S.store.remove("shifts", { id: shift.id }); if (shift.user_id !== S.me.id) logAction("shift_delete", shift.user_id, { site: shift.site, starts_at: shift.starts_at }); toast("Créneau supprimé", "ok"); } catch (e) { errToast(e); } } };
      f.onsubmit = async (e) => {
        e.preventDefault();
        const err = d.querySelector("#shift-err"); err.textContent = "";
        const [a, b] = range();
        const who = f.who?.value || S.me.id;
        if ((b - a) / 36e5 > 16) { err.textContent = "Un créneau ne peut pas dépasser 16 h. Coupe-le en deux."; return; }
        if (b.getTime() < Date.now() - 36e5) { err.textContent = "Ce créneau est déjà passé."; return; }
        const clash = S.shifts.find((s) => s.user_id === who && (!shift || s.id !== shift.id) && +new Date(s.starts_at) < +b && +new Date(s.ends_at) > +a);
        if (clash) { err.textContent = `${who === S.me.id ? "Tu es" : pseudoOf(who) + " est"} déjà inscrit·e de ${fmtTime(clash.starts_at)} à ${fmtTime(clash.ends_at)} (${site(clash.site).short}). Modifie ce créneau plutôt.`; return; }
        const row = { site: cur, user_id: who, starts_at: a.toISOString(), ends_at: b.toISOString(), note: f.note.value.trim() || null };
        try {
          if (editing) { await S.store.update("shifts", { id: shift.id }, row); if (shift.user_id !== S.me.id) logAction("shift_edit", shift.user_id, row); toast("Créneau modifié", "ok"); }
          else { await S.store.insert("shifts", row); if (who !== S.me.id) logAction("shift_add_for", who, row); toast(`Inscrit·e ! ${site(cur).short}, ${fmtTime(a)} → ${fmtTime(b)}`, "ok"); }
          closeModal();
        } catch (e2) { err.textContent = e2.message; }
      };
    },
  });
}
const sameDate = (a, b) => a.toDateString() === b.toDateString();
function roundNext() { const d = new Date(); d.setSeconds(0, 0); d.setMinutes(d.getMinutes() < 30 ? 30 : 60); return d; }
