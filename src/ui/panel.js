// Yan panel: sağdan (masaüstü) / alttan (mobil) kayar, içerik katman katman belirir.
let root = null, lastFocus = null, closeCbs = [], open = false, hideTimer = 0;

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function build(item, section) {
  const parts = [];
  const type = section && section.type;
  if (section && section.title) parts.push(el('p', 'ui-p-section', section.title));
  const title = el('h2', 'ui-p-title', item.title || item.name || (section && section.title) || '');
  title.id = 'ui-panel-title';
  title.tabIndex = -1;
  parts.push(title);
  if (item.meta) parts.push(el('p', 'ui-p-meta', item.meta));
  if (item.summary) parts.push(el('p', 'ui-p-summary', item.summary));
  if (item.bullets && item.bullets.length) {
    const ul = el('ul', 'ui-p-bullets');
    item.bullets.forEach((b) => ul.append(el('li', null, b)));
    parts.push(ul);
  }
  if (item.tech && item.tech.length) {
    const row = el('div', 'ui-p-tech');
    item.tech.forEach((t) => row.append(el('span', 'ui-tag', t)));
    parts.push(row);
  }
  if (type === 'skills' && section.groups) {
    const groups = item.items && item.name ? [item] : section.groups;
    groups.forEach((g) => {
      const box = el('div', 'ui-p-group');
      box.append(el('h3', 'ui-p-group-title', g.name));
      box.append(el('p', 'ui-p-group-items',
        (g.items || []).map((x) => (typeof x === 'string' ? x : x.name)).join(', ')));
      parts.push(box);
    });
  }
  if (item.url) {
    const a = el('a', 'ui-p-open', 'Projeyi aç');
    a.href = item.url;
    a.target = '_blank';
    a.rel = 'noopener';
    parts.push(a);
  }
  return { parts, title };
}

function ensureRoot() {
  if (root) return root;
  root = el('aside', 'ui-panel');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-labelledby', 'ui-panel-title');
  root.hidden = true;
  document.body.append(root);
  document.addEventListener('keydown', () => document.body.classList.add('ui-kbd'), true);
  document.addEventListener('pointerdown', () => document.body.classList.remove('ui-kbd'), true);
  document.addEventListener('keydown', (e) => {
    if (open && e.key === 'Escape') { e.stopPropagation(); closePanel(); }
  }, true);
  return root;
}

export function openPanel(item, section) {
  if (!item) return;
  ensureRoot();
  clearTimeout(hideTimer);
  if (!open) lastFocus = document.activeElement;
  const { parts, title } = build(item, section || {});
  const close = el('button', 'ui-p-close', 'Kapat');
  close.type = 'button';
  close.addEventListener('click', closePanel);
  const body = el('div', 'ui-p-body');
  root.replaceChildren(close, body);
  parts.forEach((p, i) => {
    p.classList.add('ui-rise');
    p.style.transitionDelay = (120 + i * 70) + 'ms';
    body.append(p);
  });
  root.hidden = false;
  open = true;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    root.classList.add('ui-on');
    title.focus({ preventScroll: true });
  }));
}

export function closePanel() {
  if (!open) return;
  open = false;
  root.classList.remove('ui-on');
  hideTimer = setTimeout(() => { root.hidden = true; }, 350);
  const f = lastFocus;
  lastFocus = null;
  if (f && f.focus && document.contains(f)) f.focus({ preventScroll: true });
  closeCbs.slice().forEach((cb) => { try { cb(); } catch (e) { console.error(e); } });
}

export function onPanelClose(cb) { if (typeof cb === 'function') closeCbs.push(cb); }
export function isPanelOpen() { return open; }
