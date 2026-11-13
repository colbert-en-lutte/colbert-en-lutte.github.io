// État global de l'application + fonctions métier partagées
import { DEFAULT_SETTINGS, CHECKIN_TTL_H, SITE_IDS } from "./defaults.js";

export const S = {
  store: null,
  me: null,                 // mon profil
  settings: structuredClone(DEFAULT_SETTINGS),
  profiles: new Map(),
  statuses: {},             // site -> {status, note, updated_by, updated_at}
  reports: [],
  shifts: [],
  checkins: [],
  channels: [],
  messages: new Map(),      // channel_id -> [messages]
  unread: {},               // channel_id -> n
  polls: [], myVotes: {}, pollCounts: {},
  pages: [], supportCounts: {}, mySupports: new Set(),
  announcements: [],
  materials: [], pledges: [],
  events: [],
  identities: null, audit: [],
  pickSite: null,           // mode "repositionner un site sur la carte"
};

const bus = new EventTarget();
export const emit = (domain) => bus.dispatchEvent(new CustomEvent("change", { detail: domain }));
export const onChange = (fn) => { const h = (e) => fn(e.detail); bus.addEventListener("change", h); return () => bus.removeEventListener("change", h); };

export const isMod = () => S.me && ["admin", "modo"].includes(S.me.role);
export const isAdmin = () => S.me?.role === "admin";
export const canSite = (site) => isMod() || (S.me?.role === "referent" && (S.me.referent_site === site || site === "both"));
export const prof = (id) => S.profiles.get(id);
export const pseudoOf = (id) => prof(id)?.pseudo || "Inconnu·e";
export const site = (id) => S.settings.sites?.[id] || DEFAULT_SETTINGS.sites[id] || { name: id, short: id };
export const siteName = (id) => (id === "both" ? "Les deux sites" : id === "autre" ? "Autre lieu" : site(id).short);

export function activeCheckins(siteId) {
  const limit = Date.now() - CHECKIN_TTL_H * 36e5;
  return S.checkins.filter((c) => (!siteId || c.site === siteId) && new Date(c.since).getTime() > limit && prof(c.user_id)?.status === "active");
}
export const myCheckin = () => activeCheckins().find((c) => c.user_id === S.me?.id);

// Nombre de personnes inscrites qui couvrent une plage [a, b)
export function countOverlap(siteId, a, b) {
  const A = +a, B = +b;
  let n = 0;
  const seen = new Set();
  for (const s of S.shifts) {
    if (s.site !== siteId) continue;
    if (+new Date(s.starts_at) < B && +new Date(s.ends_at) > A && !seen.has(s.user_id)) { seen.add(s.user_id); n++; }
  }
  return n;
}
export const peopleOverlap = (siteId, a, b) => S.shifts.filter((s) => s.site === siteId && +new Date(s.starts_at) < +b && +new Date(s.ends_at) > +a);

export function level(siteId, n) {
  const st = site(siteId);
  if (n >= st.target) return "ok";
  if (n >= st.min) return "mid";
  return "low";
}

// Prochain "trou" (créneau sous le minimum) aujourd'hui pour un site
export function nextGap(siteId) {
  const st = S.settings;
  const now = new Date();
  const t = new Date(now); t.setSeconds(0, 0); t.setMinutes(t.getMinutes() < 30 ? 0 : 30);
  const end = new Date(now); end.setHours(st.day_end, 0, 0, 0);
  let gapStart = null;
  for (let c = new Date(t); c < end; c = new Date(c.getTime() + 30 * 6e4)) {
    if (c.getHours() < st.day_start) continue;
    const n = countOverlap(siteId, c, new Date(c.getTime() + 30 * 6e4));
    if (n < site(siteId).min) { if (!gapStart) gapStart = { start: new Date(c), n }; }
    else if (gapStart) return { ...gapStart, end: c };
  }
  return gapStart ? { ...gapStart, end } : null;
}

export async function logAction(action, target, details) {
  try { await S.store.insert("audit_log", { action, target: target ? String(target) : null, details: details || null }); } catch (e) { console.warn("audit", e); }
}

export { SITE_IDS };
