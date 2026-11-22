// İçerik: tüm görünen metin content/ altındaki JSON dosyalarından gelir.
let site = null;
let lines = null;

export async function loadContent() {
  const [s, l] = await Promise.all([
    fetch('./content/site.json').then((r) => r.json()),
    fetch('./content/lines.json').then((r) => r.json()),
  ]);
  site = s;
  lines = l;
}

export const getSite = () => site;
export const getSection = (id) => site.sections.find((s) => s.id === id);
export const getLine = (id) => lines.find((l) => l.id === id);
