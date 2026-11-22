// Düz liste: tam ekran, tek sütun metin sayfası.
import { renderContact } from './contact.js';

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

export function initFlatList(site, { onSelect } = {}) {
  const trigger = document.getElementById('duz-liste');
  if (!trigger) { console.warn('#duz-liste bulunamadı'); return null; }
  let root = null, lastFocus = null, timer = 0;

  function build() {
    const r = el('div', 'ui-flat');
    r.setAttribute('role', 'dialog');
    r.setAttribute('aria-label', 'Düz liste');
    r.hidden = true;
    const back = el('button', 'ui-flat-back', "3D'ye dön");
    back.type = 'button';
    back.addEventListener('click', close);
    const main = el('main', 'ui-flat-main');
    (site.sections || []).forEach((sec) => {
      const s = el('section', 'ui-flat-sec');
      s.append(el('h2', 'ui-flat-sec-title', sec.title));
      if (sec.type === 'skills' && sec.groups) {
        sec.groups.forEach((g) => {
          const d = el('div', 'ui-flat-item');
          d.append(el('h3', 'ui-flat-item-title', g.name));
          d.append(el('p', 'ui-flat-summary', (g.items || []).map((x) => (typeof x === 'string' ? x : x.name)).join(', ')));
          s.append(d);
        });
      }
      (sec.items || []).forEach((it) => {
        const d = el('div', 'ui-flat-item');
        const h = el('h3', 'ui-flat-item-title');
        if (onSelect) {
          const b = el('button', 'ui-flat-link', it.title);
          b.type = 'button';
          b.addEventListener('click', () => onSelect(it, sec));
          h.append(b);
        } else h.textContent = it.title;
        d.append(h);
        if (it.meta) d.append(el('p', 'ui-flat-meta', it.meta));
        if (it.summary) d.append(el('p', 'ui-flat-summary', it.summary));
        if (it.url) {
          const a = el('a', 'ui-flat-url', 'Projeyi aç');
          a.href = it.url; a.target = '_blank'; a.rel = 'noopener';
          d.append(a);
        }
        s.append(d);
      });
      main.append(s);
    });
    const c = el('section', 'ui-flat-sec');
    c.append(el('h2', 'ui-flat-sec-title', 'İletişim'), renderContact(site.contact));
    main.append(c);
    r.append(back, main);
    document.body.append(r);
    return r;
  }

  function show() {
    if (!root) root = build();
    clearTimeout(timer);
    lastFocus = document.activeElement;
    root.hidden = false;
    root.scrollTop = 0;
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('ui-on')));
    root.querySelector('.ui-flat-back').focus({ preventScroll: true });
  }
  function close() {
    if (!root || root.hidden) return;
    root.classList.remove('ui-on');
    timer = setTimeout(() => { root.hidden = true; }, 250);
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }
  trigger.addEventListener('click', (e) => { e.preventDefault(); show(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && root && !root.hidden) close();
  });
  return { open: show, close };
}
