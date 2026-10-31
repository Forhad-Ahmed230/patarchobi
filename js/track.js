import { db, fs, $, esc, okUrl, LABEL, sha } from './common.js';
const ST = ['Pending', 'Accepted', 'InProgress', 'PreviewReady', 'CustomerApproved', 'Shipped', 'Delivered'];
const q = new URLSearchParams(location.search); if (q.get('no')) $('#no').value = q.get('no');
fs.getDoc(fs.doc(db, 'settings', 'site')).then(d => { const w = d.data()?.whatsapp; if (w) { $('#wa').href = 'https://wa.me/' + String(w).replace(/\D/g, ''); $('#wa').hidden = false; } }).catch(() => {});
const bad = '<p class="note">অর্ডার পাওয়া যায়নি। অর্ডার নম্বর ও মোবাইল নম্বর ঠিক আছে কি না দেখুন।</p>';
$('#tf').onsubmit = async e => {
  e.preventDefault(); const no = $('#no').value.trim().toUpperCase().replace(/[^A-Z0-9]/g, ''), ph = $('#ph').value.trim(), out = $('#out');
  if (!/^LA[A-Z0-9]{8}$/.test(no)) { out.innerHTML = bad; return; }
  out.innerHTML = '<p class="note">খোঁজা হচ্ছে…</p>';
  try {
    const d = await fs.getDoc(fs.doc(db, 'tracks', no)), t = d.exists() ? d.data() : null;
    if (!t || t.phoneHash !== await sha(no + ':' + ph)) { out.innerHTML = bad; return; }
    const i = t.status === 'ChangeRequested' ? 3 : ST.indexOf(t.status);
    out.innerHTML = `<div class="card"><h3 style="margin:0 0 8px">${esc(no)} <span class="badge s-${esc(t.status)}">${LABEL[t.status] || ''}</span></h3>
    ${i >= 0 ? `<ol class="tl">${ST.map((s, k) => `<li class="${k <= i ? 'done' : ''}${k === i ? ' cur' : ''}">${LABEL[s]}</li>`).join('')}</ol>` : `<p class="note">এই অর্ডারটি ${LABEL[t.status] || ''}।</p>`}
    ${t.courier || t.tracking ? `<p><b>কুরিয়ার:</b> ${esc(t.courier)}<br><b>ট্র্যাকিং নম্বর:</b> ${esc(t.tracking)}</p>` : ''}
    ${okUrl(t.trackUrl) ? `<a class="btn gold" href="${esc(t.trackUrl)}" target="_blank" rel="noopener">কুরিয়ারের সাইটে ট্র্যাক করুন</a>` : ''}
    ${t.updatedAt ? `<p class="note" style="font-size:.85rem">সর্বশেষ আপডেট: ${t.updatedAt.toDate().toLocaleString('bn-BD')}</p>` : ''}
    <p class="note" style="font-size:.85rem">প্রিভিউ দেখতে ও অনুমোদন দিতে হোম পেজে লগইন করে "আমার অর্ডার" দেখুন।</p></div>`;
  } catch (err) { out.innerHTML = '<p class="note">ত্রুটি হয়েছে, একটু পরে আবার চেষ্টা করুন।</p>'; }
};
