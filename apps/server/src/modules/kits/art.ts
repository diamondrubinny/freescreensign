/**
 * Rubinny Art Pack: original artwork for the starter kits, drawn as SVG in code and
 * dedicated to the public domain (CC0 1.0). Each piece is turned into a PNG by sharp when a
 * kit is created and goes through the normal media pipeline (scan, processing). There is no
 * text in the art: words are design elements, so they stay editable and translated.
 */

export interface ArtPiece {
  /** Width and height of the PNG made from it. */
  width: number;
  height: number;
  /** English name for the media library. */
  name: string;
  /** Hebrew name for the media library. */
  nameHe: string;
  svg: (width: number, height: number) => string;
}

const svg = (width: number, height: number, viewBox: string, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${String(width)}" height="${String(height)}" viewBox="${viewBox}" preserveAspectRatio="xMidYMid slice">${body}</svg>`;

/** Deterministic pseudo-random numbers, so the art is the same on every server. */
function random(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}

/** Soft round lights ("bokeh"), as a group of blurred circles. */
function bokeh(seed: number, count: number, colors: string[], w: number, h: number) {
  const next = random(seed);
  let circles = '';
  for (let i = 0; i < count; i++) {
    const r = 20 + next() * 90;
    circles += `<circle cx="${(next() * w).toFixed(0)}" cy="${(next() * h).toFixed(0)}" r="${r.toFixed(0)}" fill="${colors[i % colors.length] ?? '#fff'}" opacity="${(0.08 + next() * 0.22).toFixed(2)}"/>`;
  }
  return `<g filter="url(#soft)">${circles}</g>`;
}

const softFilter = (amount: number) =>
  `<filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${String(amount)}"/></filter>`;

// ---- Backgrounds -----------------------------------------------------------------------

/** Restaurant: warm darkness with candle-like lights. */
const ember = (width: number, height: number) =>
  svg(
    width,
    height,
    '0 0 1600 1200',
    `<defs>
      <radialGradient id="g" cx="30%" cy="35%" r="85%">
        <stop offset="0" stop-color="#4a2a17"/><stop offset="0.55" stop-color="#1f120b"/><stop offset="1" stop-color="#0b0604"/>
      </radialGradient>
      <radialGradient id="glow" cx="50%" cy="50%" r="50%">
        <stop offset="0" stop-color="#f3b36b" stop-opacity="0.55"/><stop offset="1" stop-color="#f3b36b" stop-opacity="0"/>
      </radialGradient>
      ${softFilter(18)}
    </defs>
    <rect width="1600" height="1200" fill="url(#g)"/>
    <ellipse cx="420" cy="380" rx="520" ry="420" fill="url(#glow)"/>
    ${bokeh(7, 26, ['#f7c27a', '#e8935a', '#fde2b8'], 1600, 1200)}
    <path d="M0 980 C 300 900, 520 1060, 820 990 S 1350 900, 1600 1000 L1600 1200 L0 1200 Z" fill="#000" opacity="0.35"/>`,
  );

/** Café: a dark slate chalkboard with soft chalk haze and a wooden frame. */
const chalkboard = (width: number, height: number) => {
  const next = random(11);
  let specks = '';
  for (let i = 0; i < 260; i++) {
    specks += `<circle cx="${(next() * 1600).toFixed(0)}" cy="${(next() * 1200).toFixed(0)}" r="${(0.6 + next() * 1.8).toFixed(1)}" fill="#fff" opacity="${(0.04 + next() * 0.1).toFixed(2)}"/>`;
  }
  return svg(
    width,
    height,
    '0 0 1600 1200',
    `<defs>
      <linearGradient id="wood" x1="0" x2="1"><stop offset="0" stop-color="#6b4226"/><stop offset="0.5" stop-color="#8a5a35"/><stop offset="1" stop-color="#5a3620"/></linearGradient>
      <radialGradient id="board" cx="45%" cy="40%" r="80%"><stop offset="0" stop-color="#2f3a35"/><stop offset="1" stop-color="#18201c"/></radialGradient>
      ${softFilter(40)}
    </defs>
    <rect width="1600" height="1200" fill="url(#wood)"/>
    <rect x="44" y="44" width="1512" height="1112" rx="10" fill="url(#board)"/>
    <g filter="url(#soft)"><ellipse cx="500" cy="380" rx="420" ry="200" fill="#fff" opacity="0.07"/><ellipse cx="1150" cy="850" rx="380" ry="160" fill="#fff" opacity="0.05"/></g>
    ${specks}`,
  );
};

/** Cinema: a night-blue hall, two spotlight beams and a velvet curtain edge. */
const cinema = (width: number, height: number) =>
  svg(
    width,
    height,
    '0 0 1600 1200',
    `<defs>
      <radialGradient id="g" cx="50%" cy="20%" r="95%"><stop offset="0" stop-color="#1d2b53"/><stop offset="0.6" stop-color="#0a0f22"/><stop offset="1" stop-color="#03040a"/></radialGradient>
      <linearGradient id="beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6d5" stop-opacity="0.45"/><stop offset="1" stop-color="#fff6d5" stop-opacity="0"/></linearGradient>
      <linearGradient id="velvet" x1="0" x2="1"><stop offset="0" stop-color="#5c0b16"/><stop offset="0.5" stop-color="#9b1b2a"/><stop offset="1" stop-color="#4a0911"/></linearGradient>
      ${softFilter(14)}
    </defs>
    <rect width="1600" height="1200" fill="url(#g)"/>
    <g filter="url(#soft)">
      <polygon points="300,-40 380,-40 900,1200 300,1200" fill="url(#beam)"/>
      <polygon points="1220,-40 1300,-40 1300,1200 700,1200" fill="url(#beam)"/>
    </g>
    ${bokeh(23, 18, ['#fde68a', '#93c5fd'], 1600, 700)}
    ${[0, 1]
      .map((side) => {
        const x = side === 0 ? 0 : 1600;
        const dir = side === 0 ? 1 : -1;
        let folds = '';
        for (let i = 0; i < 4; i++) {
          const start = x + dir * i * 38;
          folds += `<path d="M${String(start)} 0 Q ${String(start + dir * 30)} 600 ${String(start + dir * 12)} 1200 L ${String(start + dir * 38)} 1200 Q ${String(start + dir * 60)} 600 ${String(start + dir * 38)} 0 Z" fill="url(#velvet)" opacity="${(0.95 - i * 0.12).toFixed(2)}"/>`;
        }
        return folds;
      })
      .join('')}`,
  );

/** Sale: a red-orange burst of rays from a bright center. */
const burst = (width: number, height: number) => {
  let rays = '';
  for (let i = 0; i < 36; i++) {
    const a1 = (i / 36) * Math.PI * 2;
    const a2 = a1 + Math.PI / 36;
    const r = 2000;
    rays += `<polygon points="800,600 ${(800 + Math.cos(a1) * r).toFixed(0)},${(600 + Math.sin(a1) * r).toFixed(0)} ${(800 + Math.cos(a2) * r).toFixed(0)},${(600 + Math.sin(a2) * r).toFixed(0)}" fill="#fff" opacity="0.07"/>`;
  }
  return svg(
    width,
    height,
    '0 0 1600 1200',
    `<defs><radialGradient id="g" cx="50%" cy="50%" r="75%"><stop offset="0" stop-color="#f97316"/><stop offset="0.45" stop-color="#dc2626"/><stop offset="1" stop-color="#7f1d1d"/></radialGradient></defs>
    <rect width="1600" height="1200" fill="url(#g)"/>${rays}
    ${bokeh(31, 14, ['#fde047', '#fff'], 1600, 1200).replace('url(#soft)', 'url(#soft2)')}
    <defs><filter id="soft2" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="10"/></filter></defs>`,
  );
};

/** Office lobby: calm blues with layered waves and a fine grid. */
const waves = (width: number, height: number) => {
  let grid = '';
  for (let x = 0; x <= 1600; x += 80) {
    grid += `<line x1="${String(x)}" y1="0" x2="${String(x)}" y2="1200" stroke="#fff" stroke-opacity="0.04"/>`;
  }
  for (let y = 0; y <= 1200; y += 80) {
    grid += `<line x1="0" y1="${String(y)}" x2="1600" y2="${String(y)}" stroke="#fff" stroke-opacity="0.04"/>`;
  }
  return svg(
    width,
    height,
    '0 0 1600 1200',
    `<defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b1f3a"/><stop offset="1" stop-color="#123c69"/></linearGradient>
      <linearGradient id="w1" x1="0" x2="1"><stop offset="0" stop-color="#38bdf8" stop-opacity="0.55"/><stop offset="1" stop-color="#6366f1" stop-opacity="0.35"/></linearGradient>
      <linearGradient id="w2" x1="0" x2="1"><stop offset="0" stop-color="#22d3ee" stop-opacity="0.3"/><stop offset="1" stop-color="#a78bfa" stop-opacity="0.25"/></linearGradient>
    </defs>
    <rect width="1600" height="1200" fill="url(#g)"/>${grid}
    <path d="M0 860 C 320 760, 640 980, 960 860 S 1440 760, 1600 820 L1600 1200 L0 1200 Z" fill="url(#w2)"/>
    <path d="M0 960 C 360 860, 700 1080, 1040 960 S 1460 880, 1600 940 L1600 1200 L0 1200 Z" fill="url(#w1)"/>
    <circle cx="1320" cy="260" r="180" fill="none" stroke="#7dd3fc" stroke-opacity="0.25" stroke-width="3"/>
    <circle cx="1320" cy="260" r="260" fill="none" stroke="#7dd3fc" stroke-opacity="0.12" stroke-width="2"/>`,
  );
};

/** Hotel: deep navy with gold art-deco fans and lines. */
const deco = (width: number, height: number) => {
  let fans = '';
  for (const [cx, cy, flip] of [
    [0, 1200, 1],
    [1600, 0, -1],
  ] as const) {
    for (let r = 120; r <= 720; r += 75) {
      fans += `<circle cx="${String(cx)}" cy="${String(cy)}" r="${String(r)}" fill="none" stroke="#d4af37" stroke-opacity="${(0.45 - r / 2400).toFixed(2)}" stroke-width="3"/>`;
    }
    for (let i = 0; i <= 8; i++) {
      const a = (i / 8) * (Math.PI / 2);
      const x = cx + flip * Math.cos(a) * 760;
      const y = cy - flip * Math.sin(a) * 760;
      fans += `<line x1="${String(cx)}" y1="${String(cy)}" x2="${x.toFixed(0)}" y2="${y.toFixed(0)}" stroke="#d4af37" stroke-opacity="0.18" stroke-width="2"/>`;
    }
  }
  return svg(
    width,
    height,
    '0 0 1600 1200',
    `<defs><radialGradient id="g" cx="50%" cy="45%" r="80%"><stop offset="0" stop-color="#172554"/><stop offset="1" stop-color="#070b1a"/></radialGradient></defs>
    <rect width="1600" height="1200" fill="url(#g)"/>${fans}
    <rect x="60" y="60" width="1480" height="1080" fill="none" stroke="#d4af37" stroke-opacity="0.35" stroke-width="4"/>
    <rect x="80" y="80" width="1440" height="1040" fill="none" stroke="#d4af37" stroke-opacity="0.2" stroke-width="2"/>`,
  );
};

/** Community and school: a cheerful light background with confetti. */
const confetti = (width: number, height: number) => {
  const next = random(41);
  const colors = ['#f43f5e', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'];
  let pieces = '';
  for (let i = 0; i < 110; i++) {
    const x = next() * 1600;
    const y = next() * 1200;
    const color = colors[i % colors.length] ?? '#000';
    const rotate = (next() * 180).toFixed(0);
    pieces +=
      i % 3 === 0
        ? `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(5 + next() * 8).toFixed(0)}" fill="${color}" opacity="0.8"/>`
        : `<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${(10 + next() * 14).toFixed(0)}" height="${(5 + next() * 6).toFixed(0)}" rx="2" fill="${color}" opacity="0.85" transform="rotate(${rotate} ${x.toFixed(0)} ${y.toFixed(0)})"/>`;
  }
  return svg(
    width,
    height,
    '0 0 1600 1200',
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff7ed"/><stop offset="1" stop-color="#eef2ff"/></linearGradient></defs>
    <rect width="1600" height="1200" fill="url(#g)"/>
    <circle cx="1450" cy="160" r="300" fill="#fde68a" opacity="0.45"/>
    <circle cx="140" cy="1080" r="260" fill="#bfdbfe" opacity="0.5"/>${pieces}`,
  );
};

// ---- Illustrations (transparent) -------------------------------------------------------

/** A plate seen from above: grilled steak, greens, cherry tomatoes and a sauce swirl. */
const dish = (width: number, height: number) =>
  svg(
    width,
    height,
    '0 0 800 800',
    `<defs>
      <radialGradient id="plate" cx="45%" cy="40%" r="60%"><stop offset="0" stop-color="#ffffff"/><stop offset="0.8" stop-color="#e9e4dc"/><stop offset="1" stop-color="#cfc6b8"/></radialGradient>
      <radialGradient id="steak" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#a0522d"/><stop offset="0.7" stop-color="#6b2f16"/><stop offset="1" stop-color="#4a1f0e"/></radialGradient>
      <radialGradient id="tomato" cx="35%" cy="30%" r="70%"><stop offset="0" stop-color="#ff8a80"/><stop offset="1" stop-color="#c62828"/></radialGradient>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#000" flood-opacity="0.45"/></filter>
    </defs>
    <g filter="url(#shadow)"><circle cx="400" cy="400" r="350" fill="url(#plate)"/></g>
    <circle cx="400" cy="400" r="285" fill="none" stroke="#d8d0c4" stroke-width="4"/>
    ${[0, 1, 2, 3, 4, 5, 6]
      .map(
        (i) =>
          `<circle cx="${String(250 + i * 48)}" cy="${String(560 - Math.sin(i / 2) * 40)}" r="${String(16 - i)}" fill="#7c2d12" opacity="0.85"/>`,
      )
      .join('')}
    <g transform="rotate(-14 400 390)">
      <clipPath id="steakShape"><path d="M240 330 C 260 260, 420 250, 520 280 C 590 300, 600 400, 560 450 C 510 500, 330 500, 270 460 C 225 430, 225 370, 240 330 Z"/></clipPath>
      <path d="M240 330 C 260 260, 420 250, 520 280 C 590 300, 600 400, 560 450 C 510 500, 330 500, 270 460 C 225 430, 225 370, 240 330 Z" fill="url(#steak)"/>
      <path d="M262 340 C 300 300, 420 292, 505 312" fill="none" stroke="#f3d6b8" stroke-width="10" stroke-linecap="round" opacity="0.55"/>
      <g clip-path="url(#steakShape)">${[0, 1, 2, 3]
        .map(
          (i) =>
            `<line x1="${String(300 + i * 62)}" y1="280" x2="${String(262 + i * 62)}" y2="490" stroke="#2b1208" stroke-width="12" opacity="0.5"/>`,
        )
        .join('')}</g>
    </g>
    <g transform="rotate(30 330 250)">
      <line x1="230" y1="250" x2="430" y2="250" stroke="#3f6212" stroke-width="6" stroke-linecap="round"/>
      ${[0, 1, 2, 3, 4, 5, 6, 7]
        .map(
          (i) =>
            `<ellipse cx="${String(245 + i * 24)}" cy="${String(i % 2 ? 236 : 264)}" rx="16" ry="5" fill="#4d7c0f" transform="rotate(${String(i % 2 ? -35 : 35)} ${String(245 + i * 24)} ${String(i % 2 ? 236 : 264)})"/>`,
        )
        .join('')}
    </g>
    ${[
      [520, 520, 0],
      [570, 470, 40],
      [490, 580, -30],
      [600, 540, 70],
      [450, 545, 15],
    ]
      .map(
        ([x, y, r]) =>
          `<ellipse cx="${String(x)}" cy="${String(y)}" rx="48" ry="22" fill="#4caf50" transform="rotate(${String(r)} ${String(x)} ${String(y)})"/><line x1="${String((x ?? 0) - 40)}" y1="${String(y)}" x2="${String((x ?? 0) + 40)}" y2="${String(y)}" stroke="#2e7d32" stroke-width="4" transform="rotate(${String(r)} ${String(x)} ${String(y)})"/>`,
      )
      .join('')}
    ${[
      [300, 250],
      [345, 215],
      [255, 300],
    ]
      .map(
        ([x, y]) =>
          `<circle cx="${String(x)}" cy="${String(y)}" r="30" fill="url(#tomato)"/><circle cx="${String((x ?? 0) - 9)}" cy="${String((y ?? 0) - 10)}" r="7" fill="#fff" opacity="0.6"/>`,
      )
      .join('')}`,
  );

/** A coffee cup on a saucer with rising steam. */
const coffee = (width: number, height: number) =>
  svg(
    width,
    height,
    '0 0 800 800',
    `<defs>
      <linearGradient id="cup" x1="0" x2="1"><stop offset="0" stop-color="#f5efe6"/><stop offset="0.6" stop-color="#ffffff"/><stop offset="1" stop-color="#d8cfc2"/></linearGradient>
      <radialGradient id="crema" cx="45%" cy="40%" r="60%"><stop offset="0" stop-color="#d9a066"/><stop offset="1" stop-color="#7a4a24"/></radialGradient>
      <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="16" stdDeviation="18" flood-color="#000" flood-opacity="0.4"/></filter>
      <filter id="blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>
    </defs>
    <g fill="none" stroke="#fff" stroke-width="16" stroke-linecap="round" opacity="0.55" filter="url(#blur)">
      <path d="M330 300 C 290 240, 370 200, 330 140 S 350 60, 330 30"/>
      <path d="M410 290 C 370 230, 450 190, 410 130 S 430 50, 410 20"/>
      <path d="M490 300 C 450 240, 530 200, 490 140 S 510 60, 490 30"/>
    </g>
    <g filter="url(#shadow)">
      <ellipse cx="400" cy="640" rx="300" ry="70" fill="#efe7db"/>
      <ellipse cx="400" cy="630" rx="250" ry="52" fill="#fbf7f1"/>
      <path d="M210 360 L 590 360 L 560 600 Q 400 660 240 600 Z" fill="url(#cup)"/>
      <path d="M585 410 C 700 400, 700 540, 565 540" fill="none" stroke="#ebe3d6" stroke-width="34" stroke-linecap="round"/>
    </g>
    <ellipse cx="400" cy="362" rx="190" ry="34" fill="url(#crema)"/>
    <path d="M360 360 C 380 340, 420 340, 440 360 C 420 380, 380 380, 360 360 Z" fill="#f3d2a8" opacity="0.8"/>
    <rect x="236" y="430" width="330" height="22" fill="#6b4226" opacity="0.85"/>`,
  );

/** A slice of layered cake with a strawberry. */
const cake = (width: number, height: number) =>
  svg(
    width,
    height,
    '0 0 800 800',
    `<defs>
      <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="16" stdDeviation="18" flood-color="#000" flood-opacity="0.4"/></filter>
      <radialGradient id="berry" cx="35%" cy="30%" r="70%"><stop offset="0" stop-color="#ff6b6b"/><stop offset="1" stop-color="#b91c1c"/></radialGradient>
    </defs>
    <g filter="url(#shadow)">
      <ellipse cx="400" cy="640" rx="290" ry="60" fill="#f1ece4"/>
      <polygon points="170,600 630,600 630,330 170,430" fill="#7c3f1d"/>
      <polygon points="170,430 630,330 630,250 400,180 170,330" fill="#fde7d4"/>
      <polygon points="170,520 630,470 630,500 170,550" fill="#fbcfe8"/>
      <polygon points="170,460 630,400 630,425 170,488" fill="#fbcfe8"/>
    </g>
    <path d="M170 430 L 630 330" stroke="#fff" stroke-width="10" opacity="0.6"/>
    <circle cx="420" cy="190" r="58" fill="url(#berry)"/>
    <path d="M395 135 Q 420 105 445 135 Q 420 128 395 135 Z" fill="#16a34a"/>
    ${[0, 1, 2, 3, 4, 5]
      .map(
        (i) =>
          `<circle cx="${String(400 + Math.cos(i) * 34)}" cy="${String(195 + Math.sin(i) * 34)}" r="4" fill="#fde047"/>`,
      )
      .join('')}`,
  );

/** A striped popcorn bucket, overflowing. */
const popcorn = (width: number, height: number) => {
  const next = random(5);
  let kernels = '';
  for (let i = 0; i < 46; i++) {
    const x = 230 + next() * 340;
    const y = 160 + next() * 170 - Math.abs(x - 400) * 0.25;
    const r = 26 + next() * 16;
    kernels += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${r.toFixed(0)}" fill="${i % 4 === 0 ? '#fde68a' : '#fffbeb'}" stroke="#f5d48a" stroke-width="3"/>`;
  }
  return svg(
    width,
    height,
    '0 0 800 800',
    `<defs><filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="16" stdDeviation="18" flood-color="#000" flood-opacity="0.5"/></filter>
    <clipPath id="bucket"><polygon points="220,320 580,320 530,740 270,740"/></clipPath></defs>
    <g filter="url(#shadow)">${kernels}
      <polygon points="220,320 580,320 530,740 270,740" fill="#fff"/>
      <g clip-path="url(#bucket)">${[0, 1, 2, 3, 4, 5]
        .map(
          (i) =>
            `<polygon points="${String(200 + i * 70)},300 ${String(235 + i * 70)},300 ${String(255 + i * 62)},760 ${String(220 + i * 62)},760" fill="#dc2626"/>`,
        )
        .join('')}</g>
      <rect x="210" y="312" width="380" height="30" rx="8" fill="#b91c1c"/>
    </g>`,
  );
};

/** A cinema ticket stub. */
const ticket = (width: number, height: number) =>
  svg(
    width,
    height,
    '0 0 800 500',
    `<defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#fbbf24"/><stop offset="1" stop-color="#f59e0b"/></linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="14" stdDeviation="16" flood-color="#000" flood-opacity="0.45"/></filter></defs>
    <g transform="rotate(-12 400 250)" filter="url(#shadow)">
      <path d="M90 120 H710 V210 A40 40 0 0 0 710 290 V380 H90 V290 A40 40 0 0 0 90 210 Z" fill="url(#g)"/>
      <line x1="560" y1="130" x2="560" y2="370" stroke="#92400e" stroke-width="5" stroke-dasharray="14 12"/>
      <rect x="140" y="170" width="360" height="26" rx="13" fill="#92400e" opacity="0.5"/>
      <rect x="140" y="225" width="280" height="20" rx="10" fill="#92400e" opacity="0.35"/>
      <rect x="140" y="270" width="320" height="20" rx="10" fill="#92400e" opacity="0.35"/>
      <circle cx="635" cy="250" r="40" fill="none" stroke="#92400e" stroke-width="6" opacity="0.6"/>
    </g>`,
  );

/** Poster art: a lighthouse at night under the stars (for "The Last Lighthouse"). */
const posterLighthouse = (width: number, height: number) => {
  const next = random(17);
  let stars = '';
  for (let i = 0; i < 120; i++) {
    stars += `<circle cx="${(next() * 1000).toFixed(0)}" cy="${(next() * 900).toFixed(0)}" r="${(0.8 + next() * 2.2).toFixed(1)}" fill="#fff" opacity="${(0.3 + next() * 0.7).toFixed(2)}"/>`;
  }
  return svg(
    width,
    height,
    '0 0 1000 1500',
    `<defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#020617"/><stop offset="0.55" stop-color="#1e1b4b"/><stop offset="1" stop-color="#7c2d12"/></linearGradient>
      <linearGradient id="beam" x1="0" x2="1"><stop offset="0" stop-color="#fef3c7" stop-opacity="0.75"/><stop offset="1" stop-color="#fef3c7" stop-opacity="0"/></linearGradient>
      <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0f172a"/><stop offset="1" stop-color="#020617"/></linearGradient>
      ${softFilter(8)}
    </defs>
    <rect width="1000" height="1500" fill="url(#sky)"/>${stars}
    <circle cx="760" cy="300" r="70" fill="#fef9c3" opacity="0.9"/>
    <polygon points="540,640 1000,470 1000,820" fill="url(#beam)" filter="url(#soft)"/>
    <path d="M0 1080 L 260 900 L 420 960 L 560 880 L 760 1000 L 1000 940 L 1000 1500 L 0 1500 Z" fill="#0b1020"/>
    <polygon points="470,700 560,700 590,1000 440,1000" fill="#f8fafc"/>
    ${[0, 1, 2]
      .map(
        (i) =>
          `<polygon points="${String(462 - i * 5)},${String(780 + i * 75)} ${String(568 + i * 5)},${String(780 + i * 75)} ${String(573 + i * 5)},${String(815 + i * 75)} ${String(457 - i * 5)},${String(815 + i * 75)}" fill="#dc2626"/>`,
      )
      .join('')}
    <rect x="480" y="640" width="70" height="60" fill="#fde68a"/>
    <polygon points="465,640 565,640 515,590" fill="#1f2937"/>
    <rect y="1000" width="1000" height="500" fill="url(#sea)"/>
    ${[0, 1, 2, 3, 4, 5, 6]
      .map(
        (i) =>
          `<path d="M0 ${String(1060 + i * 60)} q 125 -18 250 0 t 250 0 t 250 0 t 250 0" fill="none" stroke="#60a5fa" stroke-opacity="${(0.25 - i * 0.025).toFixed(2)}" stroke-width="3"/>`,
      )
      .join('')}
    <rect x="490" y="1000" width="50" height="420" fill="#fde68a" opacity="0.18" filter="url(#soft)"/>`,
  );
};

/** Poster art: a ringed planet over a desert of dunes (for "Red Horizon"). */
const posterPlanet = (width: number, height: number) =>
  svg(
    width,
    height,
    '0 0 1000 1500',
    `<defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a0b2e"/><stop offset="0.6" stop-color="#7a2048"/><stop offset="1" stop-color="#f97316"/></linearGradient>
      <radialGradient id="planet" cx="35%" cy="35%" r="70%"><stop offset="0" stop-color="#fde68a"/><stop offset="0.5" stop-color="#f59e0b"/><stop offset="1" stop-color="#7c2d12"/></radialGradient>
      <linearGradient id="dune1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9a3412"/><stop offset="1" stop-color="#431407"/></linearGradient>
      <linearGradient id="dune2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c2410c"/><stop offset="1" stop-color="#7c2d12"/></linearGradient>
    </defs>
    <rect width="1000" height="1500" fill="url(#sky)"/>
    <ellipse cx="560" cy="460" rx="360" ry="70" fill="none" stroke="#fde68a" stroke-width="14" opacity="0.5" transform="rotate(-14 560 460)"/>
    <circle cx="560" cy="460" r="230" fill="url(#planet)"/>
    <path d="M330 470 A 230 230 0 0 0 790 450" fill="none" stroke="#fde68a" stroke-width="14" opacity="0.85" transform="rotate(-14 560 460)"/>
    <circle cx="210" cy="250" r="34" fill="#fbcfe8" opacity="0.8"/>
    <path d="M0 1050 C 200 950, 380 1000, 540 1060 S 860 1000, 1000 1040 L1000 1500 L0 1500 Z" fill="url(#dune2)"/>
    <path d="M0 1200 C 260 1110, 500 1220, 700 1180 S 920 1120, 1000 1160 L1000 1500 L0 1500 Z" fill="url(#dune1)"/>
    `,
  );

/** Poster art: a city skyline at dusk, reflected in water (for "Night Train"). */
const posterCity = (width: number, height: number) => {
  const next = random(29);
  let buildings = '';
  let windows = '';
  let x = 0;
  while (x < 1000) {
    const w = 60 + next() * 90;
    const h = 220 + next() * 520;
    buildings += `<rect x="${x.toFixed(0)}" y="${(1000 - h).toFixed(0)}" width="${w.toFixed(0)}" height="${h.toFixed(0)}" fill="#0f172a"/>`;
    for (let wy = 1000 - h + 24; wy < 980; wy += 38) {
      for (let wx = x + 12; wx < x + w - 16; wx += 26) {
        if (next() > 0.55) {
          windows += `<rect x="${wx.toFixed(0)}" y="${wy.toFixed(0)}" width="12" height="18" fill="#fde68a" opacity="${(0.5 + next() * 0.5).toFixed(2)}"/>`;
        }
      }
    }
    x += w + 6;
  }
  return svg(
    width,
    height,
    '0 0 1000 1500',
    `<defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0c1445"/><stop offset="0.6" stop-color="#6d28d9"/><stop offset="1" stop-color="#f472b6"/></linearGradient>
      <linearGradient id="water" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1e1b4b"/><stop offset="1" stop-color="#020617"/></linearGradient>
    </defs>
    <rect width="1000" height="1000" fill="url(#sky)"/>
    <circle cx="300" cy="420" r="120" fill="#fef3c7" opacity="0.85"/>
    ${buildings}${windows}
    <rect y="1000" width="1000" height="500" fill="url(#water)"/>
    <g transform="translate(0 2000) scale(1 -1)" opacity="0.22">${buildings}${windows}</g>
    ${[0, 1, 2, 3, 4]
      .map(
        (i) =>
          `<line x1="${String(120 + i * 170)}" y1="${String(1080 + i * 70)}" x2="${String(260 + i * 170)}" y2="${String(1080 + i * 70)}" stroke="#fde68a" stroke-opacity="0.35" stroke-width="4"/>`,
      )
      .join('')}`,
  );
};

/** A sale tag on a string. */
const tag = (width: number, height: number) =>
  svg(
    width,
    height,
    '0 0 800 800',
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fde047"/><stop offset="1" stop-color="#f59e0b"/></linearGradient>
    <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="18" stdDeviation="20" flood-color="#000" flood-opacity="0.45"/></filter></defs>
    <path d="M120 120 C 220 60, 300 200, 300 260" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round"/>
    <g transform="rotate(18 420 430)" filter="url(#shadow)">
      <path d="M230 260 L 520 260 L 680 430 L 520 600 L 230 600 Q 200 600 200 570 L 200 290 Q 200 260 230 260 Z" fill="url(#g)"/>
      <circle cx="560" cy="430" r="34" fill="#7f1d1d"/>
      <rect x="250" y="330" width="230" height="30" rx="15" fill="#7f1d1d" opacity="0.4"/>
      <rect x="250" y="400" width="180" height="24" rx="12" fill="#7f1d1d" opacity="0.3"/>
      <rect x="250" y="460" width="210" height="24" rx="12" fill="#7f1d1d" opacity="0.3"/>
    </g>`,
  );

/** A concierge bell on a gold base. */
const bell = (width: number, height: number) =>
  svg(
    width,
    height,
    '0 0 800 800',
    `<defs>
      <radialGradient id="dome" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="#fff7d6"/><stop offset="0.45" stop-color="#e2b54a"/><stop offset="1" stop-color="#8a6416"/></radialGradient>
      <linearGradient id="base" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#1f2937"/><stop offset="1" stop-color="#030712"/></linearGradient>
      <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="18" stdDeviation="20" flood-color="#000" flood-opacity="0.5"/></filter>
    </defs>
    <g filter="url(#shadow)">
      <ellipse cx="400" cy="600" rx="290" ry="56" fill="url(#base)"/>
      <rect x="110" y="540" width="580" height="60" fill="url(#base)"/>
      <ellipse cx="400" cy="540" rx="290" ry="40" fill="#374151"/>
      <path d="M170 520 A 230 230 0 0 1 630 520 Z" fill="url(#dome)"/>
      <rect x="385" y="250" width="30" height="50" rx="8" fill="#b8892a"/>
      <ellipse cx="400" cy="245" rx="44" ry="16" fill="#e2b54a"/>
    </g>
    <path d="M250 430 A 160 160 0 0 1 380 330" fill="none" stroke="#fff" stroke-width="14" stroke-linecap="round" opacity="0.55"/>`,
  );

/** Three balloons on strings. */
const balloons = (width: number, height: number) =>
  svg(
    width,
    height,
    '0 0 800 800',
    `<defs>
      ${[
        ['b1', '#fb7185', '#be123c'],
        ['b2', '#60a5fa', '#1d4ed8'],
        ['b3', '#fcd34d', '#d97706'],
      ]
        .map(
          ([id, light, dark]) =>
            `<radialGradient id="${id ?? ''}" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="${light ?? ''}"/><stop offset="1" stop-color="${dark ?? ''}"/></radialGradient>`,
        )
        .join('')}
      <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="14" stdDeviation="14" flood-color="#000" flood-opacity="0.25"/></filter>
    </defs>
    <g fill="none" stroke="#64748b" stroke-width="4">
      <path d="M270 400 C 300 520, 360 600, 400 760"/><path d="M420 330 C 420 480, 410 600, 400 760"/><path d="M570 420 C 520 540, 450 640, 400 760"/>
    </g>
    <g filter="url(#shadow)">
      <ellipse cx="270" cy="270" rx="120" ry="140" fill="url(#b1)"/>
      <ellipse cx="420" cy="200" rx="125" ry="145" fill="url(#b2)"/>
      <ellipse cx="570" cy="290" rx="115" ry="135" fill="url(#b3)"/>
    </g>
    ${[
      [235, 210],
      [385, 135],
      [535, 230],
    ]
      .map(
        ([x, y]) =>
          `<ellipse cx="${String(x)}" cy="${String(y)}" rx="26" ry="38" fill="#fff" opacity="0.45" transform="rotate(-25 ${String(x)} ${String(y)})"/>`,
      )
      .join('')}`,
  );

export const ART = {
  ember: {
    width: 1600,
    height: 1200,
    name: 'Warm evening (art)',
    nameHe: 'ערב חמים (איור)',
    svg: ember,
  },
  chalkboard: {
    width: 1600,
    height: 1200,
    name: 'Chalkboard (art)',
    nameHe: 'לוח גיר (איור)',
    svg: chalkboard,
  },
  cinema: {
    width: 1600,
    height: 1200,
    name: 'Cinema hall (art)',
    nameHe: 'אולם קולנוע (איור)',
    svg: cinema,
  },
  burst: {
    width: 1600,
    height: 1200,
    name: 'Sale burst (art)',
    nameHe: 'פרץ מבצע (איור)',
    svg: burst,
  },
  waves: {
    width: 1600,
    height: 1200,
    name: 'Calm waves (art)',
    nameHe: 'גלים רגועים (איור)',
    svg: waves,
  },
  deco: { width: 1600, height: 1200, name: 'Art deco (art)', nameHe: 'ארט דקו (איור)', svg: deco },
  confetti: {
    width: 1600,
    height: 1200,
    name: 'Confetti (art)',
    nameHe: 'קונפטי (איור)',
    svg: confetti,
  },
  dish: {
    width: 800,
    height: 800,
    name: 'Steak dish (art)',
    nameHe: 'מנת סטייק (איור)',
    svg: dish,
  },
  coffee: {
    width: 800,
    height: 800,
    name: 'Coffee cup (art)',
    nameHe: 'כוס קפה (איור)',
    svg: coffee,
  },
  cake: {
    width: 800,
    height: 800,
    name: 'Cake slice (art)',
    nameHe: 'פרוסת עוגה (איור)',
    svg: cake,
  },
  popcorn: {
    width: 800,
    height: 800,
    name: 'Popcorn (art)',
    nameHe: 'פופקורן (איור)',
    svg: popcorn,
  },
  ticket: {
    width: 800,
    height: 500,
    name: 'Cinema ticket (art)',
    nameHe: 'כרטיס קולנוע (איור)',
    svg: ticket,
  },
  posterLighthouse: {
    width: 1000,
    height: 1500,
    name: 'Poster: lighthouse (art)',
    nameHe: 'פוסטר: מגדלור (איור)',
    svg: posterLighthouse,
  },
  posterPlanet: {
    width: 1000,
    height: 1500,
    name: 'Poster: planet (art)',
    nameHe: 'פוסטר: כוכב לכת (איור)',
    svg: posterPlanet,
  },
  posterCity: {
    width: 1000,
    height: 1500,
    name: 'Poster: city at night (art)',
    nameHe: 'פוסטר: עיר בלילה (איור)',
    svg: posterCity,
  },
  tag: { width: 800, height: 800, name: 'Sale tag (art)', nameHe: 'תווית מבצע (איור)', svg: tag },
  bell: {
    width: 800,
    height: 800,
    name: 'Concierge bell (art)',
    nameHe: 'פעמון קבלה (איור)',
    svg: bell,
  },
  balloons: {
    width: 800,
    height: 800,
    name: 'Balloons (art)',
    nameHe: 'בלונים (איור)',
    svg: balloons,
  },
} satisfies Record<string, ArtPiece>;

export type ArtName = keyof typeof ART;
export const ART_NAMES = Object.keys(ART) as ArtName[];

/** Where the art comes from (stored with the media, shown in the library). */
export const ART_SOURCE_URL =
  'https://github.com/diamondrubinny/freescreensign/tree/HEAD/apps/server/src/modules/kits/art.ts';
export const ART_ATTRIBUTION = 'Rubinny Art Pack (CC0)';

/** The SVG markup of a piece at its PNG size. */
export function artSvg(name: ArtName): string {
  const piece = ART[name];
  return piece.svg(piece.width, piece.height);
}
