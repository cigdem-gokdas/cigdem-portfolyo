import { loadContent, getSite, getLines } from './content.js';
import { loader } from './ui/loader.js';
import { subtitle } from './ui/subtitle.js';
import { initBoard } from './board/board.js';

function webglOk() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; }
}

async function main() {
  loader.set(0);
  await loadContent();
  document.getElementById('ad').textContent = 'Çiğdem Gökdaş'; // TODO: site.json'a ad alanı eklenirse oradan oku
  const board = initBoard(document.getElementById('tahta'), { site: getSite(), lines: getLines() });
  loader.done();

  // Avatar yalnızca geniş ekranda; yüklenirken tahta kullanılabilir
  const canvas = document.getElementById('avatar');
  const spin = document.getElementById('avatar-yukleniyor');
  const wide = matchMedia('(min-width: 900px)').matches;
  if (!wide || !webglOk()) { canvas.hidden = true; spin?.remove(); return; }
  try {
    const { createPresenter } = await import('./avatar/Presenter.js');
    const p = await createPresenter(canvas, { subtitle });
    board.setPresenter(p);
  } catch (e) {
    console.warn('Avatar yüklenemedi; tahta avatarsız çalışıyor', e);
    canvas.hidden = true;
  } finally {
    spin?.classList.add('bitti');
    setTimeout(() => spin?.remove(), 600);
  }
}

main().catch((e) => { console.error(e); const y = document.getElementById('yuzde'); if (y) y.textContent = 'Yüklenemedi'; });
