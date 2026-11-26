// Slayt tahtası: 3 seviye (bölümler → alt başlıklar → detay). Tüm metin content/ altından gelir
// (istisna: "İletişim" bölüm başlığı ve iletişim kartı adları; site.json'da yalnızca adresler var).
// Presenter (avatar) isteğe bağlıdır; yoksa tahta aynı şekilde çalışır.
import { lineFor } from '../content.js';
import { ICONS, DECOR, itemIcon, rough } from './icons.js';

const POINT_TIMEOUT = 1500;
const reduced = matchMedia('(prefers-reduced-motion: reduce)');

const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) el.append(k.nodeType ? k : document.createTextNode(k));
  return el;
};
const slug = (s) => s.toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const chalk = (i = 0) => { const t = document.createElement('template'); t.innerHTML = rough(i); return t.content.firstElementChild; };
const icon = (name) => { const s = h('span', { class: 'ikon', 'aria-hidden': 'true' }); s.innerHTML = ICONS[name] || ICONS.other; return s; };

// İletişim bölümü site.contact'tan türetilir
function contactSection(c) {
  const items = [];
  if (c.github) items.push({ id: 'github', title: 'GitHub', meta: c.github.replace(/^https?:\/\//, ''), href: c.github, icon: 'github' });
  if (c.linkedin) items.push({ id: 'linkedin', title: 'LinkedIn', meta: 'LinkedIn profili', href: c.linkedin, icon: 'linkedin' });
  if (c.email) items.push({ id: 'eposta', title: 'E-posta', meta: c.email, href: 'mailto:' + c.email, icon: 'mail' });
  if (c.phone) items.push({ id: 'telefon', title: 'Telefon', meta: c.phone, href: 'tel:' + c.phone.replace(/\s+/g, ''), icon: 'phone' });
  return { id: 'iletisim', type: 'contact', title: 'İletişim', line: 'iletisim', items };
}

// Beceriler: her beceri bir öğe gibi davranır (detayda kullanıldığı yerler)
function skillItems(sec) {
  return (sec.groups || []).flatMap((g) => g.items.map((s) => ({
    id: slug(s.name), title: s.name, meta: g.name, group: g.name, source: s.source || [],
  })));
}

function countOf(sec) {
  if (sec.type === 'skills') return skillItems(sec).length;
  return (sec.items || []).length;
}

export function initBoard(root, { site, lines }) {
  const sections = [...site.sections, contactSection(site.contact || {})];
  let presenter = null;
  let busy = false;
  let state = { sec: null, item: null };
  let greeted = false;

  root.classList.add('tahta');
  const crumbs = h('nav', { class: 'yol', 'aria-label': 'Konum' });
  const back = h('button', { class: 'geri', type: 'button', 'aria-label': 'Geri', on: { click: () => goBack() } });
  back.innerHTML = ICONS.back + '<span>Geri</span>';
  back.append(chalk(1));
  const bar = h('div', { class: 'tahta-ust' }, back, crumbs, h('span', { class: 'sayfa-no', 'aria-hidden': 'true' }));
  const stage = h('div', { class: 'sahne-alani' });
  const decor = h('div', { class: 'sus', 'aria-hidden': 'true' });
  decor.innerHTML = ['star', 'arrow', 'brace', 'wave', 'sigma'].map((n) => `<span class="sus-${n}">${DECOR[n]}</span>`).join('');
  root.append(decor, bar, stage);

  const findSec = (id) => sections.find((s) => s.id === id) || null;
  const itemsOf = (sec) => (sec.type === 'skills' ? skillItems(sec) : sec.items || []);
  const findItem = (sec, id) => (sec && id ? itemsOf(sec).find((i) => i.id === id) || null : null);

  // ---------- Görünümler ----------
  function viewHome() {
    const grid = h('div', { class: 'izgara bolumler' });
    sections.forEach((sec, i) => {
      const n = countOf(sec);
      grid.append(h('button', {
        class: 'kart bolum', type: 'button', style: `--i:${i}`, 'data-sec': sec.id,
        on: { click: (e) => select(e.currentTarget, { sec: sec.id }) },
      }, icon(sec.type === 'contact' ? 'contact' : sec.type), h('span', { class: 'kart-baslik' }, sec.title),
      n ? h('span', { class: 'rozet' }, String(n)) : null, chalk(i)));
    });
    return h('section', { class: 'slayt' },
      h('header', { class: 'slayt-bas' }, h('p', { class: 'ust-etiket' }, 'Portfolyo'), h('h1', {}, document.getElementById('ad')?.textContent || '')),
      grid);
  }

  function viewSection(sec) {
    const body = h('div', { class: 'izgara ogeler' });
    if (sec.type === 'skills') {
      body.className = 'beceri-gruplari';
      let i = 0;
      for (const g of sec.groups || []) {
        const chips = h('div', { class: 'cipler' });
        for (const s of g.items) {
          const id = slug(s.name);
          chips.append(h('button', { class: 'cip', type: 'button', style: `--i:${i++}`, on: { click: (e) => select(e.currentTarget, { sec: sec.id, item: id }) } }, s.name));
        }
        body.append(h('div', { class: 'grup' }, h('h3', {}, g.name), chips));
      }
    } else if (sec.type === 'contact') {
      sec.items.forEach((it, i) => body.append(h('a', {
        class: 'kart oge iletisim', href: it.href, style: `--i:${i}`,
        target: it.href.startsWith('http') ? '_blank' : null, rel: it.href.startsWith('http') ? 'noopener' : null,
        on: { click: () => presenter?.point(document.activeElement) },
      }, icon(it.icon), h('span', { class: 'kart-baslik' }, it.title), h('span', { class: 'kart-meta' }, it.meta), chalk(i))));
    } else {
      (sec.items || []).forEach((it, i) => body.append(h('button', {
        class: 'kart oge', type: 'button', style: `--i:${i}`,
        on: { click: (e) => select(e.currentTarget, { sec: sec.id, item: it.id }) },
      }, icon(itemIcon(it, sec.type)), h('span', { class: 'kart-baslik' }, it.title), it.meta ? h('span', { class: 'kart-meta' }, it.meta) : null,
      h('span', { class: 'ok', 'aria-hidden': 'true' }, '→'), chalk(i))));
    }
    return h('section', { class: 'slayt' },
      h('header', { class: 'slayt-bas' }, icon(sec.type === 'contact' ? 'contact' : sec.type), h('h2', {}, sec.title)),
      body);
  }

  function viewItem(sec, it) {
    const parts = [h('p', { class: 'ust-etiket' }, sec.title), h('h2', {}, it.title)];
    if (it.meta && sec.type !== 'skills') parts.push(h('p', { class: 'meta' }, it.meta));
    const body = h('div', { class: 'detay' });
    if (sec.type === 'skills') {
      body.append(h('p', { class: 'meta' }, it.group));
      if (it.source.length) body.append(h('ul', { class: 'maddeler' }, it.source.map((s) => h('li', {}, s))));
    } else {
      if (it.summary) body.append(h('p', { class: 'ozet' }, it.summary));
      if (it.bullets?.length) body.append(h('ul', { class: 'maddeler' }, it.bullets.map((b) => h('li', {}, b))));
      if (it.tech?.length) body.append(h('div', { class: 'cipler sabit' }, it.tech.map((t) => h('span', { class: 'cip' }, t))));
      if (it.url) body.append(h('a', { class: 'baglanti', href: it.url, target: '_blank', rel: 'noopener' }, it.url.replace(/^https?:\/\//, '').replace(/\/$/, ''), ' ↗'));
    }
    return h('section', { class: 'slayt' },
      h('header', { class: 'slayt-bas' }, icon(itemIcon(it, sec.type)), h('div', { class: 'baslik-metin' }, ...parts)), body);
  }

  function renderCrumbs(sec, it) {
    crumbs.replaceChildren();
    const add = (label, target, current) => {
      if (crumbs.childNodes.length) crumbs.append(h('span', { class: 'ayrac', 'aria-hidden': 'true' }, '›'));
      crumbs.append(current ? h('span', { 'aria-current': 'page' }, label)
        : h('a', { href: hashOf(target), on: { click: (e) => { e.preventDefault(); navigate(target, -1); } } }, label));
    };
    add('Ana sayfa', {}, !sec);
    if (sec) add(sec.title, { sec: sec.id }, !it);
    if (it) add(it.title, null, true);
    back.hidden = !sec;
    bar.querySelector('.sayfa-no').textContent = sec ? String(sections.indexOf(sec) + 1).padStart(2, '0') + ' / ' + String(sections.length).padStart(2, '0') : '';
  }

  const hashOf = (t) => '#/' + [t.sec, t.item].filter(Boolean).join('/');
  const depth = (t) => (t.item ? 2 : t.sec ? 1 : 0);

  // dir: +1 ileri, -1 geri
  function show(target, dir) {
    const sec = findSec(target.sec);
    const it = findItem(sec, target.item);
    state = { sec: sec?.id || null, item: it?.id || null };
    const view = it ? viewItem(sec, it) : sec ? viewSection(sec) : viewHome();
    renderCrumbs(sec, it);
    const old = stage.firstElementChild;
    if (old && !reduced.matches) {
      old.classList.add(dir < 0 ? 'cik-sag' : 'cik-sol');
      old.addEventListener('animationend', () => old.remove(), { once: true });
      setTimeout(() => old.remove(), 600);
      view.classList.add(dir < 0 ? 'gir-sol' : 'gir-sag');
    } else if (old) old.remove();
    stage.append(view);
    // Odağı yeni slaytın başlığına taşı (ekran okuyucu ve klavye için)
    const hd = view.querySelector('h1, h2');
    if (hd) { hd.tabIndex = -1; hd.focus({ preventScroll: true }); }
    return { sec, it };
  }

  function speakFor(sec, it) {
    if (!presenter) return;
    if (!sec) return;
    const ln = it ? lineFor(it, sec, lines) : lineFor(null, sec, lines);
    if (ln) presenter.say(ln.id, ln.text);
  }

  function navigate(target, dir, { speak = true, push = true } = {}) {
    const { sec, it } = show(target, dir);
    if (push) {
      const hs = hashOf(state);
      if (location.hash !== hs) history.pushState(null, '', hs === '#/' ? location.pathname + location.search : hs);
    }
    if (dir < 0) presenter?.idle();
    else if (speak) speakFor(sec, it);
  }

  // Kullanıcı bastı: avatar dönüp dokunsun, dokunma anında aç
  async function select(el, target) {
    if (busy) return;
    busy = true;
    el.classList.add('basiliyor');
    try {
      if (presenter) {
        await Promise.race([
          Promise.resolve().then(() => presenter.point(el)).catch(() => {}),
          new Promise((r) => setTimeout(r, POINT_TIMEOUT)),
        ]);
      }
      el.classList.remove('basiliyor');
      el.classList.add('basildi');
      await new Promise((r) => setTimeout(r, reduced.matches ? 0 : 160));
      navigate(target, +1);
    } finally { busy = false; }
  }

  function goBack() {
    if (busy) return;
    if (state.item) navigate({ sec: state.sec }, -1);
    else if (state.sec) navigate({}, -1);
  }

  function fromHash() {
    const [sec, item] = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
    return { sec: sec || null, item: item || null };
  }

  addEventListener('popstate', () => {
    const t = fromHash();
    const dir = depth(t) < depth(state) ? -1 : +1;
    navigate(t, dir, { push: false, speak: dir > 0 });
  });
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); goBack(); }
  });

  show(fromHash(), +1);

  return {
    setPresenter(p) {
      presenter = p;
      if (p && !greeted) {
        greeted = true;
        const ln = lines.find((l) => l.id === 'karsilama');
        if (ln) p.say(ln.id, ln.text);
      }
    },
  };
}
