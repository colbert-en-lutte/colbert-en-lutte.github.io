import { S, isMod, logAction } from "../state.js";
import { PAGE_KINDS } from "../defaults.js";
import { esc, icon, ago, md, openModal, closeModal, toast, errToast, confirmDialog, $ } from "../ui.js";

let tab = "revendication";

export function renderInfos(view) {
  view.innerHTML = `<div class="page-head"><div><h1>S'informer, <em>convaincre</em></h1><p>Nos revendications, nos arguments et ce qu'il faut savoir avant de venir.</p></div>
      ${isMod() ? `<button class="btn primary" data-new>${icon("plus")} Ajouter</button>` : ""}</div>
    <div class="tabs" role="tablist">${Object.entries(PAGE_KINDS).map(([k, v]) => `<button role="tab" data-tab="${k}" aria-selected="${k === tab}">${esc(v.label)}</button>`).join("")}</div>
    <div id="infos-body"></div>`;
  view.querySelectorAll("[data-tab]").forEach((b) => (b.onclick = () => { tab = b.dataset.tab; view.querySelectorAll("[data-tab]").forEach((x) => x.setAttribute("aria-selected", x === b)); updateInfos(); }));
  const n = view.querySelector("[data-new]"); if (n) n.onclick = () => pageModal({ kind: tab });
  updateInfos();
}

export function updateInfos() {
  const body = $("#infos-body"); if (!body) return;
  const pages = S.pages.filter((p) => p.kind === tab).sort((a, b) => a.position - b.position || a.id - b.id);
  const rev = tab === "revendication";
  body.innerHTML = pages.length ? `<div class="cards">${pages.map((p, i) => `<article class="card doc-card">
      <div class="row" style="align-items:flex-start;flex-wrap:nowrap">${rev ? `<span class="rev-num">${i + 1}</span>` : ""}<h2 style="flex:1">${esc(p.title)}</h2>
        ${isMod() ? `<button class="icon-btn sm" data-edit="${p.id}" aria-label="Modifier">${icon("edit")}</button>` : ""}</div>
      <div class="prose">${md(p.body)}</div>
      <div class="foot"><small class="muted">Mis à jour ${ago(p.updated_at)}</small>
        ${rev ? `<button class="btn sm support-btn" data-support="${p.id}" aria-pressed="${S.mySupports.has(p.id)}">${icon("fist")} Je soutiens · <span class="mono">${S.supportCounts[p.id] || 0}</span></button>` : ""}</div>
    </article>`).join("")}</div>`
    : `<p class="empty">${isMod() ? "Rien ici pour l'instant. Clique sur « Ajouter » pour créer la première page." : "Cette section sera bientôt remplie par l'équipe."}</p>`;
  body.querySelectorAll("[data-edit]").forEach((b) => (b.onclick = () => pageModal(S.pages.find((p) => p.id === Number(b.dataset.edit)))));
  body.querySelectorAll("[data-support]").forEach((b) => (b.onclick = async () => {
    const id = Number(b.dataset.support);
    const on = S.mySupports.has(id);
    try {
      if (on) await S.store.remove("supports", { page_id: id, user_id: S.me.id });
      else await S.store.insert("supports", { page_id: id, user_id: S.me.id });
      if (S.store.mode === "live") { on ? S.mySupports.delete(id) : S.mySupports.add(id); S.supportCounts[id] = (S.supportCounts[id] || 0) + (on ? -1 : 1); updateInfos(); }
    } catch (e) { errToast(e); }
  }));
}

function pageModal(p) {
  const editing = !!p?.id;
  openModal({
    title: `${icon("edit")} ${editing ? "Modifier" : "Nouvelle"} ${esc(PAGE_KINDS[p.kind].one)}`, wide: true,
    body: `<form id="page-form">
      <label class="field"><span>Rubrique</span><select class="input" name="kind">${Object.entries(PAGE_KINDS).map(([k, v]) => `<option value="${k}" ${k === p.kind ? "selected" : ""}>${esc(v.label)}</option>`).join("")}</select></label>
      <label class="field"><span>Titre</span><input class="input" name="title" required maxlength="160" value="${esc(p.title || "")}"></label>
      <label class="field"><span>Contenu</span><textarea class="input" name="body" rows="12" style="font-family:var(--font-mono);font-size:.9rem">${esc(p.body || (p.kind === "revendication" ? "## Le constat\n\n\n## Ce qu'on demande\n- \n\n## Pourquoi c'est juste\n" : ""))}</textarea>
        <small>Mise en forme : « ## » pour un sous-titre, « - » pour une liste, **gras**, les liens deviennent cliquables.</small></label>
      <label class="field" style="max-width:160px"><span>Ordre d'affichage</span><input class="input" type="number" name="position" value="${p.position ?? (S.pages.filter((x) => x.kind === p.kind).length + 1)}"></label>
      <div class="form-actions">${editing ? `<button type="button" class="btn danger" data-del>${icon("trash")} Supprimer</button>` : ""}<button type="button" class="btn ghost" data-cancel>Annuler</button><button class="btn primary">Enregistrer</button></div></form>`,
    onMount: (d) => {
      d.querySelector("[data-cancel]").onclick = closeModal;
      const del = d.querySelector("[data-del]");
      if (del) del.onclick = async () => { if (await confirmDialog(`Supprimer « ${p.title} » ?`, { ok: "Supprimer", danger: true })) { try { await S.store.remove("pages", { id: p.id }); logAction("page_delete", p.title); } catch (e) { errToast(e); } } };
      d.querySelector("form").onsubmit = async (e) => {
        e.preventDefault(); const f = e.target;
        const row = { kind: f.kind.value, title: f.title.value.trim(), body: f.body.value, position: Number(f.position.value) || 0, updated_at: new Date().toISOString() };
        try {
          if (editing) await S.store.update("pages", { id: p.id }, row); else await S.store.insert("pages", row);
          logAction(editing ? "page_edit" : "page_add", row.title); tab = row.kind; toast("Enregistré", "ok"); closeModal();
        } catch (er) { errToast(er); }
      };
    },
  });
}
