# Home styling

A mobile-first prototype for Josh and Amy. It opens on Josh's lounge, in Warm earthy modern, and offers Good, Better and Best products from Kmart, Bed Bath N' Table, Adairs, Temple & Webster, and IKEA. A sample lounge stays available as the second room.

Version one is a static site. The room reading, the palette and the product research are precomputed for the stock photo. The modules are separate so a later upload-and-search step can replace the data without rewriting the page.

## Run it

No build step. From this folder:

```bash
python3 -m http.server 8765
```

Open `http://127.0.0.1:8765` on a phone-width window. Tap a cushion, the rug, the throw or the right-hand picture, then swipe sideways on that region. Each item changes on its own.

## Layering

The room photo is never regenerated. Four items sit on independent layers over one fixed base:

1. `assets/room/base.jpg` is the only photograph of the room.
2. `data/room.json` stores a pixel polygon (and, for the rug, holes) for cushions, rug, throw and wall art. Wall art uses the inside of the right-hand frame. The left frame stays in the base.
3. `scripts/build_overlays.py` downloads each verified product photo and builds one transparent PNG per product, clipped to that product’s mask, at the base image’s pixel size, then cropped with an x/y offset. Rugs, throws and cushions are the product cloth, shaded with the luminance already in that region so folds remain. Wall art is the product image perspective-mapped into the frame, with no luminance from the old print. Nothing outside the mask is written.
4. The page composites those PNGs in `js/compositor.js`. Order is rug, throw, cushions, wall art. Positions are percentages of the base, so the stack scales. A pixel whose mask is 0 is the original photo.

Swiping the rug cycles rug options only. The cushion, throw and art layers stay where they are. Tapping a region scrolls to that carousel. The carousels use scroll-snap and stay in sync with the layers.

Josh's lounge uses the same layering on `assets/room/josh.jpg` (1600 x 1200). Cushions in a tier are one set: three covers or cushions, placed on the left sofa back and the chaise lumbar. The rug mask keeps the walnut coffee table, including the slats, and lets the new rug show through the gaps. Wall art sits on the bare wall left of the dining window. Swipe order there is Good, then Better, then Best. The tier total adds every product in that tier. Good includes three $6 IKEA INNER pads.

These overlays are the real product photo, placed in the mask. The caption on the page says so. They are not a new photo of this room and they are not an AI illustration. If a product photo could not be verified, that layer is left off and the card says so.

### Swapping in Josh’s photo

1. Replace `assets/room/base.jpg`. Note the new width and height.
2. Update `image`, `width`, `height` and `credit` in `data/room.json`.
3. Redraw `regions` in that file. Coordinates are pixels on the new base. Keep holes around anything that must not change (tables, a plant, a frame edge).
4. Resample the fixed colours (`fixed` in `data/room.json`) or, later, call `sampleRegions()` from `js/room-reading.js`.
5. Run `python3 scripts/build_overlays.py`. It rewrites `assets/overlays/`, `data/overlays.json`, and any Bed Bath N' Table image URLs it refreshes from the live page.
6. The script prints a pixel check. `outsidePixelsChanged` must be 0 for every overlay. If it is not, the mask is leaking and the base is no longer identical outside that item.

The same regions drive the tap targets. Wall art can have a larger `hit` rectangle than the `quad` the artwork is warped into, so the frame stays tappable while the wood stays in the base photo.

## Colour

`data/color-rules.json` is the written rule. `js/style-engine.js` is the function a later version should call.

- Anchors are the things that do not move: walls, sofa, timber, light. They are sampled from the photo and never recolored.
- The palette is a 60/30/10 split. 60 starts from the wall. 30 mixes the sofa with the timber. 10 is one accent.
- Harmony is analogous, complementary or monochrome. Each style in `data/styles.json` names one, plus an undertone and a `hueShift` added to the timber hue.
- Warm oak against cool walls is bridged. A warm style mixes a little timber into the wall colour. A cool accent is greyed. That is what keeps icy blue and saturated orange out.
- Textures should vary across the four categories. Each style lists the families it prefers.

Switching style runs `derivePalette()` again and swaps the product set. The photo’s fixed colours do not change.

## Products

`data/products.json` is the catalogue. Each record has a name, store, price in AUD, product URL, image URL, the local image file, and which style and tier it belongs to. `checkedOn` is the date the page was read.

Tiers are Good, Better and Best. A tier can hold more than one product. They are chosen by fit and price across all five stores, not by assigning one store to one tier. In the room, the options for a category are ordered by price.

A `priceIsFrom` price is the structured-data offer, which matches the low end of a size range. Totals that include one are labelled From. Where a page shows more than one figure (an RRP and a Linen Lovers price, for example), the total uses the first figure and the card’s note records the others.

## What a live version needs

This prototype can be sold as a static demo. A live version, where someone uploads their own room, needs two services this repo does not call:

- An image model or a vision API, to find the same four anchors and the four item regions on a new photo. The regions still have to become masks. The room image itself should still be the uploaded photo, with overlays composited on top, rather than a freshly generated scene.
- Free scripts read public sitemaps, structured data and the stores' own image servers, for Kmart, Bed Bath N' Table, Adairs, Temple & Webster and IKEA. Several of those sites block automated requests. Prices in this repo were checked by hand on 29 Oct 2026 and will go stale.

## Verification limits

Checked 29 Oct 2026.

- Bed Bath N' Table pages returned HTTP 200. Price and image come from JSON-LD on the page. `build_overlays.py` asks the live page again before saving a BBNT image.
- Temple & Webster pages were readable, including JSON-LD, but a direct HTTP request from this environment returned 403. Images were downloaded from `img.zcdn.com.au`.
- Adairs pages were readable, but `adairs.com.au` returned 403. Product images were fetched through `images.weserv.nl` because the Adairs host blocked this environment.
- Kmart product pages returned 403 or 429 from this environment. The image host `assets.kmart.com.au` returned HTTP 200, and the live catalogue search (`ac.cnstrc.com`, the key the Kmart site uses) returned the name, price and image URL. Olive and bloom uses the Indi jute rug ($85, 235 x 160cm) and the Flecked sage round rug ($69, 180cm). Calm Scandi’s Good cushion is the 50cm woven check cover in beige ($7). An earlier round jute at $42 (SKU 42375609) and an earlier check cover (SKU 43475735) no longer appear in that search.
- Guessed Kmart image URLs were not used. A guessed URL returned a fallback file rather than the product. The image ids here come from the catalogue search, and each file was opened and checked.
- IKEA Australia pages returned HTTP 200. Each main image is the page `og:image` on `ikea.com`. IKEA cushion prices are the cover only. BILD posters are unframed and are shown inside the frame already in the room. Two BLODFLÄDER pictures are sold as a 2 pack.

## Deploy

The site is static: `index.html`, `css/`, `js/`, `data/`, `assets/`. This repository is public. GitHub Pages serves it at https://gary-the-ai-2026.github.io/home-styling/.
