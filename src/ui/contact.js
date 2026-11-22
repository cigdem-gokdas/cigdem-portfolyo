// İletişim: bağlantı listesi + sol alt köşe kartı.
function link(label, href, text, external) {
  const li = document.createElement('li');
  const a = document.createElement('a');
  a.href = href;
  a.textContent = text;
  if (external) { a.target = '_blank'; a.rel = 'noopener'; }
  const k = document.createElement('span');
  k.className = 'ui-contact-label';
  k.textContent = label;
  li.append(k, a);
  return li;
}

export function renderContact(contact) {
  const ul = document.createElement('ul');
  ul.className = 'ui-contact';
  const c = contact || {};
  if (c.github) ul.append(link('GitHub', c.github, 'GitHub', true));
  if (c.linkedin) ul.append(link('LinkedIn', c.linkedin, 'LinkedIn', true));
  if (c.email) ul.append(link('E-posta', 'mailto:' + c.email, c.email, false));
  if (c.phone) ul.append(link('Telefon', 'tel:' + c.phone.replace(/[^\d+]/g, ''), c.phone, false));
  return ul;
}

export function initContactCorner(contact) {
  const wrap = document.createElement('div');
  wrap.className = 'ui-corner';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'ui-corner-btn';
  btn.textContent = 'İletişim';
  btn.setAttribute('aria-expanded', 'false');
  const card = document.createElement('div');
  card.className = 'ui-corner-card';
  card.id = 'ui-corner-card';
  card.hidden = true;
  card.append(renderContact(contact));
  btn.setAttribute('aria-controls', card.id);

  let timer = 0;
  const set = (open) => {
    clearTimeout(timer);
    btn.setAttribute('aria-expanded', String(open));
    if (open) {
      card.hidden = false;
      requestAnimationFrame(() => card.classList.add('ui-on'));
    } else {
      card.classList.remove('ui-on');
      timer = setTimeout(() => { card.hidden = true; }, 250);
    }
  };
  btn.addEventListener('click', () => set(btn.getAttribute('aria-expanded') !== 'true'));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && btn.getAttribute('aria-expanded') === 'true') set(false);
  });
  wrap.append(card, btn);
  document.body.append(wrap);
  return wrap;
}
