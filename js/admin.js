import { auth, db, fs, login, signOut, signInWithEmailAndPassword, sendPasswordResetEmail, sendEmailVerification, EmailAuthProvider, linkWithCredential, reload, onAuthStateChanged, $, esc, okUrl, shrink, LABEL, DEF_CATS, DEF_REFUND, DEF_PRIVACY } from './common.js';

// ===== পপআপ বার্তা: অ্যাডমিনের প্রতিটি কাজের ফলাফল সুন্দর পপআপে দেখায় (ব্রাউজারের alert-এর বদলে) =====
function say(msg, kind = 'ok') {
  const box = $('#say'), t = document.createElement('div'), icon = { ok: 'fa-circle-check', err: 'fa-triangle-exclamation', info: 'fa-circle-info' }[kind] || 'fa-circle-info';
  t.className = 'say-i ' + kind; t.setAttribute('role', kind === 'err' ? 'alert' : 'status');
  const i = document.createElement('i'); i.className = 'fa-solid ' + icon; i.setAttribute('aria-hidden', 'true');
  const s = document.createElement('span'); s.className = 'say-t'; s.textContent = String(msg ?? '');
  const x = document.createElement('button'); x.type = 'button'; x.className = 'say-x'; x.setAttribute('aria-label', 'বন্ধ করুন'); x.textContent = '×'; x.onclick = () => t.remove();
  t.append(i, s, x); box.append(t); while (box.children.length > 4) box.firstChild.remove();
  setTimeout(() => t.remove(), kind === 'err' ? 8000 : 4500);
}
window.alert = m => say(m, 'err'); // বাকি সব alert (যাচাই/ত্রুটি বার্তা) পপআপে লাল হয়ে দেখায়; সফল কাজের বার্তা নিচে say(..., 'ok') দিয়ে
let ORD = [], F = 'All', Q = '', ADV = 130; const PH = {};
// নতুন: একটি অর্ডার খোলা (OPEN), অসংরক্ষিত পরিবর্তন (DIRTY), কতগুলো দেখানো হচ্ছে (SHOW), রিয়েল-টাইম listener (UNSUB)
const SEL = new Set(); let MSGE = false; // SEL = বাল্ক-নির্বাচন, MSGE = বার্তা লেখা চলছে
let OPEN = null, DIRTY = false, SHOW = 30, UNSUB = null, LOADED = false, WANT = null;
const setLocked = b => document.body.classList.toggle('locked', b); // অ্যাডমিন হিসেবে অর্ডার পড়তে পারার আগে ড্যাশবোর্ড লুকানো থাকে
onAuthStateChanged(auth, u => { if (u) $('#me').textContent = u.email + (u.emailVerified ? '' : ' (ইমেইল ভেরিফাইড নয়)'); $('#aOut').hidden = !u; renderPw(u); if (!u) { stopOrders(); renderLogin(); return; } load(); loadSettings(); loadHero(); loadGallery(); loadReviews(); });
const sel = (n, arr, v) => `<select name="${n}">${arr.map(a => `<option value="${a}" ${a === v ? 'selected' : ''}>${LABEL[a] || a}</option>`).join('')}</select>`;
// অর্ডার রিয়েল-টাইম listener: প্রথম স্ন্যাপশট আগের getDocs-এর সমান রিড; এরপর শুধু বদলানো ডকুমেন্ট পড়ে
async function load() { if (UNSUB) { stats(); render(); return; } startOrders(); }
function stopOrders() { setLocked(true); if (UNSUB) UNSUB(); UNSUB = null; LOADED = false; ORD = []; OPEN = null; DIRTY = false; MSGE = false; ntReset(); }
function startOrders() {
  ntLoad(); let first = true;
  UNSUB = fs.onSnapshot(fs.collection(db, 'orders'), snap => {
    ORD = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    const added = first ? [] : snap.docChanges().filter(c => c.type === 'added').map(c => c.doc.id);
    first = false; LOADED = true; setLocked(false);
    ntSync(added); stats(); render(); applyWant();
  }, e => { UNSUB = null; setLocked(true); $('#list').innerHTML = `<p class="note">অনুমতি নেই বা ত্রুটি: ${esc(e.message)}<br>Rules-এ আপনার ইমেইল ঠিক আছে কি না দেখুন।</p>`; verifyBox(); });
}
function stats() {
  const n = s => ORD.filter(o => s.includes(o.status)).length;
  $('#stats').innerHTML = [['মোট অর্ডার', ORD.length], ['নতুন (Pending)', n(['Pending'])], ['চলমান', n(['Accepted', 'InProgress', 'ChangeRequested'])], ['প্রিভিউ পাঠানো', n(['PreviewReady'])], ['শিপ করার জন্য প্রস্তুত', n(['CustomerApproved'])], ['অগ্রিম যাচাই বাকি', ORD.filter(o => o.advanceTrx && o.advanceStatus !== 'Verified').length], ['COD বাকি', ORD.filter(o => ['Shipped', 'Delivered'].includes(o.status) && o.paymentStatus !== 'Paid').length]].map(([l, v]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join('');
}
const dt = o => { try { return o.createdAt ? o.createdAt.toDate().toLocaleString('bn-BD', { dateStyle: 'medium', timeStyle: 'short' }) : ''; } catch { return ''; } };
const filtered = () => ORD.filter(o => (F === 'All' || (F === 'Flag' ? flags().get(o.id)?.warn : o.status === F)) && (!Q || [o.name, o.phone, o.orderNo, o.advanceTrx, o.district, o.upazila].join(' ').toLowerCase().includes(Q)));
const cardEl = id => [...document.querySelectorAll('#list article')].find(a => a.dataset.id === id);
// বিস্তারিত অংশ: আগের কার্ডের ভেতরের ফর্ম/তথ্য হুবহু একই (সেভ, মুছুন, স্লিপ আগের হ্যান্ডলারেই চলে)
const body = o => `<div class="obody"><img class="ph" data-photo="${esc(o.id)}" alt=""><div><div class="ophone"><i class="fa-solid fa-phone" aria-hidden="true"></i> <b>${esc(o.phone)}</b></div>${flagNote(o)}
  <small><i class="fa-solid fa-credit-card" aria-hidden="true"></i> অগ্রিম: ${esc(o.advanceFrom || '—')} · TrxID <b>${esc(o.advanceTrx || '—')}</b><br><i class="fa-solid fa-hashtag" aria-hidden="true"></i> ${esc(o.orderNo || '—')} · <i class="fa-solid fa-palette" aria-hidden="true"></i> ${esc(o.category || '—')} · <i class="fa-solid fa-location-dot" aria-hidden="true"></i> ${esc(o.district)}, ${esc(o.upazila)}, ${esc(o.address)} · <i class="fa-solid fa-money-bill-wave" aria-hidden="true"></i> ${esc(o.paymentMethod || 'COD')}</small>
  ${o.note ? `<div><small>নোট: ${esc(o.note)}</small></div>` : ''}${o.customerComment ? `<div class="badge s-ChangeRequested" style="margin-top:6px"><i class="fa-solid fa-comment" aria-hidden="true"></i> ${esc(o.customerComment)}</div>` : ''}
  ${o.price ? `<div class="badge s-Shipped" style="margin-top:6px"><i class="fa-solid fa-money-bill-wave" aria-hidden="true"></i> COD আদায়যোগ্য: ৳${Math.max(0, o.price - (o.advanceStatus === 'Verified' ? ADV : 0))}${o.advanceStatus === 'Verified' ? '' : ' (অগ্রিম যাচাই বাকি)'}</div>` : ''}
  <div class="af"><label>স্ট্যাটাস${sel('status', Object.keys(LABEL).filter(k => k !== 'CustomerApproved' || o.status === k), o.status)}</label>
  <label>মূল্য (৳)<input name="price" type="number" value="${esc(o.price)}"></label><label>কুরিয়ার<input name="courier" value="${esc(o.courier)}"></label><label>ট্র্যাকিং নম্বর<input name="tracking" value="${esc(o.tracking)}"></label>
  <label>অগ্রিম (বিকাশ)<select name="advanceStatus"><option value="Pending" ${o.advanceStatus !== 'Verified' ? 'selected' : ''}>যাচাই বাকি</option><option value="Verified" ${o.advanceStatus === 'Verified' ? 'selected' : ''}>যাচাইকৃত</option></select></label>
  <label>COD পেমেন্ট${sel('paymentStatus', ['Unpaid', 'Paid'], o.paymentStatus)}</label>
  <label class="w2">প্রিভিউ ছবির লিংক (https://…)<input name="previewUrl" value="${esc(o.previewUrl)}"></label>
  <label class="w2">কুরিয়ার ট্র্যাকিং লিংক (ঐচ্ছিক, https://…)<input name="trackUrl" value="${esc(o.trackUrl)}"></label></div>
  <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap"><button class="sm" data-save data-no="${esc(o.orderNo)}">সেভ করুন</button><button class="sm red" data-delord data-no="${esc(o.orderNo)}"><i class="fa-solid fa-trash" aria-hidden="true"></i> মুছুন</button><button class="sm" data-slip style="background:#555"><i class="fa-solid fa-print" aria-hidden="true"></i> স্লিপ</button></div>${msgBox(o)}</div></div>`;
const card = o => {
  const open = o.id === OPEN, nt = NT.items[o.id], fresh = nt && !nt.read;
  return `<article class="card ord ocard${open ? ' open' : ''}" data-id="${esc(o.id)}"><div class="ohead">
  <h3><input type="checkbox" class="osel" data-sel aria-label="অর্ডার নির্বাচন"${SEL.has(o.id) ? ' checked' : ''}><span class="badge s-${esc(o.status)}">${esc(LABEL[o.status] || o.status)}</span> <b class="ordno">${esc(o.orderNo || '—')}</b>${fresh ? ' <span class="nbadge">নতুন</span>' : ''}</h3>
  <div class="ometa"><span class="oname">${esc(o.name)}</span><small>${esc(dt(o))}</small></div>
  ${flagChips(o)}<button type="button" class="sm odet" data-toggle aria-expanded="${open}">${open ? 'বন্ধ করুন' : 'বিস্তারিত দেখুন'}</button></div>${open ? body(o) : ''}</article>`;
};
async function loadPhoto(im) {
  if (!im) return; const id = im.dataset.photo;
  try { if (!PH[id]) { const d = await fs.getDoc(fs.doc(db, 'orderImages', id)); if (d.exists()) PH[id] = d.data().data; } if (PH[id]) im.src = PH[id]; } catch (e) { console.error(e); }
}
function render() {
  $('#filters').innerHTML = ['All', 'Flag', ...Object.keys(LABEL)].map(k => `<button data-f="${k}" class="${k === F ? 'on' : ''}">${k === 'All' ? 'সব' : k === 'Flag' ? '⚠ সতর্কতা' : LABEL[k]} (${k === 'All' ? ORD.length : k === 'Flag' ? flagCount() : ORD.filter(o => o.status === k).length})</button>`).join('');
  const list = filtered();
  if (OPEN && !ORD.some(o => o.id === OPEN)) { OPEN = null; DIRTY = false; MSGE = false; }
  // সম্পাদনা চলাকালীন (অসংরক্ষিত) খোলা কার্ড লাইভ আপডেটে মুছবে না: DOM নোডটি রেখে দিয়ে আবার বসানো হয়
  const keep = OPEN && (DIRTY || MSGE) ? cardEl(OPEN) : null;
  const act = keep && keep.contains(document.activeElement) ? document.activeElement : null; let ss = null, se = null; try { ss = act?.selectionStart; se = act?.selectionEnd; } catch { /* number ইনপুটে নেই */ }
  const shown = list.slice(0, SHOW);
  if (keep && !shown.some(o => o.id === OPEN)) { const o = ORD.find(x => x.id === OPEN); if (o) shown.unshift(o); }
  if (OPEN && !shown.some(o => o.id === OPEN)) { OPEN = null; DIRTY = false; MSGE = false; }
  $('#count').textContent = list.length ? `${list.length}টি অর্ডার${F !== 'All' || Q ? ' (ফিল্টার অনুযায়ী)' : ''}` : '';
  $('#list').innerHTML = shown.map(card).join('') + (list.length > shown.length ? `<button type="button" class="sm" id="more">আরও দেখান (${list.length - shown.length})</button>` : '') || '<p class="note">এই ফিল্টারে কোনো অর্ডার নেই।</p>';
  updateBulk();
  if (keep) { const n = cardEl(OPEN); if (n) n.replaceWith(keep); if (act) { act.focus({ preventScroll: true }); try { if (ss != null) act.setSelectionRange(ss, se); } catch { /* ঠিক আছে */ } } } else if (OPEN) loadPhoto(cardEl(OPEN)?.querySelector('img[data-photo]'));
}
// একটি অর্ডার খোলা/বন্ধ (একবারে একটিই)
function setOpen(id) {
  if (OPEN && OPEN !== id && DIRTY && !confirm('খোলা অর্ডারে সংরক্ষণ না করা পরিবর্তন আছে। বাদ দিয়ে অন্যটি খুলবেন?')) return false;
  OPEN = id; DIRTY = false; MSGE = false; const i = filtered().findIndex(o => o.id === id); if (i >= SHOW) SHOW = i + 1;
  markRead(id); render(); const c = cardEl(id); if (c) c.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); return true;
}
function openOrder(id) {
  document.querySelector('[data-tab="orders"]').click(); F = 'All'; Q = ''; $('#q').value = '';
  if (ORD.some(o => o.id === id)) { WANT = null; setOpen(id); }
  else if (!LOADED) WANT = id;
  else toast('অর্ডারটি পাওয়া যায়নি (মুছে ফেলা হয়ে থাকতে পারে)');
}
function applyWant() { if (WANT) { const id = WANT; WANT = null; openOrder(id); } }
$('#filters').onclick = e => { const b = e.target.closest('[data-f]'); if (b) { F = b.dataset.f; SHOW = 30; render(); } };
$('#list').onclick = async e => {
  if (e.target.matches('[data-slip]')) { printSlip(ORD.find(x => x.id === e.target.closest('article').dataset.id)); return; }
  if (e.target.matches('[data-delord]')) {
    const id = e.target.closest('article').dataset.id, no = e.target.dataset.no;
    if (!confirm('এই অর্ডার, ক্রেতার ছবি ও ট্র্যাকিং তথ্য স্থায়ীভাবে মুছে যাবে। নিশ্চিত?')) return;
    try { await Promise.all([fs.deleteDoc(fs.doc(db, 'orders', id)), fs.deleteDoc(fs.doc(db, 'orderImages', id))]); if (no) await fs.deleteDoc(fs.doc(db, 'tracks', no)).catch(() => {}); DIRTY = false; MSGE = false; await load(); say(`অর্ডার ${no || ''} মুছে ফেলা হয়েছে`); } catch (err) { alert('মুছতে ত্রুটি: ' + err.message); }
    return;
  }
  if (!e.target.matches('[data-save]')) return; const card = e.target.closest('article'), id = card.dataset.id, g = n => card.querySelector(`[name=${n}]`);
  const url = g('previewUrl').value.trim(); if (url && !okUrl(url)) return alert('লিংক https:// দিয়ে শুরু হতে হবে');
  const tu = g('trackUrl').value.trim(); if (tu && !okUrl(tu)) return alert('ট্র্যাকিং লিংক https:// দিয়ে শুরু হতে হবে');
  const upd = { status: g('status').value, price: Number(g('price').value) || null, courier: g('courier').value, tracking: g('tracking').value, paymentStatus: g('paymentStatus').value, advanceStatus: g('advanceStatus').value, previewUrl: url, trackUrl: tu, updatedAt: fs.serverTimestamp() };
  e.target.disabled = true;
  try {
    await fs.updateDoc(fs.doc(db, 'orders', id), upd);
    if (e.target.dataset.no) await fs.setDoc(fs.doc(db, 'tracks', e.target.dataset.no), { status: upd.status, courier: upd.courier, tracking: upd.tracking, trackUrl: tu, updatedAt: fs.serverTimestamp() }, { merge: true }).catch(() => {});
    DIRTY = false; MSGE = false; await load(); say(`অর্ডার ${e.target.dataset.no || ''} সেভ হয়েছে (স্ট্যাটাস: ${LABEL[upd.status] || upd.status})`);
  } catch (err) { alert('ত্রুটি: ' + err.message); e.target.disabled = false; }
};
$('#gForm').onsubmit = async e => {
  e.preventDefault(); const f = e.target;
  let img; try { img = await shrink(f.img.files[0], 800); } catch { return alert('ছবি পড়া যায়নি। JPG বা PNG ছবি দিন (HEIC/WebP-এর কিছু ধরন চলে না)।'); }
  try { await fs.addDoc(fs.collection(db, 'gallery'), { img, title: f.title.value, price: Number(f.price.value) }); say('গ্যালারিতে ছবি যোগ হয়েছে'); f.reset(); loadGallery(); }
  catch (err) { alert(err.code === 'permission-denied' ? 'অনুমতি নেই: Rules-এ আপনার ইমেইল ঠিক আছে কি না, Rules Publish করেছেন কি না, এবং ওপরে দেখানো ইমেইল দিয়েই লগইন করেছেন কি না দেখুন।' : 'ত্রুটি: ' + err.message); }
};

// ট্যাব
document.querySelector('.tabs').onclick = e => { const b = e.target.closest('[data-tab]'); if (!b) return; document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x === b)); document.querySelectorAll('.pane').forEach(p => p.hidden = p.id !== 't-' + b.dataset.tab); };
// সেটিংস
const SF = ['h1a', 'h1b', 'lead', 'noticeTitle', 'notice', 'phone', 'whatsapp', 'messenger', 'facebook', 'footer', 'refundText', 'privacyText', 'leadTime', 'advanceAmount', 'bkashNo'];
let NS = { t: '', b: '', id: '' }; // সর্বশেষ প্রকাশিত ঘোষণা (বদলেছে কি না বোঝার জন্য)
async function loadSettings() { const s = (await fs.getDoc(fs.doc(db, 'settings', 'site'))).data() || {}; const f = $('#sForm'); SF.forEach(k => f[k].value = s[k] ?? ''); NS = { t: String(s.noticeTitle ?? '').trim(), b: String(s.notice ?? '').trim(), id: String(s.noticeId ?? '') }; ADV = Number(s.advanceAmount) || 130; if (ORD.length) render();
  if (!f.refundText.value) f.refundText.value = DEF_REFUND; if (!f.privacyText.value) f.privacyText.value = DEF_PRIVACY;
  CATS = Array.isArray(s.cats) ? s.cats.map(c => ({ ...c })) : (typeof s.cats === 'string' && s.cats ? s.cats.split('\n').map(x => { const [n, p, pm, ds] = x.split('|'); return { n: (n || '').trim(), p: (p || '').trim(), pmax: (pm || '').trim(), d: (ds || '').trim(), img: '' }; }) : catDef()); renderCats(); f.orderOpen.checked = s.orderOpen !== false; }
$('#sForm').onsubmit = async e => {
  e.preventDefault(); const f = e.target, v = { orderOpen: f.orderOpen.checked, updatedAt: fs.serverTimestamp() }; SF.forEach(k => v[k] = f[k].value.trim());
  v.noticeTitle = v.noticeTitle.slice(0, 80); v.notice = v.notice.slice(0, 1000); // ঘোষণা: লেখা বদলালে বা "আবার দেখান" টিক দিলে নতুন আইডি → ভিজিটররা আবার দেখবেন
  v.noticeId = v.notice ? ((v.noticeTitle !== NS.t || v.notice !== NS.b || f.noticeRe.checked || !NS.id) ? String(Date.now()) : NS.id) : NS.id;
  v.cats = CATS.filter(c => String(c.n).trim()).map(c => ({ n: String(c.n).trim(), d: String(c.d || '').trim().slice(0, 60), p: Number(c.p) || 0, pmax: Number(c.pmax) || 0, pf: Number(c.pf) || 0, img: c.img || '' }));
  const bad = v.cats.find(c => c.pmax && c.pmax < c.p); if (bad) return alert(`"${bad.n}": সর্বোচ্চ মূল্য সর্বনিম্ন মূল্যের চেয়ে কম হতে পারে না`);
  v.advanceAmount = Number(v.advanceAmount) || null;
  if (v.facebook && !okUrl(v.facebook)) return alert('Facebook লিংক https:// দিয়ে শুরু হতে হবে');
  try { await fs.setDoc(fs.doc(db, 'settings', 'site'), v); NS = { t: v.noticeTitle, b: v.notice, id: v.noticeId }; f.noticeRe.checked = false; say('সেটিংস সেভ হয়েছে — সাইটে কার্যকর হবে'); } catch (err) { alert('ত্রুটি: ' + err.message); }
};
// গ্যালারি ব্যবস্থাপনা
async function loadGallery() {
  const g = await fs.getDocs(fs.collection(db, 'gallery'));
  $('#gList').innerHTML = g.docs.map(d => ({ id: d.id, ...d.data() })).map(x => `<figure><img src="${esc(x.img)}" alt=""><figcaption><span>${esc(x.title)} ৳${esc(x.price)}</span><button class="sm red" data-del="${esc(x.id)}">মুছুন</button></figcaption></figure>`).join('') || '<p class="note">গ্যালারি খালি।</p>';
}
$('#gList').onclick = async e => { const b = e.target.closest('[data-del]'); if (b && confirm('মুছে ফেলবেন?')) { try { await fs.deleteDoc(fs.doc(db, 'gallery', b.dataset.del)); say('গ্যালারি থেকে ছবি মুছে ফেলা হয়েছে'); loadGallery(); } catch (err) { alert('ত্রুটি: ' + err.message); } } };
// কাজের ধরন ও মূল্য সম্পাদক (ছোট ছবিসহ)
let CATS = [];
const catDef = () => DEF_CATS.split('\n').map(x => { const [n, p, pm, ds] = x.split('|'); return { n, p: p || '', pmax: pm || '', pf: '', d: ds || '', img: '' }; });
function renderCats() { $('#catRows').innerHTML = CATS.map((c, i) => `<div class="crow" data-i="${i}">${c.img ? `<img src="${esc(c.img)}" alt="">` : '<span><i class="fa-regular fa-image" aria-hidden="true"></i></span>'}<input data-k="n" value="${esc(c.n)}" placeholder="নাম"><input data-k="d" maxlength="60" value="${esc(c.d)}" placeholder="বর্ণনা (যেমন: একজনের ছবি)"><input data-k="p" type="number" min="0" value="${esc(c.p)}" placeholder="সর্বনিম্ন ৳"><input data-k="pmax" type="number" min="0" value="${esc(c.pmax)}" placeholder="সর্বোচ্চ ৳"><input data-k="pf" type="number" min="0" value="${esc(c.pf)}" placeholder="ফ্রেমসহ মূল্য ৳ (ঐচ্ছিক)"><input data-k="img" type="file" accept="image/*"><button type="button" class="sm red" data-rm="${i}"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></div>`).join(''); }
$('#catRows').oninput = e => { const r = e.target.closest('.crow'), k = e.target.dataset.k; if (r && k && k !== 'img') CATS[r.dataset.i][k] = e.target.value; };
$('#catRows').onchange = async e => { if (e.target.dataset.k !== 'img') return; const r = e.target.closest('.crow'), f = e.target.files[0]; if (!f) return; try { CATS[r.dataset.i].img = await shrink(f, 360, .7); renderCats(); } catch { alert('ছবি পড়া যায়নি (JPG/PNG দিন)'); } };
$('#catRows').onclick = e => { const b = e.target.closest('[data-rm]'); if (b) { CATS.splice(+b.dataset.rm, 1); renderCats(); } };
$('#addCat').onclick = () => { if (CATS.length >= 8) return alert('সর্বোচ্চ ৮টি ধরন'); CATS.push({ n: '', d: '', p: '', pmax: '', pf: '', img: '' }); renderCats(); };
$('#q').oninput = e => { Q = e.target.value.trim().toLowerCase(); SHOW = 30; render(); };
// ডেলিভারি স্লিপ প্রিন্ট
function printSlip(o) {
  const w = window.open('', '_blank', 'width=420,height=640'); if (!w) return alert('পপআপ অনুমতি দিন');
  const due = o.price ? Math.max(0, o.price - (o.advanceStatus === 'Verified' ? ADV : 0)) : null;
  w.document.write(`<html lang="bn"><head><meta charset="utf-8"><title>${esc(o.orderNo)}</title><style>body{font-family:system-ui,'Noto Sans Bengali',sans-serif;padding:16px;font-size:15px}h2{margin:0 0 6px}table{width:100%;border-collapse:collapse;margin-top:8px}td{padding:6px 0;border-bottom:1px dashed #999;vertical-align:top}td:first-child{width:32%;color:#555}.cod{font-size:22px;font-weight:700;border:2px solid #000;padding:10px;text-align:center;margin-top:14px}</style></head><body><h2>পাতার ছবি</h2><div>অর্ডার: <b>${esc(o.orderNo)}</b></div><table><tr><td>প্রাপক</td><td>${esc(o.name)}</td></tr><tr><td>মোবাইল</td><td>${esc(o.phone)}</td></tr><tr><td>ঠিকানা</td><td>${esc(o.address)}, ${esc(o.upazila)}, ${esc(o.district)}</td></tr><tr><td>পণ্য</td><td>${esc(o.category)} (হাতে তৈরি শিল্পকর্ম)</td></tr>${o.courier ? `<tr><td>কুরিয়ার</td><td>${esc(o.courier)} ${esc(o.tracking)}</td></tr>` : ''}${o.note ? `<tr><td>নোট</td><td>${esc(o.note)}</td></tr>` : ''}</table><div class="cod">${due === null ? 'মূল্য নির্ধারণ বাকি' : 'COD আদায়: ৳' + due}</div>${o.advanceStatus === 'Verified' ? '' : '<p>সতর্কতা: অগ্রিম যাচাই বাকি</p>'}<script>setTimeout(() => print(), 300)<\/script></body></html>`);
  w.document.close();
}
// রিভিউ ব্যবস্থাপনা
async function loadReviews() {
  const s = await fs.getDocs(fs.collection(db, 'reviews'));
  $('#rvList').innerHTML = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)).map(x => `<article class="card" data-id="${esc(x.id)}"><b>${esc(x.name1)}</b> <span class="stars">${'<i class="fa-solid fa-star" aria-hidden="true"></i>'.repeat(x.rating)}${'<i class="fa-regular fa-star" aria-hidden="true"></i>'.repeat(5 - x.rating)}</span> <span class="badge ${x.approved ? 's-Delivered' : 's-Pending'}">${x.approved ? 'সাইটে দেখানো হচ্ছে' : 'অনুমোদনের অপেক্ষায়'}</span><p>${esc(x.text) || '(মন্তব্য নেই)'}</p><button class="sm" data-ap="${x.approved ? 0 : 1}">${x.approved ? 'লুকান' : 'অনুমোদন দিন'}</button> <button class="sm red" data-rdel>মুছুন</button></article>`).join('') || '<p class="note">এখনো কোনো রিভিউ নেই।</p>';
}
$('#rvList').onclick = async e => {
  const c = e.target.closest('article'); if (!c) return; const id = c.dataset.id;
  try {
    let m;
    if (e.target.dataset.ap !== undefined) { await fs.updateDoc(fs.doc(db, 'reviews', id), { approved: e.target.dataset.ap === '1' }); m = e.target.dataset.ap === '1' ? 'রিভিউ অনুমোদিত — এখন সাইটে দেখানো হবে' : 'রিভিউ সাইট থেকে লুকানো হয়েছে'; }
    else if (e.target.matches('[data-rdel]')) { if (!confirm('মুছে ফেলবেন?')) return; await fs.deleteDoc(fs.doc(db, 'reviews', id)); m = 'রিভিউ মুছে ফেলা হয়েছে'; }
    else return;
    loadReviews(); say(m);
  } catch (err) { alert('ত্রুটি: ' + err.message); }
};

// হিরো সার্কেলের ছবি + অবস্থান/জুম: settings/hero ডকুমেন্টে (img, zoom, ox, oy); বিদ্যমান settings/site-এ হাত দেয় না; Blaze/Storage লাগে না
let HERO = null; const HMAX = 600000;
async function heroEncode(file) {
  const b = await createImageBitmap(file);
  for (const max of [900, 720, 560, 420]) {
    const s = Math.min(1, max / Math.max(b.width, b.height)), c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(b.width * s)); c.height = Math.max(1, Math.round(b.height * s));
    const g = c.getContext('2d'); g.drawImage(b, 0, 0, c.width, c.height);
    let out = c.toDataURL('image/webp', .86);
    if (!out.startsWith('data:image/webp')) { g.globalCompositeOperation = 'destination-over'; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); out = c.toDataURL('image/jpeg', .86); }
    if (out.length <= HMAX) return out;
  }
  throw new Error('big');
}
const HS = { src: '', shown: '', z: 1, ox: 0, oy: 0, dirty: false, edit: false };
const hn = (v, lo, hi, d) => { v = Number(v); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
function heroDraw() {
  const im = $('#hImg'), has = !!HS.src; $('#hDef').hidden = has; im.style.display = has ? '' : 'none';
  if (has) { if (HS.shown !== HS.src) { im.setAttribute('href', HS.src); HS.shown = HS.src; } const w = 356 * HS.z; im.setAttribute('width', w); im.setAttribute('height', w); im.setAttribute('x', 200 + HS.ox - w / 2); im.setAttribute('y', 200 + HS.oy - w / 2); } // হোমপেজের একই সূত্র
  $('#hZoom').value = Math.round(HS.z * 100); $('#hZv').textContent = Math.round(HS.z * 100) + '%';
  ['#hZm', '#hZp', '#hZoom', '#hPos', '#hLock'].forEach(q => $(q).disabled = !has); if (!has) HS.edit = false;
  $('#hPrev').classList.toggle('edit', HS.edit); $('#hLock').textContent = HS.edit ? '✔ সরানো চালু — শেষ হলে এখানে চেপে বন্ধ করুন' : '✋ ছবি সরানো/জুম চালু করুন'; $('#hLock').setAttribute('aria-pressed', String(HS.edit)); $('#hSave').disabled = !(has && HS.dirty);
}
function heroSet(z, ox, oy) { HS.z = hn(z, .3, 4, 1); HS.ox = hn(ox, -300, 300, 0); HS.oy = hn(oy, -300, 300, 0); HS.dirty = true; heroDraw(); }
async function loadHero() {
  try {
    const d = await fs.getDoc(fs.doc(db, 'settings', 'hero')), h = d.data() || {}, i = h.img, ok = typeof i === 'string' && i.startsWith('data:image/');
    HS.src = ok ? i : ''; HS.z = hn(h.zoom, .3, 4, 1); HS.ox = hn(h.ox, -300, 300, 0); HS.oy = hn(h.oy, -300, 300, 0); HS.dirty = false; HERO = null; HS.edit = false;
    heroDraw(); $('#hInfo').textContent = ok ? 'বর্তমানে কাস্টম ছবি চালু আছে। টেনে সরিয়ে বা জুম করে "ছবি সেভ করুন" চাপলে নতুন অবস্থান সেভ হবে।' : 'বর্তমানে ডিফল্ট ছবি চালু আছে।';
  } catch (e) { console.error(e); }
}
$('#hFile').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  if (!/^image\/(jpeg|png|webp)$/.test(f.type) || f.size > 15e6) { e.target.value = ''; return alert('১৫MB-এর মধ্যে JPG, PNG বা WebP ছবি দিন'); }
  try { HERO = await heroEncode(f); HS.src = HERO; HS.z = 1; HS.ox = 0; HS.oy = 0; HS.dirty = true; heroDraw(); $('#hInfo').textContent = `প্রিভিউ — আকার ≈ ${Math.round(HERO.length / 1024)} KB। ছবিটি টেনে সরান বা জুম করুন, ঠিক থাকলে "ছবি সেভ করুন" চাপুন।`; }
  catch { e.target.value = ''; alert('ছবি প্রসেস করা যায়নি বা অনেক বড়। অন্য ছবি বা ছোট সাইজ দিন।'); }
};
// টেনে সরানো (মাউস/আঙুল), দুই আঙুলে পিঞ্চ-জুম, মাউস হুইল, কীবোর্ড
{
  const sv = $('#hSvg'), ptr = new Map(); let pinch = 0;
  const dist = () => { const [a, b] = [...ptr.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  // আঙুলে স্ক্রল করতে গিয়ে ছবি যেন না নড়ে: টাচে শুধু "সরানো চালু" মোডে ড্র্যাগ কাজ করে (মাউস সবসময়)
  sv.addEventListener('pointerdown', e => { if (!HS.src || (e.pointerType !== 'mouse' && !HS.edit)) return; try { sv.setPointerCapture(e.pointerId); } catch { /* ঠিক আছে */ } ptr.set(e.pointerId, { x: e.clientX, y: e.clientY }); pinch = ptr.size === 2 ? dist() : 0; sv.classList.add('grab'); });
  sv.addEventListener('pointermove', e => {
    const p = ptr.get(e.pointerId); if (!p) return; const k = 400 / (sv.getBoundingClientRect().width || 400), dx = (e.clientX - p.x) * k, dy = (e.clientY - p.y) * k;
    p.x = e.clientX; p.y = e.clientY;
    if (ptr.size === 1) heroSet(HS.z, HS.ox + dx, HS.oy + dy);
    else if (ptr.size === 2) { const d = dist(); if (pinch) heroSet(HS.z * d / pinch, HS.ox, HS.oy); pinch = d; }
  });
  const end = e => { ptr.delete(e.pointerId); pinch = 0; if (!ptr.size) sv.classList.remove('grab'); };
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => sv.addEventListener(t, end));
  sv.addEventListener('wheel', e => { if (!HS.src || !(HS.edit || e.ctrlKey)) return; e.preventDefault(); heroSet(HS.z * (e.deltaY < 0 ? 1.08 : 1 / 1.08), HS.ox, HS.oy); }, { passive: false });
  $('#hPrev').addEventListener('keydown', e => {
    if (!HS.src) return; const st = e.shiftKey ? 15 : 4, m = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, -st], ArrowDown: [0, st] }[e.key];
    if (m) { e.preventDefault(); heroSet(HS.z, HS.ox + m[0], HS.oy + m[1]); } else if (e.key === '+' || e.key === '=') { e.preventDefault(); heroSet(HS.z * 1.1, HS.ox, HS.oy); } else if (e.key === '-') { e.preventDefault(); heroSet(HS.z / 1.1, HS.ox, HS.oy); }
  });
  $('#hZoom').oninput = e => heroSet(e.target.value / 100, HS.ox, HS.oy);
  $('#hZm').onclick = () => heroSet(HS.z / 1.1, HS.ox, HS.oy); $('#hZp').onclick = () => heroSet(HS.z * 1.1, HS.ox, HS.oy);
  $('#hPos').onclick = () => heroSet(1, 0, 0);
  $('#hLock').onclick = () => { if (HS.src) { HS.edit = !HS.edit; heroDraw(); } };
}
$('#hSave').onclick = async e => {
  if (!HS.src) return; e.target.disabled = true;
  try { await fs.setDoc(fs.doc(db, 'settings', 'hero'), { img: HERO || HS.src, zoom: Math.round(HS.z * 1000) / 1000, ox: Math.round(HS.ox * 10) / 10, oy: Math.round(HS.oy * 10) / 10, updatedAt: fs.serverTimestamp() }); say('হিরো ছবি ও অবস্থান সেভ হয়েছে'); $('#hFile').value = ''; HERO = null; loadHero(); }
  catch (err) { alert(err.code === 'permission-denied' ? 'অনুমতি নেই: অ্যাডমিন ইমেইল দিয়ে লগইন করেছেন কি না দেখুন।' : 'ত্রুটি: ' + err.message); e.target.disabled = false; }
};
$('#hReset').onclick = async () => {
  if (!confirm('কাস্টম ছবি সরিয়ে ডিফল্ট ছবিতে ফিরবেন?')) return;
  try { await fs.deleteDoc(fs.doc(db, 'settings', 'hero')); $('#hFile').value = ''; HERO = null; HS.src = ''; HS.dirty = false; loadHero(); say('ডিফল্ট হিরো ছবি ফিরিয়ে আনা হয়েছে'); } catch (err) { alert('ত্রুটি: ' + err.message); }
};

// ===== নতুন অর্ডারের নোটিফিকেশন (বেল, ব্যাজ, Read/Unread, ব্রাউজার নোটিফিকেশন) =====
// Read/Unread অবস্থা এই ডিভাইসের localStorage-এ থাকে (Firestore/Rules বদলাতে হয় না)।
// প্রতিটি অর্ডারের জন্য ঠিক একটি এন্ট্রি (কী = অর্ডারের ডকুমেন্ট আইডি), তাই ডুপ্লিকেট হয় না।
let NT = { items: {} };
const NKEY = () => 'pc_admin_notifs_v1:' + (auth.currentUser?.uid || 'x');
function ntLoad() {
  try { const j = JSON.parse(localStorage.getItem(NKEY()) || 'null'); NT = { items: j && j.items && typeof j.items === 'object' ? j.items : {} }; }
  catch { NT = { items: {} }; }
  renderBell();
}
function ntSave() { try { localStorage.setItem(NKEY(), JSON.stringify(NT)); } catch { /* স্টোরেজ বন্ধ থাকলে শুধু এই সেশনে কাজ করবে */ } }
function ntReset() { NT = { items: {} }; renderBell(); }
const msOf = o => { try { return o.createdAt?.toMillis?.() || Date.now(); } catch { return Date.now(); } };
// অর্ডার তালিকার সঙ্গে মিলিয়ে নোটিফিকেশন আপডেট। added = এই স্ন্যাপশটে নতুন যুক্ত হওয়া আইডি (প্রথম লোডে খালি)
function ntSync(added) {
  const items = NT.items, live = new Map(ORD.map(o => [o.id, o])), fresh = []; let changed = false;
  for (const o of ORD) {
    if (o.status === 'Pending' && !items[o.id]) { items[o.id] = { no: o.orderNo || '', name: o.name || '', ts: msOf(o), read: false }; changed = true; if (added.includes(o.id)) fresh.push(o); }
  }
  for (const id of Object.keys(items)) {
    if (!live.has(id)) { delete items[id]; changed = true; }
    else if (!items[id].read && live.get(id).status !== 'Pending') { items[id].read = true; changed = true; } // অর্ডারে হাত পড়েছে → পড়া ধরা হলো
  }
  const ids = Object.keys(items).sort((a, b) => (items[b].ts || 0) - (items[a].ts || 0));
  ids.slice(60).forEach(id => { if (items[id].read) { delete items[id]; changed = true; } });
  if (changed) ntSave(); renderBell();
  if (fresh.length) announce(fresh);
}
const unreadN = () => Object.values(NT.items).filter(x => !x.read).length;
function markRead(id, v = true) { const x = NT.items[id]; if (x && x.read !== v) { x.read = v; ntSave(); renderBell(); } }
const fmtT = t => { try { return new Date(Number(t)).toLocaleString('bn-BD', { dateStyle: 'medium', timeStyle: 'short' }); } catch { return ''; } };
function renderBell() {
  const n = unreadN(), b = $('#bellN'); if (!b) return;
  b.hidden = !n; b.textContent = n > 99 ? '99+' : String(n);
  $('#bell').setAttribute('aria-label', n ? `নোটিফিকেশন, ${n}টি অপঠিত` : 'নোটিফিকেশন');
  document.title = (n ? `(${n}) ` : '') + 'অ্যাডমিন – পাতার ছবি';
  if (!$('#npanel').hidden) renderPanel();
}
function permHtml() {
  if (!('Notification' in window)) return '<small>এই ব্রাউজারে ব্রাউজার-নোটিফিকেশন সমর্থিত নয়।</small>';
  const p = Notification.permission;
  if (p === 'granted') return '<small><i class="fa-solid fa-circle-check" aria-hidden="true"></i> ব্রাউজার নোটিফিকেশন চালু (অ্যাডমিন পেজ খোলা/ব্যাকগ্রাউন্ডে থাকলে আসবে)</small>';
  if (p === 'denied') return '<small>নোটিফিকেশন ব্লক করা আছে। ব্রাউজারের সাইট সেটিংস থেকে অনুমতি দিন।</small>';
  return '<button type="button" class="sm" data-nperm><i class="fa-solid fa-bell" aria-hidden="true"></i> ব্রাউজার নোটিফিকেশন চালু করুন</button>';
}
function renderPanel() {
  const items = NT.items, ids = Object.keys(items).sort((a, b) => (items[b].ts || 0) - (items[a].ts || 0)).slice(0, 30), n = unreadN();
  $('#npanel').innerHTML = `<div class="nh"><b>নোটিফিকেশন${n ? ` (${n})` : ''}</b><button type="button" class="sm" data-nall ${n ? '' : 'disabled'}>সব পড়া হয়েছে</button></div><div class="np">${permHtml()}</div><div class="nl">${ids.map(id => { const x = items[id]; return `<div class="ni${x.read ? '' : ' unread'}"><button type="button" class="nmain" data-nopen="${esc(id)}"><b>${esc(x.no || 'নতুন অর্ডার')}</b><span>${esc(x.name)}</span><small>${esc(fmtT(x.ts))}</small></button><button type="button" class="ntog" data-ntog="${esc(id)}" title="${x.read ? 'অপঠিত করুন' : 'পড়া হয়েছে'}" aria-label="${x.read ? 'অপঠিত করুন' : 'পড়া হয়েছে হিসেবে চিহ্নিত করুন'}"><i class="fa-${x.read ? 'regular' : 'solid'} fa-envelope${x.read ? '' : '-open'}" aria-hidden="true"></i></button></div>`; }).join('') || '<p class="note">কোনো নোটিফিকেশন নেই।</p>'}</div>`;
}
function closePanel() { const p = $('#npanel'); if (p.hidden) return; p.hidden = true; $('#bell').setAttribute('aria-expanded', 'false'); }
$('#bell').onclick = e => {
  e.stopPropagation(); const p = $('#npanel');
  if (!p.hidden) return closePanel();
  renderPanel(); p.style.top = Math.round($('.top').getBoundingClientRect().bottom + 6) + 'px'; p.hidden = false; $('#bell').setAttribute('aria-expanded', 'true');
};
document.addEventListener('click', e => { const p = $('#npanel'); if (!p.hidden && !e.composedPath().includes(p) && !e.composedPath().includes($('#bell'))) closePanel(); }); // composedPath: প্যানেলের ভেতরের বাটন রি-রেন্ডারে DOM থেকে খুলে গেলেও ভেতরের ক্লিক ধরা পড়ে
document.addEventListener('keydown', e => { if (e.key === 'Escape') closePanel(); });
$('#npanel').onclick = e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.nopen !== undefined) { closePanel(); openOrder(b.dataset.nopen); }
  else if (b.dataset.ntog !== undefined) markRead(b.dataset.ntog, !NT.items[b.dataset.ntog]?.read);
  else if (b.dataset.nall !== undefined) { Object.values(NT.items).forEach(x => x.read = true); ntSave(); renderBell(); say('সব নোটিফিকেশন পড়া হিসেবে চিহ্নিত হয়েছে'); }
  else if (b.dataset.nperm !== undefined) { try { Promise.resolve(Notification.requestPermission()).then(p => { renderPanel(); if (p === 'granted') say('ব্রাউজার নোটিফিকেশন চালু হয়েছে'); else say('নোটিফিকেশনের অনুমতি দেওয়া হয়নি', 'info'); }, renderPanel); } catch { renderPanel(); } }
};
// অন্য ট্যাবে বদল হলে এখানেও মেলানো
addEventListener('storage', e => { if (e.key === NKEY()) ntLoad(); });

// পপ-আপ (টোস্ট) ও ব্রাউজার নোটিফিকেশন
function toast(msg, id) {
  const t = document.createElement('button'); t.type = 'button'; t.className = 'toast';
  const i = document.createElement('i'); i.className = 'fa-solid fa-bell'; i.setAttribute('aria-hidden', 'true'); t.append(i, ' ', document.createTextNode(msg));
  t.onclick = () => { t.remove(); if (id) openOrder(id); };
  const box = $('#toasts'); box.append(t); while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => t.remove(), 9000);
}
function announce(list) {
  const one = list.length === 1 ? list[0] : null;
  const fl = one ? flags().get(one.id) : null, title = one ? 'নতুন অর্ডার এসেছে' : `${list.length}টি নতুন অর্ডার এসেছে`, text = one ? `${one.name || ''} · ${one.orderNo || ''}${fl && fl.trx.length ? ' ⚠ একই TrxID আগে ব্যবহৃত' : fl && fl.warn ? ' ⚠ সতর্কতা' : ''}` : 'অ্যাডমিন প্যানেলে দেখুন';
  toast(one ? `${title}: ${text}` : title, one ? one.id : null);
  osNotify(title, text, one ? 'order-' + one.id : 'orders-batch', one ? one.id : null);
}
async function osNotify(title, body, tag, id) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (document.visibilityState === 'visible' && document.hasFocus()) return; // পেজ সামনে থাকলে টোস্টই যথেষ্ট
  try {
    const reg = 'serviceWorker' in navigator ? await Promise.race([navigator.serviceWorker.ready, new Promise(r => setTimeout(r, 2500))]) : null;
    if (reg && reg.showNotification) { await reg.showNotification(title, { body, tag, data: { id } }); return; }
  } catch { /* নিচে সাধারণ Notification দিয়ে চেষ্টা */ }
  try { const n = new Notification(title, { body, tag }); n.onclick = () => { focus(); if (id) openOrder(id); n.close(); }; } catch { /* Android Chrome-এ সরাসরি new Notification চলে না; Service Worker লাগে */ }
}
// Service Worker (শুধু নোটিফিকেশন-ক্লিক সামলায়; কোনো ক্যাশ/ফেচ করে না)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
  navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.type === 'open-order' && e.data.id) openOrder(e.data.id); });
}
// নোটিফিকেশন ক্লিকে খোলা লিংক: admin.html#o=<অর্ডার আইডি>
{ const m = location.hash.match(/^#o=(.+)$/); if (m) { try { WANT = decodeURIComponent(m[1]); } catch { WANT = null; } history.replaceState(null, '', location.pathname + location.search); } }

// কার্ড খোলা/বন্ধ ও অসংরক্ষিত পরিবর্তন ট্র্যাক
$('#list').addEventListener('click', e => {
  if (e.target.closest('#more')) { SHOW += 30; render(); return; }
  if (e.target.closest('[data-sel]')) return; const h = e.target.closest('.ohead'); if (!h) return;
  const id = h.closest('article').dataset.id;
  if (OPEN === id) { if (DIRTY && !confirm('এই অর্ডারে সংরক্ষণ না করা পরিবর্তন আছে। বাদ দিয়ে বন্ধ করবেন?')) return; OPEN = null; DIRTY = false; MSGE = false; render(); }
  else setOpen(id);
});
['input', 'change'].forEach(t => $('#list').addEventListener(t, e => { if (e.target.closest('.msgbox')) MSGE = true; else if (e.target.closest('.obody')) DIRTY = true; }));

// প্রস্তাবিত ৪টি ধরন একবারে বসানো (সেভ না করা পর্যন্ত সাইটে বদলায় না; একই নামের ধরনের ছবি থাকলে রাখা হয়)
$('#catDefBtn').onclick = () => {
  if (!confirm('বর্তমান ধরনগুলো বদলে ৪টি নতুন ধরন (Single/Family/Couple Portrait, Name Art) বসবে। একই নামের ধরনের ছবি থাকলে রাখা হবে, বাকি ছবি বাদ যাবে। "সেটিংস সেভ করুন" না চাপা পর্যন্ত সাইটে কিছু বদলাবে না। এগোবেন?')) return;
  const old = new Map(CATS.map(c => [String(c.n).trim().toLowerCase(), c.img || '']));
  CATS = catDef().map(c => ({ ...c, img: old.get(c.n.toLowerCase()) || '' })); renderCats(); say('৪টি ধরন বসানো হয়েছে — সাইটে কার্যকর করতে নিচে "সেটিংস সেভ করুন" চাপুন', 'info');
};

// ===== ক্রেতাকে এক-ক্লিকে বার্তা (কপি / WhatsApp / SMS) — সার্ভার লাগে না =====
const MSGK = ['Pending', 'Accepted', 'InProgress', 'PreviewReady', 'ChangeRequested', 'CustomerApproved', 'Shipped', 'Delivered', 'Rejected', 'Cancelled'];
function msgText(k, o, card) {
  const v = n => { const e = card && card.querySelector(`[name=${n}]`); return e ? e.value.trim() : String(o[n] ?? '').trim(); };
  const track = new URL('track.html?no=' + encodeURIComponent(o.orderNo || ''), location.href).href, site = new URL('./', location.href).href;
  const price = Number(v('price')) || 0, adv = o.advanceStatus === 'Verified' ? ADV : 0, due = Math.max(0, price - adv);
  const ship = [v('courier') && `কুরিয়ার: ${v('courier')}`, v('tracking') && `ট্র্যাকিং নম্বর: ${v('tracking')}`, v('trackUrl') && `ট্র্যাকিং লিংক: ${v('trackUrl')}`].filter(Boolean).join('\n');
  const money = price ? `মোট মূল্য ৳${price}${adv ? `, অগ্রিম ৳${adv} পেয়েছি` : ''}। পণ্য হাতে পেয়ে বাকি ৳${due} দেবেন।` : 'পণ্য হাতে পেয়ে বাকি টাকা দেবেন।';
  const hi = `আসসালামু আলাইকুম ${o.name || ''},`, no = o.orderNo || '';
  const T = {
    Pending: `${hi}\nআপনার অর্ডার ${no} পেয়েছি। অগ্রিম যাচাই করে শীঘ্রই জানাব।\nঅর্ডারের অবস্থা: ${track}`,
    Accepted: `${hi}\nআপনার অর্ডার ${no} গ্রহণ করা হয়েছে। কাজ শুরু হলে জানাব।\nঅর্ডারের অবস্থা: ${track}`,
    InProgress: `${hi}\nআপনার অর্ডার ${no}-এর শিল্পকর্ম তৈরির কাজ চলছে। প্রিভিউ তৈরি হলে আপনাকে জানাব।`,
    PreviewReady: `${hi}\nআপনার অর্ডার ${no}-এর প্রিভিউ পাঠানো হয়েছে। সাইটে লগইন করে "আমার অর্ডার" থেকে দেখে অনুমোদন দিন বা পরিবর্তনের অনুরোধ জানান: ${site}#orders\nআপনার অনুমোদন ছাড়া পণ্য পাঠানো হবে না।`,
    ChangeRequested: `${hi}\nআপনার পরিবর্তনের অনুরোধ পেয়েছি (অর্ডার ${no})। সংশোধন করে আবার প্রিভিউ পাঠাব।`,
    CustomerApproved: `${hi}\nঅনুমোদনের জন্য ধন্যবাদ! আপনার অর্ডার ${no} কুরিয়ারে পাঠানোর প্রস্তুতি চলছে।`,
    Shipped: `${hi}\nআপনার অর্ডার ${no} কুরিয়ারে পাঠানো হয়েছে।${ship ? '\n' + ship : ''}\n${money}\nঅর্ডারের অবস্থা: ${track}`,
    Delivered: `${hi}\nআপনার অর্ডার ${no} ডেলিভারি সম্পন্ন হয়েছে। আমাদের থেকে কেনার জন্য ধন্যবাদ! সময় পেলে সাইটে একটি রিভিউ দিলে খুশি হব: ${site}`,
    Rejected: `${hi}\nদুঃখিত, আপনার অর্ডার ${no} গ্রহণ করা সম্ভব হয়নি। কারণ ও পরবর্তী করণীয় জানতে আমাদের সঙ্গে যোগাযোগ করুন।`,
    Cancelled: `${hi}\nআপনার অর্ডার ${no} বাতিল করা হয়েছে। প্রয়োজনে আমাদের সঙ্গে যোগাযোগ করুন।`,
  };
  return (T[k] || T.Accepted) + '\n— পাতার ছবি';
}
const msgBox = o => `<details class="msgbox"><summary><i class="fa-solid fa-comment-dots" aria-hidden="true"></i> ক্রেতাকে বার্তা পাঠান</summary><label>বার্তার ধরন<select data-msgsel>${MSGK.map(k => `<option value="${k}"${(MSGK.includes(o.status) ? o.status : 'Accepted') === k ? ' selected' : ''}>${LABEL[k]}</option>`).join('')}</select></label><textarea data-msgtxt rows="7" aria-label="বার্তা"></textarea><div class="msgact"><button type="button" class="sm" data-msgcopy><i class="fa-regular fa-copy" aria-hidden="true"></i> কপি</button><button type="button" class="sm msgwa" data-msgwa><i class="fa-brands fa-whatsapp" aria-hidden="true"></i> WhatsApp-এ পাঠান</button><button type="button" class="sm" data-msgsms style="background:#555"><i class="fa-solid fa-message" aria-hidden="true"></i> SMS</button></div><small class="note" style="text-align:left;display:block">পাঠানোর আগে লেখা বদলাতে পারেন। মূল্য/কুরিয়ার/ট্র্যাকিং ঘরে লেখা থাকলে (সেভ না করলেও) বার্তায় আসবে।</small></details>`;
function fillMsg(card) { const o = ORD.find(x => x.id === card.dataset.id); if (o) card.querySelector('[data-msgtxt]').value = msgText(card.querySelector('[data-msgsel]').value, o, card); }
$('#list').addEventListener('toggle', e => { const d = e.target; if (d.matches && d.matches('details.msgbox')) { MSGE = d.open; if (d.open) fillMsg(d.closest('article')); } }, true);
$('#list').addEventListener('change', e => { const s = e.target.closest('[data-msgsel]'); if (s) fillMsg(s.closest('article')); });
$('#list').addEventListener('click', async e => {
  const b = e.target.closest('[data-msgcopy],[data-msgwa],[data-msgsms]'); if (!b) return;
  const card = b.closest('article'), o = ORD.find(x => x.id === card.dataset.id), ta = card.querySelector('[data-msgtxt]'), t = ta.value; if (!o) return;
  let ph = String(o.phone || '').replace(/\D/g, ''); if (!ph.startsWith('880')) ph = '88' + ph;
  if (b.matches('[data-msgcopy]')) {
    let ok = false; try { await navigator.clipboard.writeText(t); ok = true; } catch { try { ta.select(); ok = document.execCommand('copy'); } catch { /* নিচে বার্তা */ } }
    const old = b.innerHTML; b.textContent = ok ? 'কপি হয়েছে ✓' : 'কপি করা যায়নি — লেখা চেপে ধরে কপি করুন'; setTimeout(() => { b.innerHTML = old; }, 1800); if (ok) say('বার্তা কপি হয়েছে — এখন যেখানে খুশি পেস্ট করুন'); else alert('কপি করা যায়নি। লেখাটি চেপে ধরে কপি করুন।');
  } else if (b.matches('[data-msgwa]')) { window.open(`https://wa.me/${ph}?text=${encodeURIComponent(t)}`, '_blank', 'noopener'); say('WhatsApp খোলা হচ্ছে…', 'info'); }
  else location.href = `sms:+${ph}?body=${encodeURIComponent(t)}`;
});

// ===== একসঙ্গে একাধিক অর্ডারের স্ট্যাটাস বদল =====
$('#bulkSt').innerHTML = '<option value="">নতুন স্ট্যাটাস বেছে নিন</option>' + Object.keys(LABEL).filter(k => k !== 'Pending' && k !== 'CustomerApproved').map(k => `<option value="${k}">${LABEL[k]}</option>`).join('');
function updateBulk() {
  for (const id of [...SEL]) if (!ORD.some(o => o.id === id)) SEL.delete(id);
  const f = filtered(), n = f.filter(o => SEL.has(o.id)).length;
  $('#bulk').hidden = !SEL.size; $('#bulkN').textContent = `${SEL.size}টি নির্বাচিত`;
  const all = $('#selAll'); all.checked = !!f.length && n === f.length; all.indeterminate = n > 0 && n < f.length; $('#selAllRow').hidden = !f.length;
}
// নিয়ম (Rules অনুযায়ী): "ক্রেতা অনুমোদিত" ক্রেতার নিজের; "পাঠানো হয়েছে" শুধু ক্রেতা-অনুমোদিত অর্ডারে
const bulkOk = (o, st) => o.status !== st && st !== 'CustomerApproved' && !(st === 'Shipped' && !['CustomerApproved', 'Shipped'].includes(o.status));
$('#list').addEventListener('change', e => { const c = e.target.closest('[data-sel]'); if (!c) return; const id = c.closest('article').dataset.id; if (c.checked) { if (SEL.size >= 100) { c.checked = false; return alert('একবারে সর্বোচ্চ ১০০টি অর্ডার নির্বাচন করা যাবে'); } SEL.add(id); } else SEL.delete(id); updateBulk(); });
$('#selAll').onchange = e => {
  const f = filtered(); if (e.target.checked) { for (const o of f) { if (SEL.size >= 100) { alert('একবারে সর্বোচ্চ ১০০টি অর্ডার নির্বাচন করা যাবে'); break; } SEL.add(o.id); } } else f.forEach(o => SEL.delete(o.id));
  document.querySelectorAll('#list [data-sel]').forEach(c => { c.checked = SEL.has(c.closest('article').dataset.id); }); updateBulk();
};
$('#bulkClr').onclick = () => { say('নির্বাচন বাদ দেওয়া হয়েছে', 'info'); SEL.clear(); document.querySelectorAll('#list [data-sel]').forEach(c => { c.checked = false; }); updateBulk(); };
$('#bulkGo').onclick = async () => {
  const st = $('#bulkSt').value; if (!st) return alert('নতুন স্ট্যাটাস বেছে নিন');
  const all = ORD.filter(o => SEL.has(o.id)), ok = all.filter(o => bulkOk(o, st)), skip = all.length - ok.length;
  if (!ok.length) return alert('নির্বাচিত কোনো অর্ডারে এই স্ট্যাটাস বসানো যাবে না' + (st === 'Shipped' ? ' ("পাঠানো হয়েছে" দিতে আগে ক্রেতার অনুমোদন লাগে)।' : ' (আগে থেকেই একই স্ট্যাটাস)।'));
  if (!confirm(`${ok.length}টি অর্ডারের স্ট্যাটাস "${LABEL[st]}" করবেন?` + (skip ? `\n(${skip}টি বাদ যাবে: আগে থেকেই একই স্ট্যাটাস, বা নিয়ম অনুযায়ী বদলানো যাবে না)` : ''))) return;
  const btn = $('#bulkGo'); btn.disabled = true; let done = 0; const fail = [];
  for (const o of ok) {
    btn.textContent = `${done + fail.length + 1}/${ok.length}…`;
    try {
      await fs.updateDoc(fs.doc(db, 'orders', o.id), { status: st, updatedAt: fs.serverTimestamp() }); done++; SEL.delete(o.id);
      if (o.orderNo) await fs.setDoc(fs.doc(db, 'tracks', o.orderNo), { status: st, updatedAt: fs.serverTimestamp() }, { merge: true }).catch(() => {}); // একক সেভের মতোই
    } catch (err) { fail.push((o.orderNo || o.id) + ': ' + (err.code || err.message)); }
  }
  btn.disabled = false; btn.textContent = 'প্রয়োগ করুন'; updateBulk(); render();
  say(`${done}টি অর্ডারের স্ট্যাটাস "${LABEL[st]}" হয়েছে।` + (fail.length ? `\nব্যর্থ ${fail.length}টি:\n` + fail.slice(0, 5).join('\n') : ''), fail.length ? 'err' : 'ok');
};

// ===== অগ্রিম/TrxID যাচাইয়ে সাহায্য: একই TrxID বারবার, একই ফোনে বারবার অর্ডার, বহুদিন অযাচাইকৃত অগ্রিম =====
const STALE_DAYS = 3; // এত দিন বা বেশি অযাচাইকৃত থাকলে চিহ্ন
let FLK = null, FL = new Map();
const trxKey = o => String(o.advanceTrx || '').trim().toUpperCase(), phKey = o => String(o.phone || '').replace(/\D/g, '');
const openAdv = o => o.advanceStatus !== 'Verified' && !['Cancelled', 'Rejected'].includes(o.status);
function computeFlags() {
  const T = new Map(), P = new Map(), m = new Map(), now = Date.now(), add = (M, k, o) => { if (!k) return; if (!M.has(k)) M.set(k, []); M.get(k).push(o); };
  for (const o of ORD) { add(T, trxKey(o), o); add(P, phKey(o), o); }
  for (const o of ORD) {
    const trx = (T.get(trxKey(o)) || []).filter(x => x.id !== o.id), phone = (P.get(phKey(o)) || []).filter(x => x.id !== o.id);
    const age = o.createdAt?.toMillis ? (now - o.createdAt.toMillis()) / 864e5 : 0, stale = openAdv(o) && age >= STALE_DAYS ? Math.floor(age) : 0;
    if (trx.length || phone.length || stale) m.set(o.id, { trx, phone, stale, warn: trx.length > 0 || stale > 0 || (phone.length > 0 && openAdv(o)) });
  }
  return m;
}
const flags = () => { if (FLK !== ORD) { FL = computeFlags(); FLK = ORD; } return FL; };
const flagCount = () => ORD.filter(o => flags().get(o.id)?.warn).length;
const flagChips = o => {
  const f = flags().get(o.id); if (!f) return ''; const c = [];
  if (f.trx.length) c.push(`<span class="oflag bad">⚠ একই TrxID ${f.trx.length + 1}টি অর্ডারে</span>`);
  if (f.phone.length) c.push(`<span class="oflag ${openAdv(o) ? 'warn' : 'info'}">📞 একই ফোনে ${f.phone.length + 1}টি অর্ডার</span>`);
  if (f.stale) c.push(`<span class="oflag warn">⏳ ${f.stale} দিন ধরে অগ্রিম যাচাই বাকি</span>`);
  return `<div class="oflags">${c.join('')}</div>`;
};
const flagNote = o => {
  const f = flags().get(o.id); if (!f) return ''; const L = a => a.map(x => esc(x.orderNo || x.id)).join(', '), r = [];
  if (f.trx.length) r.push(`<b>একই TrxID (${esc(o.advanceTrx)})</b> অন্য অর্ডারেও আছে: ${L(f.trx)} — আসল পেমেন্ট ও প্রাপ্ত টাকা মিলিয়ে দেখুন।`);
  if (f.phone.length) r.push(`<b>এই ফোনে</b> আরও অর্ডার আছে: ${L(f.phone)}।`);
  if (f.stale) r.push(`<b>অগ্রিম ${f.stale} দিন ধরে যাচাই বাকি।</b> যাচাই করে "যাচাইকৃত" করুন বা ক্রেতাকে জানান।`);
  return `<div class="oflagn">${r.map(x => `<p>${x}</p>`).join('')}</div>`;
};

// ===== অ্যাডমিন লগইন: Google + ইমেইল/পাসওয়ার্ড + পাসওয়ার্ড ভুলে গেলে রিসেট =====
const A_ERR = { 'auth/invalid-email': 'ইমেইল ঠিকানাটি সঠিক নয়।', 'auth/invalid-credential': 'ইমেইল বা পাসওয়ার্ড ভুল। (প্রথমবার হলে আগে Google দিয়ে ঢুকে "সেটিংস" থেকে পাসওয়ার্ড চালু করুন।)', 'auth/wrong-password': 'ইমেইল বা পাসওয়ার্ড ভুল।', 'auth/user-not-found': 'ইমেইল বা পাসওয়ার্ড ভুল।', 'auth/too-many-requests': 'অনেকবার চেষ্টা হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।', 'auth/network-request-failed': 'ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।', 'auth/user-disabled': 'এই অ্যাকাউন্টটি বন্ধ আছে।', 'auth/operation-not-allowed': 'ইমেইল/পাসওয়ার্ড লগইন Firebase-এ চালু নেই (Authentication > Sign-in method > Email/Password চালু করুন)।', 'auth/popup-blocked': 'পপআপ ব্লক করা আছে। অনুমতি দিন।' };
const aMail = v => /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(v);
function renderLogin() {
  document.querySelector('[data-tab="orders"]').click(); // লগআউটের সময় অন্য ট্যাবে থাকলেও লগইন কার্ড যেন দেখা যায়
  $('#list').innerHTML = `<div class="card alogin am"><h3>অ্যাডমিন লগইন</h3>
  <button type="button" class="am-g" id="aGoogle"><i class="fa-brands fa-google" aria-hidden="true"></i> Google দিয়ে লগইন</button><p class="am-or"><span>অথবা ইমেইল ও পাসওয়ার্ড</span></p>
  <form id="aForm" novalidate><label for="aEmail">ইমেইল</label><input id="aEmail" type="email" autocomplete="username" inputmode="email" autocapitalize="off" spellcheck="false">
  <label for="aPass">পাসওয়ার্ড</label><div class="am-pw"><input id="aPass" type="password" autocomplete="current-password"><button type="button" id="aEye" aria-pressed="false" aria-label="পাসওয়ার্ড দেখান বা লুকান">দেখান</button></div>
  <p id="aErr" class="rvm-err" role="alert" hidden></p><p id="aInfo" class="am-info" role="status" hidden></p>
  <button type="submit" class="sm" id="aGo">লগইন করুন</button><button type="button" class="am-link" id="aForgot">পাসওয়ার্ড ভুলে গেছেন?</button></form>
  <p class="note" style="text-align:left">প্রথমবার ইমেইল/পাসওয়ার্ড চালু করতে: আগে Google দিয়ে লগইন করুন, তারপর "সেটিংস" ট্যাব থেকে "ইমেইল/পাসওয়ার্ড চালু করুন" চাপুন।</p></div>`;
  const msg = (el, t) => { $('#aErr').hidden = true; $('#aInfo').hidden = true; if (t) { el.textContent = t; el.hidden = false; } }, busy = b => ['#aGo', '#aGoogle', '#aForgot'].forEach(q => { const e = $(q); if (e) e.disabled = b; });
  $('#aGoogle').onclick = async () => { msg($('#aErr'), ''); busy(true); try { await login(); } catch (e) { if ($('#aErr') && e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') msg($('#aErr'), A_ERR[e.code] || 'Google দিয়ে লগইন করা যায়নি।'); } if ($('#aGo')) busy(false); };
  $('#aEye').onclick = () => { const s = $('#aPass').type === 'password'; $('#aPass').type = s ? 'text' : 'password'; $('#aEye').textContent = s ? 'লুকান' : 'দেখান'; $('#aEye').setAttribute('aria-pressed', String(s)); };
  $('#aForm').onsubmit = async e => {
    e.preventDefault(); const em = $('#aEmail').value.trim(), pw = $('#aPass').value; msg($('#aErr'), '');
    if (!aMail(em)) { msg($('#aErr'), 'সঠিক ইমেইল ঠিকানা দিন।'); $('#aEmail').focus(); return; }
    if (!pw) { msg($('#aErr'), 'পাসওয়ার্ড দিন।'); $('#aPass').focus(); return; }
    busy(true); try { await signInWithEmailAndPassword(auth, em, pw); say('লগইন সফল হয়েছে'); } catch (x) { console.error(x.code || x); if ($('#aErr')) msg($('#aErr'), A_ERR[x.code] || 'লগইন করা যায়নি। আবার চেষ্টা করুন।'); } if ($('#aGo')) busy(false);
  };
  $('#aForgot').onclick = async () => {
    const em = $('#aEmail').value.trim(); msg($('#aErr'), '');
    if (!aMail(em)) { msg($('#aErr'), 'আগে ওপরে আপনার ইমেইল ঠিকানা লিখুন, তারপর "পাসওয়ার্ড ভুলে গেছেন?" চাপুন।'); $('#aEmail').focus(); return; }
    busy(true); try { await sendPasswordResetEmail(auth, em); msg($('#aInfo'), 'ঐ ইমেইলে পাসওয়ার্ড-অ্যাকাউন্ট থাকলে রিসেটের লিংক পাঠানো হয়েছে। ইনবক্স ও স্প্যাম ফোল্ডার দেখুন।'); }
    catch (x) { console.error(x.code || x); msg($('#aErr'), x.code === 'auth/user-not-found' ? 'ঐ ইমেইলে পাসওয়ার্ড-অ্যাকাউন্ট থাকলে রিসেটের লিংক পাঠানো হয়েছে।' : A_ERR[x.code] || 'লিংক পাঠানো যায়নি। আবার চেষ্টা করুন।'); } if ($('#aGo')) busy(false);
  };
}
$('#aOut').onclick = async () => { await signOut(auth); say('লগআউট হয়েছে', 'info'); };
// ইমেইল যাচাই না থাকলে (Rules যাচাইকৃত ইমেইল চায়): যাচাই লিংক পাঠানো ও "যাচাই করেছি" বাটন
function verifyBox() {
  const u = auth.currentUser; if (!u || u.emailVerified) return;
  $('#list').insertAdjacentHTML('beforeend', '<div class="card" id="vBox"><p><b>আপনার ইমেইল এখনো যাচাই হয়নি।</b> অ্যাডমিন অনুমতির জন্য ইমেইল যাচাই করা লাগে।</p><button type="button" class="sm" id="vSend">যাচাই লিংক পাঠান</button> <button type="button" class="sm" id="vDone">আমি যাচাই করেছি — আবার দেখুন</button></div>');
  $('#vSend').onclick = async () => { try { await sendEmailVerification(auth.currentUser); say('যাচাই লিংক পাঠানো হয়েছে — ইমেইলের লিংকে চাপুন', 'info'); } catch (e) { alert(e.code === 'auth/too-many-requests' ? 'অনেকবার চেষ্টা হয়েছে, কিছুক্ষণ পরে আবার চেষ্টা করুন।' : 'লিংক পাঠানো যায়নি: ' + (e.code || e.message)); } };
  $('#vDone').onclick = async () => { try { await reload(auth.currentUser); await auth.currentUser.getIdToken(true); } catch (e) { console.error(e); } if (auth.currentUser && auth.currentUser.emailVerified) location.reload(); else alert('এখনো যাচাই হয়নি। ইমেইলের লিংকে চেপে যাচাই করে তারপর আবার চাপুন।'); };
}
// ===== সেটিংস ট্যাবে: Google অ্যাকাউন্টে পাসওয়ার্ড যুক্ত করা (একই অ্যাকাউন্ট, তাই অ্যাডমিন অনুমতি অপরিবর্তিত) =====
function renderPw(u) {
  const has = !!u && (u.providerData || []).some(p => p.providerId === 'password');
  $('#pwState').textContent = !u ? '' : has ? '✓ ইমেইল/পাসওয়ার্ড লগইন চালু আছে। এখন লগইন পেজে ইমেইল ও পাসওয়ার্ড দিয়েও ঢুকতে পারবেন, এবং "পাসওয়ার্ড ভুলে গেছেন?" চলবে।' : 'এখন শুধু Google দিয়ে লগইন চালু। নিচে পাসওয়ার্ড দিলে একই অ্যাকাউন্টে ইমেইল ও পাসওয়ার্ড দিয়েও লগইন করা যাবে — আলাদা অ্যাকাউন্ট তৈরি হয় না, তাই অ্যাডমিন অনুমতি একই থাকে।';
  $('#pwForm').hidden = !u || has; $('#pwReset').hidden = !u || !has; $('#pwErr').hidden = true;
}
$('#pwForm').onsubmit = async e => {
  e.preventDefault(); const u = auth.currentUser, p1 = $('#pwNew').value, p2 = $('#pwNew2').value, er = $('#pwErr'); er.hidden = true; if (!u) return;
  const fail = t => { er.textContent = t; er.hidden = false; };
  if (p1.length < 8) return fail('পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের দিন (অ্যাডমিন অ্যাকাউন্ট, তাই শক্ত পাসওয়ার্ড দিন)।');
  if (p1 !== p2) return fail('দুটি পাসওয়ার্ড মিলছে না।');
  $('#pwGo').disabled = true;
  try { await linkWithCredential(u, EmailAuthProvider.credential(u.email, p1)); try { await reload(u); } catch { /* ঠিক আছে */ } $('#pwNew').value = $('#pwNew2').value = ''; renderPw(auth.currentUser); say('ইমেইল/পাসওয়ার্ড লগইন চালু হয়েছে — এখন থেকে দুই পদ্ধতিতেই লগইন করতে পারবেন'); }
  catch (x) { console.error(x.code || x); fail({ 'auth/requires-recent-login': 'নিরাপত্তার জন্য লগআউট করে Google দিয়ে আবার লগইন করে চেষ্টা করুন।', 'auth/provider-already-linked': 'ইমেইল/পাসওয়ার্ড আগেই চালু আছে।', 'auth/credential-already-in-use': 'এই ইমেইলে আলাদা একটি পাসওয়ার্ড-অ্যাকাউন্ট আছে। ঐ অ্যাকাউন্ট দিয়ে লগইন করুন।', 'auth/email-already-in-use': 'এই ইমেইলে আলাদা একটি পাসওয়ার্ড-অ্যাকাউন্ট আছে। ঐ অ্যাকাউন্ট দিয়ে লগইন করুন।', 'auth/weak-password': 'পাসওয়ার্ড দুর্বল — আরও শক্ত পাসওয়ার্ড দিন।', 'auth/operation-not-allowed': 'ইমেইল/পাসওয়ার্ড Firebase-এ চালু নেই (Authentication > Sign-in method > Email/Password চালু করুন)।', 'auth/network-request-failed': 'ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।' }[x.code] || 'চালু করা যায়নি। আবার চেষ্টা করুন।'); }
  $('#pwGo').disabled = false;
};
$('#pwReset').onclick = async () => { try { await sendPasswordResetEmail(auth, auth.currentUser.email); say('পাসওয়ার্ড বদলানোর লিংক আপনার ইমেইলে পাঠানো হয়েছে', 'info'); } catch (x) { alert(A_ERR[x.code] || 'লিংক পাঠানো যায়নি।'); } };
