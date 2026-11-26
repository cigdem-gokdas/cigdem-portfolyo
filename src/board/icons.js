// Tebeşir karalamaları: 48x48, yalnızca çizgi. Renk: currentColor (CSS'te tebeşir beyazı).
const s = (d) => `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

export const ICONS = {
  // Bölümler
  project: s('<path d="M8 11Q8 9 10 9H38Q40 9 40 11V30H8Z"/><path d="M4 34H44L41 38H7Z"/><path d="M19 15L14 20L19 25M29 15L34 20L29 25M25 14L23 26"/>'),
  hackathon: s('<path d="M14 6H34V18Q34 27 24 28Q14 27 14 18Z"/><path d="M14 10H8Q8 19 15 21M34 10H40Q40 19 33 21"/><path d="M24 28V35M16 41H32M18 41Q18 35 24 35Q30 35 30 41"/><path d="M25 11l-3 5h5l-3 5"/>'),
  experience: s('<path d="M6 16H42V38H6Z"/><path d="M17 16V11H31V16"/><path d="M6 25H42M21 25V29H27V25"/>'),
  education: s('<path d="M3 18L24 8L45 18L24 28Z"/><path d="M12 23V32Q24 40 36 32V23"/><path d="M42 20V32M42 32l-2 4M42 32l2 4"/>'),
  skills: s('<path d="M24 5A12 12 0 0 1 32 26V31H16V26A12 12 0 0 1 24 5Z"/><path d="M18 36H30M20 41H28M24 31V22M20 18l4 4 4-4"/><path d="M6 14l4 2M42 14l-4 2M3 25h4M41 25h4"/>'),
  other: s('<path d="M5 8H27Q30 8 30 11V21Q30 24 27 24H15L9 30V24H8Q5 24 5 21Z"/><path d="M34 18H40Q43 18 43 21V31Q43 34 40 34H39V40L33 34H23Q20 34 20 31V29"/><path d="M11 14H24M11 18H20"/>'),
  contact: s('<path d="M5 11H43V37H5Z"/><path d="M5 12L24 27L43 12"/><path d="M5 36L18 23M43 36L30 23"/>'),
  // Bağlantılar
  github: s('<circle cx="14" cy="10" r="4"/><circle cx="14" cy="38" r="4"/><circle cx="34" cy="20" r="4"/><path d="M14 14V34M34 24Q34 31 14 32"/>'),
  linkedin: s('<rect x="6" y="6" width="36" height="36" rx="5"/><path d="M16 21V33M16 14.5v.5M23 33V21M23 27Q23 21 29 21Q33 21 33 27V33"/>'),
  mail: s('<path d="M5 11H43V37H5Z"/><path d="M5 12L24 27L43 12"/><path d="M5 36L18 23M43 36L30 23"/>'),
  phone: s('<path d="M12 6H18L21 15L16 18Q20 28 30 32L33 27L42 30V36Q42 42 36 42Q10 40 6 12Q6 6 12 6Z"/><path d="M30 8Q38 9 40 17M30 14Q34 15 35 19"/>'),
  back: s('<path d="M42 24H9M19 13L8 24L19 35"/>'),
  // Öğe karalamaları (anahtar kelimeyle seçilir)
  code: s('<path d="M16 12L5 24L16 36M32 12L43 24L32 36M27 8L21 40"/>'),
  web: s('<rect x="5" y="8" width="38" height="31" rx="3"/><path d="M5 17H43M10 12.5h.1M15 12.5h.1M20 12.5h.1"/><circle cx="24" cy="28" r="7"/><path d="M17 28H31M24 21Q20 28 24 35M24 21Q28 28 24 35"/>'),
  mobile: s('<rect x="14" y="4" width="20" height="40" rx="4"/><path d="M21 8H27M22 39H26M19 17L23 21L19 25M25 26H30"/>'),
  ai: s('<rect x="10" y="15" width="28" height="23" rx="5"/><path d="M24 15V9M5 24V30M43 24V30"/><circle cx="24" cy="6.5" r="2.5"/><circle cx="18" cy="26" r="3"/><circle cx="30" cy="26" r="3"/><path d="M18 33H30"/>'),
  data: s('<ellipse cx="24" cy="11" rx="14" ry="5"/><path d="M10 11V37Q10 42 24 42Q38 42 38 37V11M10 20Q10 25 24 25Q38 25 38 20M10 29Q10 34 24 34Q38 34 38 29"/>'),
  game: s('<path d="M12 14H36Q44 14 45 28Q46 38 40 38Q35 38 33 32H15Q13 38 8 38Q2 38 3 28Q4 14 12 14Z"/><path d="M13 21V29M9 25H17"/><circle cx="32" cy="22" r="1.5"/><circle cx="37" cy="27" r="1.5"/>'),
  gear: s('<circle cx="24" cy="24" r="6"/><circle cx="24" cy="24" r="13"/><path d="M24 6V11M24 37V42M6 24H11M37 24H42M11.3 11.3l3.5 3.5M33.2 33.2l3.5 3.5M36.7 11.3l-3.5 3.5M14.8 33.2l-3.5 3.5"/>'),
};

// Köşe süsleri (soluk, okunurluğu bozmaz)
export const DECOR = {
  star: s('<path d="M24 5L28.5 18L42 18.5L31.5 27L35 41L24 33L13 41L16.5 27L6 18.5L19.5 18Z"/>'),
  arrow: s('<path d="M4 34Q16 10 30 26T44 12M36 11L44 12L42 20"/>'),
  brace: s('<path d="M20 4Q14 4 14 10V19Q14 24 8 24Q14 24 14 29V38Q14 44 20 44"/><path d="M28 12H42M28 24H38M28 36H42"/>'),
  sigma: s('<path d="M34 8H12L26 24L12 40H34"/>'),
  wave: s('<path d="M2 24Q8 8 14 24T26 24T38 24T48 22"/><path d="M2 24H46"/>'),
};

// Anahtar kelimeyle öğe karalaması; bulunamazsa bölüm türüne göre yedek
const KEYS = [
  ['game', /oyun|game/],
  ['mobile', /mobil|mobile|flutter|react native|android|\bios\b/],
  ['ai', /yapay zeka|\bllm\b|\bgpt|gemini|ollama|\bveo\b|actor-critic|ai\b/],
  ['web', /\bweb\b|html|tailwind|netlify|javascript|react\b|css\b/],
  ['data', /\bveri|\bdata|sql|mongo|falkor|chroma|grafik/],
];
const FALLBACK = { project: 'code', hackathon: 'hackathon', experience: 'experience', education: 'education', skills: 'gear', other: 'other' };

export function itemIcon(item, secType) {
  const text = [item.title, item.meta, ...(item.tech || [])].filter(Boolean).join(' ').toLocaleLowerCase('tr');
  for (const [name, re] of KEYS) if (re.test(text)) return name;
  return FALLBACK[secType] || 'other';
}

// El çizimi dikdörtgen: viewBox 100x100, kutuya esner (non-scaling-stroke). 3 çeşit, iki geçişli.
const ROUGH = [
  ['M1.5 2.5Q50 .8 98.5 2Q99.4 50 98 97.5Q50 99.3 2 98Q.8 50 2.2 1', 'M2.5 1.2Q50 2.6 97.5 1Q98.8 50 99.2 98.8Q50 97.4 1 99Q1.8 50 .6 3.5'],
  ['M2 1.5Q50 2.4 99 1.2Q98.2 50 99.2 98Q50 96.8 1.2 99Q2.2 50 1 .4', 'M1 2.8Q50 .9 98 2.6Q99.6 50 97.8 99.3Q50 98.6 2.4 97.6Q.6 50 2.6 2'],
  ['M1.2 1.8Q50 1.2 98.8 2.4Q98.6 50 98 98.4Q50 99.6 1.6 97.8Q1.4 50 1.8 .6', 'M2.4 2.6Q50 1.8 97.2 1Q99.2 50 99 97.2Q50 98 1 98.8Q2 50 .4 1.6'],
];
export const rough = (i = 0) => {
  const [a, b] = ROUGH[i % ROUGH.length];
  return `<svg class="cizgi" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path class="ikinci" d="${b}"/><path d="${a}"/></svg>`;
};
