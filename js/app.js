import { fixedAnchors } from "./room-reading.js";
import { derivePalette } from "./style-engine.js";
import {
  CATEGORIES,
  TIERS,
  TIER_LABEL,
  formatPrice,
  formatTotal,
  picksFor,
  sumProducts,
} from "./catalogue.js";
import { applyOverlays, mountHits } from "./compositor.js";

const state = {
  room: null,
  styles: null,
  products: null,
  overlays: null,
  styleId: null,
  selection: defaultSelection(),
  picks: null,
};

const stage = document.querySelector("#stage");
const hits = document.querySelector("#hits");

async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Could not load ${path}`);
  return response.json();
}

function defaultSelection() {
  return { cushions: "good", rug: "good", throw: "good", "wall-art": "good" };
}

async function main() {
  const [room, stylesDoc, catalogue, overlays] = await Promise.all([
    loadJson("data/room.json"),
    loadJson("data/styles.json"),
    loadJson("data/products.json"),
    loadJson("data/overlays.json"),
  ]);
  state.room = room;
  state.styles = stylesDoc.styles;
  state.recommendedId = stylesDoc.recommendedId;
  state.products = catalogue.products.filter((product) => !product.unused);
  state.checkedOn = catalogue.checkedOn;
  state.overlays = overlays;
  state.styleId = stylesDoc.recommendedId;

  document.querySelector("#base").src = room.image;
  document.querySelector("#base").alt = `${room.title}. Stock photo, regions can be swapped later.`;
  document.querySelector("#placement").textContent =
    overlays.placement || "Product photo, placed in the room.";
  mountHits(hits, room);
  wireHits();
  document.querySelector("#style").addEventListener("click", onStyleClick);
  renderCredit();
  renderStyle();
}

function currentStyle() {
  return state.styles.find((style) => style.id === state.styleId);
}

function renderStyle() {
  state.selection = defaultSelection();
  state.picks = picksFor(state.products, state.styleId);
  const style = currentStyle();
  const anchors = fixedAnchors(state.room);
  const palette = derivePalette(anchors, style);

  renderAnalysis(anchors, palette);
  renderStyleCard(style);
  renderCarousels();
  renderCatalogue();
  applyOverlays(stage, state.overlays, state.picks, state.selection);
  markSelected();
  updateStageLabel(null);
}

function renderAnalysis(anchors, palette) {
  const fixed = state.room.fixed
    .map(
      (item) => `
      <li>
        <span class="swatch" style="background:${item.hex}"></span>
        <span>
          <strong>${item.label}</strong>
          <em>${item.note}</em>
        </span>
      </li>`
    )
    .join("");
  const derived = [palette.dominant, palette.secondary, palette.accent]
    .map(
      (swatch) => `
      <li>
        <span class="swatch large" style="background:${swatch.hex}"></span>
        <span>
          <strong>${swatch.role}</strong>
          <em>${swatch.label}</em>
        </span>
      </li>`
    )
    .join("");
  document.querySelector("#analysis").innerHTML = `
    <p class="kicker">Room</p>
    <h2>What stays</h2>
    <ul class="swatches">${fixed}</ul>
    <h2 class="subhead">Palette for this style</h2>
    <ul class="swatches derived">${derived}</ul>
    <p class="fine">Walls ${anchors.walls}, sofa ${anchors.sofa}, timber ${anchors.timber}. The 60/30/10 split is derived from those, plus this style’s harmony.</p>
  `;
}

function renderStyleCard(style) {
  const others = state.styles.filter((item) => item.id !== style.id);
  const recommended = style.id === state.recommendedId ? `<p class="recommend">Recommended</p>` : "";
  document.querySelector("#style").innerHTML = `
    ${recommended}
    <h2>${style.name}</h2>
    <p class="reason">${style.reason}</p>
    <details class="quiet">
      <summary>Not quite?</summary>
      <div class="alt-styles">
        ${others
          .map(
            (item) =>
              `<button type="button" data-style="${item.id}"><strong>${item.name}</strong><span>${item.reason}</span></button>`
          )
          .join("")}
      </div>
    </details>
  `;
}

function onStyleClick(event) {
  const button = event.target.closest("[data-style]");
  if (!button) return;
  state.styleId = button.dataset.style;
  renderStyle();
}

function renderCarousels() {
  const root = document.querySelector("#carousels");
  root.innerHTML = CATEGORIES.map((category) => {
    const cards = TIERS.map((tier) => cardHtml(category, tier)).join("");
    return `
      <section class="carousel-block" id="carousel-${category.id}">
        <header>
          <h2>${category.label}</h2>
          <p>Good, Better, Best</p>
        </header>
        <div class="scroller" data-category="${category.id}" tabindex="0">${cards}</div>
      </section>`;
  }).join("");

  root.querySelectorAll(".scroller").forEach((scroller) => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.72)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) return;
        const category = scroller.dataset.category;
        const tier = visible.target.dataset.tier;
        if (state.selection[category] === tier) return;
        state.selection[category] = tier;
        applyOverlays(stage, state.overlays, state.picks, state.selection);
        markSelected();
        updateStageLabel(category);
      },
      { root: scroller, threshold: [0.72, 0.9] }
    );
    scroller.querySelectorAll(".card").forEach((card) => observer.observe(card));
  });
}

function cardHtml(category, tier) {
  const product = state.picks[category.id][tier];
  if (!product) {
    return `<article class="card" data-category="${category.id}" data-tier="${tier}"><p>No product for this tier.</p></article>`;
  }
  const placed = Boolean(state.overlays.overlays?.[product.id]);
  const photo = product.imageUnverified
    ? `<div class="photo missing"><p>Photo could not be verified, so it is not placed in the room.</p></div>`
    : `<img class="photo" src="${product.imageFile}" alt="Product photo of ${escapeAttr(product.name)}" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'photo missing',textContent:'Photo unavailable'}))">`;
  const unplaced = !placed && !product.imageUnverified
    ? `<p class="note">Not placed in the room. The product photo could not be saved.</p>`
    : "";
  const note = product.priceNote ? `<p class="note">${escapeHtml(product.priceNote)}</p>` : "";
  return `
    <article class="card" data-category="${category.id}" data-tier="${tier}">
      <p class="tier">${TIER_LABEL[tier]}</p>
      ${photo}
      <h3>${escapeHtml(product.name)}</h3>
      <p class="meta"><span>${escapeHtml(product.store)}</span><strong>${formatPrice(product)}</strong></p>
      ${note}
      ${unplaced}
      <a class="buy" href="${escapeAttr(product.url)}" target="_blank" rel="noopener noreferrer">View at ${escapeHtml(product.store)}</a>
    </article>`;
}

function renderCatalogue() {
  const blocks = TIERS.map((tier) => {
    const items = CATEGORIES.map((category) => state.picks[category.id][tier]);
    const total = sumProducts(items);
    const rows = CATEGORIES.map((category, index) => {
      const product = items[index];
      if (!product) return "";
      return `
        <li data-category="${category.id}" data-tier="${tier}">
          <a href="${escapeAttr(product.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(product.name)}</a>
          <span>${escapeHtml(product.store)}</span>
          <strong>${formatPrice(product)}</strong>
        </li>`;
    }).join("");
    return `
      <article class="tier-total" data-tier="${tier}">
        <header>
          <h3>${TIER_LABEL[tier]}</h3>
          <p>${formatTotal(total)}</p>
        </header>
        <ul>${rows}</ul>
      </article>`;
  }).join("");

  const roomItems = CATEGORIES.map((category) => state.picks[category.id][state.selection[category.id]]);
  document.querySelector("#catalogue").innerHTML = `
    <p class="kicker">Catalogue</p>
    <h2>The three ways to buy it</h2>
    <p class="fine">Prices checked ${escapeHtml(state.checkedOn)}, in AUD. A total that includes a from-price is labelled From. The row in the room right now is marked.</p>
    <p class="room-total">In the room now <strong id="room-total">${formatTotal(sumProducts(roomItems))}</strong></p>
    <div class="tier-grid">${blocks}</div>
  `;
}

function markSelected() {
  document.querySelectorAll(".card").forEach((card) => {
    const on = state.selection[card.dataset.category] === card.dataset.tier;
    card.classList.toggle("is-selected", on);
  });
  document.querySelectorAll("#catalogue li").forEach((row) => {
    const on = state.selection[row.dataset.category] === row.dataset.tier;
    row.classList.toggle("is-in-room", on);
  });
  const roomItems = CATEGORIES.map((category) => state.picks[category.id][state.selection[category.id]]);
  const total = document.querySelector("#room-total");
  if (total) total.textContent = formatTotal(sumProducts(roomItems));
}

function updateStageLabel(categoryId) {
  const label = document.querySelector("#stage-label");
  if (!categoryId) {
    label.hidden = true;
    return;
  }
  const category = CATEGORIES.find((item) => item.id === categoryId);
  const product = state.picks[categoryId][state.selection[categoryId]];
  label.hidden = false;
  label.textContent = product
    ? `${category.label} · ${TIER_LABEL[state.selection[categoryId]]} · ${product.name}`
    : category.label;
}

function wireHits() {
  let gesture = null;
  hits.addEventListener("pointerdown", (event) => {
    const region = event.target.closest("[data-category]");
    if (!region) return;
    gesture = {
      id: region.dataset.category,
      x: event.clientX,
      y: event.clientY,
    };
  });
  hits.addEventListener("pointerup", (event) => {
    if (!gesture) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    const id = gesture.id;
    gesture = null;
    if (Math.abs(dx) > 36 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      cycle(id, dx < 0 ? 1 : -1);
      return;
    }
    if (Math.abs(dx) < 14 && Math.abs(dy) < 14) openCarousel(id);
  });
  hits.addEventListener("pointercancel", () => {
    gesture = null;
  });
  hits.addEventListener("keydown", (event) => {
    const region = event.target.closest("[data-category]");
    if (!region) return;
    const id = region.dataset.category;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openCarousel(id);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      cycle(id, 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      cycle(id, -1);
    }
  });
}

function cycle(categoryId, direction) {
  const index = TIERS.indexOf(state.selection[categoryId]);
  const next = TIERS[(index + direction + TIERS.length) % TIERS.length];
  state.selection[categoryId] = next;
  applyOverlays(stage, state.overlays, state.picks, state.selection);
  markSelected();
  updateStageLabel(categoryId);
  const card = document.querySelector(`.card[data-category="${categoryId}"][data-tier="${next}"]`);
  const scroller = card?.parentElement;
  if (card && scroller) {
    const left = card.offsetLeft - (scroller.clientWidth - card.offsetWidth) / 2;
    scroller.scrollTo({ left, behavior: "smooth" });
  }
}

function openCarousel(categoryId) {
  document.querySelector(`#carousel-${categoryId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  updateStageLabel(categoryId);
}

function renderCredit() {
  const credit = state.room.credit;
  document.querySelector("#credit").innerHTML = `
    Photo by <a href="${escapeAttr(credit.photographerUrl)}">${escapeHtml(credit.photographer)}</a>
    on <a href="${escapeAttr(credit.sourceUrl)}">Unsplash</a>.
    <a href="${escapeAttr(credit.licenseUrl)}">${escapeHtml(credit.license)}</a>.
    Prices checked ${escapeHtml(state.checkedOn)}.
  `;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("'", "&#39;");
}

main().catch((error) => {
  document.querySelector("main").innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`;
});
