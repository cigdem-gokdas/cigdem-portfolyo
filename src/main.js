import { loadContent, getSite, getLines } from './content.js';
import { loader } from './ui/loader.js';
import { shouldUseMobile, initMobile } from './mobile.js';

async function main() {
  loader.set(0);
  await loadContent();
  document.getElementById('ad').textContent = 'Çiğdem Gökdaş'; // TODO: site.json'a ad alanı eklenirse oradan oku
  if (shouldUseMobile()) {
    // 3D hiç başlatılmaz (three bile indirilmez)
    loader.done();
    await initMobile(getSite(), getLines(), {
      speak: (id) => { try { new Audio(`./assets/voice/${id}.mp3`).play().catch(() => {}); } catch (e) { /* ses yok */ } },
    });
    return;
  }
  const { start3d } = await import('./scene/app3d.js');
  await start3d();
}

main().catch((e) => { console.error(e); const y = document.getElementById('yuzde'); if (y) y.textContent = 'Yüklenemedi'; });
