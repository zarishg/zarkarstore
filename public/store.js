(function () {
'use strict';
var $ = function (s, r) { return (r || document).querySelector(s); };
var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
var S = { cfg: null, pages: [], products: [], cart: [], cur: 'PKR', quote: null, country: 'PK', method: '', last: null };
var app = $('#app');

/* ---------- storage ---------- */
function load(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } }

/* ---------- helpers ---------- */
var LOC = { PKR: 'en-PK', USD: 'en-US', GBP: 'en-GB', AED: 'en-AE' };
function money(pkr) {
  var r = (S.cfg.currencies[S.cur] || 1) * pkr;
  try { return new Intl.NumberFormat(LOC[S.cur] || 'en-US', { style: 'currency', currency: S.cur, maximumFractionDigits: S.cur === 'PKR' ? 0 : 2 }).format(r); }
  catch (e) { return S.cur + ' ' + Math.round(r); }
}
function api(path, opt) {
  opt = opt || {};
  return fetch(path, { method: opt.method || 'GET', headers: opt.body ? { 'Content-Type': 'application/json' } : undefined, body: opt.body ? JSON.stringify(opt.body) : undefined })
    .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Something went wrong.'); return j; }); });
}
var toastT;
function toast(m) { var t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('on'); }, 2400); }
function prod(id) { return S.products.filter(function (p) { return p.id === id; })[0]; }
function bySlug(slug) { return S.products.filter(function (p) { return p.slug === slug; })[0]; }
function img(p, i) { return (p.images && p.images[i || 0]) || '/img/casserole.jpg'; }
var CATS = { blue: ['Blue Pottery', 'Cobalt and white florals from Multan.'], clay: ['Clay Pottery', 'Warm, glazed terracotta for the kitchen and table.'], cookware: ['Clay Cookware', 'Handmade clay pots, pans and kitchen ware.'], kashi: ['Kashi Kari', 'Colourful hand-painted tile-style florals, birds and patterns.'] };
function catName(c) { return (CATS[c] && CATS[c][0]) || c.charAt(0).toUpperCase() + c.slice(1); }

/* ---------- cart ---------- */
function cartCount() { return S.cart.reduce(function (n, i) { return n + i.qty; }, 0); }
function addToCart(id, qty) {
  var p = prod(id); if (!p || p.stock < 1 || !(p.price_pkr > 0)) return;
  var it = S.cart.filter(function (i) { return i.id === id; })[0];
  var have = it ? it.qty : 0, want = Math.min(p.stock, have + (qty || 1));
  if (want === have) { toast('That is all we have of this piece.'); return; }
  if (it) it.qty = want; else S.cart.push({ id: id, qty: want });
  save('cart', S.cart); renderCart(); toast(p.name + ' added to your bag');
}
function setQty(id, d) {
  var it = S.cart.filter(function (i) { return i.id === id; })[0]; if (!it) return;
  var p = prod(id); it.qty = Math.max(0, Math.min(p ? p.stock : 0, it.qty + d));
  S.cart = S.cart.filter(function (i) { return i.qty > 0; }); save('cart', S.cart); renderCart();
  if (location.hash.indexOf('#/checkout') === 0) refreshQuote();
}
function renderCart() {
  S.cart = S.cart.filter(function (i) { return prod(i.id); });
  var sub = 0, h = '';
  S.cart.forEach(function (i) {
    var p = prod(i.id); sub += p.price_pkr * i.qty;
    h += '<div class="dl"><div class="th pan"><img src="' + esc(img(p)) + '" alt=""></div><div><b>' + esc(p.name) + '</b><div class="dnote">' + money(p.price_pkr) + '</div>' +
      '<div class="q"><button type="button" data-q="' + p.id + '" data-d="-1" aria-label="Fewer">−</button><span>' + i.qty + '</span><button type="button" data-q="' + p.id + '" data-d="1" aria-label="More">+</button></div></div><b>' + money(p.price_pkr * i.qty) + '</b></div>';
  });
  $('#dlist').innerHTML = h || '<p class="dnote">Your bag is empty. Add a piece to see it here.</p>';
  $('#dsub').textContent = money(sub);
  $('#cc').textContent = cartCount();
  $('#toCheckout').style.display = S.cart.length ? '' : 'none';
}
function openCart(o) { $('#drawer').classList.toggle('on', o); $('#veil').classList.toggle('on', o); }

/* ---------- shared bits ---------- */
function card(p) {
  return '<article class="card"><div class="pan">' + (p.stock < 1 ? '<span class="soldout">Sold out</span>' : '') +
    '<a class="il" href="#/p/' + esc(p.slug) + '" aria-label="' + esc(p.name) + '"><img src="' + esc(img(p)) + '" alt="' + esc(p.name) + '" loading="lazy"></a>' +
    (p.stock > 0 && p.price_pkr > 0 ? '<button class="qa" type="button" data-add="' + p.id + '">Quick add</button>' : '') + '</div>' +
    '<div class="meta"><div><small>' + esc(catName(p.category)) + '</small><a href="#/p/' + esc(p.slug) + '"><b>' + esc(p.name) + '</b></a></div><span>' + (p.price_pkr > 0 ? money(p.price_pkr) : 'Price coming soon') + '</span></div></article>';
}
function setTitle(t) { document.title = (t ? t + ' · ' : '') + S.cfg.brandName; }
function waLink(text) { return S.cfg.whatsapp ? 'https://wa.me/' + S.cfg.whatsapp + '?text=' + encodeURIComponent(text) : ''; }

/* ---------- views ---------- */
function viewHome() {
  setTitle('');
  var P = S.products, a = P[0] || {}, b = P[1] || a, c = P.filter(function (x) { return x.slug === 'n18'; })[0] || P[2] || a;
  var cats = ['blue', 'clay', 'kashi', 'cookware'].filter(function (k) { return P.some(function (x) { return x.category === k; }); });
  var accHtml = cats.slice(0, 4).map(function (k, i) {
    var p = P.filter(function (x) { return x.category === k; })[0];
    if (k === 'blue') { p = P.filter(function (x) { return x.slug === 'n14'; })[0] || p; }
    return '<a href="#/shop?cat=' + esc(k) + '" class="pan' + (i === 0 ? ' on' : '') + '" data-acc><img src="' + esc(img(p)) + '" alt="' + esc(p.name) + '"><span class="cap"><b>' + esc(catName(k)) + '</b><span>' + esc((CATS[k] && CATS[k][1]) || 'Hand-painted pieces.') + '</span></span></a>';
  }).join('');
  var mq = ['Blue pottery', 'Clay pottery', 'Kashi kari', 'Made to order', 'Ships worldwide'].map(function (t) { return '<span>✦</span>' + t; }).join('');
  app.innerHTML =
  '<section class="hero" data-hero><div class="glow"></div><div class="wrap"><div>' +
    '<div class="eyebrow">Hand-painted · Multan to the world</div>' +
    '<h1 class="disp">Blue that <em>glows.</em><br>Clay that remembers.</h1>' +
    '<p class="lead">Collector-grade pottery, painted stroke by stroke. Made for the tables you want to be remembered for.</p>' +
    '<a href="#/shop" class="btn p">Shop the collection</a> <a href="#col" class="btn o" data-scroll="col">Explore</a></div>' +
    '<div class="stage">' +
      '<div class="dep" data-depth="-14"><a href="#/p/' + esc(a.slug) + '" class="disc pan"><img src="' + esc(img(a)) + '" alt="' + esc(a.name) + '"></a></div>' +
      '<div class="dep" data-depth="26"><a href="#/p/' + esc(b.slug) + '" class="mini m1 pan"><img src="' + esc(img(b)) + '" alt="' + esc(b.name) + '"></a></div>' +
      '<div class="dep" data-depth="34"><a href="#/p/' + esc(c.slug) + '" class="mini m2 pan"><img src="' + esc(img(c)) + '" alt="' + esc(c.name) + '"></a></div>' +
      '<div class="dep" data-depth="10"><svg class="badge" viewBox="0 0 200 200" aria-hidden="true"><defs><path id="cp" d="M100,100 m-80,0 a80,80 0 1,1 160,0 a80,80 0 1,1 -160,0"/></defs><text font-size="17" letter-spacing="4" fill="currentColor" font-weight="600"><textPath href="#cp">HAND PAINTED · HAND GLAZED · HAND FIRED ·</textPath></text></svg></div>' +
    '</div></div></section>' +
  '<div class="mq" aria-hidden="true"><div>' + mq + mq + mq + mq + '</div></div>' +
  '<section class="s" id="col"><div class="wrap"><h2 class="disp">Four traditions.</h2><p class="sub">Move over a panel to open it, then choose it to see the pieces.</p><div class="acc">' + accHtml + '</div></div></section>' +
  '<section class="s" style="padding-top:20px"><div class="wrap"><h2 class="disp">The collection</h2><p class="sub">Every piece is signed by the hand that painted it.</p>' +
    '<div class="grid">' + P.slice(0, 6).map(card).join('') + '</div>' +
    '<p style="margin-top:36px"><a class="btn o" href="#/shop">View all pieces</a></p></div></section>' +
  '<section class="s" style="background:var(--bg2)"><div class="wrap"><h2 class="disp">Shaped. Painted. Fired.</h2><p class="sub">The three steps every piece goes through, in this order.</p>' +
    '<div class="steps"><div><b>Shaped</b>The clay is cleaned, mixed and rested until it is ready to work. We then shape every piece by hand on our own wheel, and dry it slowly and evenly so it does not crack.</div><div><b>Painted</b>Our own artisans paint each piece by hand, freehand, with fine brushes: cobalt blue florals on blue pottery, and birds and flowers in colour on kashi kari. No stickers, no transfers.</div><div><b>Fired</b>Each piece is fired in our own kiln. It is painted, coated with a clear glaze and fired again, so the colour fuses into the clay and the surface turns glossy and strong. Our blue pottery is food safe.</div></div></div></section>' +
  '<section class="seal-band"><div class="wrap"><img src="/img/brand/seal.png" alt="' + esc(S.cfg.brandName) + ' clay seal"><div><h2>' + esc(S.cfg.brandName) + '</h2><p>Every piece leaves our workshop pressed with this clay seal: a promise that it was shaped, painted and fired by hand. Artisanal soul, timeless craft.</p></div></div></section>' +
  '<section class="s"><div class="wrap"><h2 class="disp">Delivery and payment</h2><p class="sub">We ship worldwide with protective packing.</p><div class="steps">' +
    '<div><b>Pakistan</b>Cash on delivery, JazzCash, Easypaisa or bank transfer.</div>' +
    '<div><b>Worldwide</b>' + (S.cfg.cardEnabled ? 'Pay by card, or by bank transfer.' : 'Pay by bank transfer.') + ' Rates are calculated at checkout.</div>' +
    '<div><b>Safe packing</b>Every piece is cushioned and double-boxed.</div></div></div></section>';
  initHero();
}
function initHero() {
  var hero = $('[data-hero]'); if (!hero) return;
  hero.addEventListener('mousemove', function (e) {
    var r = hero.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
    hero.style.setProperty('--mx', (e.clientX - r.left) + 'px'); hero.style.setProperty('--my', (e.clientY - r.top) + 'px');
    $$('[data-depth]', hero).forEach(function (d) { var k = +d.getAttribute('data-depth'); d.style.transform = 'translate3d(' + (x * k) + 'px,' + (y * k) + 'px,0)'; });
  });
  hero.addEventListener('mouseleave', function () { $$('[data-depth]', hero).forEach(function (d) { d.style.transform = ''; }); });
}

function viewShop(q) {
  var cat = q.get('cat') || 'all', sub = q.get('sub') || 'all';
  if (cat === 'cookware') { cat = 'clay'; sub = 'cookware'; }   /* cookware is part of Clay */
  setTitle('Shop');
  var cats = []; S.products.forEach(function (p) { var k = p.category === 'cookware' ? 'clay' : p.category; if (cats.indexOf(k) < 0) cats.push(k); });
  var chips = [['all', 'All']].concat(cats.map(function (c) { return [c, c === 'clay' ? 'Clay' : catName(c)]; })).map(function (c) {
    return '<a href="#/shop' + (c[0] === 'all' ? '' : '?cat=' + esc(c[0])) + '" class="' + (cat === c[0] ? 'on' : '') + '">' + esc(c[1]) + '</a>';
  }).join('');
  var subChips = '';
  if (cat === 'clay') {
    subChips = '<div class="chips sub">' + [['all', 'All clay'], ['pottery', 'Clay pottery'], ['cookware', 'Clay cookware']].map(function (c) {
      return '<a href="#/shop?cat=clay' + (c[0] === 'all' ? '' : '&sub=' + c[0]) + '" class="' + (sub === c[0] ? 'on' : '') + '">' + c[1] + '</a>';
    }).join('') + '</div>';
  }
  var list = S.products.filter(function (p) {
    if (cat === 'all') return true;
    if (cat === 'clay') return p.category === 'clay' ? sub !== 'cookware' : p.category === 'cookware' ? sub !== 'pottery' : false;
    return p.category === cat;
  });
  app.innerHTML = '<div class="wrap page"><h2 class="disp">' + (cat === 'all' ? 'The collection' : cat === 'clay' ? 'Clay' : esc(catName(cat))) + '</h2><div class="chips">' + chips + '</div>' + subChips +
    (list.length ? '<div class="grid">' + list.map(card).join('') + '</div>' : '<p class="sub">Nothing here yet. Please check back soon.</p>') + '</div>';
}

function viewProduct(slug) {
  var p = bySlug(slug);
  if (!p) { app.innerHTML = '<div class="wrap page"><h2 class="disp">Piece not found</h2><p class="sub">It may have been sold or removed.</p><a class="btn p" href="#/shop">Back to the shop</a></div>'; return; }
  setTitle(p.name);
  var start = p.images[1] || p.images[0];
  var thumbs = p.images.length > 1 ? '<div class="thumbs">' + p.images.map(function (im, i) { return '<button type="button" class="pan' + (im === start ? ' on' : '') + '" data-thumb="' + esc(im) + '" aria-label="Photo ' + (i + 1) + '"><img src="' + esc(im) + '" alt=""></button>'; }).join('') + '</div>' : '';
  var stock = p.stock < 1 ? '<span class="pill">Sold out</span>' : p.stock <= 2 ? '<span class="pill">Only ' + p.stock + ' left</span>' : '<span class="pill">In stock</span>';
  var wa = waLink('Hello, I would like to ask about: ' + p.name);
  app.innerHTML = '<div class="wrap"><div class="crumb"><a href="#/shop">Shop</a> / <a href="#/shop?cat=' + esc(p.category) + '">' + esc(catName(p.category)) + '</a></div><div class="view">' +
    '<div><div class="zoom pan' + (p.images[1] ? ' lux' : '') + '" id="zoom"><img id="zimg" src="' + esc(start) + '" alt="' + esc(p.name) + '"></div>' + thumbs + '</div>' +
    '<div><div class="eyebrow">' + esc(catName(p.category)) + '</div><h2 class="disp" style="margin-bottom:8px">' + esc(p.name) + '</h2><p class="pr">' + (p.price_pkr > 0 ? money(p.price_pkr) : 'Price coming soon') + '</p>' + stock +
    '<p class="sub" style="margin:18px 0 0">' + esc(p.description) + '</p>' +
    (p.stock > 0 && p.price_pkr > 0 ? '<div><div class="qty"><button type="button" id="qm" aria-label="Fewer">−</button><span id="qv">1</span><button type="button" id="qp" aria-label="More">+</button></div><button class="btn p" type="button" id="addBtn">Add to bag</button></div>' : '') +
    '<div class="facts"><span>Hand-painted, so small variations are part of the piece.</span><span>Ships in protective packing. Shipping is calculated at checkout.</span>' +
    (wa ? '<a href="' + esc(wa) + '" target="_blank" rel="noopener" style="color:var(--terra-l)">Ask about this piece on WhatsApp</a>' : '') + '</div></div></div></div>';
  var z = $('#zoom');
  z.addEventListener('mousemove', function (e) { var r = z.getBoundingClientRect(); $('#zimg').style.transformOrigin = ((e.clientX - r.left) / r.width * 100) + '% ' + ((e.clientY - r.top) / r.height * 100) + '%'; });
  var q = 1;
  if ($('#qm')) {
    $('#qm').onclick = function () { q = Math.max(1, q - 1); $('#qv').textContent = q; };
    $('#qp').onclick = function () { q = Math.min(p.stock, q + 1); $('#qv').textContent = q; };
    $('#addBtn').onclick = function () { addToCart(p.id, q); openCart(true); };
  }
}

/* ---------- checkout ---------- */
function viewCheckout() {
  setTitle('Checkout');
  if (!S.cart.length) { app.innerHTML = '<div class="wrap page"><h2 class="disp">Your bag is empty</h2><p class="sub">Add a piece first, then come back to check out.</p><a class="btn p" href="#/shop">Shop the collection</a></div>'; return; }
  var opts = S.cfg.countries.map(function (c) { return '<option value="' + c[0] + '"' + (c[0] === S.country ? ' selected' : '') + '>' + esc(c[1]) + '</option>'; }).join('');
  app.innerHTML = '<div class="wrap page"><h2 class="disp">Checkout</h2><form id="coForm" class="co" novalidate><div>' +
    '<div class="box"><div class="fgrid">' +
    '<div class="full"><label class="f" for="f-name">Full name</label><input id="f-name" autocomplete="name" required></div>' +
    '<div><label class="f" for="f-email">Email</label><input id="f-email" type="email" autocomplete="email" required></div>' +
    '<div><label class="f" for="f-phone">Phone (with country code)</label><input id="f-phone" type="tel" autocomplete="tel" required></div>' +
    '<div class="full"><label class="f" for="f-country">Country</label><select id="f-country" autocomplete="country">' + opts + '</select></div>' +
    '<div><label class="f" for="f-city">City</label><input id="f-city" autocomplete="address-level2" required></div>' +
    '<div><label class="f" for="f-postal">Postal code</label><input id="f-postal" autocomplete="postal-code"></div>' +
    '<div class="full"><label class="f" for="f-address">Address</label><textarea id="f-address" rows="3" autocomplete="street-address" required></textarea></div>' +
    '<div class="full"><label class="f" for="f-notes">Order notes (optional)</label><textarea id="f-notes" rows="2"></textarea></div></div></div>' +
    '<h3 class="disp" style="font-size:32px;margin:30px 0 8px">Payment</h3><div class="pm" id="pm"><p class="note">Choose your country to see payment options.</p></div></div>' +
    '<div class="box sum" id="sum"></div></form></div>';
  $('#f-country').onchange = function () { S.country = this.value; S.method = ''; refreshQuote(); };
  $('#coForm').onsubmit = placeOrder;
  refreshQuote();
}
function refreshQuote() {
  if (!$('#sum')) return;
  api('/api/quote', { method: 'POST', body: { items: S.cart, country: S.country } }).then(function (q) {
    S.quote = q;
    if (!q.methods.some(function (m) { return m.id === S.method; })) S.method = q.methods[0] ? q.methods[0].id : '';
    drawSummary(); drawMethods();
  }).catch(function (e) { S.quote = null; $('#sum').innerHTML = '<div class="err">' + esc(e.message) + '</div>'; });
}
function drawSummary() {
  var q = S.quote;
  var rows = S.cart.map(function (i) { var p = prod(i.id); return '<div class="row"><span>' + esc(p.name) + ' × ' + i.qty + '</span><span>' + money(p.price_pkr * i.qty) + '</span></div>'; }).join('');
  $('#sum').innerHTML = '<div class="disp" style="font-size:30px;margin-bottom:8px">Your order</div>' + rows +
    '<div class="row"><span>Subtotal</span><span>' + money(q.subtotal) + '</span></div>' +
    '<div class="row"><span>Shipping (' + esc(q.zone) + ')</span><span>' + (q.free ? 'Free' : money(q.shipping)) + '</span></div>' +
    '<div class="row tot"><span>Total</span><span>' + money(q.total) + '</span></div>' +
    '<p class="note">Amounts show in ' + esc(S.cur) + '. ' + (S.cur !== 'PKR' ? 'Rates are approximate; the order total is fixed in PKR. ' : '') + '</p>' +
    '<div id="coErr"></div><button class="btn p block" type="submit" id="placeBtn">Place order</button>';
}
function drawMethods() {
  $('#pm').innerHTML = S.quote.methods.map(function (m) {
    return '<label><input type="radio" name="pay" value="' + esc(m.id) + '"' + (S.method === m.id ? ' checked' : '') + '><span><b>' + esc(m.label) + '</b><small>' + esc(m.note) + '</small></span></label>';
  }).join('');
  $$('#pm input').forEach(function (r) { r.onchange = function () { S.method = r.value; }; });
}
function placeOrder(e) {
  e.preventDefault();
  var v = function (id) { return $('#' + id).value.trim(); };
  var err = $('#coErr'), btn = $('#placeBtn');
  if (!v('f-name') || !v('f-email') || !v('f-phone') || !v('f-city') || !v('f-address')) { err.innerHTML = '<div class="err">Please fill in all required fields.</div>'; return; }
  if (!S.method) { err.innerHTML = '<div class="err">Please choose a payment method.</div>'; return; }
  btn.disabled = true; btn.textContent = 'Placing order…'; err.innerHTML = '';
  api('/api/orders', { method: 'POST', body: { items: S.cart, method: S.method, currency: S.cur,
    customer: { name: v('f-name'), email: v('f-email'), phone: v('f-phone'), country: S.country, city: v('f-city'), postal: v('f-postal'), address: v('f-address'), notes: v('f-notes') } } })
  .then(function (o) {
    S.cart = []; save('cart', S.cart); renderCart(); S.last = o;
    if (o.redirect) { location.href = o.redirect; return; }
    location.hash = '#/done/' + o.code;
  }).catch(function (x) { err.innerHTML = '<div class="err">' + esc(x.message) + '</div>'; btn.disabled = false; btn.textContent = 'Place order'; });
}
function viewDone(code) {
  setTitle('Order placed');
  var o = S.last && S.last.code === code ? S.last : null;
  var wa = waLink('Hello, my order code is ' + code);
  app.innerHTML = '<div class="wrap page" style="max-width:760px"><div class="eyebrow">Thank you</div><h2 class="disp">Your order is placed.</h2>' +
    '<p class="sub">Your order code is <b style="color:var(--ink)">' + esc(code) + '</b>. Please keep it to track your order.</p>' +
    (o && o.instructions ? '<h3 class="disp" style="font-size:30px;margin:0 0 10px">Next step</h3><div class="mono">' + esc(o.instructions) + '</div>' : '') +
    (o && (o.method === 'bank' || o.method === 'jazzcash' || o.method === 'easypaisa' || o.method === 'paypal') ? '<p class="note" style="margin-top:14px">We confirm your order as soon as we see the payment.</p>' : '') +
    '<p style="margin-top:30px;display:flex;gap:12px;flex-wrap:wrap"><a class="btn p" href="#/track?code=' + esc(code) + '">Track this order</a>' +
    (wa ? '<a class="btn o" target="_blank" rel="noopener" href="' + esc(wa) + '">Message us on WhatsApp</a>' : '') + '</p></div>';
}

/* ---------- tracking ---------- */
var FLOW = ['pending', 'confirmed', 'packed', 'shipped', 'delivered'];
function viewTrack(q) {
  setTitle('Track order');
  app.innerHTML = '<div class="wrap page" style="max-width:820px"><h2 class="disp">Track your order</h2><p class="sub">Enter your order code and the email or phone you used.</p>' +
    '<form id="trForm" class="box"><div class="fgrid"><div><label class="f" for="t-code">Order code</label><input id="t-code" value="' + esc(q.get('code') || '') + '" placeholder="ORD-XXXXXX" required></div>' +
    '<div><label class="f" for="t-contact">Email or phone</label><input id="t-contact" required></div></div><p style="margin:18px 0 0"><button class="btn p" type="submit">Find order</button></p></form><div id="trOut"></div></div>';
  $('#trForm').onsubmit = function (e) {
    e.preventDefault();
    api('/api/track?code=' + encodeURIComponent($('#t-code').value) + '&contact=' + encodeURIComponent($('#t-contact').value)).then(function (o) {
      var idx = FLOW.indexOf(o.status);
      var tl = o.status === 'cancelled' ? '<div class="err">This order was cancelled.</div>' : '<div class="timeline">' + FLOW.map(function (s, i) { return '<div class="' + (i <= idx ? 'done' : '') + '">' + s + '</div>'; }).join('') + '</div>';
      $('#trOut').innerHTML = '<div class="box" style="margin-top:24px"><div class="eyebrow">' + esc(o.code) + '</div>' + tl +
        (o.tracking ? '<p>Courier: <b>' + esc(o.carrier || 'Courier') + '</b> · Tracking number: <b>' + esc(o.tracking) + '</b></p>' : '') +
        '<p class="note">Payment: ' + (o.pay_status === 'paid' ? 'received' : 'not received yet') + ' · ' + esc(o.method) + '</p>' +
        o.items.map(function (i) { return '<div class="row" style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--line)"><span>' + esc(i.name) + ' × ' + i.qty + '</span><span>' + money(i.price_pkr * i.qty) + '</span></div>'; }).join('') +
        '<p style="font-size:20px;margin:14px 0 0">Total ' + money(o.total_pkr) + '</p></div>';
    }).catch(function (x) { $('#trOut').innerHTML = '<div class="err" style="margin-top:20px">' + esc(x.message) + '</div>'; });
  };
  if (q.get('code')) $('#t-contact').focus();
}

/* ---------- workshop (we make it ourselves) ---------- */
function wsMedia(name, cap, note) {
  return '<div class="ws-media"><div class="ws-ph"><span>' + esc(cap) + '</span></div>' +
    '<video class="ws-vid" muted loop playsinline autoplay preload="metadata" aria-label="' + esc(cap) + '"><source src="/img/workshop/' + name + '.mp4" type="video/mp4"></video>' +
    '<img class="ws-photo" src="/img/workshop/' + name + '.jpg" alt="' + esc(cap) + '">' + (note ? '<span class="ws-cap">' + esc(note) + '</span>' : '') + '</div>';
}
function viewWorkshop() {
  var b = esc(S.cfg.brandName), wa = waLink('Hello, I would like to know more about your workshop and custom orders.');
  setTitle('Our Workshop');
  app.innerHTML =
  '<section class="ws-hero"><div class="glow"></div><div class="wrap ws-herogrid"><div><div class="eyebrow">Made by us, from start to finish</div>' +
    '<h1 class="disp">We are the <em>makers.</em></h1>' +
    '<p class="lead">' + b + ' is not a reseller. Our pottery and clay cookware are made in our own workshop: shaped on our own wheel, painted by our own hands and fired in our own kiln.</p>' +
    '<div class="ws-badges"><span>Our wheel</span><span>Our kiln</span><span>Our hands</span><span>Our seal</span></div></div>' +
    '<div class="ws-media ws-hv"><video class="ws-vid" muted loop playsinline autoplay preload="metadata" aria-label="A potter shaping a clay vase on the wheel"><source src="/img/workshop/hero.mp4" type="video/mp4"></video></div></div></section>' +
  '<section class="s"><div class="wrap ws-split">' + wsMedia('wheel', 'Our potter\'s wheel') +
    '<div><div class="eyebrow">01 · The wheel (chaak)</div><h2 class="disp ws-h">Every piece begins on our wheel.</h2>' +
    '<p class="sub">A lump of prepared clay is centred on the wheel, opened with the thumbs and drawn upwards into a bowl, a vase or a platter. We shape it ourselves, so the form, the curve of the rim and the weight in your hand are ours to decide, not a factory\'s.</p>' +
    '<p class="sub">Because it is shaped by hand, no two pieces are exactly alike. That is the point.</p></div></div></section>' +
  '<section class="s" style="background:var(--bg2)"><div class="wrap ws-split rev"><div><div class="eyebrow">02 · The kiln (bhatti)</div><h2 class="disp ws-h">Fired in our own kiln.</h2>' +
    '<p class="sub">After slow drying, each piece goes into our own kiln. Painted and glazed pieces return to the fire so the colours fuse into the clay and the glaze turns glassy and deep.</p>' +
    '<p class="sub">Owning the kiln means we control the firing ourselves. We choose when a piece is ready, and we can stand behind how it is made.</p></div>' +
    wsMedia('kiln', 'Our kiln') + '</div></section>' +
  '<section class="s"><div class="wrap"><h2 class="disp ws-h">From clay to your home</h2><p class="sub">The six steps every piece goes through in our workshop.</p>' +
    '<div class="ws-steps">' + [['Clay prepared','Cleaned, mixed and rested until it is ready to work.'],['Thrown on the wheel','Shaped by hand on our own wheel.'],['Dried slowly','Dried gently and evenly so it does not crack.'],['Painted by hand','Motifs drawn freehand: blue florals, kashi kari birds and patterns.'],['Glazed','A clear, glossy glaze brings out the colour.'],['Fired in our kiln','Fired in our own kiln, then inspected before packing.']].map(function (s, i) {
      return '<div><i>' + (i + 1) + '</i><b>' + s[0] + '</b><span>' + s[1] + '</span></div>';
    }).join('') + '</div></div></section>' +
  '<section class="seal-band"><div class="wrap"><img src="/img/brand/seal.png" alt="' + b + ' clay seal"><div><h2>The seal of the maker</h2><p>Each piece is pressed with our clay seal before it leaves the workshop. It means one thing: we made it.</p></div></div></section>' +
  '<section class="s"><div class="wrap" style="text-align:center"><h2 class="disp ws-h">Want something made for you?</h2><p class="sub" style="margin:0 auto 30px">Because we make everything ourselves, we can take custom sizes, colours and wholesale orders.</p>' +
    '<a class="btn p" href="#/shop">Shop the collection</a> ' + (wa ? '<a class="btn o" href="' + esc(wa) + '" target="_blank" rel="noopener">Talk to us on WhatsApp</a>' : '') + '</div></section>';
  $$('.ws-media').forEach(function (m) {
    var v = $('.ws-vid', m), im = $('.ws-photo', m), src = v && $('source', v);
    var rmV = function () { if (v && v.parentNode) v.remove(); }, rmI = function () { if (im && im.parentNode) im.remove(); };
    if (v) { v.addEventListener('error', rmV); if (src) src.addEventListener('error', rmV); v.addEventListener('loadeddata', function () { rmI(); m.classList.add('has'); }); var p = v.play && v.play(); if (p && p.catch) p.catch(function () {}); }
    if (im) { im.addEventListener('error', rmI); if (im.complete && !im.naturalWidth) rmI(); else im.addEventListener('load', function () { m.classList.add('has'); }); }
    if (m.classList.contains('ws-hv')) { m.style.display = 'none'; if (v) v.addEventListener('loadeddata', function () { m.style.display = ''; }); }
  });
}


/* ---------- content pages (editable in Admin > Pages) ---------- */
function inline(t) {
  t = esc(t);
  t = t.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  t = t.replace(/\[([^\]]+)\]\(((?:https?:\/\/|mailto:|#\/)[^)\s]*)\)/g, function (m, a, u) { return '<a href="' + u + '"' + (u.charAt(0) === '#' ? '' : ' target="_blank" rel="noopener"') + '>' + a + '</a>'; });
  return t;
}
function freeShipText() {
  var f = S.cfg.freeOver && S.cfg.freeOver.PK;
  return f ? 'Orders within Pakistan over ' + money(f) + ' ship free.' : '';
}
function fillTokens(t) {
  var c = S.cfg.contact || {};
  return t.replace(/\{\{(\w+)\}\}/g, function (m, k) {
    var map = { brand: S.cfg.brandName, email: c.email || '', phone: c.phone || '', address: c.address || '', hours: c.hours || '', whatsapp: S.cfg.whatsapp ? '+' + S.cfg.whatsapp : '', freeship: freeShipText() };
    return k in map ? map[k] : m;
  });
}
function renderBody(body, slug) {
  var lines = fillTokens(body).split('\n'), out = [], list = [], para = [], faq = slug === 'faq', open = false;
  function flushP() { if (para.length) { out.push('<p>' + inline(para.join(' ')) + '</p>'); para = []; } }
  function flushL() { if (list.length) { out.push('<ul>' + list.map(function (x) { return '<li>' + inline(x) + '</li>'; }).join('') + '</ul>'); list = []; } }
  function closeD() { if (open) { out.push('</div></details>'); open = false; } }
  lines.forEach(function (raw) {
    var l = raw.replace(/\s+$/, '');
    if (!l.trim()) { flushP(); flushL(); return; }
    var m;
    if ((m = l.match(/^###\s+(.*)$/))) { flushP(); flushL(); closeD(); if (faq) { out.push('<details class="qa"><summary>' + inline(m[1]) + '</summary><div>'); open = true; } else out.push('<h3>' + inline(m[1]) + '</h3>'); }
    else if ((m = l.match(/^##\s+(.*)$/))) { flushP(); flushL(); closeD(); out.push('<h2>' + inline(m[1]) + '</h2>'); }
    else if ((m = l.match(/^[-*]\s+(.*)$/))) { flushP(); list.push(m[1]); }
    else { flushL(); para.push(l.trim()); }
  });
  flushP(); flushL(); closeD();
  return out.join('');
}
function contactCard() {
  var c = S.cfg.contact || {}, rows = [];
  if (S.cfg.whatsapp) rows.push(['WhatsApp', '<a href="https://wa.me/' + esc(S.cfg.whatsapp) + '" target="_blank" rel="noopener">+' + esc(S.cfg.whatsapp) + '</a>']);
  if (c.phone) rows.push(['Phone', esc(c.phone)]);
  if (c.email) rows.push(['Email', '<a href="mailto:' + esc(c.email) + '">' + esc(c.email) + '</a>']);
  if (c.address) rows.push(['Find us', esc(c.address)]);
  if (c.hours) rows.push(['Hours', esc(c.hours)]);
  if (c.instagram) rows.push(['Instagram', '<a href="' + esc(c.instagram) + '" target="_blank" rel="noopener">Follow us</a>']);
  if (c.facebook) rows.push(['Facebook', '<a href="' + esc(c.facebook) + '" target="_blank" rel="noopener">Follow us</a>']);
  return '<aside class="ccard">' + rows.map(function (r) { return '<div><small>' + r[0] + '</small><span>' + r[1] + '</span></div>'; }).join('') + '</aside>';
}
function inquiryForm(type) {
  var extraLabel = type === 'wholesale' ? 'Shop or business name' : type === 'custom' ? 'What would you like made? (size, colour, quantity)' : '';
  var msgLabel = type === 'wholesale' ? 'What are you looking for?' : type === 'custom' ? 'Describe your idea' : 'Your message';
  return '<form class="iform" id="iform" novalidate data-type="' + type + '">' +
    '<div class="row2"><div><label for="i-name">Your name</label><input id="i-name" autocomplete="name" required></div><div><label for="i-phone">Phone or WhatsApp</label><input id="i-phone" autocomplete="tel"></div></div>' +
    '<label for="i-email">Email</label><input id="i-email" type="email" autocomplete="email">' +
    (extraLabel ? '<label for="i-extra">' + extraLabel + '</label><input id="i-extra">' : '') +
    '<label for="i-msg">' + msgLabel + '</label><textarea id="i-msg" rows="5" required></textarea>' +
    '<div class="hp" aria-hidden="true"><label for="i-web">Leave this empty</label><input id="i-web" tabindex="-1" autocomplete="off"></div>' +
    '<div class="err" id="i-err" role="alert" hidden></div>' +
    '<button class="btn p" type="submit" id="i-send">Send message</button><p class="sub small" id="i-ok" hidden>Thank you. We have received your message and will reply soon.</p></form>';
}
function wireForm() {
  var f = $('#iform'); if (!f) return;
  f.addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = $('#i-send'); btn.disabled = true; $('#i-err').hidden = true;
    api('/api/inquiry', { method: 'POST', body: { type: f.getAttribute('data-type'), name: $('#i-name').value, email: $('#i-email').value, phone: $('#i-phone').value,
      message: $('#i-msg').value, extra: $('#i-extra') ? $('#i-extra').value : '', website: $('#i-web').value } })
      .then(function () { f.reset(); $('#i-ok').hidden = false; btn.textContent = 'Message sent'; })
      .catch(function (x) { $('#i-err').textContent = x.message; $('#i-err').hidden = false; btn.disabled = false; });
  });
}
function viewPage(slug) {
  api('/api/pages/' + encodeURIComponent(slug)).then(function (p) {
    setTitle(p.title);
    var withForm = ['contact', 'wholesale', 'custom'].indexOf(slug) >= 0;
    var wa = waLink('Hello, I have a question about ' + p.title.toLowerCase() + '.');
    app.innerHTML = '<div class="wrap page"><div class="eyebrow">' + esc(S.cfg.brandName) + '</div><h1 class="disp ph">' + esc(p.title) + '</h1>' +
      '<div class="pgrid' + (withForm ? ' two' : '') + '"><article class="prose">' + renderBody(p.body, slug) +
      (slug === 'contact' || !withForm ? '' : '') + '</article>' +
      (withForm ? '<div>' + (slug === 'contact' ? contactCard() : '') + '<div class="fcard"><h3 class="disp">' + (slug === 'contact' ? 'Send us a message' : slug === 'wholesale' ? 'Wholesale enquiry' : 'Tell us your idea') + '</h3>' + inquiryForm(slug) + '</div></div>' : '') +
      '</div>' + (!withForm && wa ? '<p class="pnote">Questions? <a href="' + esc(wa) + '" target="_blank" rel="noopener">Message us on WhatsApp</a>.</p>' : '') + '</div>';
    wireForm();
    window.scrollTo(0, 0);
  }).catch(function () {
    app.innerHTML = '<div class="wrap page"><h2 class="disp">Page not found</h2><p class="sub">We could not find that page.</p><a class="btn p" href="#/shop">Back to the shop</a></div>';
  });
}
function viewCollections() {
  setTitle('Collections');
  var defs = [['blue', 'Blue pottery', 'Cobalt and white florals from Multan.'], ['kashi', 'Kashi kari', 'Colourful tile-style florals, birds and patterns.'], ['clay', 'Clay', 'Warm, glazed clay pieces and clay cookware.']];
  var cards = defs.map(function (d) {
    var list = S.products.filter(function (p) { return d[0] === 'clay' ? (p.category === 'clay' || p.category === 'cookware') : p.category === d[0]; });
    if (!list.length) return '';
    var shots = list.slice(0, 3).map(function (p) { return '<img src="' + esc(img(p)) + '" alt="" loading="lazy">'; }).join('');
    return '<a class="ccol" href="#/shop?cat=' + d[0] + '"><div class="cshots">' + shots + '</div><div class="cinfo"><b class="disp">' + d[1] + '</b><span>' + esc(d[2]) + '</span><em>' + list.length + ' pieces</em></div></a>';
  }).join('');
  app.innerHTML = '<div class="wrap page"><div class="eyebrow">' + esc(S.cfg.brandName) + '</div><h1 class="disp ph">Collections</h1><p class="sub">Every piece is made by hand in our own workshop. Choose a collection to explore.</p><div class="ccols">' + cards + '</div>' +
    '<p style="margin-top:40px"><a class="btn o" href="#/workshop">See how we make it</a></p></div>';
}

/* ---------- router ---------- */
function route() {
  var h = location.hash || '#/', parts = h.slice(2).split('?'), path = parts[0].split('/'), q = new URLSearchParams(parts[1] || '');
  openCart(false);
  var v = path[0];
  if (v === 'shop') viewShop(q);
  else if (v === 'p' && path[1]) viewProduct(path[1]);
  else if (v === 'checkout') viewCheckout();
  else if (v === 'done' && path[1]) viewDone(path[1]);
  else if (v === 'order' && path[1]) { q.set('code', path[1]); viewTrack(q); }
  else if (v === 'track') viewTrack(q);
  else if (v === 'workshop' || v === 'story') viewWorkshop();
  else if (v === 'collections') viewCollections();
  else if (v && S.pages.some(function (p) { return p.slug === v; })) { viewPage(v); return; }
  else viewHome();
  window.scrollTo(0, 0);
}

/* ---------- events ---------- */
document.addEventListener('click', function (e) {
  var t = e.target, x;
  if ((x = t.closest('[data-add]'))) { addToCart(+x.getAttribute('data-add')); return; }
  if ((x = t.closest('[data-q]'))) { setQty(+x.getAttribute('data-q'), +x.getAttribute('data-d')); return; }
  if (t.closest('#openCart')) { openCart(true); return; }
  if (t.closest('#closeCart') || t.id === 'veil' || t.closest('#toCheckout')) { openCart(false); return; }
  if ((x = t.closest('[data-thumb]'))) { $('#zimg').src = x.getAttribute('data-thumb'); $('#zoom').classList.toggle('lux', x.getAttribute('data-thumb').indexOf('img/p/') >= 0); $$('[data-thumb]').forEach(function (b) { b.classList.toggle('on', b === x); }); return; }
  if ((x = t.closest('[data-acc]'))) { if (!x.classList.contains('on')) { e.preventDefault(); $$('[data-acc]').forEach(function (a) { a.classList.toggle('on', a === x); }); } return; }
  if ((x = t.closest('[data-scroll]'))) { e.preventDefault(); var el = document.getElementById(x.getAttribute('data-scroll')); if (el) el.scrollIntoView({ behavior: 'smooth' }); }
});
document.addEventListener('mouseover', function (e) { var a = e.target.closest && e.target.closest('[data-acc]'); if (a && !a.classList.contains('on')) $$('[data-acc]').forEach(function (x) { x.classList.toggle('on', x === a); }); });
document.addEventListener('keydown', function (e) { if (e.key === 'Escape') openCart(false); });
window.addEventListener('hashchange', route);

/* ---------- boot ---------- */
Promise.all([api('/api/config'), api('/api/products'), api('/api/pages').catch(function () { return []; })]).then(function (r) {
  S.cfg = r[0]; S.products = r[1]; S.pages = r[2]; S.cart = load('cart', []); S.cur = load('cur', 'PKR');
  if (!S.cfg.currencies[S.cur]) S.cur = 'PKR';
  $('#logo span').textContent = S.cfg.brandName;
  $('#ann').textContent = 'Worldwide shipping · Breakage-safe packing';
  $('#cur').innerHTML = Object.keys(S.cfg.currencies).map(function (c) { return '<option' + (c === S.cur ? ' selected' : '') + '>' + c + '</option>'; }).join('');
  $('#cur').onchange = function () { S.cur = this.value; save('cur', S.cur); renderCart(); route(); };
  var f = $('#foot');
  var foot = S.pages.filter(function (p) { return p.footer; }).map(function (p) { return '<a href="#/' + esc(p.slug) + '">' + esc(p.title) + '</a>'; }).join('');
  f.innerHTML = '<div class="wrap fgrid"><div><div class="fb"><img src="/img/brand/seal-96.png" alt=""><div class="logo" style="font-size:26px">' + esc(S.cfg.brandName) + '</div></div><p>Artisanal soul. Timeless craft.<br>Handmade in Pakistan.</p></div>' +
    '<div><small>Shop</small><a href="#/shop">All pieces</a><a href="#/collections">Collections</a><a href="#/workshop">Our workshop</a><a href="#/track">Track order</a>' +
    (S.cfg.whatsapp ? '<a href="https://wa.me/' + esc(S.cfg.whatsapp) + '" target="_blank" rel="noopener">WhatsApp</a>' : '') + '</div>' +
    '<div><small>Help and information</small>' + foot + '</div></div><div class="wrap fcopy">© ' + new Date().getFullYear() + ' ' + esc(S.cfg.brandName) + '</div>';
  renderCart(); route();
}).catch(function () { app.innerHTML = '<div class="wrap page"><h2 class="disp">We will be right back</h2><p class="sub">The store could not load. Please refresh in a moment.</p></div>'; });
})();
