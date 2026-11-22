// Büyük ekran (masaüstü): sağ panel yerine 3D ekran açılır. Bu modül yalnızca DOM tarafı:
// - görünmez role="dialog" aria-live bölgesi (ekran metni ekran okuyucu için),
// - sağ üstte küçük "Kapat" düğmesi, Esc ile kapatma,
// - gerçek <a href target=_blank rel=noopener> bağlantısı: 3D "Projeyi aç" düğmesinin tam üstüne konumlanır (her karede setLinkRect).
// Otomatik açma yok; yalnız kullanıcı tıklayınca açılır. Mobil panel (panel.js) etkilenmez.
let host = null, sr = null, closeBtn = null, link = null, open = false, lastFocus = null, onClose = null;

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function ensure() {
  if (host) return;
  host = el('div', 'ui-big');
  host.hidden = true;
  sr = el('div', 'ui-big-sr');
  sr.setAttribute('role', 'dialog');
  sr.setAttribute('aria-live', 'polite');
  sr.setAttribute('aria-modal', 'false');
  sr.tabIndex = -1;
  link = el('a', 'ui-big-link');
  link.target = '_blank'; link.rel = 'noopener';
  link.hidden = true;
  closeBtn = el('button', 'ui-big-close', 'Kapat');
  closeBtn.type = 'button';
  closeBtn.addEventListener('click', () => { if (onClose) onClose(); });
  host.append(sr, link, closeBtn);
  document.body.append(host);
  document.addEventListener('keydown', (e) => {
    if (open && e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); if (onClose) onClose(); }
  }, true);
  document.addEventListener('keydown', () => document.body.classList.add('ui-kbd'), true);
  document.addEventListener('pointerdown', () => document.body.classList.remove('ui-kbd'), true);
}

// Ekran okuyucu metni: başlık, meta, özet, maddeler, teknolojiler, beceri grupları
function fillSr(item, section) {
  const parts = [];
  const skills = section && section.type === 'skills' && item === section;
  if (section && section.title && !skills) parts.push(el('p', null, section.title));
  parts.push(el('h2', null, item.title || item.name || (section && section.title) || ''));
  if (item.meta) parts.push(el('p', null, item.meta));
  if (item.summary) parts.push(el('p', null, item.summary));
  if (item.bullets && item.bullets.length) {
    const ul = el('ul'); item.bullets.slice(0, 3).forEach((b) => ul.append(el('li', null, b))); parts.push(ul);
  }
  if (item.tech && item.tech.length) parts.push(el('p', null, 'Kullanılan teknolojiler: ' + item.tech.join(', ')));
  if (skills) for (const g of section.groups || []) parts.push(el('p', null, g.name + ': ' + (g.items || []).map((x) => (typeof x === 'string' ? x : x.name)).join(', ')));
  sr.replaceChildren(...parts);
  sr.setAttribute('aria-label', item.title || item.name || (section && section.title) || '');
}

export const bigScreen = {
  get isOpen() { return open; },
  onClose(cb) { onClose = cb; },
  // Ekran açılırken: metni yükle (görünmez), bağlantıyı hazırla
  show(item, section) {
    ensure();
    if (!open) lastFocus = document.activeElement;
    open = true;
    document.body.classList.add('ui-big-open');
    host.hidden = false;
    fillSr(item, section);
    closeBtn.classList.remove('ui-on');
    closeBtn.tabIndex = -1;
    if (item.url) { link.href = item.url; link.setAttribute('aria-label', 'Projeyi aç: ' + (item.title || '')); } else { link.removeAttribute('href'); }
    link.hidden = true;
  },
  // Efekt bitti: Kapat düğmesi görünür, odak ekran metnine (ekran okuyucu okur)
  ready() {
    if (!open) return;
    closeBtn.classList.add('ui-on');
    closeBtn.tabIndex = 0;
    sr.focus({ preventScroll: true });
  },
  // Bağlantının ekran dikdörtgeni (piksel); null = gizle (efekt sürerken / kapanırken / url yok)
  setLinkRect(r) {
    if (!link) return;
    if (!r || !link.getAttribute('href')) { if (!link.hidden) link.hidden = true; return; }
    if (link.hidden) link.hidden = false;
    const st = link.style;
    st.left = r.x.toFixed(1) + 'px'; st.top = r.y.toFixed(1) + 'px'; st.width = r.w.toFixed(1) + 'px'; st.height = r.h.toFixed(1) + 'px';
  },
  hide() {
    if (!open) return;
    open = false;
    document.body.classList.remove('ui-big-open');
    closeBtn.classList.remove('ui-on');
    link.hidden = true;
    host.hidden = true;
    sr.replaceChildren();
    const f = lastFocus; lastFocus = null;
    if (f && f.focus && document.contains(f)) f.focus({ preventScroll: true });
  },
};
