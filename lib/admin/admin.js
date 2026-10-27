(function () {
'use strict';
var $ = function (s, r) { return (r || document).querySelector(s); };
var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
var tab = 'orders', toastT;
function toast(m) { var t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('on'); }, 2200); }
function api(path, opt) {
  opt = opt || {};
  var o = { method: opt.method || 'GET', headers: {} };
  if (opt.body) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(opt.body); }
  if (opt.form) o.body = opt.form;
  return fetch(path, o).then(function (r) {
    return r.json().then(function (j) {
      if (r.status === 401 && path !== '/api/admin/login') { showLogin(); throw new Error('Please sign in.'); }
      if (!r.ok) throw new Error(j.error || 'Something went wrong.'); return j;
    });
  });
}
var pkr = function (n) { return 'PKR ' + Number(n).toLocaleString('en-PK'); };
var STATUSES = ['pending', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled'];

function showLogin() { $('#main').hidden = true; $('#login').hidden = false; $('#pw').focus(); }
function showMain(def) {
  $('#login').hidden = true; $('#main').hidden = false;
  $('#warn').innerHTML = def ? '<div class="w">You are using the default password. Set ADMIN_PASSWORD in your .env file and restart the server.</div>' : '';
  go(tab);
}
$('#lf').onsubmit = function (e) {
  e.preventDefault();
  api('/api/admin/login', { method: 'POST', body: { password: $('#pw').value } }).then(function (r) { $('#pw').value = ''; $('#lerr').hidden = true; showMain(r.defaultPassword); })
  .catch(function (x) { $('#lerr').textContent = x.message; $('#lerr').hidden = false; });
};
$('#logout').onclick = function () { api('/api/admin/logout', { method: 'POST' }).then(showLogin); };
$('#tabs').onclick = function (e) { var b = e.target.closest('[data-t]'); if (b) go(b.getAttribute('data-t')); };
function go(t) {
  tab = t;
  Array.prototype.forEach.call(document.querySelectorAll('#tabs button'), function (b) { b.classList.toggle('on', b.getAttribute('data-t') === t); });
  ({ orders: viewOrders, products: viewProducts, pages: viewPages, inquiries: viewInquiries, settings: viewSettings })[t]();
}

/* ---------- orders ---------- */
function viewOrders() {
  Promise.all([api('/api/admin/stats'), api('/api/admin/orders')]).then(function (r) {
    var s = r[0], list = r[1];
    var rows = list.map(function (o) {
      var items = o.items.map(function (i) { return esc(i.name) + ' × ' + i.qty; }).join('<br>');
      return '<tr><td><b>' + esc(o.code) + '</b><br><span class="small">' + esc(o.created_at) + '</span></td>' +
        '<td>' + esc(o.name) + '<br><span class="small">' + esc(o.phone) + '<br>' + esc(o.email) + '</span></td>' +
        '<td class="small">' + esc(o.address) + '<br>' + esc(o.city) + ' ' + esc(o.postal) + ', ' + esc(o.country) + (o.notes ? '<br><i>' + esc(o.notes) + '</i>' : '') + '</td>' +
        '<td>' + items + '</td><td><b>' + pkr(o.total_pkr) + '</b><br><span class="small">ship ' + pkr(o.shipping_pkr) + '<br>' + esc(o.method) + '</span></td>' +
        '<td><label>Status<select data-f="status">' + STATUSES.map(function (x) { return '<option' + (x === o.status ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select></label>' +
        '<label>Payment<select data-f="pay_status"><option' + (o.pay_status === 'unpaid' ? ' selected' : '') + '>unpaid</option><option' + (o.pay_status === 'paid' ? ' selected' : '') + '>paid</option></select></label></td>' +
        '<td><label>Courier<input data-f="carrier" value="' + esc(o.carrier) + '" placeholder="TCS, Leopards, DHL…"></label><label>Tracking no.<input data-f="tracking" value="' + esc(o.tracking) + '"></label>' +
        '<button class="btn sm" style="margin-top:10px" data-save="' + esc(o.code) + '">Save</button></td></tr>';
    }).join('');
    $('#view').innerHTML = '<div class="stats"><div><b>' + s.orders + '</b><span>Orders (not cancelled)</span></div><div><b>' + pkr(s.revenue_pkr) + '</b><span>Order value</span></div><div><b>' + s.pending + '</b><span>Waiting to be confirmed</span></div><div><b>' + s.lowStock + '</b><span>Pieces with 1 or 0 left</span></div></div>' +
      '<h2>Orders</h2>' + (list.length ? '<div class="tw"><table><thead><tr><th>Order</th><th>Customer</th><th>Ship to</th><th>Items</th><th>Total</th><th>Status</th><th>Shipping</th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '<p class="small">No orders yet.</p>');
  }).catch(function () {});
}
$('#view').addEventListener('click', function (e) {
  var b = e.target.closest('[data-save]'); if (!b) return;
  var tr = b.closest('tr'), body = {};
  Array.prototype.forEach.call(tr.querySelectorAll('[data-f]'), function (f) { body[f.getAttribute('data-f')] = f.value; });
  api('/api/admin/orders/' + encodeURIComponent(b.getAttribute('data-save')), { method: 'PATCH', body: body }).then(function () { toast('Order updated'); }).catch(function (x) { toast(x.message); });
});

/* ---------- products ---------- */
var editing = null, imgs = [];
function viewProducts() {
  api('/api/admin/products').then(function (list) {
    var rows = list.map(function (p) {
      return '<tr><td><img class="thumb" src="' + esc(p.images[0] || '') + '" alt=""></td><td><b>' + esc(p.name) + '</b><br><span class="small">' + esc(p.category) + '</span></td><td>' + pkr(p.price_pkr) + '</td><td>' + p.stock + '</td><td>' + (p.active ? '<span class="pill ok">Live</span>' : '<span class="pill no">Hidden</span>') + '</td>' +
        '<td><button class="ghost" data-edit="' + p.id + '">Edit</button></td></tr>';
    }).join('');
    window.__products = list;
    $('#view').innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center"><h2>Products</h2><button class="btn sm" id="newP">Add product</button></div><div class="tw"><table><thead><tr><th></th><th>Name</th><th>Price</th><th>Stock</th><th>Status</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div><div id="pf"></div>';
    $('#newP').onclick = function () { form(null); };
  });
}
function form(p) {
  editing = p; imgs = p ? p.images.slice() : [];
  $('#pf').innerHTML = '<div class="card" style="margin-top:18px"><h2>' + (p ? 'Edit product' : 'New product') + '</h2><div class="row2">' +
    '<div><label for="p-name">Name</label><input id="p-name" value="' + esc(p ? p.name : '') + '"></div>' +
    '<div><label for="p-cat">Category (blue, clay, kashi or your own)</label><input id="p-cat" value="' + esc(p ? p.category : 'blue') + '"></div>' +
    '<div><label for="p-price">Price (PKR)</label><input id="p-price" type="number" min="0" value="' + (p ? p.price_pkr : '') + '"></div>' +
    '<div><label for="p-weight">Weight (grams, with the piece only)</label><input id="p-weight" type="number" min="0" value="' + (p ? p.weight_g : 1500) + '"></div>' +
    '<div><label for="p-stock">Stock</label><input id="p-stock" type="number" min="0" value="' + (p ? p.stock : 1) + '"></div>' +
    '<div><label for="p-active">Visible in store</label><select id="p-active"><option value="1"' + (!p || p.active ? ' selected' : '') + '>Yes</option><option value="0"' + (p && !p.active ? ' selected' : '') + '>No (hidden)</option></select></div></div>' +
    '<label for="p-desc">Description</label><textarea id="p-desc">' + esc(p ? p.description : '') + '</textarea>' +
    '<label for="p-files">Photos (JPG, PNG or WebP, up to 6 MB each. The first photo is the main one.)</label><input id="p-files" type="file" accept="image/jpeg,image/png,image/webp" multiple><div class="imgs" id="imgs"></div>' +
    '<div id="perr" class="err" hidden></div><div style="display:flex;gap:10px;margin-top:14px"><button class="btn" id="saveP" style="margin:0">Save product</button><button class="ghost" id="cancelP">Cancel</button>' +
    (p ? '<button class="ghost danger" id="delP" style="margin-left:auto">Hide from store</button>' : '') + '</div></div>';
  drawImgs();
  $('#pf').scrollIntoView({ behavior: 'smooth' });
  $('#p-files').onchange = function () {
    var fd = new FormData(); Array.prototype.forEach.call(this.files, function (f) { fd.append('images', f); });
    api('/api/admin/upload', { method: 'POST', form: fd }).then(function (r) { imgs = imgs.concat(r.paths); drawImgs(); }).catch(function (x) { toast(x.message); });
  };
  $('#cancelP').onclick = function () { $('#pf').innerHTML = ''; };
  if (p) $('#delP').onclick = function () { api('/api/admin/products/' + p.id, { method: 'DELETE' }).then(function () { toast('Product hidden'); viewProducts(); }); };
  $('#saveP').onclick = function () {
    var body = { name: $('#p-name').value, category: $('#p-cat').value, price_pkr: $('#p-price').value, weight_g: $('#p-weight').value, stock: $('#p-stock').value, description: $('#p-desc').value, images: imgs, active: $('#p-active').value === '1' };
    api(p ? '/api/admin/products/' + p.id : '/api/admin/products', { method: p ? 'PUT' : 'POST', body: body })
      .then(function () { toast('Product saved'); viewProducts(); }).catch(function (x) { $('#perr').textContent = x.message; $('#perr').hidden = false; });
  };
}
function drawImgs() {
  $('#imgs').innerHTML = imgs.map(function (s, i) { return '<div><img src="' + esc(s) + '" alt=""><button type="button" data-rm="' + i + '" aria-label="Remove photo">×</button></div>'; }).join('');
}
document.addEventListener('click', function (e) {
  var r = e.target.closest('[data-rm]'); if (r) { imgs.splice(+r.getAttribute('data-rm'), 1); drawImgs(); return; }
  var ed = e.target.closest('[data-edit]'); if (ed) form((window.__products || []).filter(function (p) { return p.id === +ed.getAttribute('data-edit'); })[0]);
});

/* ---------- settings ---------- */

/* ---------- pages + contact details ---------- */
function viewPages() {
  Promise.all([api('/api/admin/pages'), api('/api/admin/settings')]).then(function (r) {
    var list = r[0], c = r[1].contact || {};
    window.__pages = list;
    var rows = list.map(function (p) {
      return '<tr><td><b>' + esc(p.title) + '</b><br><span class="small">/#/' + esc(p.slug) + '</span></td><td>' + (p.needsInfo ? '<span class="pill no">Needs your details</span>' : '<span class="pill ok">Ready</span>') + '</td><td>' + (p.footer ? 'Yes' : 'No') + '</td><td><button class="ghost" data-pedit="' + esc(p.slug) + '">Edit</button></td></tr>';
    }).join('');
    $('#view').innerHTML = '<h2>Contact details</h2><div class="card"><p class="small">Shown on the Contact page and used in the page texts. Leave blank anything you do not want to show.</p>' +
      '<div class="row2"><div><label for="c-em">Email</label><input id="c-em" value="' + esc(c.email) + '"></div><div><label for="c-ph">Phone</label><input id="c-ph" value="' + esc(c.phone) + '"></div></div>' +
      '<div class="row2"><div><label for="c-ad">Address or city</label><input id="c-ad" value="' + esc(c.address) + '"></div><div><label for="c-hr">Hours</label><input id="c-hr" value="' + esc(c.hours) + '"></div></div>' +
      '<div class="row2"><div><label for="c-ig">Instagram link (https://...)</label><input id="c-ig" value="' + esc(c.instagram) + '"></div><div><label for="c-fb">Facebook link (https://...)</label><input id="c-fb" value="' + esc(c.facebook) + '"></div></div>' +
      '<div id="cerr" class="err" hidden></div><button class="btn" id="saveC">Save contact details</button></div>' +
      '<div style="display:flex;justify-content:space-between;align-items:center"><h2>Pages</h2><button class="btn sm" id="newPg">Add page</button></div>' +
      '<p class="small">Pages marked "Needs your details" still contain text in [square brackets]. Replace it with your real information.</p>' +
      '<div class="tw"><table><thead><tr><th>Page</th><th>Status</th><th>In footer</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div><div id="pgf"></div>';
    $('#saveC').onclick = function () {
      api('/api/admin/settings', { method: 'PUT', body: { contact: { email: $('#c-em').value, phone: $('#c-ph').value, address: $('#c-ad').value, hours: $('#c-hr').value, instagram: $('#c-ig').value, facebook: $('#c-fb').value } } })
        .then(function () { toast('Contact details saved'); $('#cerr').hidden = true; }).catch(function (x) { $('#cerr').textContent = x.message; $('#cerr').hidden = false; });
    };
    $('#newPg').onclick = function () { pageForm(null); };
  }).catch(function () {});
}
function pageForm(p) {
  var isNew = !p; p = p || { title: '', body: '', footer: 1, builtin: 0 };
  $('#pgf').innerHTML = '<div class="card" style="margin-top:20px"><h3>' + (isNew ? 'New page' : 'Edit: ' + esc(p.title)) + '</h3>' +
    '<label for="pg-t">Title</label><input id="pg-t" value="' + esc(p.title) + '">' +
    '<label for="pg-b">Text</label><textarea id="pg-b" style="min-height:360px;font-family:ui-monospace,monospace">' + esc(p.body) + '</textarea>' +
    '<p class="small">Writing guide: <code>## Heading</code>, <code>### Sub heading</code> (a question on the FAQ page), <code>- list item</code>, <code>**bold**</code>, <code>[link text](https://...)</code>. A blank line starts a new paragraph. You can also use {{email}}, {{phone}}, {{address}}, {{hours}}, {{whatsapp}}, {{brand}}.</p>' +
    '<label><input type="checkbox" id="pg-f"' + (p.footer ? ' checked' : '') + '> Show in footer</label>' +
    '<div id="pgerr" class="err" hidden></div><div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px"><button class="btn" id="pg-save">Save page</button><button class="ghost" id="pg-x">Cancel</button>' +
    (!isNew && p.builtin ? '<button class="ghost" id="pg-reset">Restore original text</button>' : '') + (!isNew && !p.builtin ? '<button class="ghost" id="pg-del">Delete page</button>' : '') + '</div></div>';
  $('#pgf').scrollIntoView({ behavior: 'smooth' });
  function fail(x) { $('#pgerr').textContent = x.message; $('#pgerr').hidden = false; }
  $('#pg-x').onclick = function () { $('#pgf').innerHTML = ''; };
  $('#pg-save').onclick = function () {
    var body = { title: $('#pg-t').value, body: $('#pg-b').value, footer: $('#pg-f').checked };
    (isNew ? api('/api/admin/pages', { method: 'POST', body: body }) : api('/api/admin/pages/' + encodeURIComponent(p.slug), { method: 'PUT', body: body }))
      .then(function () { toast('Page saved'); viewPages(); }).catch(fail);
  };
  if ($('#pg-reset')) $('#pg-reset').onclick = function () { if (confirm('Replace this page with the original text? Your edits will be lost.')) api('/api/admin/pages/' + encodeURIComponent(p.slug) + '/reset', { method: 'POST' }).then(function () { toast('Original text restored'); viewPages(); }).catch(fail); };
  if ($('#pg-del')) $('#pg-del').onclick = function () { if (confirm('Delete this page?')) api('/api/admin/pages/' + encodeURIComponent(p.slug), { method: 'DELETE' }).then(function () { toast('Page deleted'); viewPages(); }).catch(fail); };
}
document.addEventListener('click', function (e) {
  var b = e.target.closest('[data-pedit]'); if (!b) return;
  pageForm((window.__pages || []).filter(function (p) { return p.slug === b.getAttribute('data-pedit'); })[0]);
});

/* ---------- messages from the store forms ---------- */
function viewInquiries() {
  api('/api/admin/inquiries').then(function (list) {
    var rows = list.map(function (q) {
      var ex = ''; try { ex = q.extra || ''; } catch (e) {}
      return '<tr' + (q.is_read ? '' : ' style="font-weight:600"') + '><td class="small">' + esc(q.created_at) + '<br>' + esc(q.type) + '</td><td>' + esc(q.name) + '<br><span class="small">' + esc(q.phone) + '<br>' + esc(q.email) + '</span></td>' +
        '<td>' + (ex ? '<span class="small">' + esc(ex) + '</span><br>' : '') + esc(q.message) + '</td><td><button class="ghost" data-qr="' + q.id + '" data-read="' + (q.is_read ? 0 : 1) + '">' + (q.is_read ? 'Mark unread' : 'Mark read') + '</button> <button class="ghost" data-qd="' + q.id + '">Delete</button></td></tr>';
    }).join('');
    $('#view').innerHTML = '<h2>Messages</h2>' + (list.length ? '<div class="tw"><table><thead><tr><th>When</th><th>From</th><th>Message</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '<p class="small">No messages yet. Contact, wholesale and custom-order forms from the store arrive here.</p>');
  }).catch(function () {});
}
document.addEventListener('click', function (e) {
  var r = e.target.closest('[data-qr]'), d = e.target.closest('[data-qd]');
  if (r) api('/api/admin/inquiries/' + r.getAttribute('data-qr'), { method: 'PUT', body: { read: r.getAttribute('data-read') === '1' } }).then(viewInquiries);
  if (d && confirm('Delete this message?')) api('/api/admin/inquiries/' + d.getAttribute('data-qd'), { method: 'DELETE' }).then(viewInquiries);
});

function viewSettings() {
  api('/api/admin/settings').then(function (s) {
    $('#view').innerHTML = '<h2>Settings</h2><div class="card"><div class="row2"><div><label for="s-brand">Brand name</label><input id="s-brand" value="' + esc(s.brandName) + '"></div>' +
      '<div><label for="s-wa">WhatsApp number (digits with country code, e.g. 923001234567)</label><input id="s-wa" value="' + esc(s.whatsapp) + '"></div></div>' +
      '<h3>Payments</h3><label for="s-bank">Bank transfer details (shown to the customer after ordering)</label><textarea id="s-bank">' + esc(s.payments.bankDetails) + '</textarea>' +
      '<div class="row2"><div><label for="s-jc">JazzCash number</label><input id="s-jc" value="' + esc(s.payments.jazzcash) + '"></div><div><label for="s-ep">Easypaisa number</label><input id="s-ep" value="' + esc(s.payments.easypaisa) + '"></div>' +
      '<div><label for="s-pp">PayPal link (https://paypal.me/yourname, optional)</label><input id="s-pp" value="' + esc(s.payments.paypalLink) + '"></div></div>' +
      '<p class="small">Card payments by Stripe turn on when STRIPE_SECRET_KEY is set in the .env file.</p>' +
      '<h3>Currency rates (1 PKR = how much)</h3><label for="s-cur">One per line, like USD=0.0036</label><textarea id="s-cur">' + Object.keys(s.currencies).filter(function (k) { return k !== 'PKR'; }).map(function (k) { return k + '=' + s.currencies[k]; }).join('\n') + '</textarea>' +
      '<h3>Shipping zones</h3><p class="small">The numbers below are samples. Replace them with your courier\'s real rates. Cost = base + (extra kg × per-kg) + packaging per piece.</p>' +
      '<label for="s-ship">Zones as JSON</label><textarea id="s-ship" style="min-height:260px;font-family:ui-monospace,monospace">' + esc(JSON.stringify(s.shipping, null, 2)) + '</textarea>' +
      '<div id="serr" class="err" hidden></div><button class="btn" id="saveS">Save settings</button></div>';
    $('#saveS').onclick = function () {
      try {
        var cur = {}; $('#s-cur').value.split('\n').forEach(function (l) { var m = l.trim().match(/^([A-Za-z]{3})\s*=\s*([\d.]+)$/); if (m) cur[m[1].toUpperCase()] = Number(m[2]); });
        var body = { brandName: $('#s-brand').value, whatsapp: $('#s-wa').value, currencies: cur, shipping: JSON.parse($('#s-ship').value), sampleData: false,
          payments: { bankDetails: $('#s-bank').value, jazzcash: $('#s-jc').value, easypaisa: $('#s-ep').value, paypalLink: $('#s-pp').value } };
        api('/api/admin/settings', { method: 'PUT', body: body }).then(function () { toast('Settings saved'); $('#serr').hidden = true; })
          .catch(function (x) { $('#serr').textContent = x.message; $('#serr').hidden = false; });
      } catch (x) { $('#serr').textContent = 'Shipping JSON is not valid: ' + x.message; $('#serr').hidden = false; }
    };
  });
}

api('/api/admin/me').then(function (r) { r.admin ? showMain(r.defaultPassword) : showLogin(); });
})();
