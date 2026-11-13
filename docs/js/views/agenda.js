import { S, isMod, siteName, logAction } from "../state.js";
import { esc, icon, fmtDay, fmtTime, md, toDateInput, openModal, closeModal, errToast, confirmDialog, $ } from "../ui.js";

export function renderAgenda(view) {
  view.innerHTML = `<div class="page-head"><div><h1>Agenda <em>des actions</em></h1><p>AG, rassemblements, réunions : tout ce qui est prévu.</p></div>
    ${isMod() ? `<button class="btn primary" data-new>${icon("plus")} Ajouter</button>` : ""}</div><div id="agenda-body"></div>`;
  const n = view.querySelector("[data-new]"); if (n) n.onclick = () => evModal();
  updateAgenda();
}

export function updateAgenda() {
  const body = $("#agenda-body"); if (!body) return;
  const now = Date.now() - 2 * 36e5;
  const up = S.events.filter((e) => +new Date(e.starts_at) >= now), past = S.events.filter((e) => +new Date(e.starts_at) < now).reverse();
  const item = (e) => { const d = new Date(e.starts_at); return `<article class="card ev">
      <div class="date-chip"><b>${d.getDate()}</b><span>${d.toLocaleDateString("fr-FR", { month: "short" }).replace(".", "")}</span></div>
      <div class="body"><h3>${esc(e.title)}</h3><div class="meta"><span>${icon("clock")} <span style="text-transform:capitalize">${esc(fmtDay(d))}</span>, ${fmtTime(d)}</span>${e.place ? `<span>${icon("pin")} ${esc(e.place)}</span>` : ""}${e.site ? `<span class="site-tag ${e.site}">${esc(siteName(e.site))}</span>` : ""}</div>
        ${e.description ? `<div class="prose">${md(e.description)}</div>` : ""}</div>
      ${isMod() ? `<div class="row" style="gap:.1em;flex-wrap:nowrap"><button class="icon-btn sm" data-edit="${e.id}" aria-label="Modifier">${icon("edit")}</button><button class="icon-btn sm" data-del="${e.id}" aria-label="Supprimer">${icon("trash")}</button></div>` : ""}</article>`; };
  body.innerHTML = (up.length ? `<div style="display:grid;gap:.8em">${up.map(item).join("")}</div>` : `<p class="empty">Rien de prévu pour l'instant.</p>`) +
    (past.length ? `<details style="margin-top:2em"><summary class="muted" style="cursor:pointer;font-weight:700">Événements passés (${past.length})</summary><div style="display:grid;gap:.8em;margin-top:.8em;opacity:.65">${past.map(item).join("")}</div></details>` : "");
  body.querySelectorAll("[data-edit]").forEach((b) => (b.onclick = () => evModal(S.events.find((e) => e.id === Number(b.dataset.edit)))));
  body.querySelectorAll("[data-del]").forEach((b) => (b.onclick = async () => {
    if (!(await confirmDialog("Supprimer cet événement ?", { ok: "Supprimer", danger: true }))) return;
    try { await S.store.remove("events", { id: Number(b.dataset.del) }); logAction("event_delete", b.dataset.del); } catch (er) { errToast(er); }
  }));
}

function evModal(ev = null) {
  const d = ev ? new Date(ev.starts_at) : new Date(Date.now() + 864e5);
  const t = `${String(d.getHours()).padStart(2, "0")}:${String(ev ? d.getMinutes() : 0).padStart(2, "0")}`;
  openModal({
    title: `${icon("agenda")} ${ev ? "Modifier" : "Nouvel"} événement`,
    body: `<form><label class="field"><span>Titre</span><input class="input" name="title" required maxlength="120" value="${esc(ev?.title || "")}" placeholder="ex : AG commune"></label>
      <div class="grid2"><label class="field"><span>Jour</span><input class="input" type="date" name="day" required value="${toDateInput(d)}"></label><label class="field"><span>Heure</span><input class="input" type="time" name="time" required value="${ev ? t : "12:00"}"></label></div>
      <div class="grid2"><label class="field"><span>Site</span><select class="input" name="site">${["colbert", "ibd", "autre"].map((s) => `<option value="${s}" ${ev?.site === s ? "selected" : ""}>${esc(siteName(s))}</option>`).join("")}</select></label><label class="field"><span>Lieu précis</span><input class="input" name="place" maxlength="80" value="${esc(ev?.place || "")}" placeholder="ex : amphi A"></label></div>
      <label class="field"><span>Description</span><textarea class="input" name="description" maxlength="1500">${esc(ev?.description || "")}</textarea></label>
      <div class="form-actions"><button type="button" class="btn ghost" data-cancel>Annuler</button><button class="btn primary">Enregistrer</button></div></form>`,
    onMount: (dl) => {
      dl.querySelector("[data-cancel]").onclick = closeModal;
      dl.querySelector("form").onsubmit = async (e) => {
        e.preventDefault(); const f = e.target;
        const [y, m, da] = f.day.value.split("-").map(Number); const [hh, mm] = f.time.value.split(":").map(Number);
        const row = { title: f.title.value.trim(), site: f.site.value, place: f.place.value.trim() || null, description: f.description.value.trim() || null, starts_at: new Date(y, m - 1, da, hh, mm).toISOString() };
        try { if (ev) await S.store.update("events", { id: ev.id }, row); else await S.store.insert("events", row); logAction(ev ? "event_edit" : "event_add", row.title); closeModal(); } catch (er) { errToast(er); }
      };
    },
  });
}
