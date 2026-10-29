/**
 * Room compositor.
 *
 * The base photo never changes. Each swappable item is an <img> of a
 * transparent PNG, positioned with percentages of the base so it scales.
 * Missing overlays stay hidden, which leaves the original pixels showing.
 * Hit targets are an SVG in the same viewBox as the region coordinates.
 */

import { CATEGORIES } from "./catalogue.js";

const LAYER_ORDER = ["rug", "throw", "cushions", "wall-art"];

export function layerOrder() {
  return LAYER_ORDER;
}

export function applyOverlays(stage, manifest, options, selection) {
  const baseWidth = manifest.width;
  const baseHeight = manifest.height;
  for (const categoryId of LAYER_ORDER) {
    const layer = stage.querySelector(`[data-layer="${categoryId}"]`);
    if (!layer) continue;
    const product = (options[categoryId] || []).find((item) => item.id === selection[categoryId]);
    const meta = product ? manifest.overlays[product.id] : null;
    if (!meta) {
      layer.hidden = true;
      layer.removeAttribute("src");
      continue;
    }
    const next = meta.file;
    if (layer.getAttribute("src") !== next) layer.src = next;
    layer.hidden = false;
    layer.style.left = `${(meta.x / baseWidth) * 100}%`;
    layer.style.top = `${(meta.y / baseHeight) * 100}%`;
    layer.style.width = `${(meta.width / baseWidth) * 100}%`;
    layer.style.height = `${(meta.height / baseHeight) * 100}%`;
    layer.alt = "";
  }
}

export function mountHits(svg, room) {
  svg.setAttribute("viewBox", `0 0 ${room.width} ${room.height}`);
  svg.replaceChildren();
  for (const category of CATEGORIES) {
    const region = room.regions[category.id];
    if (!region) continue;
    const group = svgEl("g", {
      "data-category": category.id,
      role: "button",
      tabindex: "0",
      "aria-label": `${region.label}. Tap to open options, swipe sideways to change.`,
    });
    if (region.holes?.length) {
      const parts = [...(region.polygons || []), ...region.holes];
      const d = parts.map((poly) => `M ${poly.map((point) => point.join(" ")).join(" L ")} Z`).join(" ");
      group.append(svgEl("path", { d, "fill-rule": "evenodd" }));
    } else {
      const polys = region.hit ? [region.hit] : region.polygons || (region.quad ? [region.quad] : []);
      for (const poly of polys) {
        group.append(svgEl("polygon", { points: poly.map((point) => point.join(",")).join(" ") }));
      }
    }
    svg.append(group);
  }
}

function svgEl(name, attrs) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
  return element;
}
