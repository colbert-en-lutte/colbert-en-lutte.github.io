// Chargement des données + temps réel
import { S, emit, isAdmin } from "./state.js";
import { DEFAULT_SETTINGS } from "./defaults.js";
import { debounce } from "./ui.js";

const st = () => S.store;

export const loaders = {
  async profiles() {
    const rows = await st().list("profiles", { order: ["created_at", true] });
    S.profiles = new Map(rows.map((p) => [p.id, p]));
    if (S.me) S.me = S.profiles.get(S.me.id) || S.me;
  },
  async settings() {
    const rows = await st().list("settings", { eq: { id: 1 } });
    const data = rows[0]?.data || {};
    S.settings = { ...structuredClone(DEFAULT_SETTINGS), ...data, sites: { ...DEFAULT_SETTINGS.sites, ...(data.sites || {}) } };
    for (const k of Object.keys(DEFAULT_SETTINGS.sites)) S.settings.sites[k] = { ...DEFAULT_SETTINGS.sites[k], ...(data.sites?.[k] || {}) };
  },
  async site_status() {
    const rows = await st().list("site_status");
    S.statuses = Object.fromEntries(rows.map((r) => [r.site, r]));
  },
  async reports() {
    const since = new Date(Date.now() - 48 * 36e5).toISOString();
    S.reports = await st().list("reports", { gte: { created_at: since }, order: ["created_at", false], limit: 150 });
  },
  async shifts() {
    const from = new Date(Date.now() - 14 * 864e5).toISOString();
    S.shifts = await st().list("shifts", { gte: { ends_at: from }, order: ["starts_at", true], limit: 5000 });
  },
  async checkins() { S.checkins = await st().list("checkins"); },
  async channels() { S.channels = await st().list("channels", { order: ["position", true] }); },
  async polls() {
    const [polls, votes, counts] = await Promise.all([
      st().list("polls", { order: ["created_at", false] }),
      st().list("poll_votes", { eq: { user_id: S.me.id } }),
      st().rpc("poll_counts"),
    ]);
    S.polls = polls;
    S.myVotes = Object.fromEntries(votes.map((v) => [v.poll_id, v.choices]));
    S.pollCounts = {};
    for (const c of counts || []) { (S.pollCounts[c.poll_id] ||= {})[c.choice] = Number(c.n); }
  },
  async pages() {
    const [pages, sup, counts] = await Promise.all([
      st().list("pages", { order: ["position", true] }),
      st().list("supports", { eq: { user_id: S.me.id } }),
      st().rpc("support_counts"),
    ]);
    S.pages = pages;
    S.mySupports = new Set(sup.map((s) => s.page_id));
    S.supportCounts = Object.fromEntries((counts || []).map((c) => [c.page_id, Number(c.n)]));
  },
  async announcements() { S.announcements = await st().list("announcements", { order: ["created_at", false], limit: 50 }); },
  async materials() {
    const [m, p] = await Promise.all([st().list("materials", { order: ["created_at", true] }), st().list("pledges")]);
    S.materials = m; S.pledges = p;
  },
  async events() {
    const from = new Date(Date.now() - 7 * 864e5).toISOString();
    S.events = await st().list("events", { gte: { starts_at: from }, order: ["starts_at", true] });
  },
  async identities() { S.identities = isAdmin() ? await st().list("identities") : null; },
  async audit() { S.audit = isAdmin() ? await st().list("audit_log", { order: ["created_at", false], limit: 300 }) : []; },
};

export async function loadAll() {
  await loaders.profiles();
  const keys = ["settings", "site_status", "reports", "shifts", "checkins", "channels", "polls", "pages", "announcements", "materials", "events"];
  const res = await Promise.allSettled(keys.map((k) => loaders[k]()));
  res.forEach((r, i) => r.status === "rejected" && console.warn("load", keys[i], r.reason));
  emit("all");
}

export async function loadMessages(channelId) {
  const rows = await st().list("messages", { eq: { channel_id: channelId }, order: ["created_at", false], limit: 200 });
  S.messages.set(channelId, rows.reverse());
  emit("messages");
}

// Correspondance table -> domaine rechargé
const TABLE_DOMAIN = { poll_votes: "polls", supports: "pages", pledges: "materials" };
const reloaders = {};
function reloadLater(domain) {
  if (!loaders[domain]) return;
  (reloaders[domain] ||= debounce(async () => {
    try { await loaders[domain](); emit(domain); } catch (e) { console.warn("reload", domain, e); }
  }, 250))();
}

const listeners = new Set();
export const onRealtime = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export function handleRealtime(table, payload) {
  if (table === "messages") {
    const m = payload.new?.id ? payload.new : null;
    if (payload.eventType === "INSERT" && m) {
      const arr = S.messages.get(m.channel_id);
      if (arr && !arr.some((x) => x.id === m.id)) arr.push(m);
      emit("messages");
    } else if (payload.eventType === "DELETE") {
      for (const arr of S.messages.values()) { const i = arr.findIndex((x) => x.id === payload.old?.id); if (i >= 0) arr.splice(i, 1); }
      emit("messages");
    } else if (payload.eventType === "UPDATE" && m) {
      const arr = S.messages.get(m.channel_id); const i = arr ? arr.findIndex((x) => x.id === m.id) : -1;
      if (i >= 0) arr[i] = m;
      emit("messages");
    }
  } else {
    reloadLater(TABLE_DOMAIN[table] || table);
  }
  for (const l of listeners) { try { l(table, payload); } catch (e) { console.error(e); } }
}
