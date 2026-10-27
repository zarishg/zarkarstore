'use strict';
// Zarkar Studio store API for Vercel (one Express app, PostgreSQL database).
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const { q, tx, NOW, getSettings, setSetting, ready, DEFAULT_PAGES, hasDb } = require('../lib/db');
const { quote } = require('../lib/shipping');
const COUNTRIES = require('../lib/countries');

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const ON_VERCEL = !!process.env.VERCEL;
const PASSWORD_OK = !!ADMIN_PASSWORD && (ADMIN_PASSWORD !== 'change-me' || !ON_VERCEL);
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const BASE_URL = (process.env.BASE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL : 'http://localhost:3000')).replace(/\/$/, '');
const SECRET = process.env.SESSION_SECRET || crypto.createHash('sha256').update('zarkar|' + ADMIN_PASSWORD).digest('hex');
const STATUSES = ['pending', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled'];

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);
const h = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/* ---------- database must be ready (tables created, first-run data added) ---------- */
app.use(async (req, res, next) => {
  if (!hasDb) return res.status(503).json({ error: 'The store database is not connected yet. In Vercel, open your project, go to Storage, add a Postgres database, then redeploy.' });
  try { await ready(); next(); }
  catch (e) { console.error('[db]', e.message); res.status(503).json({ error: 'The store database is not reachable right now. Please try again in a minute.' }); }
});

/* ---------- Stripe webhook needs the raw body, so it is registered before express.json ---------- */
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), h(async (req, res) => {
  if (!STRIPE_KEY || !STRIPE_WEBHOOK_SECRET) return res.status(404).end();
  let event;
  try {
    const Stripe = require('stripe');
    event = new Stripe(STRIPE_KEY).webhooks.constructEvent(req.body, req.headers['stripe-signature'], STRIPE_WEBHOOK_SECRET);
  } catch (e) { return res.status(400).send('Bad signature'); }
  if (event.type === 'checkout.session.completed') {
    const s = event.data.object;
    const code = s.metadata && s.metadata.order_code;
    if (code) await q.run("UPDATE orders SET pay_status='paid', status=CASE WHEN status='pending' THEN 'confirmed' ELSE status END, payment_ref=? WHERE code=?", [s.payment_intent || s.id, code]);
  }
  res.json({ received: true });
}));

app.use(express.json({ limit: '200kb' }));

/* ---------- helpers ---------- */
const clean = (v, max = 200) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
const productOut = p => ({ id: p.id, slug: p.slug, name: p.name, category: p.category, description: p.description, price_pkr: p.price_pkr, weight_g: p.weight_g, stock: p.stock, images: JSON.parse(p.images || '[]'), active: !!p.active });
function slugify(s) { return clean(s, 80).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item'; }
async function uniqueSlug(name, ignoreId) {
  const base = slugify(name); let slug = base, n = 2;
  while (await q.get('SELECT id FROM products WHERE slug=? AND id<>?', [slug, ignoreId || 0])) slug = `${base}-${n++}`;
  return slug;
}
function orderCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = ''; for (const b of crypto.randomBytes(6)) s += A[b % A.length];
  return 'ORD-' + s;
}
function paymentMethodsFor(country, settings) {
  const pk = String(country).toUpperCase() === 'PK';
  const m = [];
  if (pk) m.push({ id: 'cod', label: 'Cash on delivery', note: 'Pay the courier when your order arrives.' });
  if (STRIPE_KEY) m.push({ id: 'card', label: 'Card (Visa, Mastercard)', note: 'Secure payment page by Stripe.' });
  if (settings.payments.paypalLink) m.push({ id: 'paypal', label: 'PayPal', note: 'You will get a PayPal link after placing the order.' });
  if (pk) {
    m.push({ id: 'jazzcash', label: 'JazzCash', note: 'Send the amount, then share the transaction ID with us.' });
    m.push({ id: 'easypaisa', label: 'Easypaisa', note: 'Send the amount, then share the transaction ID with us.' });
  }
  m.push({ id: 'bank', label: 'Bank transfer', note: 'Transfer to our account, then share the receipt.' });
  return m;
}
async function loadCartItems(db, rawItems) {
  if (!Array.isArray(rawItems) || !rawItems.length || rawItems.length > 30) throw new Error('Your bag is empty.');
  const out = [];
  for (const r of rawItems) {
    const id = Number(r && r.id), qty = Math.floor(Number(r && r.qty));
    if (!Number.isInteger(id) || !(qty >= 1 && qty <= 20)) throw new Error('Invalid item in your bag.');
    const p = await db.get('SELECT * FROM products WHERE id=? AND active=1', [id]);
    if (!p) throw new Error('One of the items is no longer available.');
    if (!(p.price_pkr > 0)) throw new Error(`"${p.name}" is not available to order yet.`);
    if (p.stock < qty) throw new Error(`Only ${p.stock} left of "${p.name}".`);
    out.push({ ...p, qty });
  }
  return out;
}

/* ---------- public API ---------- */
app.get('/api/config', h(async (req, res) => {
  const s = await getSettings();
  res.json({
    brandName: s.brandName, currencies: s.currencies, countries: COUNTRIES, whatsapp: s.whatsapp,
    freeOver: s.shipping.freeOver, cardEnabled: !!STRIPE_KEY, sampleData: s.sampleData, contact: s.contact || {}
  });
}));

/* ---------- content pages (public read) and inquiry forms ---------- */
app.get('/api/pages', h(async (req, res) => {
  res.json(await q.all('SELECT slug, title, footer FROM pages ORDER BY sort, title'));
}));
app.get('/api/pages/:slug', h(async (req, res) => {
  const p = await q.get('SELECT slug, title, body FROM pages WHERE slug=?', [String(req.params.slug)]);
  if (!p) return res.status(404).json({ error: 'Page not found' });
  res.json(p);
}));
const inqHits = new Map();
app.post('/api/inquiry', h(async (req, res) => {
  try {
    const now = Date.now(), ip = req.ip;
    const hits = (inqHits.get(ip) || []).filter(t => now - t < 3600 * 1000);
    if (hits.length >= 6) return res.status(429).json({ error: 'Too many messages. Please try again later or message us on WhatsApp.' });
    const b = req.body || {};
    if (clean(b.website, 50)) return res.json({ ok: true }); // honeypot field: real people leave it empty
    const type = ['contact', 'wholesale', 'custom'].includes(b.type) ? b.type : 'contact';
    const name = clean(b.name, 80), email = clean(b.email, 120), phone = clean(b.phone, 30), message = String(b.message || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ').trim().slice(0, 3000);
    if (!name) throw new Error('Please enter your name.');
    if (!email && !phone) throw new Error('Please enter an email or a phone number so we can reply.');
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('That email address does not look right.');
    if (message.length < 5) throw new Error('Please write a short message.');
    const extra = clean(b.extra, 300);
    await q.run('INSERT INTO inquiries(type,name,email,phone,message,extra) VALUES(?,?,?,?,?,?)', [type, name, email, phone, message, extra]);
    hits.push(now); inqHits.set(ip, hits);
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
}));
app.get('/api/products', h(async (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=30, stale-while-revalidate=120');
  res.json((await q.all('SELECT * FROM products WHERE active=1 ORDER BY sort, id')).map(productOut));
}));
app.get('/api/products/:slug', h(async (req, res) => {
  const p = await q.get('SELECT * FROM products WHERE slug=? AND active=1', [req.params.slug]);
  if (!p) return res.status(404).json({ error: 'Not found' });
  res.json(productOut(p));
}));
app.post('/api/quote', h(async (req, res) => {
  try {
    const items = await loadCartItems(q, req.body.items);
    const s = await getSettings();
    const qt = quote(s.shipping, clean(req.body.country, 2), items);
    if (!qt.ok) return res.status(400).json(qt);
    res.json({ ...qt, methods: paymentMethodsFor(req.body.country, s) });
  } catch (e) { res.status(400).json({ ok: false, error: e.message }); }
}));

app.post('/api/orders', h(async (req, res) => {
  try {
    const b = req.body || {};
    const c = b.customer || {};
    const name = clean(c.name, 100), email = clean(c.email, 120).toLowerCase(), phone = clean(c.phone, 30);
    const country = clean(c.country, 2).toUpperCase(), city = clean(c.city, 80), address = clean(c.address, 300);
    const postal = clean(c.postal, 20), notes = clean(c.notes, 500);
    if (!name || !city || !address) throw new Error('Please fill in your name, city and address.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Please enter a valid email address.');
    if (phone.replace(/\D/g, '').length < 7) throw new Error('Please enter a valid phone number.');
    if (!COUNTRIES.some(x => x[0] === country)) throw new Error('Please choose a country.');
    const s = await getSettings();
    const method = clean(b.method, 20);
    if (!paymentMethodsFor(country, s).some(m => m.id === method)) throw new Error('This payment method is not available for your country.');
    const currency = Object.prototype.hasOwnProperty.call(s.currencies, b.currency) ? b.currency : 'PKR';
    const rate = s.currencies[currency];

    const code = orderCode();
    const qt = await tx(async db => {
      const items = await loadCartItems(db, b.items);
      const qq = quote(s.shipping, country, items);
      if (!qq.ok) throw new Error(qq.error);
      const ins = await db.get(`INSERT INTO orders(code,method,name,email,phone,country,city,address,postal,notes,currency,rate,subtotal_pkr,shipping_pkr,total_pkr)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`, [code, method, name, email, phone, country, city, address, postal, notes, currency, rate, qq.subtotal, qq.shipping, qq.total]);
      for (const i of items) {
        await db.run('INSERT INTO order_items(order_id,product_id,name,price_pkr,qty) VALUES(?,?,?,?,?)', [ins.id, i.id, i.name, i.price_pkr, i.qty]);
        const r = await db.run('UPDATE products SET stock=stock-? WHERE id=? AND stock>=?', [i.qty, i.id, i.qty]);
        if (!r.rowCount) throw new Error(`"${i.name}" just sold out.`);
      }
      return qq;
    });

    const out = { code, total_pkr: qt.total, currency, method };
    if (method === 'card') {
      const Stripe = require('stripe');
      const stripe = new Stripe(STRIPE_KEY);
      const session = await stripe.checkout.sessions.create({
        mode: 'payment', customer_email: email,
        line_items: [{ quantity: 1, price_data: { currency: currency.toLowerCase(), unit_amount: Math.max(1, Math.round(qt.total * rate * 100)), product_data: { name: `Order ${code}` } } }],
        metadata: { order_code: code },
        success_url: `${BASE_URL}/#/order/${code}`, cancel_url: `${BASE_URL}/#/checkout`
      });
      out.redirect = session.url;
    } else if (method === 'bank') out.instructions = s.payments.bankDetails;
    else if (method === 'jazzcash') out.instructions = `Send ${qt.total} PKR to JazzCash ${s.payments.jazzcash} and share the transaction ID with us, quoting ${code}.`;
    else if (method === 'easypaisa') out.instructions = `Send ${qt.total} PKR to Easypaisa ${s.payments.easypaisa} and share the transaction ID with us, quoting ${code}.`;
    else if (method === 'paypal') out.instructions = `Pay with PayPal: ${s.payments.paypalLink} (quote ${code}).`;
    else if (method === 'cod') out.instructions = 'Please keep the exact amount ready for the courier.';
    console.log(`[order] ${code} ${method} ${country} total ${qt.total} PKR`);
    res.status(201).json(out);
  } catch (e) { res.status(400).json({ error: e.message }); }
}));

async function publicOrder(o) {
  const items = await q.all('SELECT name, price_pkr, qty FROM order_items WHERE order_id=?', [o.id]);
  return { code: o.code, created_at: o.created_at, status: o.status, pay_status: o.pay_status, method: o.method, country: o.country, city: o.city,
    currency: o.currency, rate: o.rate, subtotal_pkr: o.subtotal_pkr, shipping_pkr: o.shipping_pkr, total_pkr: o.total_pkr, carrier: o.carrier, tracking: o.tracking, items };
}
app.get('/api/track', h(async (req, res) => {
  const code = clean(req.query.code, 20).toUpperCase(), contact = clean(req.query.contact, 120).toLowerCase();
  const o = await q.get('SELECT * FROM orders WHERE code=?', [code]);
  const digits = contact.replace(/\D/g, '');
  const ok = o && contact && (o.email === contact || (digits.length >= 6 && o.phone.replace(/\D/g, '').endsWith(digits.slice(-6))));
  if (!ok) return res.status(404).json({ error: 'We could not find that order. Check the code and your email or phone.' });
  res.json(await publicOrder(o));
}));

/* ---------- uploaded product photos (kept in the database, because Vercel has no permanent disk) ---------- */
app.get('/uploads/:name', h(async (req, res) => {
  const m = await q.get('SELECT mime, data FROM media WHERE name=?', [String(req.params.name)]);
  if (!m) return res.status(404).end();
  res.setHeader('Content-Type', m.mime);
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(m.data);
}));

/* ---------- admin ---------- */
const attempts = new Map();
const hash = s => crypto.createHash('sha256').update(String(s)).digest();
const sig = p => crypto.createHmac('sha256', SECRET).update(p).digest('hex');
function makeToken() { const p = (Date.now() + 12 * 3600 * 1000) + '.' + crypto.randomBytes(8).toString('hex'); return p + '.' + sig(p); }
function validToken(t) {
  const parts = String(t || '').split('.');
  if (parts.length !== 3) return false;
  const p = parts[0] + '.' + parts[1], want = Buffer.from(sig(p)), got = Buffer.from(parts[2]);
  return want.length === got.length && crypto.timingSafeEqual(want, got) && Number(parts[0]) > Date.now();
}
function cookies(req) {
  const o = {}; (req.headers.cookie || '').split(';').forEach(p => { const i = p.indexOf('='); if (i > 0) o[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); });
  return o;
}
const isAdmin = req => PASSWORD_OK && validToken(cookies(req).adm);
const isHttps = req => req.secure || String(req.headers['x-forwarded-proto'] || '').split(',')[0] === 'https';
function requireAdmin(req, res, next) { if (isAdmin(req)) return next(); res.status(401).json({ error: 'Please sign in.' }); }
app.use('/api/admin', (req, res, next) => { res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Robots-Tag', 'noindex, nofollow'); next(); });

app.post('/api/admin/login', h(async (req, res) => {
  if (!PASSWORD_OK) return res.status(503).json({ error: 'Admin is switched off until you set ADMIN_PASSWORD in Vercel (Settings, Environment Variables) and redeploy.' });
  const ip = req.ip, now = Date.now();
  const a = (attempts.get(ip) || []).filter(t => now - t < 10 * 60 * 1000);
  if (a.length >= 8) return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
  if (!crypto.timingSafeEqual(hash(req.body && req.body.password), hash(ADMIN_PASSWORD))) {
    a.push(now); attempts.set(ip, a);
    await new Promise(r => setTimeout(r, 600));
    return res.status(401).json({ error: 'Wrong password.' });
  }
  res.setHeader('Set-Cookie', `adm=${makeToken()}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${isHttps(req) ? '; Secure' : ''}`);
  res.json({ ok: true, defaultPassword: false });
}));
app.post('/api/admin/logout', (req, res) => { res.setHeader('Set-Cookie', 'adm=; Max-Age=0; Path=/'); res.json({ ok: true }); });
app.get('/api/admin/me', (req, res) => res.json({ admin: isAdmin(req), defaultPassword: false }));

app.get('/api/admin/stats', requireAdmin, h(async (req, res) => {
  const r = await q.get("SELECT COUNT(*)::int n, COALESCE(SUM(total_pkr),0)::bigint t FROM orders WHERE status<>'cancelled'");
  const p = await q.get("SELECT COUNT(*)::int n FROM orders WHERE status='pending'");
  const l = await q.get('SELECT COUNT(*)::int n FROM products WHERE active=1 AND stock<=1');
  res.json({ orders: r.n, revenue_pkr: Number(r.t), pending: p.n, lowStock: l.n });
}));
app.get('/api/admin/orders', requireAdmin, h(async (req, res) => {
  const rows = await q.all('SELECT * FROM orders ORDER BY id DESC LIMIT 300');
  const items = rows.length ? await q.all('SELECT order_id, name, price_pkr, qty FROM order_items WHERE order_id = ANY(?) ORDER BY id', [rows.map(o => o.id)]) : [];
  res.json(rows.map(o => ({ ...o, items: items.filter(i => i.order_id === o.id).map(i => ({ name: i.name, price_pkr: i.price_pkr, qty: i.qty })) })));
}));
app.patch('/api/admin/orders/:code', requireAdmin, h(async (req, res) => {
  const o = await q.get('SELECT * FROM orders WHERE code=?', [req.params.code]);
  if (!o) return res.status(404).json({ error: 'Order not found' });
  const b = req.body || {};
  const status = b.status !== undefined ? clean(b.status, 20) : o.status;
  const pay = b.pay_status !== undefined ? clean(b.pay_status, 10) : o.pay_status;
  if (!STATUSES.includes(status) || !['paid', 'unpaid'].includes(pay)) return res.status(400).json({ error: 'Invalid status' });
  await tx(async db => {
    if (status === 'cancelled' && o.status !== 'cancelled')
      for (const i of await db.all('SELECT product_id, qty FROM order_items WHERE order_id=?', [o.id])) await db.run('UPDATE products SET stock=stock+? WHERE id=?', [i.qty, i.product_id]);
    if (o.status === 'cancelled' && status !== 'cancelled')
      for (const i of await db.all('SELECT product_id, qty FROM order_items WHERE order_id=?', [o.id])) await db.run('UPDATE products SET stock=GREATEST(0,stock-?) WHERE id=?', [i.qty, i.product_id]);
    await db.run('UPDATE orders SET status=?, pay_status=?, carrier=?, tracking=? WHERE id=?', [status, pay,
      b.carrier !== undefined ? clean(b.carrier, 60) : o.carrier, b.tracking !== undefined ? clean(b.tracking, 80) : o.tracking, o.id]);
  });
  res.json({ ok: true });
}));

async function readProduct(b, existing) {
  const name = clean(b.name, 120), category = clean(b.category, 30).toLowerCase();
  const price = Math.round(Number(b.price_pkr)), weight = Math.round(Number(b.weight_g)), stock = Math.round(Number(b.stock));
  if (!name || !category) throw new Error('Name and category are required.');
  if (!(price >= 0) || !(weight >= 0) || !(stock >= 0)) throw new Error('Price, weight and stock must be numbers of 0 or more.');
  const images = (Array.isArray(b.images) ? b.images : []).map(x => String(x)).filter(x => /^\/(img|uploads)\/[A-Za-z0-9._-]+$/.test(x)).slice(0, 8);
  return { name, category, description: clean(b.description, 2000), price, weight, stock, images, active: b.active === false ? 0 : 1, slug: existing ? existing.slug : await uniqueSlug(name) };
}
app.get('/api/admin/products', requireAdmin, h(async (req, res) => res.json((await q.all('SELECT * FROM products ORDER BY sort, id')).map(productOut))));
app.post('/api/admin/products', requireAdmin, h(async (req, res) => {
  try {
    const p = await readProduct(req.body || {});
    const r = await q.get('INSERT INTO products(slug,name,category,description,price_pkr,weight_g,stock,images,active,sort) VALUES(?,?,?,?,?,?,?,?,?,(SELECT COALESCE(MAX(sort),0)+1 FROM products)) RETURNING id',
      [p.slug, p.name, p.category, p.description, p.price, p.weight, p.stock, JSON.stringify(p.images), p.active]);
    res.status(201).json({ id: r.id });
  } catch (e) { res.status(400).json({ error: e.message }); }
}));
app.put('/api/admin/products/:id', requireAdmin, h(async (req, res) => {
  try {
    const ex = await q.get('SELECT * FROM products WHERE id=?', [Number(req.params.id) || 0]);
    if (!ex) return res.status(404).json({ error: 'Not found' });
    const p = await readProduct(req.body || {}, ex);
    await q.run('UPDATE products SET name=?,category=?,description=?,price_pkr=?,weight_g=?,stock=?,images=?,active=? WHERE id=?',
      [p.name, p.category, p.description, p.price, p.weight, p.stock, JSON.stringify(p.images), p.active, ex.id]);
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
}));
app.delete('/api/admin/products/:id', requireAdmin, h(async (req, res) => {
  // Soft delete keeps old orders readable
  await q.run('UPDATE products SET active=0 WHERE id=?', [Number(req.params.id) || 0]);
  res.json({ ok: true });
}));

const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024, files: 8 }, // Vercel accepts requests up to about 4.5 MB in total
  fileFilter: (req, file, cb) => cb(null, !!EXT[file.mimetype])
});
app.post('/api/admin/upload', requireAdmin, (req, res, next) => upload.array('images', 8)(req, res, err => {
  if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Each photo must be under 4 MB (Vercel limit). Please make the photo smaller.' : 'Upload failed. Please try again with smaller photos.' });
  next();
}), h(async (req, res) => {
  const paths = [];
  for (const f of req.files || []) {
    const name = crypto.randomBytes(10).toString('hex') + EXT[f.mimetype];
    await q.run('INSERT INTO media(name,mime,data) VALUES(?,?,?)', [name, f.mimetype, f.buffer]);
    paths.push('/uploads/' + name);
  }
  res.json({ paths });
}));

app.get('/api/admin/settings', requireAdmin, h(async (req, res) => res.json(await getSettings())));
app.put('/api/admin/settings', requireAdmin, h(async (req, res) => {
  try {
    const b = req.body || {};
    if (b.brandName !== undefined) await setSetting('brandName', clean(b.brandName, 60));
    if (b.whatsapp !== undefined) await setSetting('whatsapp', clean(b.whatsapp, 20).replace(/[^\d]/g, ''));
    if (b.payments) await setSetting('payments', {
      bankDetails: clean(b.payments.bankDetails, 600), jazzcash: clean(b.payments.jazzcash, 30), easypaisa: clean(b.payments.easypaisa, 30),
      paypalLink: /^https:\/\//.test(b.payments.paypalLink || '') ? clean(b.payments.paypalLink, 200) : ''
    });
    if (b.currencies) {
      const c = { PKR: 1 };
      for (const k of Object.keys(b.currencies)) { const v = Number(b.currencies[k]); if (/^[A-Z]{3}$/.test(k) && v > 0 && k !== 'PKR') c[k] = v; }
      await setSetting('currencies', c);
    }
    if (b.shipping) {
      const sh = b.shipping;
      if (!Array.isArray(sh.zones) || !sh.zones.length) throw new Error('Shipping needs at least one zone.');
      const zones = sh.zones.map(z => {
        const base = Number(z.base), perKg = Number(z.perKg);
        if (!clean(z.name, 40) || !Array.isArray(z.countries) || !z.countries.length || !(base >= 0) || !(perKg >= 0)) throw new Error('Each shipping zone needs a name, countries, base and per-kg rate.');
        return { name: clean(z.name, 40), countries: z.countries.map(x => clean(x, 2).toUpperCase()), base, perKg };
      });
      const freeOver = {}; for (const k of Object.keys(sh.freeOver || {})) if (/^[A-Z]{2}$/.test(k) && Number(sh.freeOver[k]) >= 0) freeOver[k] = Number(sh.freeOver[k]);
      await setSetting('shipping', { packagingPerItem: Math.max(0, Number(sh.packagingPerItem) || 0), freeOver, zones });
    }
    if (b.contact) {
      const c = b.contact;
      await setSetting('contact', { email: clean(c.email, 120), phone: clean(c.phone, 40), address: clean(c.address, 200), hours: clean(c.hours, 120),
        instagram: /^https:\/\//.test(c.instagram || '') ? clean(c.instagram, 200) : '', facebook: /^https:\/\//.test(c.facebook || '') ? clean(c.facebook, 200) : '' });
    }
    if (b.sampleData === false) await setSetting('sampleData', false);
    res.json({ ok: true, settings: await getSettings() });
  } catch (e) { res.status(400).json({ error: e.message }); }
}));

/* ---------- admin: pages, contact details, inquiries ---------- */
app.get('/api/admin/pages', requireAdmin, h(async (req, res) => {
  const rows = await q.all('SELECT slug, title, body, footer, sort, builtin, updated_at FROM pages ORDER BY sort, title');
  res.json(rows.map(r => ({ ...r, needsInfo: /\[[^\]]+\](?!\()/.test(r.body) })));
}));
app.put('/api/admin/pages/:slug', requireAdmin, h(async (req, res) => {
  const slug = String(req.params.slug), b = req.body || {};
  const cur = await q.get('SELECT * FROM pages WHERE slug=?', [slug]);
  if (!cur) return res.status(404).json({ error: 'Page not found' });
  const title = clean(b.title, 80); if (!title) return res.status(400).json({ error: 'Give the page a title.' });
  const body = String(b.body == null ? cur.body : b.body).slice(0, 30000);
  const footer = b.footer === undefined ? cur.footer : (b.footer ? 1 : 0);
  await q.run(`UPDATE pages SET title=?, body=?, footer=?, updated_at=${NOW} WHERE slug=?`, [title, body, footer, slug]);
  res.json({ ok: true });
}));
app.post('/api/admin/pages', requireAdmin, h(async (req, res) => {
  const b = req.body || {}, title = clean(b.title, 80);
  if (!title) return res.status(400).json({ error: 'Give the page a title.' });
  const RESERVED = ['shop', 'p', 'checkout', 'done', 'order', 'track', 'collections', 'workshop', 'story', 'admin', 'api'];
  let slug = slugify(b.slug || title), n = 2; const base = slug;
  while (RESERVED.includes(slug) || await q.get('SELECT 1 AS x FROM pages WHERE slug=?', [slug])) slug = `${base}-${n++}`;
  await q.run('INSERT INTO pages(slug,title,body,footer,sort,builtin) VALUES(?,?,?,?,200,0)', [slug, title, String(b.body || '## ' + title + '\nWrite your text here.').slice(0, 30000), 1]);
  res.json({ ok: true, slug });
}));
app.delete('/api/admin/pages/:slug', requireAdmin, h(async (req, res) => {
  const p = await q.get('SELECT builtin FROM pages WHERE slug=?', [String(req.params.slug)]);
  if (!p) return res.status(404).json({ error: 'Page not found' });
  if (p.builtin) return res.status(400).json({ error: 'Built-in pages cannot be deleted. You can turn off "Show in footer" instead.' });
  await q.run('DELETE FROM pages WHERE slug=?', [String(req.params.slug)]);
  res.json({ ok: true });
}));
app.post('/api/admin/pages/:slug/reset', requireAdmin, h(async (req, res) => {
  const d = DEFAULT_PAGES.find(p => p.slug === String(req.params.slug));
  if (!d) return res.status(400).json({ error: 'There is no original text for this page.' });
  await q.run(`UPDATE pages SET title=?, body=?, updated_at=${NOW} WHERE slug=?`, [d.title, d.body.trim(), d.slug]);
  res.json({ ok: true });
}));
app.get('/api/admin/inquiries', requireAdmin, h(async (req, res) => res.json(await q.all('SELECT * FROM inquiries ORDER BY id DESC LIMIT 300'))));
app.put('/api/admin/inquiries/:id', requireAdmin, h(async (req, res) => { await q.run('UPDATE inquiries SET is_read=? WHERE id=?', [req.body && req.body.read === false ? 0 : 1, Number(req.params.id) || 0]); res.json({ ok: true }); }));
app.delete('/api/admin/inquiries/:id', requireAdmin, h(async (req, res) => { await q.run('DELETE FROM inquiries WHERE id=?', [Number(req.params.id) || 0]); res.json({ ok: true }); }));

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => { console.error(err); if (res.headersSent) return next(err); res.status(500).json({ error: 'Something went wrong.' }); });

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => console.log('Store API on http://localhost:' + port));
}
module.exports = app;
