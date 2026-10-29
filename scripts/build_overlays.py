#!/usr/bin/env python3
"""Download verified product photos and build room overlays.

Each overlay is a transparent PNG clipped to that item's mask. Pixels outside
the mask are fully transparent, so compositing cannot change the rest of the
base photo. Overlays are product photos placed in the region, not a new render
of the room.
"""

from __future__ import annotations

import json
import urllib.parse
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
UA = "Mozilla/5.0 (compatible; HomeStylingPrototype/1.0)"


def fetch(url: str, timeout: int = 40) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return response.read()


def bbnt_image(url: str) -> str | None:
    try:
        html = fetch(url).decode("utf-8", "ignore")
    except Exception as error:
        print("  page fail", url, error)
        return None
    import html as html_lib
    import re

    for match in re.finditer(r'<script type="application/ld\+json">(.*?)</script>', html, re.S):
        raw = html_lib.unescape(match.group(1))
        if "Product" not in raw:
            continue
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if data.get("@type") not in ("Product", "ProductGroup"):
            continue
        image = data.get("image")
        if data.get("hasVariant") and not image:
            image = data["hasVariant"][0].get("image")
        if isinstance(image, list):
            image = image[0]
        if isinstance(image, str):
            return image.replace("&amp;", "&").split("?")[0]
    return None


def download_image(product: dict) -> Image.Image | None:
    if product.get("imageUnverified") or not product.get("imageUrl"):
        return None
    existing = ROOT / product["imageFile"]
    if existing.exists():
        print("  cached", product["id"])
        return Image.open(existing).convert("RGB")
    url = product["imageUrl"]
    if product["storeId"] == "bbnt":
        live = bbnt_image(product["url"])
        if live:
            url = live
            product["imageUrl"] = live
    attempts = [url]
    if "adairs.com.au" in url:
        hostless = url.replace("https://", "").replace("http://", "")
        attempts.insert(0, "https://images.weserv.nl/?url=" + urllib.parse.quote(hostless, safe="") + "&w=1400")
    last = None
    for attempt in attempts:
        try:
            data = fetch(attempt)
            path = ROOT / product["imageFile"]
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
            image = crop_extend_bars(Image.open(path).convert("RGB"))
            image.thumbnail((1200, 1200))
            image.save(path, quality=82)
            print("  image", product["id"], image.size)
            return image
        except Exception as error:
            last = error
    print("  image fail", product["id"], last)
    return None


def crop_extend_bars(image: Image.Image) -> Image.Image:
    """Drop the flat green bands Kmart's extend transform adds above and below a photo."""
    array = np.array(image.convert("RGB"))
    bar = np.array([71, 112, 76])

    def is_bar(row: np.ndarray) -> bool:
        return float(np.abs(row.astype(int) - bar).sum(axis=1).mean()) < 12

    top = 0
    while top < array.shape[0] - 10 and is_bar(array[top]):
        top += 1
    bottom = array.shape[0]
    while bottom > top + 10 and is_bar(array[bottom - 1]):
        bottom -= 1
    if top == 0 and bottom == array.shape[0]:
        return image
    return image.crop((0, top, image.width, bottom))


def polygons_for(region: dict) -> list:
    polys = list(region.get("polygons") or [])
    if region.get("quad"):
        polys.append(region["quad"])
    return polys


def build_mask(size, region) -> Image.Image:
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    for poly in polygons_for(region):
        draw.polygon([tuple(point) for point in poly], fill=255)
    if region.get("holes"):
        hole = Image.new("L", size, 255)
        hole_draw = ImageDraw.Draw(hole)
        for poly in region["holes"]:
            hole_draw.polygon([tuple(point) for point in poly], fill=0)
        mask = Image.fromarray(np.minimum(np.array(mask), np.array(hole)))
    return mask


def trim_near_white(image: Image.Image, threshold: int = 242) -> Image.Image:
    array = np.array(image.convert("RGB"))
    content = np.any(array < threshold, axis=2)
    if content.mean() > 0.92:
        return image
    ys, xs = np.where(content)
    if len(xs) < 10:
        return image
    pad = 2
    return image.crop(
        (
            max(0, int(xs.min()) - pad),
            max(0, int(ys.min()) - pad),
            min(image.width, int(xs.max()) + 1 + pad),
            min(image.height, int(ys.max()) + 1 + pad),
        )
    )


def fabric_source(image: Image.Image, product: dict) -> Image.Image:
    crop = product.get("placementCrop")
    if crop:
        x0, y0, x1, y1 = crop
        image = image.crop(
            (int(x0 * image.width), int(y0 * image.height), int(x1 * image.width), int(y1 * image.height))
        )
    if product.get("fillFrame"):
        image = trim_near_white(image, threshold=228)
        inset = float(product.get("frameInset") or 0)
        if inset:
            width, height = image.size
            image = image.crop(
                (
                    int(width * inset),
                    int(height * inset),
                    int(width * (1 - inset)),
                    int(height * (1 - inset)),
                )
            )
        return image
    rgb = np.array(image.convert("RGB"))
    border = np.concatenate(
        [rgb[0, :, :], rgb[-1, :, :], rgb[:, 0, :], rgb[:, -1, :]],
        axis=0,
    )
    if (border.min(axis=1) > 210).mean() > 0.75:
        trimmed = trim_near_white(image, threshold=228)
        # Keep the cloth and drop the silhouette of a folded or propped product.
        w, h = trimmed.size
        return trimmed.crop((int(w * 0.18), int(h * 0.22), int(w * 0.82), int(h * 0.82)))
    # Lifestyle photo: use the central cloth, not the whole set.
    w, h = image.size
    return image.crop((int(w * 0.2), int(h * 0.2), int(w * 0.8), int(h * 0.8)))


def shade_factor(base: Image.Image, mask: np.ndarray, low: float, high: float) -> np.ndarray:
    # Blur first so the old print and fringe do not show through the new cloth.
    lum = np.array(base.convert("L").filter(ImageFilter.GaussianBlur(22)), dtype=np.float32) / 255.0
    vals = lum[mask > 0]
    med = float(np.median(vals)) if vals.size else 0.6
    med = max(med, 0.15)
    return np.clip(lum / med, low, high)


def paste_shaded(base: Image.Image, mask: Image.Image, fabric: Image.Image, region: dict, low: float, high: float):
    """Fill each polygon with the full product photo, then clip to the mask.

    Doing this per polygon means both cushion groups show the cushion, rather
    than one photo stretched across the gap of sofa between them.
    """
    alpha = np.array(mask)
    canvas = Image.new("RGB", base.size, (0, 0, 0))
    for poly in polygons_for(region):
        xs = [point[0] for point in poly]
        ys = [point[1] for point in poly]
        x0, y0, x1, y1 = int(min(xs)), int(min(ys)), int(max(xs)) + 1, int(max(ys)) + 1
        if x1 <= x0 or y1 <= y0:
            continue
        fitted = fabric.resize((x1 - x0, y1 - y0), Image.Resampling.LANCZOS)
        canvas.paste(fitted, (x0, y0))
    ys, xs = np.where(alpha > 0)
    if len(xs) == 0:
        return Image.new("RGBA", (1, 1), (0, 0, 0, 0)), (0, 0)
    x0, y0, x1, y1 = int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1
    factor = shade_factor(base, alpha, low, high)[:, :, None]
    coloured = np.clip(np.array(canvas).astype(np.float32) * factor, 0, 255).astype(np.uint8)
    out = Image.fromarray(coloured).convert("RGBA")
    out.putalpha(mask)
    return out.crop((x0, y0, x1, y1)), (x0, y0)


def warp_into_quad(fabric: Image.Image, quad, size) -> Image.Image:
    """Map the fabric onto the wall-art quad. PIL perspective maps output -> source."""
    src_w, src_h = fabric.size
    source = [(0, 0), (src_w, 0), (src_w, src_h), (0, src_h)]
    # quad order: tl, tr, br, bl
    matrix = []
    vector = []
    for (sx, sy), (dx, dy) in zip(source, quad):
        matrix.append([dx, dy, 1, 0, 0, 0, -sx * dx, -sx * dy])
        matrix.append([0, 0, 0, dx, dy, 1, -sy * dx, -sy * dy])
        vector.extend([sx, sy])
    coeffs = np.linalg.solve(np.array(matrix, dtype=np.float64), np.array(vector, dtype=np.float64))
    warped = fabric.convert("RGBA").transform(size, Image.Transform.PERSPECTIVE, coeffs.tolist(), Image.Resampling.BICUBIC)
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).polygon([tuple(point) for point in quad], fill=255)
    warped.putalpha(mask)
    xs = [point[0] for point in quad]
    ys = [point[1] for point in quad]
    box = (int(min(xs)), int(min(ys)), int(max(xs)) + 1, int(max(ys)) + 1)
    return warped.crop(box), (box[0], box[1])


def main() -> None:
    room = json.loads((ROOT / "data/room.json").read_text())
    catalogue = json.loads((ROOT / "data/products.json").read_text())
    base = Image.open(ROOT / room["image"]).convert("RGB")
    overlays = {}
    for product in catalogue["products"]:
        print(product["id"])
        if product.get("unused"):
            continue
        image = download_image(product)
        if image is None:
            overlays[product["id"]] = None
            continue
        region = room["regions"][product["category"]]
        if product["category"] == "wall-art":
            source = fabric_source(image, product)
            layer, origin = warp_into_quad(source, region["quad"], base.size)
        else:
            mask = build_mask(base.size, region)
            source = fabric_source(image, product)
            low, high = (0.88, 1.06) if product["category"] == "rug" else (0.82, 1.08)
            layer, origin = paste_shaded(base, mask, source, region, low, high)
        rel = Path("assets/overlays") / f"{product['id']}.png"
        dest = ROOT / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        layer.save(dest, optimize=True)
        overlays[product["id"]] = {
            "file": rel.as_posix(),
            "x": origin[0],
            "y": origin[1],
            "width": layer.width,
            "height": layer.height,
        }
        print("  overlay", layer.size, "at", origin)

    # Prove pixels outside every mask stay identical once composited.
    report = []
    for product in catalogue["products"]:
        meta = overlays.get(product["id"])
        if not meta:
            continue
        region = room["regions"][product["category"]]
        mask = build_mask(base.size, region)
        if product["category"] == "wall-art":
            mask = Image.new("L", base.size, 0)
            ImageDraw.Draw(mask).polygon([tuple(point) for point in region["quad"]], fill=255)
        full = Image.new("RGBA", base.size, (0, 0, 0, 0))
        layer = Image.open(ROOT / meta["file"]).convert("RGBA")
        full.paste(layer, (meta["x"], meta["y"]), layer)
        composed = Image.alpha_composite(base.convert("RGBA"), full)
        base_px = np.array(base)
        out_px = np.array(composed.convert("RGB"))
        outside = np.array(mask) == 0
        drift = np.abs(base_px.astype(int) - out_px.astype(int)).sum(axis=2)
        changed = int((drift[outside] > 0).sum())
        report.append({"id": product["id"], "outsidePixelsChanged": changed})
        if changed:
            print("  PIXEL DRIFT", product["id"], changed)

    manifest = {
        "checkedOn": catalogue["checkedOn"],
        "base": room["image"],
        "width": base.width,
        "height": base.height,
        "overlays": overlays,
        "pixelCheck": report,
        "placement": "Product photos are placed inside a fixed mask. This is not a new photo of the room and not an AI illustration.",
    }
    (ROOT / "data/overlays.json").write_text(json.dumps(manifest, indent=2))
    # Refresh image URLs that were corrected from live BBNT pages.
    (ROOT / "data/products.json").write_text(json.dumps(catalogue, indent=2) + "\n")
    bad = [row for row in report if row["outsidePixelsChanged"]]
    print("overlays", sum(1 for value in overlays.values() if value), "drift", len(bad))


if __name__ == "__main__":
    main()
