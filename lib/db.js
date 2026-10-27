'use strict';
// Database layer for Vercel (PostgreSQL). Tables are created automatically on first use.
const { Pool } = require('pg');

const CONN = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL_NON_POOLING || '';
const isLocal = /@(localhost|127\.0\.0\.1)|host=\/|localhost:/.test(CONN);
const pool = CONN ? new Pool({
  connectionString: CONN,
  ssl: isLocal || /sslmode=/.test(CONN) ? undefined : { rejectUnauthorized: false },
  max: 3, idleTimeoutMillis: 10000, connectionTimeoutMillis: 10000, query_timeout: 25000, statement_timeout: 25000
}) : null;
if (pool) pool.on('error', () => {});

const NOW = "to_char(now() at time zone 'utc','YYYY-MM-DD HH24:MI:SS')";
const toPg = sql => { let i = 0; return sql.replace(/\?/g, () => '$' + (++i)); };
function need() { if (!pool) { const e = new Error('Database is not connected.'); e.code = 'NO_DB'; throw e; } return pool; }
const mk = c => ({
  all: async (sql, p) => (await c.query(toPg(sql), p || [])).rows,
  get: async (sql, p) => (await c.query(toPg(sql), p || [])).rows[0],
  run: async (sql, p) => c.query(toPg(sql), p || [])
});
const q = { all: (s, p) => mk(need()).all(s, p), get: (s, p) => mk(need()).get(s, p), run: (s, p) => mk(need()).run(s, p) };
async function tx(fn) {
  const c = await need().connect();
  try { await c.query('BEGIN'); const r = await fn(mk(c)); await c.query('COMMIT'); return r; }
  catch (e) { try { await c.query('ROLLBACK'); } catch (_) {} throw e; }
  finally { c.release(); }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price_pkr INTEGER NOT NULL,
  weight_g INTEGER NOT NULL DEFAULT 1500,
  stock INTEGER NOT NULL DEFAULT 1,
  images TEXT NOT NULL DEFAULT '[]',
  active INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (${NOW})
);
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL DEFAULT (${NOW}),
  status TEXT NOT NULL DEFAULT 'pending',
  pay_status TEXT NOT NULL DEFAULT 'unpaid',
  method TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  country TEXT NOT NULL,
  city TEXT NOT NULL,
  address TEXT NOT NULL,
  postal TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL,
  rate DOUBLE PRECISION NOT NULL,
  subtotal_pkr INTEGER NOT NULL,
  shipping_pkr INTEGER NOT NULL,
  total_pkr INTEGER NOT NULL,
  carrier TEXT NOT NULL DEFAULT '',
  tracking TEXT NOT NULL DEFAULT '',
  payment_ref TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER,
  name TEXT NOT NULL,
  price_pkr INTEGER NOT NULL,
  qty INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS pages (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  footer INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 100,
  builtin INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (${NOW})
);
CREATE TABLE IF NOT EXISTS inquiries (
  id SERIAL PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (${NOW}),
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL,
  extra TEXT NOT NULL DEFAULT '',
  is_read INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS media (
  name TEXT PRIMARY KEY,
  mime TEXT NOT NULL,
  data BYTEA NOT NULL,
  created_at TEXT NOT NULL DEFAULT (${NOW})
);
`;

const DEFAULT_SETTINGS = {
  brandName: process.env.BRAND_NAME || 'Zarkar Studio',
  currencies: { PKR: 1, USD: 0.0036, GBP: 0.0028, AED: 0.0132 },
  shipping: {
    packagingPerItem: 150,
    freeOver: { PK: 15000 },
    zones: [
      { name: 'Pakistan', countries: ['PK'], base: 350, perKg: 120 },
      { name: 'Gulf', countries: ['AE', 'SA', 'QA', 'KW', 'OM', 'BH'], base: 4200, perKg: 1400 },
      { name: 'UK and Europe', countries: ['GB', 'IE', 'DE', 'FR', 'NL', 'IT', 'ES', 'SE', 'NO', 'DK', 'BE', 'CH', 'AT'], base: 5200, perKg: 1700 },
      { name: 'North America', countries: ['US', 'CA'], base: 5800, perKg: 1900 },
      { name: 'Rest of world', countries: ['*'], base: 6500, perKg: 2200 }
    ]
  },
  payments: {
    bankDetails: 'Bank: [Bank name]\nAccount title: [Account title]\nAccount no / IBAN: [IBAN]',
    jazzcash: '[JazzCash number]',
    easypaisa: '[Easypaisa number]',
    paypalLink: ''
  },
  whatsapp: process.env.WHATSAPP_NUMBER || '923457524413',
  contact: { email: process.env.CONTACT_EMAIL || 'zarkarstore@gmail.com', phone: '', address: '', hours: '', instagram: '', facebook: '' },
  sampleData: false
};

async function getSettings() {
  const out = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  for (const row of await q.all('SELECT key, value FROM settings')) {
    try { out[row.key] = JSON.parse(row.value); } catch (_) { /* ignore bad row */ }
  }
  if (!out.contact || typeof out.contact !== 'object') out.contact = {};
  if (!out.contact.email) out.contact.email = DEFAULT_SETTINGS.contact.email; // never leave the store email blank
  return out;
}
async function setSetting(key, value) {
  await q.run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value', [key, JSON.stringify(value)]);
}

const DEFAULT_PAGES = require('./default_pages');
let readyP = null;
function ready() {
  if (!readyP) readyP = init().catch(e => { readyP = null; throw e; });
  return readyP;
}
async function init() {
  // No locks: everything below is idempotent (IF NOT EXISTS / ON CONFLICT DO NOTHING), so concurrent cold starts are safe.
  let last;
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await initOnce(); } catch (e) { last = e; await new Promise(r => setTimeout(r, 400 * (attempt + 1))); }
  }
  throw last;
}
async function initOnce() {
  const c = await need().connect();
  try {
    await c.query(SCHEMA);
    const n = (await c.query('SELECT COUNT(*)::int n FROM products')).rows[0].n;
    if (n === 0) {
      const seed = require('./catalog.json');
      const cols = 10, rows = [], vals = [];
      seed.forEach((s, i) => {
        const b = vals.length;
        rows.push('(' + Array.from({ length: cols }, (_, k) => '$' + (b + k + 1)).join(',') + ')');
        vals.push(s.slug, s.name, s.category, s.desc, s.price, s.weight, 5, JSON.stringify([s.img_w, s.img].concat(s.extra || [])), s.active, i);
      });
      if (rows.length) await c.query('INSERT INTO products(slug,name,category,description,price_pkr,weight_g,stock,images,active,sort) VALUES ' + rows.join(',') + ' ON CONFLICT (slug) DO NOTHING', vals);
    }
    const pr = [], pv = [];
    DEFAULT_PAGES.forEach(p => { const b = pv.length; pr.push(`($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},1)`); pv.push(p.slug, p.title, p.body.trim(), p.footer, p.sort); });
    if (pr.length) await c.query('INSERT INTO pages(slug,title,body,footer,sort,builtin) VALUES ' + pr.join(',') + ' ON CONFLICT (slug) DO NOTHING', pv);
  } finally {
    c.release();
  }
}

module.exports = { q, tx, NOW, getSettings, setSetting, ready, DEFAULT_PAGES, hasDb: !!pool };
