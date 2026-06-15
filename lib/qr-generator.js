import satori from 'satori';
import sharp from 'sharp';
import QRCode from 'qrcode';
import path from 'path';
import fs from 'fs';
import zlib from 'zlib';

// ── WOFF → SFNT/TTF converter ─────────────────────────────────────────────
// librsvg only accepts TTF/OTF via fontconfig — not WOFF data URIs.
function woffToSfnt(woffBuf) {
  if (woffBuf.readUInt32BE(0) !== 0x774F4646) throw new Error('Not WOFF');
  const flavor    = woffBuf.readUInt32BE(4);
  const numTables = woffBuf.readUInt16BE(12);

  const tables = [];
  for (let i = 0; i < numTables; i++) {
    const b        = 44 + i * 20;
    const tag      = woffBuf.slice(b, b + 4).toString('ascii');
    const woffOff  = woffBuf.readUInt32BE(b + 4);
    const compLen  = woffBuf.readUInt32BE(b + 8);
    const origLen  = woffBuf.readUInt32BE(b + 12);
    const checksum = woffBuf.readUInt32BE(b + 16);
    const raw      = woffBuf.slice(woffOff, woffOff + compLen);
    let data;
    if (compLen < origLen) {
      try { data = zlib.inflateSync(raw); }
      catch { data = zlib.inflateRawSync(raw); }
    } else {
      data = Buffer.from(raw);
    }
    tables.push({ tag, data, checksum });
  }

  tables.sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));

  const nt          = tables.length;
  const log2nt      = Math.floor(Math.log2(nt));
  const searchRange = (1 << log2nt) * 16;
  const rangeShift  = nt * 16 - searchRange;
  const dataStart   = 12 + nt * 16;

  const offsets = [];
  let cur = dataStart;
  for (const { data } of tables) { offsets.push(cur); cur += (data.length + 3) & ~3; }

  const out = Buffer.alloc(cur, 0);
  let p = 0;
  out.writeUInt32BE(flavor, p);      p += 4;
  out.writeUInt16BE(nt, p);          p += 2;
  out.writeUInt16BE(searchRange, p); p += 2;
  out.writeUInt16BE(log2nt, p);      p += 2;
  out.writeUInt16BE(rangeShift, p);  p += 2;

  for (let i = 0; i < tables.length; i++) {
    const { tag, checksum, data } = tables[i];
    out.write(tag, p, 'ascii');        p += 4;
    out.writeUInt32BE(checksum, p);    p += 4;
    out.writeUInt32BE(offsets[i], p);  p += 4;
    out.writeUInt32BE(data.length, p); p += 4;
  }
  for (let i = 0; i < tables.length; i++) tables[i].data.copy(out, offsets[i]);

  return out;
}

// ── Install Cairo fonts into /tmp for fontconfig ──────────────────────────
// fontconfig is lazily initialised by librsvg on first SVG text render.
// Setting FONTCONFIG_FILE here (at module load, before any sharp() call)
// ensures our font is found before that first initialisation happens.
const _FC_DIR  = '/tmp/cairo-ar-fc';
const _FC_CONF = path.join(_FC_DIR, 'fonts.conf');

try {
  if (!fs.existsSync(path.join(_FC_DIR, 'Cairo-Regular.ttf'))) {
    fs.mkdirSync(path.join(_FC_DIR, 'cache'), { recursive: true });
    const cr = path.join(process.cwd(), 'public', 'fonts');
    fs.writeFileSync(
      path.join(_FC_DIR, 'Cairo-Regular.ttf'),
      woffToSfnt(fs.readFileSync(path.join(cr, 'cairo-arabic-400-normal.woff')))
    );
    fs.writeFileSync(
      path.join(_FC_DIR, 'Cairo-Bold.ttf'),
      woffToSfnt(fs.readFileSync(path.join(cr, 'cairo-arabic-700-normal.woff')))
    );
    fs.writeFileSync(
      path.join(_FC_DIR, 'Cairo-Latin-Regular.ttf'),
      woffToSfnt(fs.readFileSync(path.join(cr, 'cairo-latin-400-normal.woff')))
    );
    fs.writeFileSync(
      path.join(_FC_DIR, 'Cairo-Latin-Bold.ttf'),
      woffToSfnt(fs.readFileSync(path.join(cr, 'cairo-latin-700-normal.woff')))
    );
    fs.writeFileSync(_FC_CONF, [
      '<?xml version="1.0"?>',
      '<!DOCTYPE fontconfig SYSTEM "fonts.dtd">',
      '<fontconfig>',
      `  <dir>${_FC_DIR}</dir>`,
      `  <cachedir>${_FC_DIR}/cache</cachedir>`,
      '  <include ignore_missing="yes">/etc/fonts/fonts.conf</include>',
      '</fontconfig>',
    ].join('\n'));
  }
  process.env.FONTCONFIG_FILE = _FC_CONF;
} catch (err) {
  console.error('[qr] Cairo font setup failed:', err.message);
}

// ── Fonts for Satori (English cards only, cached) ──────────────────────────
let _fonts = null;
function getFonts() {
  if (_fonts) return _fonts;
  const cr = path.join(process.cwd(), 'public', 'fonts');
  _fonts = [
    { name: 'CairoAR', data: fs.readFileSync(path.join(cr, 'cairo-arabic-400-normal.woff')), weight: 400, style: 'normal' },
    { name: 'CairoAR', data: fs.readFileSync(path.join(cr, 'cairo-arabic-700-normal.woff')), weight: 700, style: 'normal' },
    { name: 'CairoEN', data: fs.readFileSync(path.join(cr, 'cairo-latin-400-normal.woff')),  weight: 400, style: 'normal' },
    { name: 'CairoEN', data: fs.readFileSync(path.join(cr, 'cairo-latin-700-normal.woff')),  weight: 700, style: 'normal' },
  ];
  return _fonts;
}

// ── Date formatter ─────────────────────────────────────────────────────────
function formatWeddingDate(dateStr, isArabic) {
  const parts = (dateStr || '').split('/');
  if (parts.length !== 3) return dateStr || '';
  const [d, m, y] = parts.map(Number);
  const date = new Date(y, m - 1, d);
  try {
    return isArabic
      ? date.toLocaleDateString('ar-EG', { weekday: 'long', month: 'long', day: 'numeric' })
      : date.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric' });
  } catch { return dateStr; }
}

// ── Unified SVG card renderer (Arabic + English) ──────────────────────────
// Both languages use the exact same SVG template and the same rendering
// pipeline (librsvg via sharp), guaranteeing pixel-perfect identical output.
// The only differences are text content, text direction, and label/value
// anchor positions (mirrored for RTL vs LTR).
//
// Layout (500 × 700):
//   y=54   title baseline
//   y=75   subtitle baseline
//   y=88   QR box top  (310×310 square, x=95, centered)
//   y=398  QR box bottom
//   y=418  info box top  (20px gap)
//   y=588  info box bottom  (170px tall, 4 rows × 40px)
//   y=610  kids-note baseline (if shown)
async function generateCardSVG({ title, subtitle, inviteUrl, guestName, formattedDate, allowedGuests, kidsValue, kidsAllowed, lang }) {
  const isAr = lang === 'ar';
  const dir  = isAr ? 'rtl' : 'ltr';

  const qrBuf = await QRCode.toBuffer(inviteUrl, {
    width: 290, margin: 1, color: { dark: '#000000', light: '#ffffff' },
  });
  const qrB64 = qrBuf.toString('base64');

  const esc = s => String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // Fixed layout constants — identical for both languages
  const BOX_Y       = 418;
  const BOX_H       = 170;
  const ROW_FIRST_Y = 448;
  const ROW_STEP    = 40;

  // RTL: label anchored to right (x=452, start), value anchored to left (x=48, end)
  // LTR: label anchored to left  (x=48,  start), value anchored to right (x=452, end)
  const labelX = isAr ? 452 : 48;
  const valueX = isAr ? 48  : 452;

  const labels = isAr
    ? ['التاريخ', 'عدد المدعوين', 'الأطفال', 'المدعو']
    : ['Date', 'Allowed Guests', 'Kids', 'Guest'];

  const values = [esc(formattedDate), String(allowedGuests), esc(kidsValue), esc(guestName)];

  const rowsSVG = labels.map((label, i) => {
    const y      = ROW_FIRST_Y + i * ROW_STEP;
    const sep_y  = y + 18;
    const isLast = i === labels.length - 1;
    return `
<text x="${labelX}" y="${y}" text-anchor="start" direction="${dir}" font-family="Cairo,sans-serif" font-size="13" fill="#888">${label}</text>
<text x="${valueX}" y="${y}" text-anchor="end"   direction="${dir}" font-family="Cairo,sans-serif" font-size="15" font-weight="700" fill="#0d1b2a">${values[i]}</text>
${!isLast ? `<line x1="48" y1="${sep_y}" x2="452" y2="${sep_y}" stroke="black" stroke-opacity="0.07" stroke-width="1"/>` : ''}`;
  }).join('');

  const kidsNoteText = isAr
    ? '* لا يسمح بدخول الاطفال تحت سن 15 عاما'
    : '* Children under 15 are not permitted';
  const kidsNoteEl = !kidsAllowed
    ? `<text x="250" y="${BOX_Y + BOX_H + 22}" text-anchor="middle" direction="${dir}" font-family="Cairo,sans-serif" font-size="11" fill="#cc3300">${kidsNoteText}</text>`
    : '';

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="500" height="700">
<rect width="500" height="700" fill="white" fill-opacity="0.28"/>
<text x="250" y="54" text-anchor="middle" direction="${dir}" font-family="Cairo,sans-serif" font-size="22" font-weight="700" fill="#0d1b2a">${esc(title)}</text>
<text x="250" y="75" text-anchor="middle" direction="${dir}" font-family="Cairo,sans-serif" font-size="13" fill="#555">${esc(subtitle)}</text>
<rect x="95" y="88" width="310" height="310" rx="18" fill="white"/>
<image xlink:href="data:image/png;base64,${qrB64}" x="105" y="98" width="290" height="290"/>
<rect x="28" y="${BOX_Y}" width="444" height="${BOX_H}" rx="16" fill="#f2f2f2" fill-opacity="0.93"/>
${rowsSVG}
${kidsNoteEl}
</svg>`;

  const svgPng = await sharp(Buffer.from(svg)).png().toBuffer();

  const bgPath = path.join(process.cwd(), 'public', 'qr-bg.png');
  try {
    return await sharp(bgPath)
      .resize(500, 700, { fit: 'cover', position: 'center' })
      .composite([{ input: svgPng, blend: 'over' }])
      .png()
      .toBuffer();
  } catch {
    return await sharp({
      create: { width: 500, height: 700, channels: 4, background: { r: 210, g: 230, b: 245, alpha: 1 } },
    })
      .composite([{ input: svgPng, blend: 'over' }])
      .png()
      .toBuffer();
  }
}

async function generateArabicQRCard(guest, token) {
  const appUrl      = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const kidsAllowed = guest?.kids_allowed ?? false;
  const kidsCount   = guest?.kids_count   ?? 0;
  return generateCardSVG({
    title:         'تصريح دخول',
    subtitle:      'للاستخدام مرة واحدة',
    inviteUrl:     `${appUrl}/invite/${token}`,
    guestName:     guest?.name          ?? 'ضيف',
    formattedDate: formatWeddingDate(process.env.WEDDING_DATE || '', true),
    allowedGuests: guest?.allowed_guests ?? 1,
    kidsAllowed,
    kidsValue:     kidsAllowed
      ? `${kidsCount} ${kidsCount === 1 ? 'طفل' : 'أطفال'}`
      : 'غير مسموح',
    lang: 'ar',
  });
}

async function generateEnglishQRCard(guest, token) {
  const appUrl      = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const kidsAllowed = guest?.kids_allowed ?? false;
  const kidsCount   = guest?.kids_count   ?? 0;
  return generateCardSVG({
    title:         'INVITATION PASS',
    subtitle:      'Single Use Pass',
    inviteUrl:     `${appUrl}/invite/${token}`,
    guestName:     guest?.name          ?? 'Guest',
    formattedDate: formatWeddingDate(process.env.WEDDING_DATE || '', false),
    allowedGuests: guest?.allowed_guests ?? 1,
    kidsAllowed,
    kidsValue:     kidsAllowed
      ? `${kidsCount} ${kidsCount === 1 ? 'Kid' : 'Kids'}`
      : 'Not Allowed',
    lang: 'en',
  });
}

// ── Public entry point ─────────────────────────────────────────────────────
export async function generateQRCard(guest, token) {
  const isArabic = (guest?.language ?? 'ar') !== 'en';
  return isArabic
    ? generateArabicQRCard(guest, token)
    : generateEnglishQRCard(guest, token);
}
