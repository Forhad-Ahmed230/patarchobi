// পাতার ছবি — অ্যাডমিন নোটিফিকেশন Service Worker
// শুধু নোটিফিকেশনে ক্লিক সামলায়। কোনো ক্যাশ/ফেচ/ব্যাকগ্রাউন্ড ডেটা নেই, তাই বিদ্যমান সাইটে কোনো প্রভাব ফেলে না।
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const id = e.notification.data && e.notification.data.id;
  const url = new URL('admin.html' + (id ? '#o=' + encodeURIComponent(id) : ''), self.registration.scope).href;
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if (/admin/.test(new URL(c.url).pathname)) { await c.focus(); if (id) c.postMessage({ type: 'open-order', id }); return; }
    }
    await self.clients.openWindow(url);
  })());
});
