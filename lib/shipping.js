'use strict';
// Shipping quote. All amounts are PKR integers. Rates come from settings (editable in Admin).
// The numbers shipped by default are SAMPLES: replace them with your courier's real rate card.

function findZone(shipping, country) {
  const c = String(country || '').toUpperCase();
  const zones = shipping.zones || [];
  return zones.find(z => z.countries.includes(c)) || zones.find(z => z.countries.includes('*')) || null;
}

// items: [{ weight_g, qty, price_pkr }]
function quote(shipping, country, items) {
  const zone = findZone(shipping, country);
  if (!zone) return { ok: false, error: 'We do not ship to this country yet.' };
  const subtotal = items.reduce((s, i) => s + i.price_pkr * i.qty, 0);
  const pieces = items.reduce((s, i) => s + i.qty, 0);
  const grams = items.reduce((s, i) => s + i.weight_g * i.qty, 0);
  // +25% for protective packing, billed in 0.5 kg steps
  const kg = Math.max(0.5, Math.ceil((grams * 1.25) / 500) * 0.5);
  let cost = zone.base + Math.max(0, kg - 1) * zone.perKg + (shipping.packagingPerItem || 0) * pieces;
  cost = Math.round(cost / 10) * 10;
  const freeOver = (shipping.freeOver || {})[String(country).toUpperCase()];
  const free = typeof freeOver === 'number' && subtotal >= freeOver;
  return { ok: true, zone: zone.name, subtotal, shipping: free ? 0 : cost, free, billableKg: kg, total: subtotal + (free ? 0 : cost) };
}

module.exports = { quote, findZone };
