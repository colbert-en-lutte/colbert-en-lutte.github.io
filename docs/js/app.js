// =====================================================================
//  COLBERT EN LUTTE — application principale
// =====================================================================
import { createStore, checkPseudo } from "./store.js";
import { S, onChange, emit, isMod, isAdmin, site, siteName, pseudoOf, activeCheckins, myCheckin, SITE_IDS } from "./state.js";
import { loaders, loadAll, loadMessages, handleRealtime } from "./data.js";
import { STATUSES, ROLES, AVATAR_COLORS } from "./defaults.js";
import { esc, icon, $, $$, toast, errToast, openModal, closeModal, avatar, debounce, ago } from "./ui.js";
import { refreshMapTheme } from "./map.js";
import { openSitePanel, renderSitePanel, currentPanel, openCheckin } from "./views/actions.js";
import { renderHome, updateHome } from "./views/home.js";
import { renderPlanning, updatePlanning } from "./views/planning.js";
import { renderChat, updateChat, currentChannel } from "./views/chat.js";
import { renderInfos, updateInfos } from "./views/infos.js";
import { renderPolls, updatePolls, startPollRefresh, stopPollRefresh } from "./views/polls.js";
import { renderMateriel, updateMateriel } from "./views/materiel.js";
import { renderAgenda, updateAgenda } from "./views/agenda.js";
import { renderAdmin, updateAdmin } from "./views/admin.js";

const ROUTES = {
  carte:    { label: "Carte",    icon: "map",      render: renderHome,     update: updateHome,     deps: ["site_status", "checkins", "shifts", "reports", "announcements", "events", "polls", "materials", "settings", "profiles"] },
  planning: { label: "Planning", icon: "calendar", render: renderPlanning, update: updatePlanning, deps: ["shifts", "profiles", "settings"] },
  chat:     { label: "Chat",     icon: "chat",     render: renderChat,     update: updateChat,     deps: ["messages", "channels", "profiles", "unread", "settings"] },
  infos:    { label: "Infos",    icon: "book",     render: renderInfos,    update: updateInfos,    deps: ["pages"], refresh: "pages" },
  sondages: { label: "Sondages", icon: "poll",     render: renderPolls,    update: updatePolls,    deps: ["polls", "profiles", "settings"], refresh: "polls" },
  materiel: { label: "Matériel", icon: "box",      render: renderMateriel, update: updateMateriel, deps: ["materials", "profiles"] },
  agenda:   { label: "Agenda",   icon: "agenda",   render: renderAgenda,   update: updateAgenda,   deps: ["events"] },
  admin:    { label: "Admin",    icon: "shield",   render: renderAdmin,    update: updateAdmin,    deps: ["profiles", "settings", "shifts", "checkins"], mod: true },
};
let route = null;
let subscribed = false;
const LOGO = `<svg class="logo" viewBox="0 0 48 48" aria-hidden="true"><rect width="48" height="48" rx="11" fill="var(--accent)"/><path d="M11 30.5 33 17v20L11 30.5Z" fill="var(--accent-ink)"/><rect x="8" y="26" width="6" height="10" rx="1.5" fill="var(--accent-ink)"/><path d="M36 19.5c2.6 1.6 4 4.3 4 7.5s-1.4 5.9-4 7.5" stroke="var(--accent-ink)" stroke-width="2.6" fill="none" stroke-linecap="round"/><path d="M15 36.5 18 42h4l-2.6-5" fill="var(--accent-ink)"/></svg>`;

// ---------------------------------------------------------------------
//  Préférences d'affichage (locales)
// ---------------------------------------------------------------------
const PREF_KEY = "cel_prefs";
const prefs = (() => { try { return JSON.parse(localStorage.getItem(PREF_KEY)) || {}; } catch { return {}; } })();
function savePrefs() { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch { } }
function applyPrefs() {
  const r = document.documentElement;
  r.dataset.theme = prefs.theme || "dark";
  r.dataset.font = prefs.font || "standard";
  r.dataset.motion = prefs.motion || "auto";
  r.style.setProperty("--fs", (prefs.fs || 16) + "px");
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", r.dataset.theme === "light" ? "#f4f1ea" : "#0b0c0f");
}

// ---------------------------------------------------------------------
//  Démarrage
// ---------------------------------------------------------------------
async function boot() {
  applyPrefs();
  try { S.store = createStore(); }
  catch (e) { document.body.innerHTML = `<div class="center-screen"><div class="box"><h1>Erreur</h1><p>${esc(e.message)}</p></div></div>`; return; }
  const uid = await S.store.userId().catch(() => null);
  if (!uid) return renderAuth();
  await enter(uid);
}

async function enter(uid) {
  $("#root").innerHTML = `<div class="center-screen"><div class="box"><div class="loader"></div><p class="muted">Chargement…</p></div></div>`;
  try {
    S.me = { id: uid };
    for (let i = 0; i < 4; i++) { await loaders.profiles(); if (S.profiles.get(uid)) break; await new Promise((r) => setTimeout(r, 700)); }
    S.me = S.profiles.get(uid);
    if (!S.me) throw new Error("Profil introuvable. Réessaie de te connecter.");
    if (S.me.status === "pending") return renderWaiting("pending");
    if (S.me.status === "banned") return renderWaiting("banned");
    await loadAll();
  } catch (e) {
    $("#root").innerHTML = `<div class="center-screen"><div class="box"><h2>Impossible de charger</h2><p class="muted">${esc(e.message)}</p><button class="btn primary" onclick="location.reload()">Réessayer</button> <button class="btn ghost" id="lo">Se déconnecter</button></div></div>`;
    $("#lo").onclick = async () => { await S.store.signOut(); location.reload(); };
    return;
  }
  renderShell();
  goRoute();
  if (!subscribed) {
    subscribed = true;
    // Temps réel. Offre gratuite Supabase = 200 connexions simultanées : on libère la connexion
    // d'un onglet resté en arrière-plan plus de 10 min, et on recharge régulièrement en secours.
    let unsub = null, hideTimer = null;
    const sub = () => { if (!unsub) unsub = S.store.subscribe((t, p) => { handleRealtime(t, p); notify(t, p); }); };
    sub();
    document.addEventListener("visibilitychange", () => {
      if (S.store.mode !== "live") return;
      if (document.hidden) hideTimer = setTimeout(() => { if (unsub) { unsub(); unsub = null; } }, 600000);
      else { clearTimeout(hideTimer); if (!unsub) sub(); refreshAll(); }
    });
    const refreshAll = () => { loadAll().catch(() => { }); const ch = currentChannel(); if (ch) loadMessages(ch).catch(() => { }); };
    if (S.store.mode === "live") setInterval(() => { if (!document.hidden) refreshAll(); }, 90000);
    onChange(onDataChange);
    window.addEventListener("hashchange", goRoute);
    setInterval(() => S.store.rpc("touch").catch(() => { }), 120000);
    S.store.rpc("touch").catch(() => { });
    setInterval(() => { emit("tick"); }, 60000);
    if (S.store.mode === "demo") S.store.startBots();
  }
  if (isAdmin() && S.settings.purge_date && new Date(S.settings.purge_date) <= new Date()) {
    toast("La date prévue de suppression des identités est atteinte. Va dans Admin → Données & RGPD.", "alert", { title: "Rappel RGPD", duration: 15000, onClick: () => (location.hash = "#admin") });
  }
}

// ---------------------------------------------------------------------
//  Connexion / inscription
// ---------------------------------------------------------------------
function renderAuth(mode = "signup") {
  const demo = S.store.mode === "demo";
  $("#root").innerHTML = `${demoBanner()}<div class="auth">
    <section class="auth-hero">
      <div class="brand" style="padding:0">${LOGO}<div class="brand-txt">${esc(S.settings.name.split(" ")[0])}<span>${esc(S.settings.name.split(" ").slice(1).join(" "))}</span></div></div>
      <h1 class="poster">Colbert<span>en lutte</span><small>Colbert · Îlot Bernard du Bois — on s'organise</small></h1>
      <div class="auth-points">
        <div>${icon("map")} La carte en direct des deux sites : bloqué, CRS, renfort.</div>
        <div>${icon("calendar")} Le planning des équipes : qui est là, quand, où.</div>
        <div>${icon("chat")} Le chat, les sondages et nos revendications au même endroit.</div>
      </div>
    </section>
    <section class="auth-form"><div class="box">
      <div class="seg" role="tablist" style="margin-bottom:1.4em;width:100%"><button style="flex:1" data-mode="signup" aria-pressed="${mode === "signup"}">Inscription</button><button style="flex:1" data-mode="login" aria-pressed="${mode === "login"}">Connexion</button></div>
      <div id="auth-body"></div>
      ${demo ? `<p class="muted" style="font-size:.82rem;margin-top:1.2em">${icon("info")} Mode démo : crée un compte avec n'importe quel nom. Le premier compte créé devient <b>admin</b>.</p>` : ""}
    </div></section></div>`;
  bindDemoBanner();
  $$("[data-mode]").forEach((b) => (b.onclick = () => renderAuth(b.dataset.mode)));
  const body = $("#auth-body");
  if (mode === "login") {
    body.innerHTML = `<h2>Bon retour</h2><p class="lead">Connecte-toi avec ton pseudo.</p>
      <form id="login-form" novalidate>
        <label class="field"><span>Pseudo</span><input class="input" name="pseudo" autocomplete="username" required autocapitalize="off" spellcheck="false"></label>
        <label class="field"><span>Mot de passe</span><div class="pw-wrap"><input class="input" type="password" name="password" autocomplete="current-password" required><button type="button" class="icon-btn sm" data-eye aria-label="Afficher le mot de passe">${icon("eye")}</button></div></label>
        <p class="form-error" id="auth-err" role="alert"></p>
        <button class="btn primary block">Se connecter</button>
        <p class="muted" style="font-size:.84rem;margin-top:1em">Mot de passe oublié ? Demande à un·e modo de contacter l'admin.</p>
      </form>`;
  } else {
    body.innerHTML = `<h2>Rejoindre</h2><p class="lead">30 secondes. Ton nom reste privé.</p>
      <form id="signup-form" novalidate>
        <div class="grid2"><label class="field"><span>Prénom</span><input class="input" name="prenom" autocomplete="given-name" required maxlength="60"></label><label class="field"><span>Nom</span><input class="input" name="nom" autocomplete="family-name" required maxlength="60"></label></div>
        <label class="field"><span>Pseudo (visible par tous)</span><input class="input" name="pseudo" autocomplete="username" required maxlength="20" autocapitalize="off" spellcheck="false" placeholder="ex : lea_13"><small id="pseudo-hint">Lettres, chiffres, . - _ (3 à 20 caractères)</small></label>
        <label class="field"><span>Mot de passe</span><div class="pw-wrap"><input class="input" type="password" name="password" autocomplete="new-password" required minlength="8"><button type="button" class="icon-btn sm" data-eye aria-label="Afficher le mot de passe">${icon("eye")}</button></div><small>8 caractères minimum. Note-le bien : pas d'email de récupération.</small></label>
        <div class="privacy-box" style="margin-bottom:1em"><label class="check"><input type="checkbox" name="consent" required><span>J'accepte que mon <b>prénom et mon nom</b> soient conservés <b>uniquement pour l'organisation</b>. Ils ne sont visibles que par l'administrateur, ne seront <b>jamais divulgués</b> et seront supprimés à la fin de la mobilisation. <a href="#" data-privacy>En savoir plus</a></span></label></div>
        <p class="form-error" id="auth-err" role="alert"></p>
        <button class="btn primary block">${icon("fist")} Créer mon compte</button>
      </form>`;
    const ps = body.querySelector("[name=pseudo]"), hint = $("#pseudo-hint");
    const check = debounce(async () => {
      const v = ps.value.trim();
      if (!v) { hint.className = ""; hint.textContent = "Lettres, chiffres, . - _ (3 à 20 caractères)"; return; }
      const err = checkPseudo(v);
      if (err) { hint.className = "avail ko"; hint.textContent = err; return; }
      try { const ok = await S.store.rpc("pseudo_available", { p: v }); hint.className = `avail ${ok ? "ok" : "ko"}`; hint.textContent = ok ? "✓ Pseudo disponible" : "✗ Pseudo déjà pris"; } catch { }
    }, 350);
    ps.addEventListener("input", check);
    body.querySelector("[data-privacy]").onclick = (e) => { e.preventDefault(); privacyModal(); };
  }
  body.querySelectorAll("[data-eye]").forEach((b) => (b.onclick = () => { const i = b.previousElementSibling; i.type = i.type === "password" ? "text" : "password"; }));
  const form = body.querySelector("form");
  form.onsubmit = async (e) => {
    e.preventDefault();
    const err = $("#auth-err"); err.textContent = "";
    const f = form; const btn = f.querySelector("button.primary");
    const pseudo = f.pseudo.value.trim(), password = f.password.value;
    try {
      if (mode === "login") {
        if (!pseudo || !password) throw new Error("Remplis ton pseudo et ton mot de passe.");
        btn.disabled = true; await S.store.signIn({ pseudo, password });
      } else {
        const prenom = f.prenom.value.trim(), nom = f.nom.value.trim();
        if (!prenom || !nom) throw new Error("Prénom et nom sont obligatoires (ils restent privés).");
        const pe = checkPseudo(pseudo); if (pe) throw new Error(pe);
        if (password.length < 8) throw new Error("Mot de passe trop court (8 caractères minimum).");
        if (!f.consent.checked) throw new Error("Tu dois accepter la conservation de ton nom pour t'inscrire.");
        btn.disabled = true;
        await S.store.signUp({ pseudo, password, prenom, nom, color: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)] });
      }
      const uid = await S.store.userId();
      if (!uid) throw new Error("Connexion impossible, réessaie.");
      await enter(uid);
    } catch (er) { err.textContent = er.message; btn.disabled = false; }
  };
}

function renderWaiting(kind) {
  $("#root").innerHTML = `<div class="center-screen"><div class="box">${LOGO.replace('class="logo"', 'class="logo" style="width:64px;height:64px;margin:0 auto 1em"')}
    ${kind === "pending" ? `<h1 class="section-title" style="justify-content:center;font-size:2rem">Compte en attente</h1><p class="muted">Ton compte <b>${esc(S.me.pseudo)}</b> a bien été créé. Un·e modo doit le valider avant que tu puisses accéder à la plateforme. Ça ne devrait pas tarder.</p><div class="loader" style="margin-top:1.5em"></div>`
      : `<h1 class="section-title" style="justify-content:center;font-size:2rem">Accès retiré</h1><p class="muted">Ton compte a été exclu par la modération. Si tu penses que c'est une erreur, contacte un·e responsable de la mobilisation.</p>`}
    <button class="btn ghost" id="lo" style="margin-top:1em">Se déconnecter</button></div></div>`;
  $("#lo").onclick = async () => { await S.store.signOut(); location.reload(); };
  if (kind === "pending") {
    const t = setInterval(async () => {
      try { await loaders.profiles(); const p = S.profiles.get(S.me.id); if (p && p.status !== "pending") { clearInterval(t); enter(S.me.id); } } catch { }
    }, 15000);
  }
}

function privacyModal() {
  openModal({
    title: `${icon("shield")} Tes données`,
    body: `<div class="prose">
      <h3>Ce qu'on te demande</h3><ul><li><b>Prénom et nom</b> : uniquement pour vérifier qu'on est entre étudiant·es et éviter les faux comptes.</li><li><b>Pseudo</b> : c'est le seul nom visible par les autres membres.</li><li><b>Mot de passe</b> : chiffré, personne ne peut le lire.</li></ul>
      <h3>Qui voit quoi</h3><ul><li>Ton prénom et ton nom sont stockés à part et <b>seul l'administrateur</b> peut les voir. Même les modérateurs n'y ont pas accès.</li><li>Ils ne seront <b>jamais transmis</b> à qui que ce soit.</li><li>Les votes aux sondages sont <b>anonymes</b>.</li></ul>
      <h3>Combien de temps</h3><p>Les noms et prénoms sont <b>effacés à la fin de la mobilisation</b>. Tu peux demander à tout moment la suppression de ton compte à l'admin.</p>
      <h3>Où</h3><p>Base de données hébergée dans l'Union européenne. Aucun email, aucun numéro de téléphone demandé.</p></div>`,
  });
}

// ---------------------------------------------------------------------
//  Squelette de l'application
// ---------------------------------------------------------------------
function demoBanner() {
  return S.store.mode === "demo" ? `<div class="demo-banner">${icon("info")} MODE DÉMO<span class="long"> — données fictives stockées dans ton navigateur, rien n'est en ligne</span><span class="short-txt"> · données fictives</span><button data-reset-demo>Réinitialiser</button></div>` : "";
}
function bindDemoBanner() {
  $$("[data-reset-demo]").forEach((b) => (b.onclick = () => S.store.resetDemo()));
  const setH = () => document.documentElement.style.setProperty("--banner", ($(".demo-banner")?.offsetHeight || 0) + "px");
  setH(); window.removeEventListener("resize", window.__celBanner || (() => { })); window.__celBanner = setH; window.addEventListener("resize", setH);
}

function renderShell() {
  const navItems = Object.entries(ROUTES).filter(([, r]) => !r.mod || isMod());
  $("#root").innerHTML = `${demoBanner()}<a class="skip" href="#view">Aller au contenu</a><div id="app">
    <aside class="sidebar">
      <a class="brand" href="#carte">${LOGO}<div class="brand-txt" id="brand-txt"></div></a>
      <nav class="nav" aria-label="Navigation principale">${navItems.map(([k, r]) => `<a href="#${k}" data-route="${k}">${icon(r.icon)}<span>${r.label}</span>${k === "chat" ? `<span class="count" data-unread hidden></span>` : ""}</a>`).join("")}</nav>
      <div class="side-foot">
        <div class="me-card" id="me-card"></div>
        <div class="row" style="gap:.3em"><button class="btn sm ghost" data-prefs style="flex:1">${icon("settings")} Réglages</button><button class="btn sm ghost" data-logout aria-label="Se déconnecter" title="Se déconnecter">${icon("logout")}</button></div>
      </div>
    </aside>
    <div class="main">
      <header class="topbar">
        <a class="brand" href="#carte" aria-label="Accueil">${LOGO}<div class="brand-txt"></div></a>
        <div class="status-chips" id="status-chips"></div>
        <span class="spacer"></span>
        <button class="btn sm checkin-btn" id="checkin-btn"></button>
      </header>
      <main id="view" tabindex="-1"></main>
    </div>
    <nav class="bottomnav" aria-label="Navigation">${["carte", "planning", "chat", "infos"].map((k) => `<a href="#${k}" data-route="${k}">${icon(ROUTES[k].icon)}<span>${ROUTES[k].label}</span>${k === "chat" ? `<span class="count" data-unread hidden></span>` : ""}</a>`).join("")}<button data-more>${icon("menu")}<span>Plus</span></button></nav>
  </div>`;
  bindDemoBanner();
  $("[data-prefs]").onclick = prefsModal;
  $("[data-logout]").onclick = logout;
  $("[data-more]").onclick = moreMenu;
  $("#checkin-btn").onclick = openCheckin;
  updateChrome();
}

function updateChrome() {
  if (!$("#status-chips")) return;
  const n = S.settings.name.split(" ");
  $("#brand-txt").innerHTML = `${esc(n[0])}<span>${esc(n.slice(1).join(" "))}</span>`;
  $("#status-chips").innerHTML = SITE_IDS.map((id) => {
    const stt = STATUSES[S.statuses[id]?.status] || STATUSES.ouvert;
    return `<button class="status-chip" data-chip="${id}" aria-label="${esc(site(id).short)} : ${esc(stt.label)}"><span class="pill" style="--c:${stt.color}"><span class="dot"></span>${esc(stt.short)}</span><span class="nm">${esc(site(id).short)}</span><span class="ct">${icon("users")}${activeCheckins(id).length}</span></button>`;
  }).join("");
  $$("[data-chip]").forEach((b) => (b.onclick = () => openSitePanel(b.dataset.chip)));
  const mine = myCheckin();
  const cb = $("#checkin-btn");
  cb.classList.toggle("on", !!mine);
  cb.innerHTML = mine ? `${icon("check")}<span class="lbl">Sur place · ${esc(site(mine.site).short)}</span>` : `${icon("pin")}<span class="lbl">Je suis sur place</span>`;
  cb.setAttribute("aria-label", mine ? `Tu es sur place à ${site(mine.site).short}. Modifier` : "Je suis sur place");
  $("#me-card").innerHTML = `${avatar(S.me, "lg")}<div class="who"><b>${esc(S.me.pseudo)}</b><span class="badge role-${S.me.role}">${ROLES[S.me.role].label}${S.me.role === "referent" ? " · " + esc(site(S.me.referent_site).short) : ""}</span></div>`;
  const unread = Object.values(S.unread).reduce((a, b) => a + b, 0);
  $$("[data-unread]").forEach((el) => { el.hidden = !unread; el.textContent = unread > 99 ? "99+" : unread; });
}

function goRoute() {
  let r = (location.hash || "#carte").slice(1);
  if (!ROUTES[r] || (ROUTES[r].mod && !isMod())) r = "carte";
  const changed = r !== route;
  route = r;
  $$("[data-route]").forEach((a) => a.setAttribute("aria-current", a.dataset.route === r ? "page" : "false"));
  const view = $("#view");
  if (!view) return;
  view.classList.remove("full");
  view.innerHTML = "";
  if (r === "sondages") startPollRefresh(); else stopPollRefresh();
  ROUTES[r].render(view);
  if (ROUTES[r].refresh) loaders[ROUTES[r].refresh]().then(() => emit(ROUTES[r].refresh)).catch(() => { });
  if (changed) { window.scrollTo(0, 0); closeModal(); }
  document.title = `${ROUTES[r].label} · ${S.settings.name}`;
}

function onDataChange(domain) {
  if (domain === "profiles" && S.me) {
    const p = S.profiles.get(S.me.id);
    if (p) {
      const roleChanged = p.role !== S.me.role || p.referent_site !== S.me.referent_site;
      S.me = p;
      if (p.status === "banned") return renderWaiting("banned");
      if (roleChanged) { renderShell(); goRoute(); toast(`Ton rôle est maintenant : ${ROLES[p.role].label}`, "info"); return; }
    }
  }
  if (["site_status", "checkins", "settings", "profiles", "unread", "all", "tick"].includes(domain)) updateChrome();
  if (domain === "settings" && route === "carte") { /* positions possibles */ }
  const R = ROUTES[route];
  if (R && (domain === "all" || R.deps.includes(domain) || (domain === "tick" && ["carte", "planning"].includes(route)))) {
    try { R.update(domain); } catch (e) { console.error(e); }
  }
  if (currentPanel() && ["site_status", "reports", "checkins", "shifts", "profiles", "all", "tick"].includes(domain)) renderSitePanel();
}

// ---------------------------------------------------------------------
//  Notifications
// ---------------------------------------------------------------------
function sysNotify(title, body) {
  if (!prefs.notif || !("Notification" in window) || Notification.permission !== "granted" || !document.hidden) return;
  try { new Notification(title, { body, icon: "icons/icon.svg", tag: "cel-" + title }); } catch { }
}
function notify(table, p) {
  if (!S.me || p.eventType === "DELETE") return;
  const n = p.new || {};
  if (table === "reports" && p.eventType === "INSERT" && n.user_id !== S.me.id) {
    const v = STATUSES[n.kind] || STATUSES.autre;
    if (v.alert) {
      toast(`${n.note || "Nouveau signalement"} — ${pseudoOf(n.user_id)}`, "alert", { title: `${v.label} · ${siteName(n.site)}`, onClick: () => openSitePanel(n.site) });
      sysNotify(`${v.label} · ${siteName(n.site)}`, n.note || "Nouveau signalement");
    }
  }
  if (table === "site_status" && n.updated_by && n.updated_by !== S.me.id && (p.eventType === "UPDATE" || p.eventType === "INSERT")) {
    if (p.old && p.old.status === n.status && p.old.note !== n.note) return;
    const v = STATUSES[n.status] || STATUSES.ouvert;
    toast(n.note || `Mis à jour par ${pseudoOf(n.updated_by)}`, v.alert ? "alert" : "info", { title: `${site(n.site).short} : ${v.label}`, onClick: () => openSitePanel(n.site) });
    sysNotify(`${site(n.site).short} : ${v.label}`, n.note || "");
  }
  if (table === "announcements" && p.eventType === "INSERT" && n.created_by !== S.me.id) {
    toast(n.body || "", n.level === "urgent" ? "alert" : "info", { title: `📢 ${n.title}`, onClick: () => (location.hash = "#carte") });
    if (n.level === "urgent") sysNotify(`📢 ${n.title}`, n.body || "");
  }
  if (table === "messages" && p.eventType === "INSERT" && n.user_id !== S.me.id) {
    const viewing = currentChannel() === n.channel_id && !document.hidden;
    if (!viewing) { S.unread[n.channel_id] = (S.unread[n.channel_id] || 0) + 1; emit("unread"); }
    const re = new RegExp(`(^|\\s)@${S.me.pseudo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\b|$)`, "i");
    if (re.test(n.content) && !viewing) {
      const ch = S.channels.find((c) => c.id === n.channel_id);
      toast(n.content.slice(0, 140), "info", { title: `${pseudoOf(n.user_id)} t'a mentionné·e dans #${ch?.name || ""}`, onClick: () => (location.hash = "#chat") });
      sysNotify(`${pseudoOf(n.user_id)} t'a mentionné·e`, n.content.slice(0, 140));
    }
  }
}

// ---------------------------------------------------------------------
//  Menus
// ---------------------------------------------------------------------
function moreMenu() {
  const items = ["sondages", "materiel", "agenda", ...(isMod() ? ["admin"] : [])];
  openModal({
    title: `${icon("menu")} Menu`,
    body: `<nav class="nav" style="display:grid;gap:.2em">${items.map((k) => `<a href="#${k}">${icon(ROUTES[k].icon)}<span>${ROUTES[k].label}</span></a>`).join("")}
      <div class="nav-sep"></div><a href="#" data-p>${icon("settings")}<span>Réglages & accessibilité</span></a><a href="#" data-l>${icon("logout")}<span>Se déconnecter</span></a></nav>
      <div class="me-card" style="margin-top:1em">${avatar(S.me, "lg")}<div class="who"><b>${esc(S.me.pseudo)}</b><span class="badge role-${S.me.role}">${ROLES[S.me.role].label}</span></div></div>`,
    onMount: (d) => {
      d.querySelectorAll("a[href^='#']:not([data-p]):not([data-l])").forEach((a) => (a.onclick = () => closeModal()));
      d.querySelector("[data-p]").onclick = (e) => { e.preventDefault(); prefsModal(); };
      d.querySelector("[data-l]").onclick = (e) => { e.preventDefault(); logout(); };
    },
  });
}

function prefsModal() {
  const seg = (name, opts, cur) => `<div class="seg" role="group">${opts.map(([v, l]) => `<button type="button" data-pref="${name}" data-v="${v}" aria-pressed="${String(cur) === String(v)}">${l}</button>`).join("")}</div>`;
  const notifState = !("Notification" in window) ? "unsupported" : Notification.permission;
  openModal({
    title: `${icon("settings")} Réglages & accessibilité`,
    body: `<div style="display:grid;gap:1.1em">
      <div class="field"><span>Thème</span>${seg("theme", [["dark", `${icon("moon")} Sombre`], ["light", `${icon("sun")} Clair`]], prefs.theme || "dark")}</div>
      <div class="field"><span>Police</span>${seg("font", [["standard", "Standard"], ["legible", "Très lisible (dyslexie)"]], prefs.font || "standard")}</div>
      <div class="field"><span>Taille du texte</span>${seg("fs", [[14, "A−"], [16, "A"], [18, "A+"], [20, "A++"]], prefs.fs || 16)}</div>
      <label class="switch"><input type="checkbox" id="pref-motion" ${prefs.motion === "reduce" ? "checked" : ""}> Réduire les animations</label>
      <div class="field"><span>Notifications (alertes CRS, renfort, annonces urgentes, mentions)</span>
        ${notifState === "unsupported" ? `<small>Non disponibles sur ce navigateur.</small>` : notifState === "denied" ? `<small>Bloquées dans ton navigateur. Autorise-les dans les réglages du site.</small>` : `<label class="switch"><input type="checkbox" id="pref-notif" ${prefs.notif && notifState === "granted" ? "checked" : ""}> Recevoir les notifications quand l'onglet est en arrière-plan</label>`}
        <small>Astuce : installe le site sur ton téléphone (menu du navigateur → « Ajouter à l'écran d'accueil »).</small></div>
      <div class="field"><span>Ma couleur</span><div class="row" style="gap:.4em">${AVATAR_COLORS.map((c) => `<button type="button" class="icon-btn" data-color="${c}" aria-label="Couleur ${c}" style="background:${c};border:3px solid ${S.me.color === c ? "var(--text)" : "transparent"};border-radius:50%"></button>`).join("")}</div></div>
      ${S.store.mode === "demo" ? `<div class="field"><span>Démo : voir le site en tant que…</span>${seg("role", Object.entries(ROLES).map(([k, v]) => [k, v.label]), S.me.role)}<small>Permet de tester ce que voit un membre, un·e référent·e ou un·e modo.</small></div>` : ""}
      <div class="row"><button class="btn sm ghost" data-privacy>${icon("shield")} Tes données</button><button class="btn sm danger" data-logout2>${icon("logout")} Se déconnecter</button></div>
    </div>`,
    onMount: (d) => {
      d.querySelectorAll("[data-pref]").forEach((b) => (b.onclick = () => {
        const k = b.dataset.pref, v = b.dataset.v;
        d.querySelectorAll(`[data-pref="${k}"]`).forEach((x) => x.setAttribute("aria-pressed", x === b));
        if (k === "role") { S.store.setMyRole(v); return; }
        prefs[k] = k === "fs" ? Number(v) : v; savePrefs(); applyPrefs();
        if (k === "theme") refreshMapTheme();
      }));
      d.querySelector("#pref-motion").onchange = (e) => { prefs.motion = e.target.checked ? "reduce" : "auto"; savePrefs(); applyPrefs(); };
      const pn = d.querySelector("#pref-notif");
      if (pn) pn.onchange = async (e) => {
        if (e.target.checked) {
          try { const r = await Notification.requestPermission(); prefs.notif = r === "granted"; e.target.checked = prefs.notif; if (!prefs.notif) toast("Notifications refusées par le navigateur", "error"); else toast("Notifications activées", "ok"); }
          catch { prefs.notif = false; e.target.checked = false; toast("Notifications indisponibles ici", "error"); }
        } else prefs.notif = false;
        savePrefs();
      };
      d.querySelectorAll("[data-color]").forEach((b) => (b.onclick = async () => {
        try { await S.store.rpc("set_color", { c: b.dataset.color }); S.me.color = b.dataset.color; d.querySelectorAll("[data-color]").forEach((x) => (x.style.borderColor = x === b ? "var(--text)" : "transparent")); updateChrome(); } catch (e) { errToast(e); }
      }));
      d.querySelector("[data-privacy]").onclick = privacyModal;
      d.querySelector("[data-logout2]").onclick = logout;
    },
  });
}

async function logout() {
  try { const c = myCheckin(); if (c) await S.store.remove("checkins", { user_id: S.me.id }); } catch { }
  await S.store.signOut();
  location.hash = "";
  location.reload();
}

// Service worker (PWA) — ignoré si indisponible (ex : aperçu)
if ("serviceWorker" in navigator && location.protocol === "https:") {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => { }));
}

void ago; void errToast;
boot();
