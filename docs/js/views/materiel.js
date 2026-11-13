import { S, canSite, siteName, pseudoOf, logAction, SITE_IDS } from "../state.js";
import { esc, icon, openModal, closeModal, toast, errToast, confirmDialog, $ } from "../ui.js";

export function renderMateriel(view) {
  const canAdd = ["both", ...SITE_IDS].some(canSite);
  view.innerHTML = `<div class="page-head"><div><h1>Matériel & <em>logistique</em></h1><p>Ce dont on a besoin sur place. Indique ce que tu peux apporter pour éviter les doublons.</p></div>
    ${canAdd ? `<button class="btn primary" data-new>${icon("plus")} Ajouter un besoin</button>` : ""}</div><div id="mat-body"></div>`;
  const n = view.querySelector("[data-new]"); if (n) n.onclick = () => matModal();
  updateMateriel();
}

export function updateMateriel() {
  const body = $("#mat-body"); if (!body) return;
  const groups = [["both", "Pour les deux sites"], ...SITE_IDS.map((id) => [id, siteName(id)])];
  body.innerHTML = groups.map(([g, label]) => {
    const items = S.materials.filter((m) => m.site === g);
    if (!items.length) return "";
    return `<h2 class="section-title" style="margin:1.2em 0 .7em"><span class="site-tag ${g}">${esc(label)}</span></h2><div class="cards">${items.map((m) => {
      const pl = S.pledges.filter((p) => p.material_id === m.id);
      const got = pl.reduce((t, p) => t + p.qty, 0);
      const mine = pl.find((p) => p.user_id === S.me.id);
      const full = got >= m.qty_needed || m.done;
      return `<article class="card" style="display:grid;gap:.7em;${m.done ? "opacity:.6" : ""}">
        <div class="mat-item"><h3 style="font-size:1.05rem">${esc(m.item)}${m.done ? ` <span class="badge">${icon("check")} réglé</span>` : ""}</h3><span class="mono" style="font-weight:700">${got} / ${m.qty_needed}</span>
          <div class="progress ${full ? "full" : ""}"><i style="width:${Math.min(100, (got / m.qty_needed) * 100)}%"></i></div></div>
        ${pl.length ? `<div class="muted" style="font-size:.86rem">${pl.map((p) => `${esc(pseudoOf(p.user_id))} (${p.qty})`).join(", ")}</div>` : `<div class="muted" style="font-size:.86rem">Personne pour l'instant.</div>`}
        <div class="row">
          ${m.done ? "" : mine ? `<span class="badge accent">Tu apportes ${mine.qty}</span><button class="btn sm ghost" data-unpledge="${m.id}">Annuler</button>`
            : `<input class="input" type="number" min="1" max="99" value="1" style="width:76px;min-height:36px" aria-label="Quantité" data-qty="${m.id}"><button class="btn sm primary" data-pledge="${m.id}">${icon("plus")} J'apporte</button>`}
          ${canSite(m.site) ? `<span style="flex:1"></span><button class="icon-btn sm" data-done="${m.id}" title="${m.done ? "Rouvrir" : "Marquer comme réglé"}" aria-label="${m.done ? "Rouvrir" : "Marquer comme réglé"}">${icon(m.done ? "rotate" : "check")}</button><button class="icon-btn sm" data-del="${m.id}" aria-label="Supprimer">${icon("trash")}</button>` : ""}
        </div></article>`;
    }).join("")}</div>`;
  }).join("") || `<p class="empty">Aucun besoin de matériel listé.</p>`;

  body.querySelectorAll("[data-pledge]").forEach((b) => (b.onclick = async () => {
    const id = Number(b.dataset.pledge); const qty = Math.max(1, Number(body.querySelector(`[data-qty="${id}"]`).value) || 1);
    try { await S.store.upsert("pledges", { material_id: id, user_id: S.me.id, qty }, "material_id,user_id"); toast("Merci ! C'est noté.", "ok"); } catch (e) { errToast(e); }
  }));
  body.querySelectorAll("[data-unpledge]").forEach((b) => (b.onclick = async () => { try { await S.store.remove("pledges", { material_id: Number(b.dataset.unpledge), user_id: S.me.id }); } catch (e) { errToast(e); } }));
  body.querySelectorAll("[data-done]").forEach((b) => (b.onclick = async () => { const m = S.materials.find((x) => x.id === Number(b.dataset.done)); try { await S.store.update("materials", { id: m.id }, { done: !m.done }); } catch (e) { errToast(e); } }));
  body.querySelectorAll("[data-del]").forEach((b) => (b.onclick = async () => {
    if (!(await confirmDialog("Supprimer ce besoin ?", { ok: "Supprimer", danger: true }))) return;
    try { await S.store.remove("materials", { id: Number(b.dataset.del) }); logAction("material_delete", b.dataset.del); } catch (e) { errToast(e); }
  }));
}

function matModal() {
  const sites = ["both", ...SITE_IDS].filter(canSite);
  openModal({
    title: `${icon("box")} Nouveau besoin`,
    body: `<form><label class="field"><span>Quoi</span><input class="input" name="item" required maxlength="80" placeholder="ex : Packs d'eau"></label>
      <div class="grid2"><label class="field"><span>Quantité</span><input class="input" type="number" name="qty" min="1" value="1" required></label>
      <label class="field"><span>Pour</span><select class="input" name="site">${sites.map((s) => `<option value="${s}">${esc(siteName(s))}</option>`).join("")}</select></label></div>
      <div class="form-actions"><button type="button" class="btn ghost" data-cancel>Annuler</button><button class="btn primary">Ajouter</button></div></form>`,
    onMount: (d) => {
      d.querySelector("[data-cancel]").onclick = closeModal;
      d.querySelector("form").onsubmit = async (e) => {
        e.preventDefault(); const f = e.target;
        try { await S.store.insert("materials", { item: f.item.value.trim(), qty_needed: Number(f.qty.value), site: f.site.value }); logAction("material_add", f.item.value.trim()); closeModal(); } catch (er) { errToast(er); }
      };
    },
  });
}
