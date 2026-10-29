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

export function applyOverlays(stage, manifest, active) {
  const stack = stage.querySelector("#layers");
  const baseWidth = manifest.width;
  const baseHeight = manifest.height;
  const wanted = [];
  for (const categoryId of LAYER_ORDER) {
    for (const product of active[categoryId] || []) {
      const meta = manifest.overlays?.[product.id];
      if (meta) wanted.push({ id: product.id, meta });
    }
  }
  const keep = new Set(wanted.map((item) => item.id));
  for (const layer of [...stack.querySelectorAll(".layer")]) {
    if (!keep.has(layer.dataset.product)) layer.remove();
  }
  for (const item of wanted) {
    let layer = stack.querySelector(`[data-product="${item.id}"]`);
    if (!layer) {
      layer = document.createElement("img");
      layer.className = "layer";
      layer.alt = "";
      layer.dataset.product = item.id;
      stack.append(layer);
    }
    const next = item.meta.file;
    if (layer.getAttribute("src") !== next) layer.src = next;
    layer.style.left = `${(item.meta.x / baseWidth) * 100}%`;
    layer.style.top = `${(item.meta.y / baseHeight) * 100}%`;
    layer.style.width = `${(item.meta.width / baseWidth) * 100}%`;
    layer.style.height = `${(item.meta.height / baseHeight) * 100}%`;
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
      const polys = hitPolys(region);
      for (const poly of polys) {
        group.append(svgEl("polygon", { points: poly.map((point) => point.join(",")).join(" ") }));
      }
    }
    svg.append(group);
  }
}

function hitPolys(region) {
  if (region.hit) return [region.hit];
  if (region.slots) {
    return Object.values(region.slots)
      .map((slot) => slot.quad || slot.polygons?.[0])
      .filter(Boolean);
  }
  if (region.polygons?.length) return region.polygons;
  return region.quad ? [region.quad] : [];
}

function svgEl(name, attrs) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
  return element;
}
