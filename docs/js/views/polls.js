import { S, isMod, pseudoOf, logAction } from "../state.js";
import { loaders } from "../data.js";
import { esc, icon, ago, fmtDateTime, openModal, closeModal, toast, errToast, confirmDialog, $ } from "../ui.js";

const isOpen = (p) => !p.closed && (!p.closes_at || +new Date(p.closes_at) > Date.now());
const canCreate = () => isMod() || S.settings.member_polls;

export function renderPolls(view) {
  view.innerHTML = `<div class="page-head"><div><h1>Sondages & <em>votes</em></h1><p>Votes anonymes : seuls les totaux sont visibles, personne ne voit qui a voté quoi.</p></div>
    ${canCreate() ? `<button class="btn primary" data-new>${icon("plus")} Nouveau sondage</button>` : ""}</div><div id="polls-body"></div>`;
  const n = view.querySelector("[data-new]"); if (n) n.onclick = pollModal;
  updatePolls();
}

async function refreshCounts() { try { await loaders.polls(); updatePolls(); } catch { } }

export function updatePolls() {
  const body = $("#polls-body"); if (!body) return;
  const open = S.polls.filter(isOpen), closed = S.polls.filter((p) => !isOpen(p));
  const block = (p) => {
    const counts = S.pollCounts[p.id] || {};
    const voters = counts[-1] || 0;
    const mine = S.myVotes[p.id];
    const showResults = !!mine || !isOpen(p);
    const max = Math.max(0, ...(p.options || []).map((_, i) => counts[i] || 0));
    const opts = (p.options || []).map((o, i) => {
      const n = counts[i] || 0, pc = voters ? Math.round((n / voters) * 100) : 0;
      const sel = mine?.includes(i);
      return showResults
        ? `<div class="opt ${sel ? "mine" : ""} ${n === max && n > 0 ? "win" : ""}" style="--w:${pc}%;cursor:default"><span class="bar"></span>${sel ? icon("check") : ""}<span class="lab">${esc(o)}</span><span class="pc">${pc}% <small class="muted">(${n})</small></span></div>`
        : `<label class="opt"><input type="${p.multiple ? "checkbox" : "radio"}" name="p${p.id}" value="${i}"><span class="lab">${esc(o)}</span></label>`;
    }).join("");
    return `<article class="card poll" data-poll="${p.id}">
      <div class="row between" style="align-items:flex-start;flex-wrap:nowrap"><h2>${esc(p.question)}</h2>
        ${isMod() || p.created_by === S.me.id ? `<div class="row" style="gap:.1em;flex-wrap:nowrap">${isOpen(p) ? `<button class="icon-btn sm" data-close="${p.id}" title="Clôturer" aria-label="Clôturer le sondage">${icon("lock")}</button>` : ""}<button class="icon-btn sm" data-del="${p.id}" title="Supprimer" aria-label="Supprimer le sondage">${icon("trash")}</button></div>` : ""}</div>
      <div class="row muted" style="font-size:.84rem;gap:.8em">${isOpen(p) ? `<span class="badge accent">Ouvert</span>` : `<span class="badge">Clôturé</span>`}${p.multiple ? "<span>Plusieurs choix possibles</span>" : ""}<span>${voters} votant·e${voters > 1 ? "s" : ""}</span>${p.closes_at && isOpen(p) ? `<span>Fin : ${esc(fmtDateTime(p.closes_at))}</span>` : ""}<span>par ${esc(pseudoOf(p.created_by))} · ${ago(p.created_at)}</span></div>
      <div style="display:grid;gap:.5em">${opts}</div>
      ${isOpen(p) ? (mine ? `<div><button class="btn sm ghost" data-unvote="${p.id}">${icon("rotate")} Changer mon vote</button></div>` : `<div><button class="btn primary" data-vote="${p.id}">${icon("check")} Voter</button></div>`) : ""}
    </article>`;
  };
  body.innerHTML = (open.length ? `<div class="cards">${open.map(block).join("")}</div>` : `<p class="empty">Aucun sondage en cours.</p>`) +
    (closed.length ? `<h2 class="section-title" style="margin:2em 0 .8em">${icon("lock")} Clôturés</h2><div class="cards">${closed.map(block).join("")}</div>` : "");

  body.querySelectorAll("[data-vote]").forEach((b) => (b.onclick = async () => {
    const id = Number(b.dataset.vote);
    const choices = [...body.querySelectorAll(`[data-poll="${id}"] input:checked`)].map((x) => Number(x.value));
    if (!choices.length) return toast("Choisis au moins une option", "error");
    try { await S.store.insert("poll_votes", { poll_id: id, user_id: S.me.id, choices }); toast("A voté ! 🗳️", "ok"); refreshCounts(); } catch (e) { errToast(e); }
  }));
  body.querySelectorAll("[data-unvote]").forEach((b) => (b.onclick = async () => {
    try { await S.store.remove("poll_votes", { poll_id: Number(b.dataset.unvote), user_id: S.me.id }); refreshCounts(); } catch (e) { errToast(e); }
  }));
  body.querySelectorAll("[data-close]").forEach((b) => (b.onclick = async () => {
    if (!(await confirmDialog("Clôturer ce sondage ? Plus personne ne pourra voter.", { ok: "Clôturer" }))) return;
    try { await S.store.update("polls", { id: Number(b.dataset.close) }, { closed: true }); logAction("poll_close", b.dataset.close); } catch (e) { errToast(e); }
  }));
  body.querySelectorAll("[data-del]").forEach((b) => (b.onclick = async () => {
    if (!(await confirmDialog("Supprimer définitivement ce sondage et ses votes ?", { ok: "Supprimer", danger: true }))) return;
    try { await S.store.remove("polls", { id: Number(b.dataset.del) }); logAction("poll_delete", b.dataset.del); } catch (e) { errToast(e); }
  }));
}

function pollModal() {
  openModal({
    title: `${icon("poll")} Nouveau sondage`,
    body: `<form id="poll-form">
      <label class="field"><span>Question</span><input class="input" name="q" required maxlength="300" placeholder="ex : On reconduit le blocage lundi ?"></label>
      <div class="field"><span>Options</span><div id="opts" style="display:grid;gap:.4em"></div><button type="button" class="btn sm ghost" data-add style="justify-self:start">${icon("plus")} Ajouter une option</button></div>
      <label class="switch" style="margin-bottom:1em"><input type="checkbox" name="multiple"> Plusieurs choix possibles</label>
      <label class="field"><span>Date de fin (facultatif)</span><input class="input" type="datetime-local" name="closes"></label>
      <p class="form-error" id="poll-err"></p>
      <div class="form-actions"><button type="button" class="btn ghost" data-cancel>Annuler</button><button class="btn primary">Publier</button></div></form>`,
    onMount: (d) => {
      const opts = d.querySelector("#opts");
      const add = (v = "") => { const row = document.createElement("div"); row.className = "row"; row.style.flexWrap = "nowrap"; row.innerHTML = `<input class="input" maxlength="120" value="${esc(v)}" placeholder="Option"><button type="button" class="icon-btn" aria-label="Retirer">${icon("x")}</button>`; row.querySelector("button").onclick = () => row.remove(); opts.appendChild(row); };
      ["Oui", "Non", "Abstention"].forEach(add);
      d.querySelector("[data-add]").onclick = () => add();
      d.querySelector("[data-cancel]").onclick = closeModal;
      d.querySelector("form").onsubmit = async (e) => {
        e.preventDefault(); const f = e.target;
        const options = [...opts.querySelectorAll("input")].map((i) => i.value.trim()).filter(Boolean);
        if (options.length < 2) { d.querySelector("#poll-err").textContent = "Il faut au moins 2 options."; return; }
        try {
          await S.store.insert("polls", { question: f.q.value.trim(), options, multiple: f.multiple.checked, closes_at: f.closes.value ? new Date(f.closes.value).toISOString() : null });
          logAction("poll_add", f.q.value.trim()); toast("Sondage publié", "ok"); closeModal();
        } catch (er) { errToast(er); }
      };
    },
  });
}

let pollTimer = null;
export function startPollRefresh() { stopPollRefresh(); pollTimer = setInterval(refreshCounts, 15000); }
export function stopPollRefresh() { clearInterval(pollTimer); }
