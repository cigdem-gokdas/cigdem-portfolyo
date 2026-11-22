// Yükleme ekranı: tek satır yüzde, bitince fade.
const el = document.getElementById('yukleme');
const pct = document.getElementById('yuzde');

export const loader = {
  set(p) { pct.textContent = '%' + Math.round(Math.min(1, p) * 100); },
  done() {
    el.classList.add('bitti');
    setTimeout(() => el.remove(), 900);
  },
};
