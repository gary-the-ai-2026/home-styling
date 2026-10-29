/** Product catalogue helpers. Tiers stay Good / Better / Best, chosen by fit and price. */

export const STORES = ["Kmart", "Bed Bath N' Table", "Adairs", "Temple & Webster", "IKEA"];

export const TIERS = ["good", "better", "best"];

export const TIER_LABEL = {
  good: "Good",
  better: "Better",
  best: "Best",
};

export const CATEGORIES = [
  { id: "cushions", label: "Cushions" },
  { id: "rug", label: "Rug" },
  { id: "throw", label: "Throw" },
  { id: "wall-art", label: "Wall art" },
];

const SLOT_ORDER = { "left-back": 0, "left-front": 1, chaise: 2 };

export function optionsFor(products, styleId, mode = "price") {
  const options = {};
  for (const category of CATEGORIES) {
    options[category.id] = products
      .filter((product) => product.category === category.id && product.styles?.[styleId])
      .sort((a, b) => compareProducts(a, b, styleId, mode));
  }
  return options;
}

function compareProducts(a, b, styleId, mode) {
  if (mode === "tier") {
    const tier = TIERS.indexOf(a.styles[styleId]) - TIERS.indexOf(b.styles[styleId]);
    if (tier) return tier;
    const slot = (SLOT_ORDER[a.slot] ?? 0) - (SLOT_ORDER[b.slot] ?? 0);
    if (slot) return slot;
  }
  return Number(a.priceAud) - Number(b.priceAud) || a.name.localeCompare(b.name);
}

export function tierProducts(options, styleId, tier) {
  return CATEGORIES.map((category) => ({
    category,
    products: options[category.id].filter((product) => product.styles[styleId] === tier),
  }));
}

export function formatChecked(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || "";
  const [year, month, day] = iso.split("-").map(Number);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${day} ${months[month - 1]} ${year}`;
}

export function formatPrice(product) {
  if (!product) return "";
  const amount = Number(product.priceAud);
  const body = Number.isInteger(amount) ? `$${amount}` : `$${amount.toFixed(2)}`;
  return product.priceIsFrom ? `From ${body}` : body;
}

export function sumProducts(products) {
  const items = products.filter(Boolean);
  const sum = Math.round(items.reduce((total, product) => total + Number(product.priceAud) + Number(product.innerPadAud || 0), 0) * 100) / 100;
  const from = items.some((product) => product.priceIsFrom);
  return { sum, from, items };
}

export function formatTotal({ sum, from }) {
  const body = Number.isInteger(sum) ? `$${sum}` : `$${sum.toFixed(2)}`;
  return from ? `From ${body}` : body;
}
