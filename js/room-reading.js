/**
 * Room reading.
 *
 * Version one uses colours sampled ahead of time from the stock photo
 * (data/room.json → fixed). A later upload step can call sampleRegions()
 * on a canvas the same size as the region coordinates and pass the result
 * to derivePalette() in style-engine.js.
 */

/** @param {object} room */
export function fixedAnchors(room) {
  const anchors = {};
  for (const item of room.fixed) anchors[item.id] = item.hex;
  return anchors;
}

/**
 * Average colour inside each named region.
 * imageData must be the same pixel size as the region coordinates.
 * Holes are excluded. Returns { [regionId]: "#rrggbb" }.
 */
export function sampleRegions(imageData, regions) {
  const { data, width } = imageData;
  const result = {};
  for (const [id, region] of Object.entries(regions)) {
    const polygons = region.polygons || (region.quad ? [region.quad] : []);
    const holes = region.holes || [];
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    const bounds = polygonBounds(polygons);
    for (let y = bounds.y0; y <= bounds.y1; y += 2) {
      for (let x = bounds.x0; x <= bounds.x1; x += 2) {
        if (!polygons.some((poly) => pointInPolygon(x, y, poly))) continue;
        if (holes.some((poly) => pointInPolygon(x, y, poly))) continue;
        const i = (y * width + x) * 4;
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
        n += 1;
      }
    }
    if (n) result[id] = rgbToHex(r / n, g / n, b / n);
  }
  return result;
}

function polygonBounds(polygons) {
  const xs = polygons.flat().map((point) => point[0]);
  const ys = polygons.flat().map((point) => point[1]);
  return {
    x0: Math.max(0, Math.floor(Math.min(...xs))),
    y0: Math.max(0, Math.floor(Math.min(...ys))),
    x1: Math.floor(Math.max(...xs)),
    y1: Math.floor(Math.max(...ys)),
  };
}

function pointInPolygon(x, y, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 0.0) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function rgbToHex(r, g, b) {
  const channel = (value) => Math.round(value).toString(16).padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`.toUpperCase();
}
