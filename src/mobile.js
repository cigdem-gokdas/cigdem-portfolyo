// Mobil / WebGL yok: 3D yerine statik sayfa.
import { openPanel } from './ui/panel.js';
import { renderContact } from './ui/contact.js';

export function shouldUseMobile() {
  try {
    if (window.matchMedia('(max-width:767px)').matches) return true;
    const c = document.createElement('canvas');
    return !(c.getContext('webgl2') || c.getContext('webgl'));
  } catch (e) { return true; }
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

export async function initMobile(site, lines, { speak } = {}) {
  document.body.classList.add('ui-mobil');
  const lineIds = new Set(Array.isArray(lines) ? lines.map((l) => l.id) : Object.keys(lines || {}));
  const lineText = (id) => {
    if (Array.isArray(lines)) { const l = lines.find((x) => x.id === id); return l && l.text; }
    const v = lines && lines[id];
    return v && (v.text || v);
  };
  const root = el('div', 'ui-mob');
  const img = el('img', 'ui-mob-poster');
  img.alt = 'Çiğdem Gökdaş avatarı';
  img.src = 'assets/avatar-poster.webp';
  img.addEventListener('error', () => { img.hidden = true; });
  const cap = el('p', 'ui-mob-caption', lineText('karsilama') || '');
  root.append(img, cap);

  (site.sections || []).forEach((sec) => {
    const g = el('section', 'ui-mob-group');
    g.append(el('h2', 'ui-mob-group-title', sec.title));
    const list = el('div', 'ui-mob-btns');
    const entries = (sec.items && sec.items.length) ? sec.items : [{ id: sec.id, title: sec.title }];
    entries.forEach((it) => {
      const b = el('button', 'ui-mob-btn', it.title);
      b.type = 'button';
      b.addEventListener('click', () => {
        openPanel(it, sec);
        if (typeof speak === 'function') speak(lineIds.has(it.id) ? it.id : sec.id);
      });
      list.append(b);
    });
    g.append(list);
    root.append(g);
  });
  const c = el('section', 'ui-mob-group');
  c.append(el('h2', 'ui-mob-group-title', 'İletişim'), renderContact(site.contact));
  root.append(c);
  document.body.append(root);
}
