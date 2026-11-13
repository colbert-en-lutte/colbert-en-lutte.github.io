import { S, site, canSite, isMod, prof, pseudoOf, countOverlap, peopleOverlap, level, SITE_IDS } from "../state.js";
import { esc, icon, fmtTime, fmtDay, fmtDayShort, fmtDate, startOfWeek, addDays, sameDay, hhmm, openModal, closeModal, toast, avatar, downloadText, csv, $ } from "../ui.js";
import { openShiftModal } from "./actions.js";

let planSite = "colbert";
let weekStart = startOfWeek(new Date());
let night = false;
let scrolled = false;

export function renderPlanning(view) {
  scrolled = false;
  view.innerHTML = `
    <div class="page-head"><div><h1>Planning des <em>équipes</em></h1>
      <p>Inscris-toi aux heures où tu peux être là. Minimum : ${site("colbert").min} à ${esc(site("colbert").short)}, ${site("ibd").min} à ${esc(site("ibd").short)} · objectif ${site("colbert").target} / ${site("ibd").target}.</p></div>
      <button class="btn primary" data-new>${icon("plus")} M'inscrire</button></div>
    <div class="plan-toolbar">
      <div class="seg" role="group" aria-label="Site">${SITE_IDS.map((id) => `<button data-site="${id}" aria-pressed="${id === planSite}">${esc(site(id).short)}</button>`).join("")}</div>
      <div class="week"><button class="icon-btn" data-week="-1" aria-label="Semaine précédente">${icon("chevL")}</button><span id="week-label"></span><button class="icon-btn" data-week="1" aria-label="Semaine suivante">${icon("chevR")}</button></div>
      <button class="btn sm ghost" data-today>Aujourd'hui</button>
      <label class="switch"><input type="checkbox" data-night ${night ? "checked" : ""}> Nuit (0h–24h)</label>
      ${SITE_IDS.some(canSite) ? `<button class="btn sm ghost" data-export>${icon("download")} Export CSV</button>` : ""}
    </div>
    <div class="legend"><span><i style="background:color-mix(in srgb,var(--low) 30%,transparent)"></i>Sous le minimum</span><span><i style="background:color-mix(in srgb,var(--mid) 35%,transparent)"></i>Minimum atteint</span><span><i style="background:color-mix(in srgb,var(--ok) 35%,transparent)"></i>Objectif atteint</span><span><i style="box-shadow:inset 3px 0 0 var(--accent-2);background:var(--surface-3)"></i>Mes créneaux</span><span>Clique sur une case pour voir qui est là / t'inscrire.</span></div>
    <div class="plan-layout"><div class="plan-wrap" id="plan-wrap"></div><aside id="plan-side" style="display:grid;gap:1.2em"></aside></div>`;
  view.querySelector("[data-new]").onclick = () => openShiftModal({ site: planSite });
  view.querySelectorAll("[data-site]").forEach((b) => (b.onclick = () => { planSite = b.dataset.site; view.querySelectorAll("[data-site]").forEach((x) => x.setAttribute("aria-pressed", x === b)); updatePlanning(); }));
  view.querySelectorAll("[data-week]").forEach((b) => (b.onclick = () => { weekStart = addDays(weekStart, 7 * Number(b.dataset.week)); updatePlanning(); }));
  view.querySelector("[data-today]").onclick = () => { weekStart = startOfWeek(new Date()); scrolled = false; updatePlanning(); };
  view.querySelector("[data-night]").onchange = (e) => { night = e.target.checked; scrolled = false; updatePlanning(); };
  const ex = view.querySelector("[data-export]"); if (ex) ex.onclick = exportCSV;
  updatePlanning();
}

export function updatePlanning() {
  const wrap = $("#plan-wrap"); if (!wrap) return;
  const st = S.settings;
  const h0 = night ? 0 : st.day_start, h1 = night ? 24 : st.day_end;
  const days = [...Array(7)].map((_, i) => addDays(weekStart, i));
  $("#week-label").textContent = `${fmtDate(days[0])} → ${fmtDate(days[6])}`;
  const now = Date.now();
  const mine = S.shifts.filter((s) => s.user_id === S.me.id);
  let html = `<div class="plan" role="grid" aria-label="Planning ${esc(site(planSite).short)}"><div class="corner"></div>`;
  for (const d of days) {
    const dayEnd = addDays(d, 1);
    const ppl = new Set(S.shifts.filter((s) => s.site === planSite && +new Date(s.starts_at) < +dayEnd && +new Date(s.ends_at) > +d).map((s) => s.user_id)).size;
    html += `<div class="hd ${sameDay(d, now) ? "today" : ""}" role="columnheader">${esc(fmtDayShort(d))}<span class="tot">${ppl} pers.</span></div>`;
  }
  for (let m = h0 * 60; m < h1 * 60; m += 30) {
    const hour = m % 60 === 0;
    html += `<div class="tm ${hour ? "hour" : ""}" role="rowheader">${hour ? hhmm(m) : ""}</div>`;
    for (const d of days) {
      const a = new Date(d.getTime()); a.setMinutes(m);
      const b = new Date(a.getTime() + 30 * 6e4);
      const n = countOverlap(planSite, a, b);
      const lv = level(planSite, n);
      const isMine = mine.some((s) => s.site === planSite && +new Date(s.starts_at) < +b && +new Date(s.ends_at) > +a);
      const past = +b < now;
      const isNow = +a <= now && now < +b;
      const k = lv === "low" ? Math.round((1 - n / Math.max(1, site(planSite).min)) * 20) : 0;
      html += `<button class="cell ${lv} ${hour ? "h" : ""} ${isMine ? "mine" : ""} ${past ? "past" : ""} ${isNow ? "nowline" : ""}" style="--k:${k};${isNow ? `--t:${((now - a) / 18e5) * 100}%` : ""}" data-t="${a.getTime()}" aria-label="${esc(fmtDayShort(a))} ${hhmm(m)} : ${n} inscrit·e${n > 1 ? "s" : ""}${isMine ? ", dont toi" : ""}">${n || ""}</button>`;
    }
  }
  html += "</div>";
  const keep = wrap.scrollTop;
  wrap.innerHTML = html;
  wrap.scrollTop = keep;
  wrap.querySelectorAll(".cell").forEach((c) => (c.onclick = () => openCell(new Date(Number(c.dataset.t)))));
  if (!scrolled) {
    scrolled = true;
    const target = wrap.querySelector(".nowline") || wrap.querySelector(`.cell[data-t]`);
    if (target && wrap.querySelector(".nowline")) wrap.scrollTop = Math.max(0, target.offsetTop - 120);
    const today = wrap.querySelector(".hd.today");
    if (today && wrap.clientWidth < wrap.scrollWidth) wrap.scrollLeft = Math.max(0, today.offsetLeft - 62);
  }
  renderSide();
}

function gapsThisWeek() {
  const st = S.settings, out = [];
  const now = Date.now();
  for (let i = 0; i < 7; i++) {
    const d = addDays(weekStart, i);
    let cur = null;
    for (let m = st.day_start * 60; m < st.day_end * 60; m += 30) {
      const a = new Date(d.getTime()); a.setMinutes(m);
      const b = new Date(a.getTime() + 30 * 6e4);
      if (+b <= now) continue;
      const n = countOverlap(planSite, a, b);
      if (n < site(planSite).min) { if (!cur) cur = { start: a, end: b, n }; else { cur.end = b; cur.n = Math.min(cur.n, n); } }
      else if (cur) { out.push(cur); cur = null; }
    }
    if (cur) out.push(cur);
  }
  return out;
}

function renderSide() {
  const side = $("#plan-side"); if (!side) return;
  const now = Date.now();
  const mine = S.shifts.filter((s) => s.user_id === S.me.id && +new Date(s.ends_at) > now).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const gaps = gapsThisWeek().slice(0, 6);
  side.innerHTML = `
    <section><h2 class="section-title" style="font-size:1.1rem;margin-bottom:.6em">${icon("check")} Mes créneaux</h2>
      <div class="my-shifts">${mine.length ? mine.map((s) => `<div class="shift-item"><span class="site-tag ${s.site}">${esc(site(s.site).short)}</span>
        <div class="when"><b>${esc(fmtDay(s.starts_at))}</b><span>${fmtTime(s.starts_at)} → ${fmtTime(s.ends_at)}${s.note ? " · " + esc(s.note) : ""}</span></div>
        <button class="icon-btn sm" data-edit="${s.id}" aria-label="Modifier ce créneau">${icon("edit")}</button></div>`).join("") : `<p class="empty">Aucun créneau à venir.<br>Clique sur une case rouge pour aider !</p>`}</div></section>
    <section><h2 class="section-title" style="font-size:1.1rem;margin-bottom:.6em;color:var(--low)">${icon("alert")} Trous à combler · ${esc(site(planSite).short)}</h2>
      ${gaps.length ? `<div class="my-shifts">${gaps.map((g) => `<button class="shift-item" style="cursor:pointer;text-align:left;color:inherit" data-gap="${g.start.getTime()}|${g.end.getTime()}">
        <div class="when"><b>${esc(fmtDay(g.start))}</b><span>${fmtTime(g.start)} → ${fmtTime(g.end)} · ${g.n}/${site(planSite).min} min.</span></div>${icon("plus")}</button>`).join("")}</div>` : `<p class="muted">Aucun trou cette semaine 💪</p>`}</section>`;
  side.querySelectorAll("[data-edit]").forEach((b) => (b.onclick = () => openShiftModal({ shift: S.shifts.find((s) => s.id === Number(b.dataset.edit)) })));
  side.querySelectorAll("[data-gap]").forEach((b) => (b.onclick = () => { const [a, e] = b.dataset.gap.split("|").map(Number); openShiftModal({ site: planSite, start: new Date(a), end: new Date(e) }); }));
}

function openCell(a) {
  const b = new Date(a.getTime() + 30 * 6e4);
  const list = peopleOverlap(planSite, a, b).sort((x, y) => x.starts_at.localeCompare(y.starts_at));
  const past = +b < Date.now();
  const n = countOverlap(planSite, a, b);
  openModal({
    title: `${icon("users")} ${esc(site(planSite).short)} · ${fmtTime(a)}–${fmtTime(b)}`,
    body: `<p class="muted" style="text-transform:capitalize">${esc(fmtDay(a))} · <b style="color:var(--${level(planSite, n)})">${n} inscrit·e${n > 1 ? "s" : ""}</b> (min. ${site(planSite).min}, objectif ${site(planSite).target})</p>
      ${list.length ? `<div class="my-shifts">${list.map((s) => `<div class="shift-item">${avatar(prof(s.user_id), "sm")}<div class="when"><b style="text-transform:none">${esc(pseudoOf(s.user_id))}${s.user_id === S.me.id ? " (toi)" : ""}</b><span>${fmtTime(s.starts_at)} → ${fmtTime(s.ends_at)}${s.note ? " · " + esc(s.note) : ""}</span></div>
        ${s.user_id === S.me.id || canSite(s.site) ? `<button class="icon-btn sm" data-edit="${s.id}" aria-label="Modifier">${icon("edit")}</button>` : ""}</div>`).join("")}</div>` : `<p class="empty">Personne sur ce créneau.</p>`}
      <div class="form-actions">${past ? `<span class="muted">Créneau passé</span>` : `<button class="btn primary" data-join>${icon("plus")} M'inscrire à partir de ${fmtTime(a)}</button>`}</div>`,
    onMount: (d) => {
      const j = d.querySelector("[data-join]"); if (j) j.onclick = () => openShiftModal({ site: planSite, start: a, end: new Date(a.getTime() + 2 * 36e5) });
      d.querySelectorAll("[data-edit]").forEach((x) => (x.onclick = () => openShiftModal({ shift: S.shifts.find((s) => s.id === Number(x.dataset.edit)) })));
    },
  });
}

function exportCSV() {
  const end = addDays(weekStart, 7);
  const rows = S.shifts.filter((s) => +new Date(s.starts_at) < +end && +new Date(s.ends_at) > +weekStart).sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    .map((s) => [new Date(s.starts_at).toLocaleDateString("fr-FR"), site(s.site).short, pseudoOf(s.user_id), fmtTime(s.starts_at), fmtTime(s.ends_at), s.note || ""]);
  downloadText(`planning-${weekStart.toISOString().slice(0, 10)}.csv`, csv([["Date", "Site", "Pseudo", "Début", "Fin", "Note"], ...rows]));
  toast("Export du planning de la semaine (pseudos uniquement)", "ok");
  void isMod; void closeModal;
}
