import { S, site, isMod, pseudoOf, level, nextGap, SITE_IDS, logAction } from "../state.js";
import { STATUSES } from "../defaults.js";
import { esc, icon, ago, fmtTime, fmtDay, fmtDateTime, md, openModal, closeModal, toast, errToast, confirmDialog, $ } from "../ui.js";
import { mountMap, updateMap, flyOverview, flySite, toggle3D, toggleRotate, setPickCursor } from "../map.js";
import { openSitePanel, openShiftModal, timelineHTML, nowStats, reportItem, bindReportTools } from "./actions.js";

export function renderHome(view) {
  view.classList.add("full");
  const name = S.settings.name || "Colbert en lutte";
  const i = name.indexOf(" ");
  const [l1, l2] = i > 0 ? [name.slice(0, i), name.slice(i + 1)] : [name, ""];
  view.innerHTML = `
    <section class="hero-map" id="hero-map">
      <div class="map-title"><h1>${esc(l1)}<span>${esc(l2)}</span></h1><p><span class="live">EN DIRECT</span> ${esc(S.settings.tagline || "")}</p></div>
      <div class="map-ctrls">
        <div class="grp">
          <button data-map="overview" title="Vue d'ensemble">${icon("target")}<span class="t">Vue d'ensemble</span></button>
          ${SITE_IDS.map((id) => `<button data-map="site" data-site="${id}" title="Aller à ${esc(site(id).short)}">${icon("pin")}<span class="t">${esc(site(id).short)}</span></button>`).join("")}
        </div>
        <div class="grp">
          <button data-map="3d" class="on" title="Basculer 2D / 3D">${icon("cube")}<span class="t">3D</span></button>
          <button data-map="rotate" title="Rotation automatique">${icon("rotate")}<span class="t">Rotation</span></button>
        </div>
      </div>
      <div id="pick-slot"></div>
    </section>
    <section class="site-cards" id="site-cards" aria-label="État des deux sites"></section>
    <div class="home-grid"><div class="col" id="home-left"></div><div class="col" id="home-right"></div></div>`;

  mountMap($("#hero-map"), { onSite: openSitePanel, onPickSite: pickSite });
  view.querySelector("[data-map='overview']").onclick = flyOverview;
  view.querySelectorAll("[data-map='site']").forEach((b) => (b.onclick = () => flySite(b.dataset.site)));
  view.querySelector("[data-map='3d']").onclick = (e) => e.currentTarget.classList.toggle("on", toggle3D());
  view.querySelector("[data-map='rotate']").onclick = (e) => e.currentTarget.classList.toggle("on", toggleRotate());
  updateHome();
}

export function updateHome() {
  if (!$("#site-cards")) return;
  updateMap();
  renderPick();
  $("#site-cards").innerHTML = SITE_IDS.map(siteCard).join("");
  $("#site-cards").querySelectorAll("[data-detail]").forEach((b) => (b.onclick = () => openSitePanel(b.dataset.detail)));
  $("#site-cards").querySelectorAll("[data-shift]").forEach((b) => (b.onclick = () => openShiftModal({ site: b.dataset.shift })));
  renderLeft(); renderRight();
}

function siteCard(id) {
  const cur = S.statuses[id] || { status: "ouvert" };
  const stt = STATUSES[cur.status] || STATUSES.ouvert;
  const ns = nowStats(id);
  const gap = nextGap(id);
  return `<article class="site-card" style="--c:${stt.color}">
    <div class="sc-head"><div><h2>${esc(site(id).short)}</h2><div class="addr">${esc(site(id).address || "")}</div></div>
      <span class="big-status" style="--c:${stt.color}">${icon(stt.icon)} ${esc(stt.short)}</span></div>
    ${cur.note ? `<p class="sc-note">${esc(cur.note)} <small class="muted">· ${ago(cur.updated_at)}</small></p>` : ""}
    <div class="sc-stats">
      <div class="stat ${level(id, ns.presents)}"><b>${ns.presents}</b><span>Sur place</span></div>
      <div class="stat ${level(id, ns.inscrits)}"><b>${ns.inscrits}</b><span>Inscrits now</span></div>
      <div class="stat"><b>${ns.target}</b><span>Objectif</span></div>
    </div>
    ${timelineHTML(id)}
    ${gap ? `<div class="gap-warn">${icon("alert")} Sous-effectif de ${fmtTime(gap.start)} à ${fmtTime(gap.end)} (min. ${site(id).min})</div>`
      : `<div class="gap-warn okk">${icon("check")} Minimum assuré pour le reste de la journée</div>`}
    <div class="sc-actions"><button class="btn sm" data-detail="${id}">${icon("eye")} Détails & signaler</button><button class="btn sm primary" data-shift="${id}">${icon("plus")} M'inscrire</button></div>
  </article>`;
}

function renderLeft() {
  const anns = S.announcements.filter((a) => a.pinned).slice(0, 4);
  const feed = S.reports.slice(0, 10);
  $("#home-left").innerHTML = `
    <section>
      <div class="row between" style="margin-bottom:.7em"><h2 class="section-title">${icon("mega")} Annonces</h2>${isMod() ? `<button class="btn sm" data-new-ann>${icon("plus")} Annonce</button>` : ""}</div>
      <div style="display:grid;gap:.7em">${anns.length ? anns.map((a) => `<article class="ann ${a.level === "urgent" ? "urgent" : ""}">
        <h3>${a.level === "urgent" ? icon("alert") : ""}${esc(a.title)}</h3>${a.body ? `<div class="prose" style="margin-top:.4em">${md(a.body)}</div>` : ""}
        <div class="meta">${esc(pseudoOf(a.created_by))} · ${ago(a.created_at)}</div>
        ${isMod() ? `<div class="tools"><button class="icon-btn sm" data-del-ann="${a.id}" aria-label="Retirer l'annonce">${icon("x")}</button></div>` : ""}</article>`).join("") : `<p class="empty">Aucune annonce pour l'instant.</p>`}</div>
    </section>
    <section class="card">
      <div class="row between" style="margin-bottom:.4em"><h2 class="section-title">${icon("bell")} Fil en direct</h2><span class="live">LIVE</span></div>
      ${feed.length ? `<ul class="feed">${feed.map((r) => reportItem(r, true)).join("")}</ul>` : `<p class="muted">Rien de signalé pour l'instant. Clique sur un site pour signaler une info.</p>`}
    </section>`;
  const nb = $("#home-left [data-new-ann]"); if (nb) nb.onclick = openAnnouncementModal;
  $("#home-left").querySelectorAll("[data-del-ann]").forEach((b) => (b.onclick = async () => {
    if (!(await confirmDialog("Retirer cette annonce ?", { ok: "Retirer", danger: true }))) return;
    try { await S.store.remove("announcements", { id: Number(b.dataset.delAnn) }); logAction("announcement_delete", b.dataset.delAnn); } catch (e) { errToast(e); }
  }));
  bindReportTools($("#home-left"));
}

function renderRight() {
  const now = Date.now();
  const myNext = S.shifts.filter((s) => s.user_id === S.me.id && +new Date(s.ends_at) > now).sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0];
  const events = S.events.filter((e) => +new Date(e.starts_at) > now - 2 * 36e5).slice(0, 3);
  const openPolls = S.polls.filter((p) => !p.closed && (!p.closes_at || +new Date(p.closes_at) > now));
  const notVoted = openPolls.filter((p) => !S.myVotes[p.id]);
  const needs = S.materials.filter((m) => !m.done).map((m) => ({ m, got: S.pledges.filter((p) => p.material_id === m.id).reduce((t, p) => t + p.qty, 0) })).filter((x) => x.got < x.m.qty_needed).slice(0, 4);
  $("#home-right").innerHTML = `
    <section class="card">
      <h2 class="section-title" style="margin-bottom:.6em">${icon("clock")} Mon prochain créneau</h2>
      ${myNext ? `<div class="shift-item" style="border:0;padding:0;background:none"><span class="site-tag ${myNext.site}">${esc(site(myNext.site).short)}</span>
        <div class="when"><b>${esc(fmtDay(myNext.starts_at))}</b><span>${fmtTime(myNext.starts_at)} → ${fmtTime(myNext.ends_at)}</span></div></div>`
        : `<p class="muted">Tu n'es inscrit·e sur aucun créneau.</p>`}
      <div class="row" style="margin-top:.8em"><button class="btn sm primary" data-go-shift>${icon("plus")} M'inscrire</button><a class="btn sm" href="#planning">${icon("calendar")} Voir le planning</a></div>
    </section>
    ${notVoted.length ? `<a class="card ann urgent" href="#sondages" style="text-decoration:none;color:inherit;display:block"><h3>${icon("poll")} ${notVoted.length} sondage${notVoted.length > 1 ? "s" : ""} en attente de ton vote</h3><div class="meta">${esc(notVoted[0].question)}</div></a>` : ""}
    <section class="card">
      <div class="row between" style="margin-bottom:.6em"><h2 class="section-title">${icon("agenda")} À venir</h2><a href="#agenda" class="btn sm ghost">Tout voir</a></div>
      ${events.length ? `<div style="display:grid;gap:.8em">${events.map((e) => { const d = new Date(e.starts_at); return `<div class="event-mini"><div class="date-chip"><b>${d.getDate()}</b><span>${d.toLocaleDateString("fr-FR", { month: "short" }).replace(".", "")}</span></div><div><b>${esc(e.title)}</b><div class="muted" style="font-size:.86rem">${esc(fmtDateTime(e.starts_at))}${e.place ? " · " + esc(e.place) : ""}</div></div></div>`; }).join("")}</div>` : `<p class="muted">Aucun événement prévu.</p>`}
    </section>
    <section class="card">
      <div class="row between" style="margin-bottom:.6em"><h2 class="section-title">${icon("box")} Il manque</h2><a href="#materiel" class="btn sm ghost">Matériel</a></div>
      ${needs.length ? `<div style="display:grid;gap:.7em">${needs.map(({ m, got }) => `<div class="mat-item"><b>${esc(m.item)}</b><span class="mono muted">${got}/${m.qty_needed}</span><div class="progress"><i style="width:${Math.min(100, (got / m.qty_needed) * 100)}%"></i></div></div>`).join("")}</div>` : `<p class="muted">Tout le matériel demandé est couvert 👍</p>`}
    </section>`;
  $("#home-right [data-go-shift]").onclick = () => openShiftModal({});
}

function openAnnouncementModal() {
  openModal({
    title: `${icon("mega")} Nouvelle annonce`,
    body: `<form id="ann-form">
      <label class="field"><span>Titre</span><input class="input" name="title" required maxlength="120"></label>
      <label class="field"><span>Texte (facultatif)</span><textarea class="input" name="body" maxlength="1500"></textarea><small>**gras**, listes avec « - », liens automatiques.</small></label>
      <label class="switch"><input type="checkbox" name="urgent"> Urgente (mise en avant + notification)</label>
      <div class="form-actions"><button type="button" class="btn ghost" data-cancel>Annuler</button><button class="btn primary">Publier</button></div></form>`,
    onMount: (d) => {
      d.querySelector("[data-cancel]").onclick = closeModal;
      d.querySelector("form").onsubmit = async (e) => {
        e.preventDefault(); const f = e.target;
        try {
          await S.store.insert("announcements", { title: f.title.value.trim(), body: f.body.value.trim() || null, level: f.urgent.checked ? "urgent" : "info", pinned: true });
          logAction("announcement", f.title.value.trim()); toast("Annonce publiée", "ok"); closeModal();
        } catch (er) { errToast(er); }
      };
    },
  });
}

// ---------- Repositionnement d'un site (admin) ----------
function renderPick() {
  const slot = $("#pick-slot"); if (!slot) return;
  setPickCursor(!!S.pickSite);
  slot.innerHTML = S.pickSite ? `<div class="pick-banner">${icon("target")} Clique sur la carte à l'emplacement exact de « ${esc(site(S.pickSite).short)} »<button data-cancel-pick>Annuler</button></div>` : "";
  const c = slot.querySelector("[data-cancel-pick]"); if (c) c.onclick = () => { S.pickSite = null; renderPick(); };
}
async function pickSite(id, lat, lng) {
  S.pickSite = null;
  renderPick();
  const sites = structuredClone(S.settings.sites);
  sites[id] = { ...sites[id], lat: +lat.toFixed(6), lng: +lng.toFixed(6) };
  try {
    await S.store.update("settings", { id: 1 }, { data: { ...S.settings, sites } });
    logAction("settings", "position " + id, { lat, lng });
    toast(`Position de ${site(id).short} mise à jour`, "ok");
  } catch (e) { errToast(e); }
}
