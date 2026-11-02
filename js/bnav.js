// মোবাইলের নিচের মেনুতে বর্তমান সেকশন হাইলাইট (শুধু দৃশ্যমান পরিবর্তন; অন্য কোনো কোডে হাত দেয় না)
(() => {
  const links = [...document.querySelectorAll('.bnav a[href^="#"]')];
  const items = links.map((a) => ({ a, el: document.querySelector(a.getAttribute('href')) })).filter((x) => x.el);
  if (!items.length) return;
  let tick = false;
  const update = () => {
    tick = false;
    const line = innerHeight * 0.35;
    let cur = items[0], best = -Infinity; // পেজের ক্রমে নয়, যেটির উপরের প্রান্ত লাইনের সবচেয়ে কাছে (পার হয়েছে এমন) সেটি
    for (const it of items) { const t = it.el.getBoundingClientRect().top; if (t <= line && t > best) { best = t; cur = it; } }
    items.forEach((it) => it.a.classList.toggle('on', it === cur));
  };
  const onScroll = () => { if (!tick) { tick = true; requestAnimationFrame(update); } };
  addEventListener('scroll', onScroll, { passive: true }); addEventListener('resize', onScroll); update();
})();
