// Carte 3D (MapLibre + bâtiments OpenStreetMap en relief) avec repli SVG si WebGL indisponible.
import { S, site, activeCheckins, SITE_IDS } from "./state.js";
import { STATUSES } from "./defaults.js";
import { esc, icon } from "./ui.js";

let map = null, mapEl = null, markers = {}, onSiteClick = () => { }, onPick = null;
let rotating = false, rotTimer = null, pulseTimer = null, is3D = true, offlineBase = false, fallbackMode = false;
const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.motion === "reduce";
const isDark = () => document.documentElement.dataset.theme !== "light";

export function mountMap(container, { onSite, onPickSite } = {}) {
  if (onSite) onSiteClick = onSite;
  if (onPickSite) onPick = onPickSite;
  if (!mapEl) {
    mapEl = document.createElement("div");
    mapEl.className = "map-root";
    mapEl.setAttribute("role", "region");
    mapEl.setAttribute("aria-label", "Carte des deux sites");
    container.appendChild(mapEl);
    init();
  } else {
    container.appendChild(mapEl);
    if (map) requestAnimationFrame(() => map.resize());
  }
  updateMap();
}

function webglOK() {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; }
}

function overviewCam() {
  const a = site("colbert"), b = site("ibd");
  const w = mapEl?.clientWidth || 800, h = mapEl?.clientHeight || 500;
  const small = w < 600;
  try {
    const cam = map.cameraForBounds([[Math.min(a.lng, b.lng), Math.min(a.lat, b.lat)], [Math.max(a.lng, b.lng), Math.max(a.lat, b.lat)]],
      { padding: { top: Math.min(170, h * 0.32), bottom: small ? 110 : Math.min(180, h * 0.3), left: small ? 70 : 160, right: small ? 70 : 220 }, bearing: -28 });
    return { center: cam.center, zoom: Math.min(16.3, cam.zoom - 0.15), bearing: -28 };
  } catch { return { center: center(), zoom: small ? 15 : 15.85, bearing: -28 }; }
}
const center = () => {
  const a = site("colbert"), b = site("ibd");
  return [(a.lng + b.lng) / 2, (a.lat + b.lat) / 2];
};

async function loadStyle() {
  const url = `https://tiles.openfreemap.org/styles/${isDark() ? "dark" : "positron"}`;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 7000);
    const r = await fetch(url, { signal: ctl.signal });
    clearTimeout(t);
    if (!r.ok) throw new Error(r.status);
    offlineBase = false;
    return await r.json();
  } catch {
    offlineBase = true;
    return { version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": isDark() ? "#0d0f13" : "#ebe6dc" } }] };
  }
}

async function init() {
  if (!window.maplibregl || !webglOK()) return renderFallback();
  try { window.maplibregl.setWorkerUrl(new URL("vendor/maplibre-gl-csp-worker.js", document.baseURI).href); } catch { }
  const style = await loadStyle();
  try {
    map = new window.maplibregl.Map({
      container: mapEl, style, center: center(), zoom: 15.1, pitch: 20, bearing: 0,
      maxPitch: 78, minZoom: 12.5, maxZoom: 19, attributionControl: false,
    });
  } catch (e) { console.warn(e); return renderFallback(); }
  map.addControl(new window.maplibregl.AttributionControl({ compact: true }), "bottom-left");
  map.on("style.load", addLayers);
  map.on("load", () => {
    mapEl.classList.toggle("offline-base", offlineBase);
    map.flyTo({ ...overviewCam(), pitch: 62, duration: reduceMotion() ? 0 : 3200, essential: true });
  });
  map.on("click", (e) => { if (S.pickSite && onPick) onPick(S.pickSite, e.lngLat.lat, e.lngLat.lng); });
  map.on("error", (e) => console.warn("carte:", e?.error?.message || e));
  map.on("dragstart", () => stopRotate());
  for (const id of SITE_IDS) {
    const el = document.createElement("button");
    el.className = "site-marker";
    el.type = "button";
    el.addEventListener("click", (ev) => { ev.stopPropagation(); if (!S.pickSite) onSiteClick(id); });
    markers[id] = { el, m: new window.maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([site(id).lng, site(id).lat]).addTo(map) };
  }
  updateMap();
  startPulse();
}

function circle(lng, lat, r = 48, n = 56) {
  const pts = [];
  const dLat = r / 111320, dLng = r / (111320 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2; pts.push([lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)]); }
  return pts;
}

function statusColor(id) { return (STATUSES[S.statuses[id]?.status] || STATUSES.ouvert).color; }

function geo() {
  const polys = SITE_IDS.map((id) => ({ type: "Feature", properties: { id, color: statusColor(id) }, geometry: { type: "Polygon", coordinates: [circle(site(id).lng, site(id).lat)] } }));
  const pts = SITE_IDS.map((id) => ({ type: "Feature", properties: { id, color: statusColor(id) }, geometry: { type: "Point", coordinates: [site(id).lng, site(id).lat] } }));
  const a = site("colbert"), b = site("ibd");
  const route = { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[a.lng, a.lat], [b.lng, b.lat]] } };
  return { polys: { type: "FeatureCollection", features: polys }, pts: { type: "FeatureCollection", features: pts }, route: { type: "FeatureCollection", features: [route] } };
}

function addLayers() {
  if (!map) return;
  const dark = isDark();
  const layers = map.getStyle().layers || [];
  const firstSymbol = layers.find((l) => l.type === "symbol")?.id;
  if (map.getSource("openmaptiles") && !map.getLayer("cel-3d")) {
    map.addLayer({
      id: "cel-3d", type: "fill-extrusion", source: "openmaptiles", "source-layer": "building", minzoom: 14,
      paint: {
        "fill-extrusion-color": ["interpolate", ["linear"], ["coalesce", ["get", "render_height"], 10],
          0, dark ? "#1a1e26" : "#e7e1d6", 20, dark ? "#232833" : "#dbd3c5", 50, dark ? "#2e3442" : "#cbc2b2"],
        "fill-extrusion-height": ["interpolate", ["linear"], ["zoom"], 14, 0, 14.8, ["coalesce", ["get", "render_height"], 10]],
        "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
        "fill-extrusion-opacity": 0.92,
        "fill-extrusion-vertical-gradient": true,
      },
    }, firstSymbol);
  }
  const g = geo();
  if (!map.getSource("cel-sites")) {
    map.addSource("cel-sites", { type: "geojson", data: g.polys });
    map.addSource("cel-pts", { type: "geojson", data: g.pts });
    map.addSource("cel-route", { type: "geojson", data: g.route });
  }
  if (!map.getLayer("cel-route")) {
    map.addLayer({ id: "cel-route", type: "line", source: "cel-route", layout: { "line-cap": "round" },
      paint: { "line-color": dark ? "#ff4d2e" : "#e63312", "line-width": ["interpolate", ["linear"], ["zoom"], 13, 1.5, 17, 4], "line-dasharray": [0.5, 2], "line-opacity": 0.85 } });
    map.addLayer({ id: "cel-halo", type: "circle", source: "cel-pts",
      paint: { "circle-color": ["get", "color"], "circle-radius": ["interpolate", ["exponential", 2], ["zoom"], 13, 14, 18, 260], "circle-blur": 0.9, "circle-opacity": 0.38, "circle-pitch-alignment": "map" } });
    map.addLayer({ id: "cel-ground", type: "fill", source: "cel-sites", paint: { "fill-color": ["get", "color"], "fill-opacity": 0.22 } });
    map.addLayer({ id: "cel-ring", type: "line", source: "cel-sites", paint: { "line-color": ["get", "color"], "line-width": 2.5, "line-opacity": 0.95 } });
    map.addLayer({ id: "cel-block", type: "fill-extrusion", source: "cel-sites",
      paint: { "fill-extrusion-color": ["get", "color"], "fill-extrusion-height": 36, "fill-extrusion-base": 0, "fill-extrusion-opacity": 0.42 } });
  }
}

function startPulse() {
  clearInterval(pulseTimer);
  if (reduceMotion()) return;
  let t = 0;
  pulseTimer = setInterval(() => {
    if (!map || !map.getLayer("cel-halo") || document.hidden) return;
    t += 0.08;
    const k = 0.25 + 0.2 * (1 + Math.sin(t)) / 2;
    map.setPaintProperty("cel-halo", "circle-opacity", k);
  }, 70);
}

export function updateMap() {
  if (fallbackMode) return renderFallback();
  if (!map) return;
  const g = geo();
  map.getSource("cel-sites")?.setData(g.polys);
  map.getSource("cel-pts")?.setData(g.pts);
  map.getSource("cel-route")?.setData(g.route);
  for (const id of SITE_IDS) {
    if (!markers[id]) continue;
    markers[id].m.setLngLat([site(id).lng, site(id).lat]);
    markers[id].el.innerHTML = markerHTML(id);
    markers[id].el.setAttribute("aria-label", `${site(id).name} : ${(STATUSES[S.statuses[id]?.status] || STATUSES.ouvert).label}. Ouvrir le détail.`);
  }
}

function markerHTML(id) {
  const stt = STATUSES[S.statuses[id]?.status] || STATUSES.ouvert;
  const n = activeCheckins(id).length;
  return `<span class="sm-label"><span class="sm-name">${esc(site(id).short)}</span>
    <span class="sm-row"><span class="sm-status" style="--c:${stt.color}">${esc(stt.short)}</span><span class="sm-count">${icon("users")}${n}</span></span></span>
    <span class="sm-stem" style="--c:${stt.color}"></span><span class="sm-dot" style="--c:${stt.color}"></span>`;
}

// ---------- Contrôles ----------
export function flyOverview() { stopRotate(); if (map) map.flyTo({ ...overviewCam(), pitch: is3D ? 62 : 0, duration: reduceMotion() ? 0 : 1600 }); }
export function flySite(id) { stopRotate(); if (map) map.flyTo({ center: [site(id).lng, site(id).lat], zoom: 17.4, pitch: is3D ? 66 : 0, bearing: id === "colbert" ? -40 : 30, duration: reduceMotion() ? 0 : 1600 }); }
export function toggle3D() {
  is3D = !is3D;
  if (map) map.easeTo({ pitch: is3D ? 62 : 0, bearing: is3D ? map.getBearing() : 0, duration: 900 });
  return is3D;
}
export function toggleRotate() {
  if (rotating) { stopRotate(); return false; }
  if (!map) return false;
  rotating = true;
  const step = () => { if (!rotating) return; map.easeTo({ bearing: map.getBearing() - 12, duration: 1000, easing: (x) => x }); };
  step(); rotTimer = setInterval(step, 1000);
  return true;
}
function stopRotate() { rotating = false; clearInterval(rotTimer); document.querySelector("[data-map='rotate']")?.classList.remove("on"); }
export async function refreshMapTheme() {
  if (!map) return updateMap();
  const style = await loadStyle();
  map.setStyle(style, { diff: false });
  mapEl.classList.toggle("offline-base", offlineBase);
}
export const mapIsOffline = () => offlineBase || fallbackMode;
export function setPickCursor(on) { if (map) map.getCanvas().style.cursor = on ? "crosshair" : ""; mapEl?.classList.toggle("picking", !!on); }

// ---------- Repli sans WebGL : schéma SVG ----------
function renderFallback() {
  fallbackMode = true;
  if (!mapEl) return;
  const a = site("colbert"), b = site("ibd");
  const minLng = Math.min(a.lng, b.lng) - 0.003, maxLng = Math.max(a.lng, b.lng) + 0.003;
  const minLat = Math.min(a.lat, b.lat) - 0.0018, maxLat = Math.max(a.lat, b.lat) + 0.0018;
  const X = (lng) => ((lng - minLng) / (maxLng - minLng)) * 100, Y = (lat) => (1 - (lat - minLat) / (maxLat - minLat)) * 100;
  const pos = { colbert: [X(a.lng), Y(a.lat)], ibd: [X(b.lng), Y(b.lat)] };
  mapEl.innerHTML = `<div class="map-fallback">
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <defs><pattern id="grid" width="4" height="4" patternUnits="userSpaceOnUse"><path d="M4 0H0V4" fill="none" stroke="currentColor" stroke-width=".08" opacity=".35"/></pattern></defs>
      <rect width="100" height="100" fill="url(#grid)"/>
      <line x1="${pos.colbert[0]}" y1="${pos.colbert[1]}" x2="${pos.ibd[0]}" y2="${pos.ibd[1]}" stroke="var(--accent)" stroke-width=".5" stroke-dasharray="1 1.6" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
    </svg>
    ${SITE_IDS.map((id) => `<div class="fb-halo" style="left:${pos[id][0]}%;top:${pos[id][1]}%;--c:${statusColor(id)}"></div>
      <button class="site-marker fb" data-site="${id}" style="left:${pos[id][0]}%;top:${pos[id][1]}%">${markerHTML(id)}</button>`).join("")}
    <p class="fb-note">${icon("info")} Aperçu simplifié (carte 3D indisponible sur cet appareil)</p>
  </div>`;
  mapEl.querySelectorAll("[data-site]").forEach((btn) => (btn.onclick = () => onSiteClick(btn.dataset.site)));
}
