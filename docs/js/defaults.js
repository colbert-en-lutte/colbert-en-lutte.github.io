export const DEFAULT_SETTINGS = {
  name: "Colbert en lutte",
  tagline: "On s'organise. On tient. On gagne.",
  manual_validation: false,
  member_polls: false,
  slow_mode: 0,
  day_start: 6,
  day_end: 22,
  purge_date: null,
  sites: {
    colbert: { name: "Faculté Colbert", short: "Colbert", address: "14 rue Puvis de Chavannes, 13001", lat: 43.30030, lng: 5.37470, min: 7, target: 15 },
    ibd: { name: "Îlot Bernard du Bois", short: "Bernard du Bois", address: "5-9 bd Maurice Bourdet, 13001", lat: 43.30215, lng: 5.37925, min: 5, target: 10 },
  },
};

export const SITE_IDS = ["colbert", "ibd"];

// Statuts d'un lieu (officiels et signalements)
export const STATUSES = {
  bloque:  { label: "Bloqué",            short: "BLOQUÉ",   color: "#ff4d2e", icon: "lock" },
  ouvert:  { label: "Ouvert",            short: "OUVERT",   color: "#8a919e", icon: "unlock" },
  police:  { label: "Police / CRS",      short: "CRS",      color: "#3b82f6", icon: "siren", alert: true },
  renfort: { label: "Besoin de renfort", short: "RENFORT",  color: "#ffb020", icon: "users", alert: true },
  ag:      { label: "AG en cours",       short: "AG",       color: "#a78bfa", icon: "mega" },
  evacue:  { label: "Évacué",            short: "ÉVACUÉ",   color: "#e11d48", icon: "alert", alert: true },
  autre:   { label: "Autre info",        short: "INFO",     color: "#9aa0ab", icon: "info" },
};
export const OFFICIAL_STATUSES = ["bloque", "ouvert", "police", "renfort", "ag", "evacue"];

export const ROLES = {
  admin:    { label: "Admin" },
  modo:     { label: "Modo" },
  referent: { label: "Référent·e" },
  membre:   { label: "Membre" },
};

export const PAGE_KINDS = {
  revendication: { label: "Revendications", one: "revendication" },
  argument:      { label: "Arguments",      one: "argument" },
  droits:        { label: "Tes droits",     one: "page" },
  faq:           { label: "FAQ",            one: "question" },
};

export const AVATAR_COLORS = ["#ff4d2e", "#ffb020", "#3ddc84", "#3b82f6", "#a78bfa", "#f472b6", "#22d3ee", "#facc15", "#fb923c", "#4ade80"];

export const CHECKIN_TTL_H = 8; // une présence expire après 8 h sans mise à jour
