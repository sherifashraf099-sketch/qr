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

// ── Arabic card via pure SVG (Satori crashes on RTL Arabic — known bug) ────
// Background is composited AFTER SVG rendering to avoid librsvg data-URI
// size limits (large base64 images silently fail inside <image xlink:href>).
async function generateArabicQRCard(guest, token) {
  const appUrl    = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const inviteUrl = `${appUrl}/invite/${token}`;

  const formattedDate = formatWeddingDate(process.env.WEDDING_DATE || '', true);
  const guestName     = guest?.name          ?? 'ضيف';
  const allowedGuests = guest?.allowed_guests ?? 1;
  const kidsAllowed   = guest?.kids_allowed   ?? false;
  const kidsCount     = guest?.kids_count     ?? 0;
  const kidsValue     = kidsAllowed
    ? `${kidsCount} ${kidsCount === 1 ? 'طفل' : 'أطفال'}`
    : 'غير مسموح';

  // QR code PNG
  const qrBuf = await QRCode.toBuffer(inviteUrl, {
    width: 290, margin: 1, color: { dark: '#000000', light: '#ffffff' },
  });
  const qrB64 = qrBuf.toString('base64');

  const esc = s => String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // Layout constants (match English card proportions)
  const BOX_Y       = 430;   // info box top
  const ROW_FIRST_Y = 458;   // baseline of first info row
  const ROW_STEP    = 33;    // vertical gap between row baselines
  const BOX_H       = 140;   // info box height

  const rows = [
    { label: 'التاريخ',       value: esc(formattedDate),       sep: true  },
    { label: 'عدد المدعوين',  value: String(allowedGuests),     sep: true  },
    { label: 'الأطفال',       value: esc(kidsValue),            sep: true  },
    { label: 'المدعو',        value: esc(guestName),            sep: false },
  ];

  // label  → RIGHT-aligned RTL (text-anchor="start" direction="rtl" at x=452)
  // value  → LEFT-aligned RTL  (text-anchor="end"   direction="rtl" at x=48)
  // In SVG RTL: text-anchor="start" → right physical edge; "end" → left physical edge
  const rowsSVG = rows.map(({ label, value, sep }, i) => {
    const y     = ROW_FIRST_Y + i * ROW_STEP;
    const sep_y = y + 9;
    return `
<text x="452" y="${y}" text-anchor="start" direction="rtl" font-family="Cairo,sans-serif" font-size="13" fill="#888">${label}</text>
<text x="48"  y="${y}" text-anchor="end"   direction="rtl" font-family="Cairo,sans-serif" font-size="15" font-weight="700" fill="#0d1b2a">${value}</text>
${sep ? `<line x1="48" y1="${sep_y}" x2="452" y2="${sep_y}" stroke="black" stroke-opacity="0.07" stroke-width="1"/>` : ''}`;
  }).join('');

  const kidsNoteEl = !kidsAllowed
    ? `<text x="250" y="${BOX_Y + BOX_H + 22}" text-anchor="middle" direction="rtl" font-family="Cairo,sans-serif" font-size="11" fill="#cc3300">* لا يسمح بدخول الاطفال تحت سن 15 عاما</text>`
    : '';

  // SVG has NO background image — rendered transparent so we can composite
  // the watercolor background underneath using sharp (avoids librsvg data-URI limits)
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="500" height="700">
<rect width="500" height="700" fill="white" fill-opacity="0.28"/>
<text x="250" y="54"  text-anchor="middle" direction="rtl" font-family="Cairo,sans-serif" font-size="22" font-weight="700" fill="#0d1b2a">تصريح دخول</text>
<text x="250" y="75"  text-anchor="middle" direction="rtl" font-family="Cairo,sans-serif" font-size="13" fill="#555">للاستخدام مرة واحدة</text>
<rect x="90" y="90" width="320" height="310" rx="18" fill="white"/>
<image xlink:href="data:image/png;base64,${qrB64}" x="100" y="100" width="300" height="290"/>
<rect x="28" y="${BOX_Y}" width="444" height="${BOX_H}" rx="16" fill="#f2f2f2" fill-opacity="0.93"/>
${rowsSVG}
${kidsNoteEl}
</svg>`;

  // Render SVG to transparent PNG (librsvg renders onto transparent canvas)
  const svgPng = await sharp(Buffer.from(svg)).png().toBuffer();

  // Composite: background image → SVG overlay
  const bgPath = path.join(process.cwd(), 'public', 'qr-bg.png');
  try {
    return await sharp(bgPath)
      .resize(500, 700, { fit: 'cover', position: 'center' })
      .composite([{ input: svgPng, blend: 'over' }])
      .png()
      .toBuffer();
  } catch {
    // fallback: plain blue background
    return await sharp({
      create: { width: 500, height: 700, channels: 4, background: { r: 210, g: 230, b: 245, alpha: 1 } },
    })
      .composite([{ input: svgPng, blend: 'over' }])
      .png()
      .toBuffer();
  }
}

// ── English card via Satori ────────────────────────────────────────────────
// Background is composited AFTER Satori/librsvg rendering — same reason as
// Arabic: librsvg drops large base64 data-URIs embedded in SVG silently.
async function generateEnglishQRCard(guest, token) {
  const appUrl    = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const inviteUrl = `${appUrl}/invite/${token}`;

  const formattedDate = formatWeddingDate(process.env.WEDDING_DATE || '', false);
  const guestName     = guest?.name          ?? 'Guest';
  const allowedGuests = guest?.allowed_guests ?? 1;
  const kidsAllowed   = guest?.kids_allowed   ?? false;
  const kidsCount     = guest?.kids_count     ?? 0;
  const kidsValue     = kidsAllowed
    ? `${kidsCount} ${kidsCount === 1 ? 'Kid' : 'Kids'}`
    : 'Not Allowed';

  const qrBuf = await QRCode.toBuffer(inviteUrl, {
    width: 290, margin: 1, color: { dark: '#000000', light: '#ffffff' },
  });
  const qrDataUrl = `data:image/png;base64,${qrBuf.toString('base64')}`;

  const infoRow = (label, value, isLast = false) => ({
    type: 'div',
    props: {
      style: {
        display: 'flex', flexDirection: 'row',
        justifyContent: 'space-between', alignItems: 'center',
        width: '100%', padding: '9px 0',
        ...(isLast ? {} : { borderBottom: '1px solid rgba(0,0,0,0.07)' }),
      },
      children: [
        { type: 'span', props: { style: { fontSize: 13, color: '#888', fontWeight: 400 }, children: label } },
        { type: 'span', props: { style: { fontSize: 15, color: '#0d1b2a', fontWeight: 700 }, children: String(value) } },
      ],
    },
  });

  const card = {
    type: 'div',
    props: {
      style: {
        width: 500, height: 700,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '0 28px 16px',
        fontFamily: '"CairoEN"',
        direction: 'ltr',
        // No background here — composited separately to avoid librsvg data-URI limits
        position: 'relative',
      },
      children: [
        { type: 'div', props: { style: { display: 'flex', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(255,255,255,0.28)' }, children: '' } },
        { type: 'div', props: { style: { display: 'flex', height: 26 }, children: '' } },
        {
          type: 'div',
          props: {
            style: { display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 14 },
            children: [
              { type: 'span', props: { style: { fontSize: 22, fontWeight: 700, color: '#0d1b2a' }, children: 'INVITATION PASS' } },
              { type: 'span', props: { style: { fontSize: 13, color: '#555', marginTop: 4 }, children: 'Single Use Pass' } },
            ],
          },
        },
        {
          type: 'div',
          props: {
            style: { display: 'flex', background: 'white', borderRadius: 18, padding: 10, boxShadow: '4px 4px 16px rgba(0,0,0,0.10)' },
            children: { type: 'img', props: { src: qrDataUrl, width: 290, height: 290 } },
          },
        },
        {
          type: 'div',
          props: {
            style: {
              display: 'flex', flexDirection: 'column', width: '100%',
              background: 'rgba(242,242,242,0.93)', borderRadius: 16, padding: '4px 20px', marginTop: 18,
            },
            children: [
              infoRow('Date',           formattedDate),
              infoRow('Allowed Guests', String(allowedGuests)),
              infoRow('Kids',           kidsValue),
              infoRow('Guest',          guestName, true),
            ],
          },
        },
        ...(!kidsAllowed ? [{
          type: 'div',
          props: {
            style: { display: 'flex', marginTop: 9 },
            children: { type: 'span', props: { style: { fontSize: 11, color: '#cc3300', textAlign: 'center' }, children: '* Children under 15 are not permitted' } },
          },
        }] : []),
      ],
    },
  };

  // Render Satori to transparent PNG (no background in SVG)
  const svg = await satori(card, { width: 500, height: 700, fonts: getFonts() });
  const satoriPng = await sharp(Buffer.from(svg)).png().toBuffer();

  // Composite: background image → Satori overlay
  const bgPath = path.join(process.cwd(), 'public', 'qr-bg.png');
  try {
    return await sharp(bgPath)
      .resize(500, 700, { fit: 'cover', position: 'center' })
      .composite([{ input: satoriPng, blend: 'over' }])
      .png()
      .toBuffer();
  } catch {
    // fallback: plain blue background
    return await sharp({
      create: { width: 500, height: 700, channels: 4, background: { r: 210, g: 230, b: 245, alpha: 1 } },
    })
      .composite([{ input: satoriPng, blend: 'over' }])
      .png()
      .toBuffer();
  }
}

// ── Public entry point ─────────────────────────────────────────────────────
export async function generateQRCard(guest, token) {
  const isArabic = (guest?.language ?? 'ar') !== 'en';
  return isArabic
    ? generateArabicQRCard(guest, token)
    : generateEnglishQRCard(guest, token);
}
