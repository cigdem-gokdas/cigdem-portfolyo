// Altyazı: alt-orta, tek satır, fade in/out.
const el = document.getElementById('altyazi');

export const subtitle = {
  show(text) { el.textContent = text; el.classList.add('acik'); },
  hide() { el.classList.remove('acik'); },
};
