import { auth, db, fs, login, signOut, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, sendEmailVerification, $, esc, okUrl, shrink, LABEL, sha, DEF_CATS } from './common.js';
import { BD } from './bd.js';
const DIST = Object.keys(BD);
$('#distSel').innerHTML = '<option value="">জেলা বেছে নিন</option>' + DIST.map(d => `<option>${d}</option>`).join('');
$('#distSel').onchange = e => { const l = BD[e.target.value]; $('#upSel').innerHTML = l ? '<option value="">উপজেলা বেছে নিন</option>' + [...l.split(','), 'অন্যান্য (তালিকায় নেই)'].map(u => `<option>${u}</option>`).join('') : '<option value="">আগে জেলা বেছে নিন</option>'; };
// ===== লগইন / নিবন্ধন: Google + ইমেইল/পাসওয়ার্ড (ফেসবুক/মেসেঞ্জারের ভেতরের ব্রাউজারে ইমেইল দিয়ে চলে) =====
const IAB = /FBAN|FBAV|FB_IAB|Messenger|Instagram/i.test(navigator.userAgent);
const AUTH_ERR = {
  'auth/invalid-email': 'ইমেইল ঠিকানাটি সঠিক নয়।', 'auth/email-already-in-use': 'এই ইমেইলে আগেই নিবন্ধন আছে। "লগইন" ট্যাবে যান, প্রয়োজনে পাসওয়ার্ড রিসেট করুন।',
  'auth/weak-password': 'পাসওয়ার্ড দুর্বল — কমপক্ষে ৬ অক্ষর দিন।', 'auth/invalid-credential': 'ইমেইল বা পাসওয়ার্ড ভুল।', 'auth/wrong-password': 'ইমেইল বা পাসওয়ার্ড ভুল।', 'auth/user-not-found': 'ইমেইল বা পাসওয়ার্ড ভুল।',
  'auth/too-many-requests': 'অনেকবার চেষ্টা হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।', 'auth/network-request-failed': 'ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।', 'auth/user-disabled': 'এই অ্যাকাউন্টটি বন্ধ আছে। আমাদের জানান।',
  'auth/operation-not-allowed': 'এই পদ্ধতিতে লগইন এখনো চালু হয়নি। Google দিয়ে চেষ্টা করুন বা আমাদের জানান।', 'auth/popup-blocked': 'পপআপ ব্লক করা আছে। অনুমতি দিন, বা ইমেইল দিয়ে লগইন করুন।',
  'auth/account-exists-with-different-credential': 'এই ইমেইলে অন্য পদ্ধতিতে অ্যাকাউন্ট আছে। ঐ পদ্ধতিতে লগইন করুন।', 'auth/unauthorized-domain': 'এই ওয়েবসাইটের ঠিকানা লগইনের জন্য অনুমোদিত নয়। আমাদের জানান।'
};
const am = $('#authModal'); let AM = null; // AM = খোলা লগইন-বক্সের অবস্থা {mode, resolve, reject, prev, busy}
const amSay = (el, msg) => { $('#amErr').hidden = true; $('#amInfo').hidden = true; if (msg) { el.textContent = msg; el.hidden = false; } };
function amMode(m) {
  AM.mode = m; const reg = m === 'register';
  $('#amTabL').setAttribute('aria-selected', String(!reg)); $('#amTabR').setAttribute('aria-selected', String(reg)); $('#amTabL').tabIndex = reg ? -1 : 0; $('#amTabR').tabIndex = reg ? 0 : -1;
  $('#amTitle').textContent = reg ? 'নতুন নিবন্ধন করুন' : 'লগইন করুন'; $('#amGo').textContent = reg ? 'নিবন্ধন করুন' : 'লগইন করুন';
  $('#amConfRow').hidden = !reg; $('#amForgot').hidden = reg; $('#amPass').autocomplete = reg ? 'new-password' : 'current-password'; amSay($('#amErr'), '');
}
function openAuth(why = '', mode = 'login') {
  if (AM) return Promise.reject(new Error('open'));
  return new Promise((resolve, reject) => {
    AM = { resolve, reject, prev: document.activeElement, busy: false, mode };
    $('#amWhy').textContent = why; $('#amWhy').hidden = !why; $('#amIab').hidden = !IAB; $('#amGoogle').classList.toggle('off', IAB);
    amBusy(false); $('#amForm').reset(); $('#amPass').type = 'password'; $('#amPass2').type = 'password'; $('#amEye').textContent = 'দেখান'; $('#amEye').setAttribute('aria-pressed', 'false'); amMode(mode);
    am.hidden = false; document.body.style.overflow = 'hidden'; document.addEventListener('keydown', amKey); setTimeout(() => { if (AM) $('#amEmail').focus(); }, 40);
  });
}
const requireLogin = why => auth.currentUser ? Promise.resolve() : openAuth(why);
function closeAuth(ok) {
  if (!AM) return; const a = AM; AM = null; am.hidden = true; document.body.style.overflow = ''; document.removeEventListener('keydown', amKey);
  if (a.prev && a.prev.focus && document.contains(a.prev)) a.prev.focus(); ok ? a.resolve() : a.reject(new Error('cancelled'));
}
function amKey(e) {
  if (e.key === 'Escape') { if (!AM.busy) closeAuth(false); return; }
  if (e.key === 'Tab') { const f = [...am.querySelectorAll('button, input')].filter(x => !x.disabled && x.tabIndex >= 0 && x.offsetParent !== null), i = f.indexOf(document.activeElement); if (!f.length) return; if (i === -1) { e.preventDefault(); f[0].focus(); } else if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); } }
}
const amBusy = b => { if (AM) AM.busy = b; ['#amGo', '#amGoogle', '#amForgot', '#amTabL', '#amTabR'].forEach(q => { $(q).disabled = b; }); }; // বক্স বন্ধ হয়ে গেলেও বাটন আবার সক্রিয় করা চাই
$('#amX').onclick = () => { if (AM && !AM.busy) closeAuth(false); }; am.onclick = e => { if (e.target === am && AM && !AM.busy) closeAuth(false); };
$('#amTabL').onclick = () => AM && amMode('login'); $('#amTabR').onclick = () => AM && amMode('register');
$('#amEye').onclick = () => { const show = $('#amPass').type === 'password'; $('#amPass').type = $('#amPass2').type = show ? 'text' : 'password'; $('#amEye').textContent = show ? 'লুকান' : 'দেখান'; $('#amEye').setAttribute('aria-pressed', String(show)); };
$('#amGoogle').onclick = async () => {
  if (!AM) return; amSay($('#amErr'), '');
  if (IAB) { amSay($('#amErr'), 'ফেসবুক/মেসেঞ্জারের ভেতরের ব্রাউজারে Google লগইন কাজ করে না। নিচে ইমেইল ও পাসওয়ার্ড দিয়ে লগইন বা নিবন্ধন করুন।'); return; }
  amBusy(true);
  try { await login(); } catch (e) { if (AM && e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') amSay($('#amErr'), AUTH_ERR[e.code] || 'Google দিয়ে লগইন করা যায়নি। আবার চেষ্টা করুন বা ইমেইল দিয়ে লগইন করুন।'); }
  amBusy(false);
};
$('#amForm').onsubmit = async e => {
  e.preventDefault(); if (!AM || AM.busy) return; const email = $('#amEmail').value.trim(), pw = $('#amPass').value, reg = AM.mode === 'register', err = $('#amErr');
  amSay(err, '');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) { amSay(err, 'সঠিক ইমেইল ঠিকানা দিন।'); $('#amEmail').focus(); return; }
  if (!pw) { amSay(err, 'পাসওয়ার্ড দিন।'); $('#amPass').focus(); return; }
  if (reg && pw.length < 6) { amSay(err, 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের দিন।'); $('#amPass').focus(); return; }
  if (reg && pw !== $('#amPass2').value) { amSay(err, 'দুটি পাসওয়ার্ড মিলছে না।'); $('#amPass2').focus(); return; }
  amBusy(true);
  try {
    if (reg) { const c = await createUserWithEmailAndPassword(auth, email, pw); sendEmailVerification(c.user).catch(() => {}); siteSay('নিবন্ধন সফল! ইমেইল যাচাইয়ের একটি লিংক পাঠানো হয়েছে (ঐচ্ছিক)।'); }
    else { await signInWithEmailAndPassword(auth, email, pw); siteSay('লগইন সফল হয়েছে।'); }
  } catch (x) { console.error(x.code || x); amSay(err, AUTH_ERR[x.code] || 'লগইন করা যায়নি। আবার চেষ্টা করুন।'); }
  amBusy(false);
};
$('#amForgot').onclick = async () => {
  if (!AM || AM.busy) return; const email = $('#amEmail').value.trim(); amSay($('#amErr'), '');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) { amSay($('#amErr'), 'আগে ওপরে আপনার ইমেইল ঠিকানা লিখুন, তারপর "পাসওয়ার্ড ভুলে গেছেন?" চাপুন।'); $('#amEmail').focus(); return; }
  amBusy(true);
  try { await sendPasswordResetEmail(auth, email); amSay($('#amInfo'), 'ঐ ইমেইলে অ্যাকাউন্ট থাকলে পাসওয়ার্ড রিসেটের লিংক পাঠানো হয়েছে। ইনবক্স ও স্প্যাম ফোল্ডার দেখুন।'); }
  catch (x) { console.error(x.code || x); amSay($('#amErr'), x.code === 'auth/user-not-found' ? 'ঐ ইমেইলে পাসওয়ার্ড রিসেটের লিংক পাঠানো হয়েছে (থাকলে)।' : AUTH_ERR[x.code] || 'লিংক পাঠানো যায়নি। আবার চেষ্টা করুন।'); }
  amBusy(false);
};
onAuthStateChanged(auth, u => {
  $('#who').innerHTML = u ? `${esc(u.displayName || (u.email || '').split('@')[0])} <button id="out">লগআউট</button>` : '<button id="in" aria-label="লগইন বা নিবন্ধন">লগইন</button>';
  ($('#in') || {}).onclick = () => openAuth('', 'login').catch(() => {}); ($('#out') || {}).onclick = () => { signOut(auth); siteSay('লগআউট হয়েছে।'); };
  $('#orderBox').hidden = !u; $('#myLink').hidden = !u; loadOrders(); if (u && AM) closeAuth(true);
});
(async () => {
  const g = await fs.getDocs(fs.collection(db, 'gallery'));
  $('#gallery').innerHTML = g.docs.map(d => d.data()).map(x => `<figure><img src="${esc(x.img)}" alt="" loading="lazy" decoding="async"><figcaption><span>${esc(x.title)}</span><span>৳${esc(x.price)}</span></figcaption></figure>`).join('') || '<p class="note">শীঘ্রই আসছে।</p>';
})().catch(e => console.error(e));
$('#orderForm').onsubmit = async e => {
  e.preventDefault(); const f = e.target, btn = f.querySelector('button:not([type=button])'), file = f.photo.files[0];
  if (!f.category.value) return alert('কাজের ধরন বেছে নিন');
  if (!$('#frameBox').hidden && !f.frame.value) return alert('ফ্রেমসহ বা ফ্রেম ছাড়া— একটি বেছে নিন');
  if (!/^[A-Za-z0-9]{6,20}$/.test(f.trx.value.trim())) return alert('বিকাশের সঠিক TrxID দিন');
  if (!/^01\d{9}$/.test(f.from.value)) return alert('যে নম্বর থেকে টাকা পাঠিয়েছেন সেটি সঠিকভাবে দিন (01XXXXXXXXX)');
  if (!f.district.value || !f.upazila.value) return alert('জেলা ও উপজেলা বেছে নিন');
  if (!/^01\d{9}$/.test(f.phone.value)) return alert('সঠিক মোবাইল নম্বর দিন (01XXXXXXXXX)');
  if (!file || file.size > 15e6) return alert('১৫MB-এর মধ্যে ছবি দিন');
  btn.disabled = true;
  try {
    if (!auth.currentUser) { try { await requireLogin('অর্ডার জমা দিতে লগইন করুন বা নতুন নিবন্ধন করুন। লগইনের পর আপনার অর্ডার নিজে থেকেই জমা হবে।'); } catch { btn.disabled = false; return; } } // জমা দেওয়ার সময় লগইন (Google বা ইমেইল/পাসওয়ার্ড)
    const id = crypto.randomUUID(), uid = auth.currentUser.uid, data = await shrink(file), orderNo = genNo(), trx = f.trx.value.trim().toUpperCase();
    try { await fs.setDoc(fs.doc(db, 'trx', trx), { ownerUid: uid, orderNo, createdAt: fs.serverTimestamp() }); } catch { throw new Error('এই TrxID আগে ব্যবহার হয়েছে বা সঠিক নয়। আবার দেখুন।'); }
    await fs.setDoc(fs.doc(db, 'orderImages', id), { ownerUid: uid, data });
    await fs.setDoc(fs.doc(db, 'orders', id), { ownerUid: uid, name: f.name.value.trim(), phone: f.phone.value, address: f.address.value.trim(), district: f.district.value, upazila: f.upazila.value.trim(), paymentMethod: 'COD', advanceTrx: trx, advanceFrom: f.from.value, advanceStatus: 'Pending', orderNo, category: catValue(f), note: f.note.value.trim().slice(0, 500), isPublic: false, status: 'Pending', paymentStatus: 'Unpaid', createdAt: fs.serverTimestamp() });
    await fs.setDoc(fs.doc(db, 'tracks', orderNo), { ownerUid: uid, phoneHash: await sha(orderNo + ':' + f.phone.value), status: 'Pending', updatedAt: fs.serverTimestamp() });
    f.reset(); $('#estPrice').textContent = ''; frameUpdate(); $('#photoQ').hidden = true; showDone(orderNo); loadOrders();
  } catch (err) { alert(String(err.code || '').startsWith('auth/') ? 'লগইন সম্পন্ন হয়নি, আবার চেষ্টা করুন।' : 'ত্রুটি: ' + err.message); }
  btn.disabled = false;
};
// ===== ছবির মান যাচাই (শুধু ক্লায়েন্ট-কোড): কম রেজোলিউশন বা ঝাপসা হলে সতর্ক করে; আপলোড আটকায় না =====
const BLUR_T = 30; // ধূসর ছবির ল্যাপ্লাসিয়ান-ভ্যারিয়েন্সের সীমা (এর নিচে ঝাপসা ধরা হয়)
async function photoQuality(file) {
  let bmp;
  try { bmp = await createImageBitmap(file); }
  catch { bmp = await new Promise((ok, no) => { const im = new Image(), u = URL.createObjectURL(file); im.onload = () => { URL.revokeObjectURL(u); ok(im); }; im.onerror = () => { URL.revokeObjectURL(u); no(new Error('decode')); }; im.src = u; }); }
  const w = bmp.width, h = bmp.height, k = Math.min(1, 480 / Math.max(w, h)), cw = Math.max(8, Math.round(w * k)), ch = Math.max(8, Math.round(h * k));
  const c = document.createElement('canvas'); c.width = cw; c.height = ch; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(bmp, 0, 0, cw, ch);
  const px = g.getImageData(0, 0, cw, ch).data, gr = new Float32Array(cw * ch);
  for (let i = 0; i < gr.length; i++) gr[i] = .299 * px[i * 4] + .587 * px[i * 4 + 1] + .114 * px[i * 4 + 2];
  let s1 = 0, s2 = 0, n = 0;
  for (let y = 1; y < ch - 1; y++) for (let x = 1; x < cw - 1; x++) { const i = y * cw + x, l = 4 * gr[i] - gr[i - 1] - gr[i + 1] - gr[i - cw] - gr[i + cw]; s1 += l; s2 += l * l; n++; }
  const mean = s1 / n, v = s2 / n - mean * mean;
  return { w, h, v, low: Math.max(w, h) < 900 || Math.min(w, h) < 600, blur: v < BLUR_T };
}
{
  const pq = $('#photoQ'); let tok = 0;
  $('#orderForm').photo.addEventListener('change', async e => {
    const file = e.target.files[0], my = ++tok; pq.hidden = true; if (!file) return;
    try {
      const q = await photoQuality(file); if (my !== tok) return;
      const why = [q.low ? `ছবির মাপ কম (${q.w}×${q.h})` : '', q.blur ? 'ছবি ঝাপসা মনে হচ্ছে' : ''].filter(Boolean);
      pq.className = 'pq full ' + (why.length ? 'warn' : 'ok');
      pq.textContent = why.length ? `⚠ এই ছবি থেকে ভালো শিল্পকর্ম নাও হতে পারে — ${why.join(' এবং ')}। বেশি রেজোলিউশনের পরিষ্কার ছবি দিলে ভালো ফল পাবেন। (চাইলে এই ছবিই দিতে পারেন।)` : '✓ ছবির মান ঠিক আছে।';
      pq.hidden = false;
    } catch { /* ছবি পড়া না গেলে নীরব; জমা দেওয়ার সময় আগের মতোই যাচাই হবে */ }
  });
}
// ===== রিভিউ বক্স (prompt বাদ): ১–৫ তারকা, লেখা, জমা/আপডেট/বাতিল; প্রতি অর্ডারে একটিই (ডক আইডি = অর্ডার আইডি) =====
let MYREV = {}; const STAR_TXT = ['তারকা বেছে নিন', 'খুব খারাপ', 'ভালো নয়', 'মোটামুটি', 'ভালো', 'চমৎকার'], stars = n => '★'.repeat(n) + '☆'.repeat(5 - n);
function siteSay(msg) { const box = $('#stoast'), t = document.createElement('div'); t.className = 'stoast-i'; t.textContent = msg; box.append(t); while (box.children.length > 2) box.firstChild.remove(); setTimeout(() => t.remove(), 5500); }
function reviewBlock(o) {
  const r = MYREV[o.id], nm = esc((o.name || '').split(' ')[0]), id = esc(o.id), no = esc(o.orderNo || '');
  if (!r) return `<button data-rev="${id}" data-nm="${nm}" data-no="${no}">☆ রিভিউ দিন</button>`;
  return `<div class="oc-rv"><div class="oc-rvh"><span class="rv-stars" role="img" aria-label="${Number(r.rating) || 0} তারা">${stars(Math.min(5, Math.max(0, Number(r.rating) || 0)))}</span><span class="oc-rvs ${r.approved ? 'ok' : 'wait'}">${r.approved ? 'সাইটে দেখানো হচ্ছে' : 'যাচাইয়ের অপেক্ষায়'}</span></div>${r.text ? `<p>${esc(r.text)}</p>` : ''}<button type="button" class="oc-rvb" data-rev="${id}" data-nm="${nm}" data-no="${no}">রিভিউ সংশোধন করুন</button></div>`;
}
const rvm = $('#rvModal'); let RV = null;
function rvSetStars(n) { RV.rating = n; rvm.querySelectorAll('#rvStars button').forEach(b => { const s = Number(b.dataset.s); b.classList.toggle('on', s <= n); b.setAttribute('aria-checked', String(s === n)); b.tabIndex = (n ? s === n : s === 1) ? 0 : -1; }); $('#rvStarTxt').textContent = STAR_TXT[n]; }
function rvOpen(id, nm, no) {
  const ex = MYREV[id] || null; RV = { id, nm, ex, prev: document.activeElement, rating: 0, r0: ex ? Number(ex.rating) || 0 : 0, t0: ex ? ex.text || '' : '', busy: false };
  $('#rvTitle').textContent = ex ? 'আপনার রিভিউ সংশোধন করুন' : 'আপনার রিভিউ দিন'; $('#rvSub').textContent = no ? 'অর্ডার ' + no : '';
  $('#rvText').value = RV.t0; $('#rvCnt').textContent = RV.t0.length + '/300'; $('#rvErr').hidden = true;
  $('#rvNote').textContent = ex ? (ex.approved ? 'এটি এখন সাইটে দেখানো হচ্ছে। সংশোধন করলে আবার যাচাইয়ের পর দেখানো হবে।' : 'যাচাইয়ের অপেক্ষায় আছে।') : 'যাচাইয়ের পর আপনার প্রথম নাম দিয়ে সাইটে দেখানো হবে।';
  $('#rvSave').textContent = ex ? 'আপডেট করুন' : 'জমা দিন'; $('#rvSave').disabled = false; rvSetStars(RV.r0);
  rvm.hidden = false; document.body.style.overflow = 'hidden'; document.addEventListener('keydown', rvKey); setTimeout(() => { if (RV) (RV.r0 ? $('#rvText') : rvm.querySelector('#rvStars button')).focus(); }, 40);
}
const rvDirty = () => !!RV && (RV.rating !== RV.r0 || $('#rvText').value !== RV.t0);
function rvClose(force) {
  if (!RV || RV.busy) return; if (!force && rvDirty() && !confirm('পরিবর্তন বাদ দিয়ে বন্ধ করবেন?')) return;
  rvm.hidden = true; document.body.style.overflow = ''; document.removeEventListener('keydown', rvKey); const p = RV.prev; RV = null; if (p && p.focus && document.contains(p)) p.focus();
}
function rvKey(e) {
  if (e.key === 'Escape') { rvClose(); return; }
  const sb = [...rvm.querySelectorAll('#rvStars button')];
  if (document.activeElement && sb.includes(document.activeElement) && /^Arrow(Left|Right|Up|Down)$/.test(e.key)) { e.preventDefault(); const d = /Left|Up/.test(e.key) ? -1 : 1, n = Math.min(5, Math.max(1, Number(document.activeElement.dataset.s) + d)); rvSetStars(n); sb[n - 1].focus(); return; }
  if (e.key === 'Tab') { const f = [...rvm.querySelectorAll('button:not([disabled]), textarea')].filter(x => x.tabIndex >= 0 && x.offsetParent !== null), i = f.indexOf(document.activeElement); if (!f.length) return; if (i === -1) { e.preventDefault(); f[0].focus(); } else if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); } }
}
$('#rvStars').onclick = e => { const b = e.target.closest('button[data-s]'); if (b && RV) { rvSetStars(Number(b.dataset.s)); $('#rvErr').hidden = true; } };
$('#rvText').oninput = e => { $('#rvCnt').textContent = e.target.value.length + '/300'; };
$('#rvX').onclick = $('#rvCancel').onclick = () => rvClose(); rvm.onclick = e => { if (e.target === rvm) rvClose(); };
$('#rvSave').onclick = async () => {
  if (!RV || RV.busy) return; const err = $('#rvErr');
  if (!(RV.rating >= 1 && RV.rating <= 5)) { err.textContent = 'কমপক্ষে ১টি তারা বেছে নিন।'; err.hidden = false; rvm.querySelector('#rvStars button').focus(); return; }
  const text = $('#rvText').value.trim().slice(0, 300), id = RV.id, ex = RV.ex, upd = !!ex; RV.busy = true; $('#rvSave').disabled = true; $('#rvSave').textContent = 'অপেক্ষা করুন…'; err.hidden = true;
  try {
    const ref = fs.doc(db, 'reviews', id);
    if (upd) await fs.updateDoc(ref, { rating: RV.rating, text, approved: false }); // আগের রিভিউ সংশোধন: আবার যাচাইয়ের জন্য approved=false
    else await fs.setDoc(ref, { ownerUid: auth.currentUser.uid, name1: RV.nm, rating: RV.rating, text, approved: false, createdAt: fs.serverTimestamp() });
    MYREV[id] = { ...(ex || {}), ownerUid: auth.currentUser.uid, name1: RV.nm, rating: RV.rating, text, approved: false }; RV.busy = false; rvClose(true); loadOrders();
    siteSay(upd ? 'রিভিউ আপডেট হয়েছে। যাচাইয়ের পর সাইটে দেখানো হবে।' : 'ধন্যবাদ! রিভিউ জমা হয়েছে। যাচাইয়ের পর সাইটে দেখানো হবে।');
  } catch (e) {
    console.error(e); RV.busy = false; $('#rvSave').disabled = false; $('#rvSave').textContent = upd ? 'আপডেট করুন' : 'জমা দিন';
    err.textContent = e.code === 'permission-denied' ? 'এই মুহূর্তে রিভিউ জমা/আপডেট করা যাচ্ছে না। কিছুক্ষণ পরে আবার চেষ্টা করুন।' : 'ত্রুটি হয়েছে। ইন্টারনেট দেখে আবার চেষ্টা করুন।'; err.hidden = false;
  }
};
const OPENO = new Set(); // যেসব অর্ডারের বিস্তারিত খোলা (আপডেটের পর আবার সাজালেও খোলা থাকে)
async function loadOrders() {
  const u = auth.currentUser; if (!u) { $('#orders').innerHTML = ''; return; }
  let s; try { s = await fs.getDocs(fs.query(fs.collection(db, 'orders'), fs.where('ownerUid', '==', u.uid))); } catch (e) { console.error(e); $('#orders').innerHTML = '<p class="note">অর্ডার লোড করা যায়নি। পেজ রিফ্রেশ করে আবার চেষ্টা করুন।</p>'; return; }
  if (s.docs.some(d => d.data().status === 'Delivered')) { try { const rs = await fs.getDocs(fs.query(fs.collection(db, 'reviews'), fs.where('ownerUid', '==', u.uid))); MYREV = {}; rs.docs.forEach(d => { MYREV[d.id] = d.data(); }); } catch (e) { console.error(e); } } // নিজের রিভিউগুলো (প্রতি অর্ডারে সর্বোচ্চ একটি)
  const dtx = (o, full) => { try { return o.createdAt ? o.createdAt.toDate().toLocaleString('bn-BD', full ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }) : ''; } catch { return ''; } };
  const rows = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  for (const id of [...OPENO]) if (!rows.some(o => o.id === id)) OPENO.delete(id);
  $('#orders').innerHTML = rows.map(o => {
    const id = esc(o.id), no = esc(o.orderNo || ''), open = OPENO.has(o.id), det = 'ocd-' + id;
    const price = o.price ? `<b>৳${bnum(o.price)}</b>${o.advanceStatus === 'Verified' ? `<small>বাকি (COD) ৳${bnum(Math.max(0, o.price - ADV))}</small>` : '<small>(COD)</small>'}` : '<span class="oc-mut">মূল্য নির্ধারণ বাকি</span>';
    const adv = o.advanceTrx ? `${esc(o.advanceTrx)} · ${o.advanceStatus === 'Verified' ? '<span class="oc-ok"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> যাচাইকৃত</span>' : '<span class="oc-wait"><i class="fa-solid fa-hourglass-half" aria-hidden="true"></i> যাচাই বাকি</span>'}` : '';
    const place = [o.address, o.upazila, o.district].filter(Boolean).map(esc).join(', ');
    return `
  <article class="card ocust" data-oid="${id}">
  <div class="oc-top"><div class="oc-id"><b class="oc-no">${no}</b><span class="badge s-${esc(o.status)}">${esc(LABEL[o.status] || '')}</span></div><div class="oc-price">${o.price ? `৳${bnum(o.price)}` : '<span class="oc-mut">মূল্য নির্ধারণ বাকি</span>'}</div></div>
  <p class="oc-prod">${esc(o.category || '')}</p>
  ${o.status === 'PreviewReady' ? '<p class="oc-need">⚡ প্রিভিউ প্রস্তুত — দেখে অনুমোদন দিন</p>' : ''}
  <div class="oc-row">${dtx(o) ? `<small class="oc-date">${esc(dtx(o))}</small>` : '<span></span>'}<button type="button" class="sm oc-more" data-more="${id}" aria-expanded="${open}" aria-controls="${det}">${open ? 'বন্ধ করুন' : 'বিস্তারিত দেখুন'}</button></div>
  <div class="oc-det" id="${det}"${open ? '' : ' hidden'}>
  <dl class="oc-grid"><div><dt>অর্ডারের সময়</dt><dd>${esc(dtx(o, true))}</dd></div><div><dt>মূল্য</dt><dd>${price}</dd></div><div><dt>পেমেন্ট</dt><dd>${o.paymentMethod === 'COD' ? 'অগ্রিম বিকাশে + বাকি ক্যাশ অন ডেলিভারি' : esc(o.paymentMethod || '')}</dd></div>${adv ? `<div><dt>অগ্রিম (TrxID)</dt><dd>${adv}</dd></div>` : ''}<div><dt>নাম</dt><dd>${esc(o.name)}</dd></div><div><dt>মোবাইল</dt><dd>${esc(o.phone)}</dd></div><div class="oc-wide"><dt>ঠিকানা</dt><dd>${place}</dd></div>${o.note ? `<div class="oc-wide"><dt>আপনার নোট</dt><dd>${esc(o.note)}</dd></div>` : ''}${o.customerComment ? `<div class="oc-wide"><dt>আপনার পরিবর্তনের অনুরোধ</dt><dd>${esc(o.customerComment)}</dd></div>` : ''}</dl>
  ${o.courier ? `<div class="oc-ship"><span><i class="fa-solid fa-truck" aria-hidden="true"></i> কুরিয়ার: <b>${esc(o.courier)}</b> · ট্র্যাকিং: <b>${esc(o.tracking)}</b></span>${okUrl(o.trackUrl) ? `<a class="btn sm" href="${esc(o.trackUrl)}" target="_blank" rel="noopener">কুরিয়ারে ট্র্যাক করুন</a>` : ''}</div>` : ''}
  ${okUrl(o.previewUrl) ? `<img src="${esc(o.previewUrl)}" alt="প্রিভিউ" loading="lazy" decoding="async" draggable="false" data-prot>` : ''}
  ${o.status === 'PreviewReady' ? `<div class="pbtns"><button data-a="CustomerApproved" data-id="${id}" data-no="${no}">অনুমোদন দিন</button><button data-a="ChangeRequested" data-id="${id}" data-no="${no}">পরিবর্তন চাই</button></div>` : ''}
  ${o.status === 'Pending' ? `<button data-a="Cancelled" data-id="${id}" data-no="${no}">বাতিল করুন</button>` : ''}${o.status === 'Delivered' ? reviewBlock(o) : ''}</div></article>`;
  }).join('') || '<p>কোনো অর্ডার নেই।</p>';
}
$('#orders').onclick = async e => {
  const mb = e.target.closest('button[data-more]');
  if (mb) { const p = document.getElementById(mb.getAttribute('aria-controls')), show = p.hidden; p.hidden = !show; mb.setAttribute('aria-expanded', String(show)); mb.textContent = show ? 'বন্ধ করুন' : 'বিস্তারিত দেখুন'; if (show) OPENO.add(mb.dataset.more); else OPENO.delete(mb.dataset.more); return; }
  const rv = e.target.closest('button[data-rev]');
  if (rv) { rvOpen(rv.dataset.rev, rv.dataset.nm, rv.dataset.no); return; }
  const b = e.target.closest('button[data-a]'); if (!b) return;
  const upd = { status: b.dataset.a, updatedAt: fs.serverTimestamp() };
  if (upd.status === 'ChangeRequested') { const c = prompt('কী পরিবর্তন চান?'); if (!c) return; upd.customerComment = c.slice(0, 500); }
  try { await fs.updateDoc(fs.doc(db, 'orders', b.dataset.id), upd);
    if (b.dataset.no) await fs.updateDoc(fs.doc(db, 'tracks', b.dataset.no), { status: upd.status, updatedAt: fs.serverTimestamp() }).catch(() => {});
    loadOrders(); } catch (err) { alert('ত্রুটি: ' + err.message); }
};


// ঘোষণা পপ-আপ: প্রতিটি নতুন ঘোষণা (noticeId বদলালে) একজন ভিজিটর একবারই দেখেন
function showNotice(s) {
  const body = String(s.notice || '').trim().slice(0, 1000); if (!body) return;
  const title = String(s.noticeTitle || '').trim().slice(0, 80) || 'ঘোষণা';
  let id = String(s.noticeId || ''); if (!id) { let h = 0; for (const c of title + '|' + body) h = (h * 31 + c.charCodeAt(0)) | 0; id = 'L' + h; } // পুরোনো (আইডি-বিহীন) ঘোষণার জন্য
  const KEY = 'pc_notice_seen', get = st => { try { return st.getItem(KEY) || ''; } catch { return ''; } }, put = st => { try { st.setItem(KEY, id); } catch { /* ব্লক থাকলে এই ট্যাবেই সীমাবদ্ধ */ } };
  if (get(localStorage) === id || get(sessionStorage) === id) return;
  const pop = $('#noticePop'), x = $('#npX'), ok = $('#npOk'), prev = document.activeElement;
  $('#npTitle').textContent = title; $('#npBody').textContent = body;
  const close = () => { pop.hidden = true; document.body.style.overflow = ''; document.removeEventListener('keydown', key); put(localStorage); put(sessionStorage); if (prev && prev.focus) prev.focus(); };
  const key = e => { if (e.key === 'Escape') close(); else if (e.key === 'Tab') { const f = [x, ok], i = f.indexOf(document.activeElement); e.preventDefault(); f[(i + (e.shiftKey ? -1 : 1) + 2) % 2].focus(); } };
  x.onclick = ok.onclick = close; pop.onclick = e => { if (e.target === pop) close(); };
  setTimeout(() => { pop.hidden = false; document.body.style.overflow = 'hidden'; document.addEventListener('keydown', key); ok.focus(); }, 600);
}

// ===== যোগাযোগ বাটন (WhatsApp / Messenger) =====
const msUrl = v => {
  v = String(v || '').trim(); if (!v) return '';
  if (/^[A-Za-z0-9._-]{5,}$/.test(v)) return 'https://m.me/' + v;
  try {
    const u = new URL(v); if (u.protocol !== 'https:' || !/^(m\.me|(www\.)?messenger\.com|(www\.)?facebook\.com|fb\.me)$/.test(u.hostname)) return '';
    if (/facebook\.com$/.test(u.hostname)) { const seg = u.pathname.split('/').filter(Boolean)[0] || '', id = seg === 'profile.php' ? u.searchParams.get('id') : seg; return /^[A-Za-z0-9._-]{5,}$/.test(id || '') ? 'https://m.me/' + id : ''; }
    return u.href;
  } catch { return ''; }
};
const waUrl = v => { const d = String(v || '').replace(/\D/g, ''); return d ? `https://wa.me/${d}?text=${encodeURIComponent('আমি পাতার ছবি সম্পর্কে জানতে চাই।')}` : ''; };
function chatSetup(s) {
  const L = [[waUrl(s.whatsapp), 'WhatsApp', 'fa-brands fa-whatsapp', 'cw'], [msUrl(s.messenger), 'Messenger', 'fa-brands fa-facebook-messenger', 'cm']].filter(x => x[0]); if (!L.length) return;
  const box = $('#chat'), btn = $('#chatBtn'), menu = $('#chatMenu'); box.hidden = false;
  if (L.length === 1) { // একটিই মাধ্যম থাকলে সরাসরি চ্যাট খোলে
    btn.className = 'chatb ' + L[0][3]; btn.innerHTML = `<i class="${L[0][2]}" aria-hidden="true"></i>`; btn.setAttribute('aria-label', L[0][1] + '-এ মেসেজ করুন'); btn.removeAttribute('aria-expanded');
    btn.onclick = () => window.open(L[0][0], '_blank', 'noopener'); return;
  }
  menu.innerHTML = L.map(x => `<a class="${x[3]}" href="${esc(x[0])}" target="_blank" rel="noopener"><i class="${x[2]}" aria-hidden="true"></i> ${x[1]}</a>`).join('');
  const shut = () => { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
  btn.onclick = () => { const o = menu.hidden; menu.hidden = !o; btn.setAttribute('aria-expanded', String(o)); };
  document.addEventListener('click', e => { if (!menu.hidden && !box.contains(e.target)) shut(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) { shut(); btn.focus(); } });
}
// ===== ফ্রেমসহ/ফ্রেম ছাড়া অপশন (ধরনের "ফ্রেমসহ মূল্য" দিলে চালু হয়) =====
function frameUpdate() {
  const o = $('#catSel').selectedOptions[0], pf = o ? Number(o.dataset.pf) || 0 : 0, box = $('#frameBox'), est = $('#estPrice');
  box.hidden = !pf; box.querySelectorAll('input').forEach(r => { r.required = !!pf; if (!pf) r.checked = false; });
  let r = '';
  if (pf) {
    $('#frNo').textContent = 'ফ্রেম ছাড়া' + (o.dataset.r ? ' — ' + o.dataset.r : ''); $('#frYes').textContent = 'ফ্রেমসহ — ৳' + bnum(pf);
    const c = box.querySelector('input:checked'); r = c ? (c.value === 'yes' ? '৳' + bnum(pf) : o.dataset.r) : '';
  } else if (o && Number(o.dataset.p)) r = o.dataset.r;
  est.textContent = r ? `আনুমানিক মূল্য: ${r} (চূড়ান্ত মূল্য অর্ডার গ্রহণের সময় নিশ্চিত করা হবে)` : '';
}
// অর্ডারে সেভ হওয়া "ধরন": ফ্রেম অপশন থাকলে শেষে "· ফ্রেমসহ/ফ্রেম ছাড়া" (Rules-এর বিদ্যমান category ফিল্ডেই, নতুন ফিল্ড/Rules বদল ছাড়া)
const catValue = f => { const base = f.category.value; if ($('#frameBox').hidden) return base; return (base.slice(0, 40) + ' · ' + (f.frame.value === 'yes' ? 'ফ্রেমসহ' : 'ফ্রেম ছাড়া')).slice(0, 59); };

// সাইট সেটিংস (অ্যাডমিন প্যানেল থেকে পরিবর্তনযোগ্য)
(async () => {
  const s = (await fs.getDoc(fs.doc(db, 'settings', 'site'))).data() || {};
  const set = (id, v) => { if (v) $('#' + id).textContent = v; };
  set('h1a', s.h1a); set('h1b', s.h1b); set('lead', s.lead); set('fline', s.footer);
  showNotice(s);
  const c = [s.phone && `<i class="fa-solid fa-phone" aria-hidden="true"></i> ${esc(s.phone)}`, s.whatsapp && `<a href="https://wa.me/${esc(String(s.whatsapp).replace(/\D/g, ''))}"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i> WhatsApp</a>`, okUrl(s.facebook) && `<a href="${esc(s.facebook)}"><i class="fa-brands fa-facebook" aria-hidden="true"></i> Facebook</a>`, msUrl(s.messenger) && `<a href="${esc(msUrl(s.messenger))}" target="_blank" rel="noopener"><i class="fa-brands fa-facebook-messenger" aria-hidden="true"></i> Messenger</a>`].filter(Boolean);
  $('#contact').innerHTML = c.join(' · ');
  if (s.cats) applyCats(s.cats); set('leadTime', s.leadTime);
  if (s.advanceAmount) document.querySelectorAll('.advAmt').forEach(x => { x.textContent = Number(s.advanceAmount).toLocaleString('bn-BD'); });
  if (s.bkashNo) $('#advNo').textContent = s.bkashNo;
  if (s.advanceAmount) { ADV = Number(s.advanceAmount); loadOrders(); }
  chatSetup(s);
  if (s.orderOpen === false) { $('#order').classList.add('closed'); $('#closed').hidden = false; }
})().catch(e => console.error(e));

// ছবি বড় করে দেখা (লাইটবক্স) ও মোবাইল মেনু
const lb = $('#lb');
document.addEventListener('click', e => {
  const im = e.target.closest('#gallery img, #orders img, #priceCards img');
  if (im) { const li = lb.querySelector('img'); li.src = im.src; li.toggleAttribute('data-prot', im.hasAttribute('data-prot')); li.draggable = !im.hasAttribute('data-prot'); lb.querySelector('p').textContent = im.closest('figure')?.querySelector('figcaption span')?.textContent || ''; lb.hidden = false; }
  else if (e.target.closest('#lb')) lb.hidden = true;
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') lb.hidden = true; });
// প্রিভিউ ছবি: ডান-ক্লিক/লং-প্রেস মেনু ও টেনে নেওয়া বন্ধ (সাধারণ ক্রেতাদের সহজে সেভ করা ঠেকায়; স্ক্রিনশট বা দক্ষ ব্যবহারকারীকে আটকায় না)
['contextmenu', 'dragstart', 'selectstart'].forEach(t => document.addEventListener(t, e => { if (e.target.closest && e.target.closest('[data-prot]')) e.preventDefault(); }));
$('#navToggle').onclick = () => $('.nav').classList.toggle('open');
document.querySelectorAll('.nav nav a').forEach(l => l.addEventListener('click', () => $('.nav').classList.remove('open')));

// অর্ডার নম্বর, ধরন/মূল্য, নিশ্চিতকরণ
const AL = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function genNo() { return 'LA' + Array.from(crypto.getRandomValues(new Uint8Array(8)), b => AL[b % AL.length]).join(''); }
const bnum = n => { try { return Number(n).toLocaleString('bn-BD'); } catch { return String(n); } };
// মূল্য-পরিসীমা থাকলে "৳৮০০–৳১,৫০০", নইলে আগের মতো একক মূল্য
const priceTxt = k => k.p && k.pmax > k.p ? `৳${bnum(k.p)}–৳${bnum(k.pmax)}` : k.p ? '৳' + bnum(k.p) : '';
function applyCats(c) {
  const L = Array.isArray(c) ? c.map(x => ({ n: x.n, d: String(x.d || ''), p: Number(x.p) || 0, pmax: Number(x.pmax) || 0, pf: Number(x.pf) || 0, img: x.img || '' })) : (c || DEF_CATS).split('\n').map(x => x.trim()).filter(Boolean).map(x => { const [n, p, pm, d] = x.split('|'), num = v => Number((v || '').replace(/[^\d.]/g, '')) || 0; return { n: n.trim(), d: (d || '').trim(), p: num(p), pmax: num(pm), pf: 0, img: '' }; });
  $('#priceCards').innerHTML = L.map(k => `<div class="step pc">${k.img ? `<img src="${esc(k.img)}" alt="" loading="lazy" decoding="async">` : ''}<h3>${esc(k.n)}</h3>${k.d ? `<p class="pcd">${esc(k.d)}</p>` : ''}${k.pf ? `${priceTxt(k) ? `<p class="price">ফ্রেম ছাড়া ${priceTxt(k)}</p>` : ''}<p class="price pfp">ফ্রেমসহ ৳${bnum(k.pf)}</p>` : `<p class="price">${priceTxt(k) || 'মূল্য আলোচনাসাপেক্ষ'}</p>`}</div>`).join('');
  $('#catSel').innerHTML = '<option value="">ধরন বেছে নিন</option>' + L.map(k => `<option value="${esc(k.n)}" data-p="${k.p}" data-pf="${k.pf}" data-r="${esc(priceTxt(k))}">${esc(k.n)}${k.d ? ' (' + esc(k.d) + ')' : ''}${priceTxt(k) ? ' — ' + priceTxt(k) : ''}</option>`).join('');
}
applyCats();
$('#catSel').onchange = frameUpdate; $('#frameBox').onchange = frameUpdate;
function showDone(no) { $('#doneNo').textContent = no; $('#doneTrack').href = 'track.html?no=' + no; $('#done').hidden = false; }
if (/FBAN|FBAV|FB_IAB|Messenger|Instagram/i.test(navigator.userAgent)) $('#iabNote').hidden = false;
$('#doneClose').onclick = () => { $('#done').hidden = true; };
$('#copyNo').onclick = () => navigator.clipboard?.writeText($('#advNo').textContent).then(() => { $('#copyNo').textContent = 'কপি হয়েছে'; });
let ADV = 130;
fs.getDocs(fs.query(fs.collection(db, 'reviews'), fs.where('approved', '==', true), fs.limit(12))).then(s => {
  if (s.empty) return;
  $('#revList').innerHTML = s.docs.map(d => d.data()).map(x => `<div class="step"><div class="stars">${'<i class="fa-solid fa-star" aria-hidden="true"></i>'.repeat(x.rating)}${'<i class="fa-regular fa-star" aria-hidden="true"></i>'.repeat(5 - x.rating)}</div><p>${esc(x.text)}</p><b>${esc(x.name1)}</b></div>`).join('');
  $('#reviews').hidden = false;
}).catch(() => {});

// হিরো সার্কেলের ছবি (অ্যাডমিন থেকে আপলোড; না থাকলে ডিফল্ট কাঁঠাল পাতার SVG থাকে)
(async () => {
  const img = $('#heroImg'), leaf = $('#heroLeaf');
  img.addEventListener('error', () => { img.style.display = 'none'; leaf.style.display = ''; });
  const d = await fs.getDoc(fs.doc(db, 'settings', 'hero')), src = d.data()?.img;
  if (typeof src !== 'string' || !/^data:image\/(webp|jpeg|png);base64,/.test(src)) return;
  const h = d.data(), n = (v, lo, hi, df) => { v = Number(v); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : df; };
  const z = n(h.zoom, .3, 4, 1), ox = n(h.ox, -300, 300, 0), oy = n(h.oy, -300, 300, 0), w = 356 * z; // অ্যাডমিন এডিটরের একই সূত্র; আগের ডেটায় এগুলো না থাকলে আগের মতোই (z=1, ০,০)
  img.setAttribute('width', w); img.setAttribute('height', w); img.setAttribute('x', 200 + ox - w / 2); img.setAttribute('y', 200 + oy - w / 2);
  img.setAttribute('href', src); img.style.display = ''; leaf.style.display = 'none';
})().catch(e => console.error(e));
