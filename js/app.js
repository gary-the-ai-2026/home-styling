import { fixedAnchors } from "./room-reading.js";
import { derivePalette } from "./style-engine.js";
import {
  CATEGORIES,
  STORES,
  TIERS,
  TIER_LABEL,
  formatChecked,
  formatPrice,
  formatTotal,
  optionsFor,
  sumProducts,
  tierProducts,
} from "./catalogue.js";
import { applyOverlays, mountHits } from "./compositor.js";

const state = {
  rooms: null,
  room: null,
  styles: null,
  allProducts: null,
  overlayDoc: null,
  overlays: null,
  styleId: null,
  selection: {},
  options: null,
};

const stage = document.querySelector("#stage");
const hits = document.querySelector("#hits");

async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Could not load ${path}`);
  return response.json();
}

function defaultSelection(options) {
  const selection = {};
  for (const category of CATEGORIES) {
    selection[category.id] = state.room.swipe === "tier" ? "good" : options[category.id][0]?.id || null;
  }
  return selection;
}

function activeProducts(categoryId) {
  const list = state.options[categoryId] || [];
  if (state.room.swipe === "tier") {
    return list.filter((product) => product.styles[state.styleId] === state.selection[categoryId]);
  }
  const product = list.find((item) => item.id === state.selection[categoryId]);
  return product ? [product] : [];
}

function activeMap() {
  const map = {};
  for (const category of CATEGORIES) map[category.id] = activeProducts(category.id);
  return map;
}

function productsForRoom() {
  return state.allProducts.filter((product) => (product.roomId || "stock-minh-pham-lounge") === state.room.id);
}

function stylesForRoom() {
  return state.styles.filter((style) => state.room.styleIds.includes(style.id));
}

async function main() {
  const [index, stylesDoc, catalogue, overlayDoc] = await Promise.all([
    loadJson("data/rooms.json"),
    loadJson("data/styles.json"),
    loadJson("data/products.json"),
    loadJson("data/overlays.json"),
  ]);
  state.rooms = await Promise.all(index.rooms.map((item) => loadJson(item.file)));
  state.defaultRoomId = index.defaultRoomId;
  state.styles = stylesDoc.styles;
  state.allProducts = catalogue.products.filter((product) => !product.unused);
  state.checkedOn = catalogue.checkedOn;
  state.overlayDoc = overlayDoc;

  document.querySelector("#stores").innerHTML = STORES.map((store) => `<li>${escapeHtml(store)}</li>`).join("");
  document.querySelector("#placement").textContent =
    overlayDoc.placement || "Product photo, placed in the room.";
  document.querySelector("#rooms").addEventListener("click", onRoomClick);
  document.querySelector("#style").addEventListener("click", onStyleClick);
  wireHits();
  showRoom(index.defaultRoomId);
}

function showRoom(roomId) {
  state.room = state.rooms.find((room) => room.id === roomId);
  state.overlays = state.overlayDoc.rooms[roomId];
  state.styleId = state.room.recommendedStyleId;
  const base = document.querySelector("#base");
  base.src = state.room.image;
  base.width = state.room.width;
  base.height = state.room.height;
  base.alt = state.room.title;
  stage.style.aspectRatio = `${state.room.width} / ${state.room.height}`;
  mountHits(hits, state.room);
  renderRooms();
  renderCredit();
  renderStyle();
}

function renderRooms() {
  document.querySelector("#rooms").innerHTML = state.rooms
    .map(
      (room) =>
        `<button type="button" data-room="${escapeAttr(room.id)}" class="${room.id === state.room.id ? "is-on" : ""}">${escapeHtml(room.title)}</button>`
    )
    .join("");
}

function onRoomClick(event) {
  const button = event.target.closest("[data-room]");
  if (!button || button.dataset.room === state.room.id) return;
  showRoom(button.dataset.room);
}

function currentStyle() {
  return state.styles.find((style) => style.id === state.styleId);
}

function renderStyle() {
  state.options = optionsFor(productsForRoom(), state.styleId, state.room.swipe || "price");
  state.selection = defaultSelection(state.options);
  const style = currentStyle();
  const anchors = fixedAnchors(state.room);
  const palette = derivePalette(anchors, style);

  renderAnalysis(anchors, palette);
  renderStyleCard(style);
  renderCarousels();
  renderCatalogue();
  applyOverlays(stage, state.overlays, activeMap());
  markSelected();
  updateStageLabel(null);
}

function renderAnalysis(anchors, palette) {
  const style = currentStyle();
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
  const swatches = style.palette
    ? style.palette.map((swatch) => ({ role: swatch.name, hex: swatch.hex, label: swatch.hex }))
    : [palette.dominant, palette.secondary, palette.accent];
  const derived = swatches
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
    <h2 class="subhead">${style.palette ? "Palette" : "Palette for this style"}</h2>
    <ul class="swatches derived">${derived}</ul>
    <p class="fine">${
      style.palette
        ? `Walls ${anchors.walls}, sofa ${anchors.sofa}, timber ${anchors.timber}. This style uses oat, tobacco, rust, olive and chocolate.`
        : `Walls ${anchors.walls}, sofa ${anchors.sofa}, timber ${anchors.timber}. The 60/30/10 split is derived from those, plus this style’s harmony.`
    }</p>
  `;
}

function renderStyleCard(style) {
  const others = stylesForRoom().filter((item) => item.id !== style.id);
  const recommended = style.id === state.room.recommendedStyleId ? `<p class="recommend">Recommended</p>` : "";
  const alternatives = others.length
    ? `<details class="quiet">
      <summary>Not quite?</summary>
      <div class="alt-styles">
        ${others
          .map(
            (item) =>
              `<button type="button" data-style="${item.id}"><strong>${item.name}</strong><span>${item.reason}</span></button>`
          )
          .join("")}
      </div>
    </details>`
    : "";
  document.querySelector("#style").innerHTML = `
    ${recommended}
    <h2>${style.name}</h2>
    <p class="reason">${style.reason}</p>
    ${alternatives}
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
    const cards = state.options[category.id].map((product) => cardHtml(category, product)).join("");
    return `
      <section class="carousel-block" id="carousel-${category.id}">
        <header>
          <h2>${category.label}</h2>
          <p>${state.room.swipe === "tier" ? "Good, Better, Best" : "Lowest price first"}</p>
        </header>
        <div class="scroller" data-category="${category.id}" tabindex="0">${cards}</div>
      </section>`;
  }).join("");

  root.querySelectorAll(".scroller").forEach((scroller) => {
    const sync = () => {
      if (!scroller.isConnected) return;
      const box = scroller.getBoundingClientRect();
      const center = box.left + box.width / 2;
      const cards = [...scroller.querySelectorAll(".card")];
      if (!cards.length) return;
      const distance = (card) => {
        const rect = card.getBoundingClientRect();
        return Math.abs(rect.left + rect.width / 2 - center);
      };
      const card = cards.reduce((nearest, item) => (distance(item) < distance(nearest) ? item : nearest));
      const category = scroller.dataset.category;
      const next = state.room.swipe === "tier" ? card.dataset.tier : card.dataset.product;
      if (state.selection[category] === next) return;
      state.selection[category] = next;
      applyOverlays(stage, state.overlays, activeMap());
      markSelected();
      updateStageLabel(category);
    };
    scroller.addEventListener("scroll", () => {
      if (scroller._frame) cancelAnimationFrame(scroller._frame);
      scroller._frame = requestAnimationFrame(sync);
    }, { passive: true });
  });
}

function cardHtml(category, product) {
  const tier = product.styles[state.styleId];
  const placed = Boolean(state.overlays.overlays?.[product.id]);
  const photo = product.imageUnverified
    ? `<div class="photo missing"><p>Photo could not be verified, so it is not placed in the room.</p></div>`
    : `<img class="photo" src="${product.imageFile}" alt="Product photo of ${escapeAttr(product.name)}" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'photo missing',textContent:'Photo unavailable'}))">`;
  const unplaced = !placed && !product.imageUnverified
    ? `<p class="note">Not placed in the room. The product photo could not be saved.</p>`
    : "";
  const note = product.priceNote ? `<p class="note">${escapeHtml(product.priceNote)}</p>` : "";
  return `
    <article class="card" data-category="${category.id}" data-product="${escapeAttr(product.id)}" data-tier="${escapeAttr(tier)}">
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
  const checked = formatChecked(state.checkedOn);
  const blocks = TIERS.map((tier) => {
    const groups = tierProducts(state.options, state.styleId, tier);
    const priced = state.room.tierTotal === "all"
      ? groups.flatMap((group) => group.products)
      : groups.map((group) => group.products[0]).filter(Boolean);
    const total = sumProducts(priced);
    const rows = groups
      .flatMap((group) =>
        group.products.map(
          (product) => `
        <li data-category="${group.category.id}" data-product="${escapeAttr(product.id)}" data-tier="${escapeAttr(product.styles[state.styleId])}">
          <a href="${escapeAttr(product.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(product.name)}</a>
          <span>${escapeHtml(product.store)}</span>
          <strong>${formatPrice(product)}</strong>
        </li>`
        )
      )
      .join("");
    return `
      <article class="tier-total" data-tier="${tier}">
        <header>
          <h3>${TIER_LABEL[tier]}</h3>
          <p>${formatTotal(total)}</p>
        </header>
        <ul>${rows}</ul>
      </article>`;
  }).join("");

  const roomItems = CATEGORIES.flatMap((category) => activeProducts(category.id));
  const fine = state.room.tierTotal === "all"
    ? `Prices checked ${escapeHtml(checked)}, in AUD. Each total is every piece in that tier. The Good total includes a $6 INNER pad for each IKEA cover.`
    : `Prices checked ${escapeHtml(checked)}, in AUD. A tier can list more than one product. Its total is the lowest price in each category. A total that includes a from-price is labelled From. The product in the room is marked.`;
  document.querySelector("#catalogue").innerHTML = `
    <p class="kicker">Catalogue</p>
    <h2>The three ways to buy it</h2>
    <p class="fine">${fine}</p>
    <p class="room-total">In the room now <strong id="room-total">${formatTotal(sumProducts(roomItems))}</strong></p>
    <div class="tier-grid">${blocks}</div>
  `;
}

function isChosen(categoryId, productId, tier) {
  if (state.room.swipe === "tier") return state.selection[categoryId] === tier;
  return state.selection[categoryId] === productId;
}

function markSelected() {
  document.querySelectorAll(".card").forEach((card) => {
    card.classList.toggle("is-selected", isChosen(card.dataset.category, card.dataset.product, card.dataset.tier));
  });
  document.querySelectorAll("#catalogue li").forEach((row) => {
    row.classList.toggle("is-in-room", isChosen(row.dataset.category, row.dataset.product, row.dataset.tier));
  });
  const roomItems = CATEGORIES.flatMap((category) => activeProducts(category.id));
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
  const products = activeProducts(categoryId);
  label.hidden = false;
  if (!products.length) {
    label.textContent = category.label;
    return;
  }
  const tier = TIER_LABEL[products[0].styles[state.styleId]];
  const names = products.map((product) => product.name.split(",")[0]).join(" · ");
  label.textContent = `${category.label} · ${tier} · ${names}`;
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
  const list = state.options[categoryId] || [];
  if (!list.length) return;
  let card;
  if (state.room.swipe === "tier") {
    const index = Math.max(0, TIERS.indexOf(state.selection[categoryId]));
    const next = TIERS[(index + direction + TIERS.length) % TIERS.length];
    state.selection[categoryId] = next;
    card = document.querySelector(`.card[data-category="${categoryId}"][data-tier="${next}"]`);
  } else {
    const index = Math.max(0, list.findIndex((product) => product.id === state.selection[categoryId]));
    const next = list[(index + direction + list.length) % list.length];
    state.selection[categoryId] = next.id;
    card = document.querySelector(`.card[data-category="${categoryId}"][data-product="${next.id}"]`);
  }
  applyOverlays(stage, state.overlays, activeMap());
  markSelected();
  updateStageLabel(categoryId);
  const scroller = card?.parentElement;
  if (card && scroller) {
    const cardBox = card.getBoundingClientRect();
    const scrollerBox = scroller.getBoundingClientRect();
    const left = scroller.scrollLeft + (cardBox.left - scrollerBox.left) - (scrollerBox.width - cardBox.width) / 2;
    scroller.scrollTo({ left, behavior: "smooth" });
  }
}

function openCarousel(categoryId) {
  document.querySelector(`#carousel-${categoryId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  updateStageLabel(categoryId);
}

function renderCredit() {
  const credit = state.room.credit;
  const checked = `Prices checked ${escapeHtml(formatChecked(state.checkedOn))}.`;
  if (!credit.sourceUrl) {
    document.querySelector("#credit").innerHTML = `${escapeHtml(credit.note || credit.photographer)} ${checked}`;
    return;
  }
  document.querySelector("#credit").innerHTML = `
    Photo by <a href="${escapeAttr(credit.photographerUrl)}">${escapeHtml(credit.photographer)}</a>
    on <a href="${escapeAttr(credit.sourceUrl)}">Unsplash</a>.
    <a href="${escapeAttr(credit.licenseUrl)}">${escapeHtml(credit.license)}</a>.
    ${checked}
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
