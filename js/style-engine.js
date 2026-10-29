/**
 * Style engine.
 *
 * derivePalette(anchors, style) is the only place a palette is invented.
 * Anchors are hex colours for walls, sofa, timber and light.
 * The style contributes harmony, undertone and hueShift (see data/color-rules.json
 * and data/styles.json). Do not hard-code a palette per photo.
 */

export function derivePalette(anchors, style) {
  const walls = hexToRgb(anchors.walls);
  const sofa = hexToRgb(anchors.sofa);
  const timber = hexToRgb(anchors.timber);
  const timberHue = rgbToHsl(timber).h;

  const warm = style.undertone === "warm-bridge";
  const bridgedWall = warm ? mix(walls, timber, 0.18) : walls;
  const dominant = lighten(bridgedWall, warm ? 0.22 : 0.12);
  const secondary = mix(sofa, timber, warm ? 0.38 : 0.22);

  let saturation = warm ? 0.26 : 0.16;
  let lightness = 0.52;
  let hue = timberHue + (style.hueShift || 0);
  if (style.harmony === "monochrome") {
    hue = timberHue;
    saturation = 0.1;
    lightness = 0.42;
  }
  if (style.harmony === "complementary") saturation = Math.min(saturation, 0.22);

  const accent = hslToRgb({ h: hue, s: saturation, l: lightness });

  return {
    dominant: { role: "60", hex: rgbToHex(dominant), label: "Main, from the walls" },
    secondary: { role: "30", hex: rgbToHex(secondary), label: "Support, sofa and timber" },
    accent: { role: "10", hex: rgbToHex(accent), label: style.accentName },
  };
}

export function hexToRgb(hex) {
  const value = hex.replace("#", "");
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

export function rgbToHex([r, g, b]) {
  const channel = (value) =>
    Math.round(Math.max(0, Math.min(255, value))).toString(16).padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`.toUpperCase();
}

function mix(a, b, t) {
  return a.map((value, index) => value * (1 - t) + b[index] * t);
}

function lighten(rgb, t) {
  return mix(rgb, [255, 255, 255], t);
}

function rgbToHsl([r, g, b]) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return { h: (h / 6) * 360, s, l };
}

function hslToRgb({ h, s, l }) {
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = hue / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}
