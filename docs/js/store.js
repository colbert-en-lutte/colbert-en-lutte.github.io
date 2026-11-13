// Couche données : même API pour le mode démo (navigateur) et le mode réel (Supabase).
import { CONFIG } from "./config.js";
import { DEFAULT_SETTINGS, AVATAR_COLORS } from "./defaults.js";

export const TABLES = ["profiles", "identities", "settings", "site_status", "reports", "shifts", "checkins", "channels",
  "messages", "polls", "poll_votes", "pages", "supports", "announcements", "materials", "pledges", "events", "audit_log"];

export function createStore() {
  const live = CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY && window.supabase;
  return live ? supabaseStore() : localStore();
}

const PSEUDO_RE = /^[A-Za-z0-9_.-]{3,20}$/;
export function checkPseudo(p) {
  if (!PSEUDO_RE.test(p || "")) return "3 à 20 caractères : lettres, chiffres, point, tiret ou _ (sans espace ni accent).";
  return null;
}

// =====================================================================
//  MODE RÉEL — Supabase
// =====================================================================
function supabaseStore() {
  const sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true },
    realtime: { params: { eventsPerSecond: 20 } },
  });
  const emailOf = (p) => `${p.toLowerCase()}@${CONFIG.EMAIL_DOMAIN}`;
  const fail = (error) => { if (error) throw new Error(translate(error.message || String(error))); };

  function applyFilters(q, f = {}) {
    for (const [k, v] of Object.entries(f.eq || {})) q = q.eq(k, v);
    for (const [k, v] of Object.entries(f.neq || {})) q = q.neq(k, v);
    for (const [k, v] of Object.entries(f.gte || {})) q = q.gte(k, v);
    for (const [k, v] of Object.entries(f.gt || {})) q = q.gt(k, v);
    for (const [k, v] of Object.entries(f.lte || {})) q = q.lte(k, v);
    for (const [k, v] of Object.entries(f.lt || {})) q = q.lt(k, v);
    for (const [k, v] of Object.entries(f.in || {})) q = q.in(k, v);
    if (f.order) q = q.order(f.order[0], { ascending: f.order[1] !== false });
    if (f.limit) q = q.limit(f.limit);
    return q;
  }
  function applyMatch(q, match) { for (const [k, v] of Object.entries(match)) q = q.eq(k, v); return q; }

  return {
    mode: "live",
    async userId() { const { data } = await sb.auth.getSession(); return data.session?.user?.id || null; },
    async signUp({ pseudo, password, prenom, nom, color }) {
      const { data: ok, error: e1 } = await sb.rpc("pseudo_available", { p: pseudo }); fail(e1);
      if (!ok) throw new Error("Ce pseudo est déjà pris.");
      const { data, error } = await sb.auth.signUp({
        email: emailOf(pseudo), password,
        options: { data: { pseudo, prenom, nom, color, consent: "true" } },
      });
      fail(error);
      if (!data.session) {
        const r = await sb.auth.signInWithPassword({ email: emailOf(pseudo), password }); fail(r.error);
      }
    },
    async signIn({ pseudo, password }) {
      const { error } = await sb.auth.signInWithPassword({ email: emailOf(pseudo), password }); fail(error);
    },
    async signOut() { await sb.auth.signOut(); },
    onAuth(cb) { sb.auth.onAuthStateChange((_e, s) => cb(s?.user?.id || null)); },

    async list(table, f = {}) {
      const { data, error } = await applyFilters(sb.from(table).select(f.select || "*"), f); fail(error); return data || [];
    },
    async insert(table, row) {
      const { data, error } = await sb.from(table).insert(row).select(); fail(error); return data?.[0];
    },
    async update(table, match, patch) {
      const { data, error } = await applyMatch(sb.from(table).update(patch), match).select(); fail(error); return data;
    },
    async remove(table, match) {
      const { error } = await applyMatch(sb.from(table).delete(), match); fail(error);
    },
    async upsert(table, row, onConflict) {
      const { data, error } = await sb.from(table).upsert(row, { onConflict }).select(); fail(error); return data?.[0];
    },
    async rpc(name, args = {}) { const { data, error } = await sb.rpc(name, args); fail(error); return data; },
    subscribe(cb) {
      const ch = sb.channel("cel-db");
      for (const t of TABLES) {
        if (t === "identities" || t === "audit_log" || t === "supports") continue;
        ch.on("postgres_changes", { event: "*", schema: "public", table: t }, (p) =>
          cb(t, { eventType: p.eventType, new: p.new, old: p.old }));
      }
      ch.subscribe();
      return () => sb.removeChannel(ch);
    },
  };
}

function translate(msg) {
  const m = msg.toLowerCase();
  if (m.includes("invalid login")) return "Pseudo ou mot de passe incorrect.";
  if (m.includes("already registered")) return "Ce pseudo est déjà pris.";
  if (m.includes("password should be")) return "Mot de passe trop court (8 caractères minimum).";
  if (m.includes("rate limit")) return "Trop de tentatives depuis ce réseau. Réessaie dans quelques minutes.";
  if (m.includes("row-level security") || m.includes("permission denied")) return "Action non autorisée pour ton rôle.";
  if (m.includes("database error saving new user")) return "Inscription impossible (pseudo déjà pris ?).";
  if (m.includes("failed to fetch") || m.includes("network")) return "Connexion au serveur impossible. Vérifie ta connexion.";
  return msg;
}

// =====================================================================
//  MODE DÉMO — tout est stocké dans le navigateur (localStorage)
// =====================================================================
const LS_KEY = "cel_demo_db_v1";
const LS_SESSION = "cel_demo_session_v1";

function localStore() {
  let db = load() || seed();
  save();
  const listeners = new Set();
  let bc = null;
  try { bc = new BroadcastChannel("cel-demo"); bc.onmessage = (e) => { const fresh = load(); if (fresh) for (const k of Object.keys(fresh)) db[k] = fresh[k]; for (const l of listeners) l(e.data.table, e.data.payload); }; } catch { }

  function load() { try { const s = localStorage.getItem(LS_KEY); return s ? JSON.parse(s) : null; } catch { return null; } }
  function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(db)); } catch { } }
  function emit(table, payload) {
    save();
    for (const l of listeners) { try { l(table, payload); } catch (e) { console.error(e); } }
    try { bc && bc.postMessage({ table, payload }); } catch { }
  }
  const me = () => { try { return localStorage.getItem(LS_SESSION); } catch { return memSession; } };
  let memSession = null;
  const setMe = (id) => { memSession = id; try { id ? localStorage.setItem(LS_SESSION, id) : localStorage.removeItem(LS_SESSION); } catch { } };
  const now = () => new Date().toISOString();
  const nextId = (t) => { db._seq[t] = (db._seq[t] || 0) + 1; return db._seq[t]; };
  const profile = (id) => db.profiles.find((p) => p.id === id);
  const isMod = () => ["admin", "modo"].includes(profile(me())?.role);
  const isAdmin = () => profile(me())?.role === "admin";

  const DEFAULTS = {
    reports: () => ({ user_id: me(), validated: false, created_at: now() }),
    shifts: () => ({ created_by: me(), created_at: now(), note: null }),
    checkins: () => ({ user_id: me(), since: now() }),
    messages: () => ({ user_id: me(), pinned: false, created_at: now() }),
    polls: () => ({ created_by: me(), created_at: now(), closed: false, multiple: false, closes_at: null }),
    poll_votes: () => ({ user_id: me(), created_at: now() }),
    pages: () => ({ updated_by: me(), updated_at: now(), position: 0, body: "" }),
    supports: () => ({ user_id: me() }),
    announcements: () => ({ created_by: me(), created_at: now(), level: "info", pinned: true }),
    materials: () => ({ created_by: me(), created_at: now(), done: false, site: "both", qty_needed: 1 }),
    pledges: () => ({ user_id: me() }),
    events: () => ({ created_by: me(), created_at: now() }),
    audit_log: () => ({ actor: me(), created_at: now() }),
    channels: () => ({ admin_only: false, position: 99 }),
  };
  const AUTO_ID = new Set(["reports", "shifts", "channels", "messages", "polls", "pages", "announcements", "materials", "events", "audit_log"]);

  const matches = (row, match) => Object.entries(match).every(([k, v]) => row[k] === v);
  function filter(rows, f = {}) {
    let r = rows.filter((row) =>
      Object.entries(f.eq || {}).every(([k, v]) => row[k] === v) &&
      Object.entries(f.neq || {}).every(([k, v]) => row[k] !== v) &&
      Object.entries(f.gte || {}).every(([k, v]) => row[k] >= v) &&
      Object.entries(f.gt || {}).every(([k, v]) => row[k] > v) &&
      Object.entries(f.lte || {}).every(([k, v]) => row[k] <= v) &&
      Object.entries(f.lt || {}).every(([k, v]) => row[k] < v) &&
      Object.entries(f.in || {}).every(([k, v]) => v.includes(row[k])));
    if (f.order) { const [c, asc] = f.order; r.sort((a, b) => (a[c] > b[c] ? 1 : a[c] < b[c] ? -1 : 0) * (asc === false ? -1 : 1)); }
    if (f.limit) r = r.slice(0, f.limit);
    return r.map((x) => ({ ...x }));
  }

  function guard(table, op) {
    const uid = me();
    if (!uid) throw new Error("Non connecté.");
    const p = profile(uid);
    if (!p || p.status !== "active") throw new Error("Compte non actif.");
    if (table === "identities" && !isAdmin()) throw new Error("Action non autorisée pour ton rôle.");
    if (["channels", "pages", "announcements", "events"].includes(table) && op !== "select" && !isMod()) throw new Error("Action non autorisée pour ton rôle.");
  }

  const api = {
    mode: "demo",
    async userId() { const id = me(); return id && profile(id) ? id : null; },
    async signUp({ pseudo, password, prenom, nom, color }) {
      if (db.profiles.some((p) => p.pseudo_slug === pseudo.toLowerCase())) throw new Error("Ce pseudo est déjà pris.");
      const id = "u_" + Math.random().toString(36).slice(2, 10);
      const hasAdmin = db.profiles.some((p) => p.role === "admin");
      const status = !hasAdmin ? "active" : db.settings[0].data.manual_validation ? "pending" : "active";
      db.auth.push({ id, slug: pseudo.toLowerCase(), password });
      db.profiles.push({ id, pseudo, pseudo_slug: pseudo.toLowerCase(), role: hasAdmin ? "membre" : "admin", referent_site: null, status, color: color || AVATAR_COLORS[0], created_at: now(), last_seen: now() });
      db.identities.push({ user_id: id, prenom, nom, consent_at: now() });
      setMe(id);
      emit("profiles", { eventType: "INSERT", new: profile(id) });
    },
    async signIn({ pseudo, password }) {
      const a = db.auth.find((x) => x.slug === pseudo.toLowerCase() && x.password === password);
      if (!a) throw new Error("Pseudo ou mot de passe incorrect.");
      setMe(a.id);
    },
    async signOut() { setMe(null); },
    onAuth() { },

    async list(table, f = {}) {
      if (!me()) throw new Error("Non connecté.");
      if (table === "identities" && !isAdmin()) return [];
      if (table === "audit_log" && !isAdmin()) return [];
      if (table === "poll_votes" || table === "supports") f = { ...f, eq: { ...(f.eq || {}), user_id: me() } };
      return filter(db[table] || [], f);
    },
    async insert(table, row) {
      guard(table, "insert");
      const r = { ...(DEFAULTS[table]?.() || {}), ...row };
      if (AUTO_ID.has(table)) r.id = nextId(table);
      if (table === "messages") {
        const ch = db.channels.find((c) => c.id === r.channel_id);
        if (ch?.admin_only && !isMod()) throw new Error("Seuls les modos peuvent écrire ici.");
      }
      if (table === "shifts" && new Date(r.ends_at) <= new Date(r.starts_at)) throw new Error("L'heure de fin doit être après le début.");
      db[table].push(r);
      emit(table, { eventType: "INSERT", new: { ...r } });
      return { ...r };
    },
    async update(table, match, patch) {
      guard(table, "update");
      const out = [];
      for (const row of db[table]) if (matches(row, match)) {
        const old = { ...row }; Object.assign(row, patch);
        if (table === "pages") row.updated_at = now();
        out.push({ ...row }); emit(table, { eventType: "UPDATE", new: { ...row }, old });
      }
      return out;
    },
    async remove(table, match) {
      guard(table, "delete");
      const keep = [], gone = [];
      for (const row of db[table]) (matches(row, match) ? gone : keep).push(row);
      db[table] = keep;
      // cascades simples
      for (const g of gone) {
        if (table === "polls") db.poll_votes = db.poll_votes.filter((v) => v.poll_id !== g.id);
        if (table === "materials") db.pledges = db.pledges.filter((v) => v.material_id !== g.id);
        if (table === "channels") db.messages = db.messages.filter((v) => v.channel_id !== g.id);
        if (table === "pages") db.supports = db.supports.filter((v) => v.page_id !== g.id);
        emit(table, { eventType: "DELETE", old: { ...g }, new: {} });
      }
    },
    async upsert(table, row, onConflict) {
      guard(table, "upsert");
      const keys = (onConflict || "id").split(",").map((s) => s.trim());
      const full = { ...(DEFAULTS[table]?.() || {}), ...row };
      const existing = db[table].find((r) => keys.every((k) => r[k] === full[k]));
      if (existing) { const old = { ...existing }; Object.assign(existing, row); emit(table, { eventType: "UPDATE", new: { ...existing }, old }); return { ...existing }; }
      db[table].push(full); emit(table, { eventType: "INSERT", new: { ...full } }); return { ...full };
    },
    async rpc(name, args = {}) {
      switch (name) {
        case "pseudo_available": return !db.profiles.some((p) => p.pseudo_slug === String(args.p).toLowerCase());
        case "set_color": { const p = profile(me()); if (p && /^#[0-9a-fA-F]{6}$/.test(args.c)) { const old = { ...p }; p.color = args.c; emit("profiles", { eventType: "UPDATE", new: { ...p }, old }); } return null; }
        case "touch": { const p = profile(me()); if (p) { p.last_seen = now(); save(); } return null; }
        case "set_role": {
          if (!isAdmin()) throw new Error("Réservé à l'admin.");
          if (args.uid === me() && args.new_role !== "admin") throw new Error("Tu ne peux pas te retirer le rôle admin.");
          const p = profile(args.uid); const old = { ...p };
          p.role = args.new_role; p.referent_site = args.new_role === "referent" ? args.site : null;
          db.audit_log.push({ id: nextId("audit_log"), actor: me(), action: "role", target: args.uid, details: { role: args.new_role, site: args.site }, created_at: now() });
          emit("profiles", { eventType: "UPDATE", new: { ...p }, old }); return null;
        }
        case "set_status": {
          if (!isMod()) throw new Error("Réservé à la modération.");
          if (args.uid === me()) throw new Error("Action impossible sur ton propre compte.");
          const p = profile(args.uid);
          if (["admin", "modo"].includes(p.role) && !isAdmin()) throw new Error("Seul l'admin peut agir sur un modo.");
          const old = { ...p }; p.status = args.new_status;
          if (args.new_status === "banned") db.checkins = db.checkins.filter((c) => c.user_id !== args.uid);
          db.audit_log.push({ id: nextId("audit_log"), actor: me(), action: "status", target: args.uid, details: { status: args.new_status }, created_at: now() });
          emit("profiles", { eventType: "UPDATE", new: { ...p }, old }); return null;
        }
        case "poll_counts": {
          const out = {};
          for (const v of db.poll_votes) { for (const c of [...v.choices, -1]) { const k = v.poll_id + ":" + c; out[k] = (out[k] || 0) + 1; } }
          return Object.entries(out).map(([k, n]) => { const [poll_id, choice] = k.split(":").map(Number); return { poll_id, choice, n }; });
        }
        case "support_counts": {
          const out = {};
          for (const s of db.supports) out[s.page_id] = (out[s.page_id] || 0) + 1;
          return Object.entries(out).map(([page_id, n]) => ({ page_id: Number(page_id), n }));
        }
        case "purge_identities": {
          if (!isAdmin()) throw new Error("Réservé à l'admin.");
          for (const i of db.identities) { i.prenom = null; i.nom = null; }
          db.audit_log.push({ id: nextId("audit_log"), actor: me(), action: "purge_identities", target: "all", created_at: now() });
          save(); return null;
        }
      }
      throw new Error("RPC inconnue : " + name);
    },
    subscribe(cb) { listeners.add(cb); return () => listeners.delete(cb); },

    // --- spécifique démo ---
    resetDemo() { try { localStorage.removeItem(LS_KEY); localStorage.removeItem(LS_SESSION); } catch { } location.reload(); },
    setMyRole(role) { const p = profile(me()); if (!p) return; const old = { ...p }; p.role = role; p.referent_site = role === "referent" ? "colbert" : null; emit("profiles", { eventType: "UPDATE", new: { ...p }, old }); },
    startBots() { return startBots(db, emit, nextId); },
  };
  return api;
}

// ---------------------------------------------------------------------
//  Données fictives de démonstration
// ---------------------------------------------------------------------
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const FAKE = [
  ["Lea_13", "modo", null, "Léa", "Martin"], ["Karim.M", "referent", "colbert", "Karim", "Benali"], ["ines_b", "referent", "ibd", "Inès", "Bernard"],
  ["Tom-R", "membre"], ["Yasmine", "membre"], ["Hugo_feg", "membre"], ["Sarah.L", "membre"], ["Nassim", "membre"], ["Camille13", "membre"],
  ["Mehdi_eco", "membre"], ["Jules.P", "membre"], ["Amina", "membre"], ["Baptiste", "membre"], ["Chloe-L3", "membre"], ["Rayan", "membre"],
  ["Manon.G", "membre"], ["Theo_13", "membre"], ["Sofia", "membre"], ["Adam_eg", "membre"], ["Lina.k", "membre"], ["Enzo13", "membre"],
  ["Ryad", "membre"], ["Zoe_m", "membre"], ["Ilyes", "membre"], ["Clara.D", "membre"], ["Maxime_L3", "membre"], ["Nour", "membre"],
  ["Lucas.b", "membre"], ["Jade", "membre"], ["Samir_13", "membre"], ["Eva.R", "membre"], ["Kenza", "membre"],
];
const FIRST = ["Léa", "Karim", "Inès", "Tom", "Yasmine", "Hugo", "Sarah", "Nassim", "Camille", "Mehdi", "Jules", "Amina", "Baptiste", "Chloé", "Rayan", "Manon", "Théo", "Sofia", "Adam", "Lina", "Enzo", "Ryad", "Zoé", "Ilyes", "Clara", "Maxime", "Nour", "Lucas", "Jade", "Samir", "Eva", "Kenza"];
const LAST = ["Martin", "Benali", "Bernard", "Roux", "Haddad", "Petit", "Lefèvre", "Amrani", "Girard", "Mansouri", "Fabre", "Diallo", "Morel", "Garcia", "Cherif", "Blanc", "Fournier", "Rossi", "Belkacem", "Mercier", "Lopez", "Saïdi", "Faure", "Meziane", "Durand", "Gauthier", "Toumi", "Robin", "Henry", "Kaci", "Perrin", "Brahimi"];

function seed() {
  const R = rng(42);
  const pick = (a) => a[Math.floor(R() * a.length)];
  const now = new Date();
  const iso = (d) => d.toISOString();
  const db = { _seq: {}, auth: [], profiles: [], identities: [], settings: [{ id: 1, data: structuredClone(DEFAULT_SETTINGS) }], site_status: [], reports: [], shifts: [], checkins: [], channels: [], messages: [], polls: [], poll_votes: [], pages: [], supports: [], announcements: [], materials: [], pledges: [], events: [], audit_log: [] };
  const id = (t) => { db._seq[t] = (db._seq[t] || 0) + 1; return db._seq[t]; };

  FAKE.forEach(([pseudo, role, site, prenom, nom], i) => {
    const uid = "f_" + i;
    db.profiles.push({ id: uid, pseudo, pseudo_slug: pseudo.toLowerCase(), role, referent_site: site || null, status: "active", color: AVATAR_COLORS[i % AVATAR_COLORS.length], created_at: iso(new Date(now - (5 - (i % 5)) * 864e5)), last_seen: iso(new Date(now - R() * 36e5 * 5)), _fake: true });
    db.identities.push({ user_id: uid, prenom: prenom || FIRST[i % FIRST.length], nom: nom || LAST[i % LAST.length], consent_at: iso(now) });
  });
  const users = db.profiles.map((p) => p.id);

  // Créneaux : de hier à J+6
  const day0 = new Date(now); day0.setHours(0, 0, 0, 0);
  for (let d = -1; d <= 6; d++) {
    for (const uid of users) {
      const n = R() < 0.15 ? 0 : R() < 0.55 ? 1 : 2;
      for (let k = 0; k < n; k++) {
        const start = new Date(day0); start.setDate(start.getDate() + d);
        const h = 6.5 + Math.floor(R() * 24) * 0.5; // 6h30 → 18h
        start.setMinutes(Math.round(h * 60));
        const end = new Date(start.getTime() + (2.5 + Math.floor(R() * 8) * 0.5) * 36e5);
        db.shifts.push({ id: id("shifts"), site: R() < 0.58 ? "colbert" : "ibd", user_id: uid, starts_at: iso(start), ends_at: iso(end), note: null, created_by: uid, created_at: iso(now) });
      }
    }
  }

  db.site_status.push({ site: "colbert", status: "bloque", note: "Entrée principale + accès rue Colbert tenus", updated_by: "f_1", updated_at: iso(new Date(now - 42 * 6e4)) });
  db.site_status.push({ site: "ibd", status: "renfort", note: "Il manque du monde côté bd Maurice Bourdet", updated_by: "f_2", updated_at: iso(new Date(now - 12 * 6e4)) });

  const rep = (site, kind, note, min, uid) => db.reports.push({ id: id("reports"), site, kind, note, user_id: uid, validated: false, created_at: iso(new Date(now - min * 6e4)) });
  rep("colbert", "bloque", "Les deux entrées sont bloquées, ambiance calme", 95, "f_3");
  rep("ibd", "police", "2 voitures de police garées devant la gare, rien de plus pour l'instant", 38, "f_7");
  rep("ibd", "renfort", "On est 4, il faudrait 3-4 personnes de plus", 14, "f_2");
  rep("colbert", "ag", "AG improvisée dans le hall, venez !", 6, "f_0");

  // Présences
  ["f_1", "f_3", "f_4", "f_5", "f_8", "f_10", "f_13", "f_15"].forEach((u, i) => db.checkins.push({ user_id: u, site: "colbert", since: iso(new Date(now - (20 + i * 11) * 6e4)) }));
  ["f_2", "f_6", "f_7", "f_11"].forEach((u, i) => db.checkins.push({ user_id: u, site: "ibd", since: iso(new Date(now - (15 + i * 9) * 6e4)) }));

  const chans = [["annonces", "Annonces", "Infos officielles (admin et modos seulement)", true], ["general", "Général", "Discussion générale", false], ["colbert", "Colbert", "Coordination du site Colbert", false], ["ibd", "Bernard du Bois", "Coordination de l'îlot Bernard du Bois", false], ["logistique", "Logistique", "Matériel, bouffe, transport", false], ["ag-votes", "AG & votes", "Préparation des AG, propositions", false]];
  chans.forEach(([slug, name, description, admin_only], i) => db.channels.push({ id: id("channels"), slug, name, description, admin_only, position: i }));
  const ch = (slug) => db.channels.find((c) => c.slug === slug).id;
  const msgs = [
    ["annonces", "f_0", "📢 Bienvenue sur la plateforme ! Inscrivez-vous sur les créneaux dans **Planning** et cliquez sur « Je suis sur place » en arrivant.", 300],
    ["general", "f_4", "Salut tout le monde, c'est top d'avoir enfin un truc organisé 🙌", 180],
    ["general", "f_9", "Grave, les groupes WhatsApp c'était l'enfer", 176],
    ["general", "f_0", "Pensez à remplir vos créneaux pour la semaine, surtout le matin tôt", 150],
    ["colbert", "f_1", "On tient les deux entrées. Besoin de monde à partir de 12h pour la relève", 70],
    ["colbert", "f_5", "Je peux venir de 12h à 15h", 66],
    ["colbert", "f_13", "Moi aussi, j'amène du café ☕", 64],
    ["ibd", "f_2", "On est un peu justes ici, si des gens de Colbert peuvent basculer ce serait cool", 15],
    ["ibd", "f_7", "Police devant la gare mais ils ne bougent pas", 37],
    ["logistique", "f_10", "Il nous faut des chaînes et des cadenas, j'ai mis la liste dans Matériel", 120],
    ["ag-votes", "f_0", "Proposition : AG commune demain midi à Colbert. Votez dans Sondages !", 90],
  ];
  msgs.forEach(([c, u, content, min]) => db.messages.push({ id: id("messages"), channel_id: ch(c), user_id: u, content, pinned: c === "annonces", created_at: iso(new Date(now - min * 6e4)) }));

  const p1 = id("polls"), p2 = id("polls");
  db.polls.push({ id: p1, question: "On reconduit le blocage lundi ?", options: ["Oui, sur les deux sites", "Oui, seulement Colbert", "Non, pause", "Abstention"], multiple: false, closes_at: iso(new Date(now.getTime() + 20 * 36e5)), closed: false, created_by: "f_0", created_at: iso(new Date(now - 3 * 36e5)) });
  db.polls.push({ id: p2, question: "Quels créneaux pour l'AG commune ? (plusieurs choix)", options: ["Mardi 12h", "Mardi 18h", "Mercredi 12h", "Jeudi 12h"], multiple: true, closes_at: null, closed: false, created_by: "f_0", created_at: iso(new Date(now - 5 * 36e5)) });
  users.forEach((u) => {
    if (R() < 0.85) db.poll_votes.push({ poll_id: p1, user_id: u, choices: [R() < 0.62 ? 0 : R() < 0.5 ? 1 : R() < 0.6 ? 2 : 3], created_at: iso(now) });
    if (R() < 0.7) db.poll_votes.push({ poll_id: p2, user_id: u, choices: [0, 1, 2, 3].filter(() => R() < 0.45).concat(R() < 0.5 ? [0] : [1]).filter((v, i, a) => a.indexOf(v) === i), created_at: iso(now) });
  });

  const pages = [
    ["revendication", "Revendication n°1 — [titre à compléter]", "## Le constat\n[Décris le problème en 2-3 phrases.]\n\n## Ce qu'on demande\n- [Demande précise et mesurable]\n\n## Pourquoi c'est juste\n[Arguments, chiffres, sources.]", 1],
    ["revendication", "Revendication n°2 — [titre à compléter]", "## Le constat\n[...]\n\n## Ce qu'on demande\n- [...]\n\n## Pourquoi c'est juste\n[...]", 2],
    ["revendication", "Revendication n°3 — [titre à compléter]", "## Le constat\n[...]\n\n## Ce qu'on demande\n- [...]", 3],
    ["argument", "Pourquoi on se mobilise", "## En une phrase\n[Le message principal, simple et clair.]\n\n## Les 3 raisons principales\n- [Raison 1]\n- [Raison 2]\n- [Raison 3]", 1],
    ["argument", "Réponses aux objections", "## « Le blocage pénalise les étudiants »\n[Réponse]\n\n## « Ça ne sert à rien »\n[Réponse]\n\n## « Je vais rater mes partiels »\n[Réponse]", 2],
    ["argument", "Chiffres clés & sources", "## Chiffres\n- [Chiffre] — source : [lien]\n- [Chiffre] — source : [lien]", 3],
    ["droits", "Tes droits (à faire valider par l'équipe juridique)", "## Avant d'y aller\n- [Conseils pratiques]\n\n## Face aux forces de l'ordre\n- [À compléter avec l'équipe juridique]\n\n## En cas d'interpellation\n- [À compléter avec l'équipe juridique]", 1],
    ["droits", "Contacts utiles", "## Équipe juridique / legal team\n- [Nom / numéro]\n\n## Référents de site\n- Colbert : [pseudo]\n- Bernard du Bois : [pseudo]\n\n## Urgences\n- SAMU : 15 · Urgences : 112", 2],
    ["faq", "Comment participer ?", "1. Inscris-toi sur un créneau dans **Planning**.\n2. Le jour J, clique sur **Je suis sur place** en arrivant.\n3. Suis le salon de ton site dans le **Chat**.", 1],
    ["faq", "Qui voit mon nom et mon prénom ?", "Uniquement l'administrateur de la plateforme. Ils servent seulement à éviter les faux comptes et seront supprimés à la fin de la mobilisation.", 2],
  ];
  pages.forEach(([kind, title, body, position]) => db.pages.push({ id: id("pages"), kind, title, body, position, updated_by: "f_0", updated_at: iso(now) }));
  users.forEach((u) => { if (R() < 0.6) db.supports.push({ page_id: 1, user_id: u }); if (R() < 0.4) db.supports.push({ page_id: 2, user_id: u }); });

  db.announcements.push({ id: id("announcements"), title: "Blocage reconduit lundi dès 7h", body: "Rendez-vous devant les deux sites. Inscrivez-vous sur les créneaux du matin, c'est là qu'on manque de monde.", level: "urgent", pinned: true, created_by: "f_0", created_at: iso(new Date(now - 2 * 36e5)) });
  db.announcements.push({ id: id("announcements"), title: "Bienvenue sur la plateforme", body: "Ici on s'organise : planning, chat, sondages, infos. Les noms et prénoms ne sont visibles que par l'admin.", level: "info", pinned: true, created_by: "f_0", created_at: iso(new Date(now - 26 * 36e5)) });

  [["Chaînes + cadenas", "both", 8], ["Banderoles", "both", 4], ["Packs d'eau", "colbert", 10], ["Thermos de café", "ibd", 3], ["Gilets fluo", "both", 10], ["Mégaphone", "ibd", 1], ["Couvertures (nuit)", "colbert", 12]].forEach(([item, site, qty]) => {
    const mid = id("materials");
    db.materials.push({ id: mid, item, site, qty_needed: qty, done: false, created_by: "f_0", created_at: iso(now) });
    users.forEach((u) => { if (R() < 0.12) db.pledges.push({ material_id: mid, user_id: u, qty: 1 + Math.floor(R() * 2) }); });
  });

  const ev = (title, site, place, dDays, h, m, description) => { const d = new Date(day0); d.setDate(d.getDate() + dDays); d.setHours(h, m); db.events.push({ id: id("events"), title, site, place, starts_at: iso(d), description, created_by: "f_0", created_at: iso(now) }); };
  ev("AG commune", "colbert", "Amphi / hall Colbert", 1, 12, 0, "Bilan de la semaine, vote de la reconduction.");
  ev("Point logistique", "ibd", "Devant la BU", 0, 18, 30, "Organisation des relèves et du matériel pour la nuit.");
  ev("Rassemblement", "autre", "Porte d'Aix", 3, 14, 0, "Rassemblement ouvert à tous.");

  void pick;
  return db;
}

// Un peu de vie dans la démo : des messages et présences simulés
function startBots(db, emit, nextId) {
  const LINES = {
    general: ["Quelqu'un a des nouvelles de la présidence ?", "Je passe à 14h avec des sandwichs", "Pensez à vous inscrire pour demain matin 🙏", "Super boulot aujourd'hui tout le monde", "Il reste de la place sur les créneaux de 7h"],
    colbert: ["Relève assurée jusqu'à 16h", "On aurait besoin d'une personne de plus côté rue Colbert", "Tout est calme ici", "Café dispo dans le hall ☕"],
    ibd: ["Toujours calme devant la gare", "Quelqu'un peut ramener des gilets fluo ?", "On est 6 maintenant, merci !"],
    logistique: ["J'ai trouvé 3 cadenas en plus", "Qui a la clé du local ?"],
  };
  const tick = () => {
    const fakes = db.profiles.filter((p) => p._fake);
    if (!fakes.length) return;
    const u = fakes[Math.floor(Math.random() * fakes.length)];
    if (Math.random() < 0.75) {
      const slugs = Object.keys(LINES); const slug = slugs[Math.floor(Math.random() * slugs.length)];
      const ch = db.channels.find((c) => c.slug === slug); if (!ch) return;
      const content = LINES[slug][Math.floor(Math.random() * LINES[slug].length)];
      const m = { id: nextId("messages"), channel_id: ch.id, user_id: u.id, content, pinned: false, created_at: new Date().toISOString() };
      db.messages.push(m); emit("messages", { eventType: "INSERT", new: { ...m } });
    } else {
      const site = Math.random() < 0.6 ? "colbert" : "ibd";
      const ex = db.checkins.find((c) => c.user_id === u.id);
      if (ex) { db.checkins = db.checkins.filter((c) => c.user_id !== u.id); emit("checkins", { eventType: "DELETE", old: ex, new: {} }); }
      else { const c = { user_id: u.id, site, since: new Date().toISOString() }; db.checkins.push(c); emit("checkins", { eventType: "INSERT", new: c }); }
    }
  };
  const t = setInterval(tick, 35000);
  return () => clearInterval(t);
}
