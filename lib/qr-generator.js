import satori from 'satori';
import sharp from 'sharp';
import QRCode from 'qrcode';
import path from 'path';
import fs from 'fs';

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

  // Background image
  const bgPath = path.join(process.cwd(), 'public', 'qr-bg.png');
  let bgEl = '<rect width="500" height="700" fill="#d2e6f5"/>';
  try {
    const buf = await sharp(bgPath).resize(500, 700, { fit: 'cover', position: 'center' }).toBuffer();
    bgEl = `<image xlink:href="data:image/png;base64,${buf.toString('base64')}" width="500" height="700" preserveAspectRatio="xMidYMid slice"/>`;
  } catch {}

  // Embed Arabic fonts so librsvg uses Cairo instead of system fallback
  const cr = path.join(process.cwd(), 'public', 'fonts');
  let fontCSS = '';
  try {
    const ar4 = fs.readFileSync(path.join(cr, 'cairo-arabic-400-normal.woff')).toString('base64');
    const ar7 = fs.readFileSync(path.join(cr, 'cairo-arabic-700-normal.woff')).toString('base64');
    fontCSS =
      `@font-face{font-family:'Cairo';src:url('data:font/woff;base64,${ar4}');font-weight:400;}` +
      `@font-face{font-family:'Cairo';src:url('data:font/woff;base64,${ar7}');font-weight:700;}`;
  } catch {}

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
    const y   = ROW_FIRST_Y + i * ROW_STEP;
    const sep_y = y + 9;
    return `
<text x="452" y="${y}" text-anchor="start" direction="rtl" font-family="Cairo,sans-serif" font-size="13" fill="#888">${label}</text>
<text x="48"  y="${y}" text-anchor="end"   direction="rtl" font-family="Cairo,sans-serif" font-size="15" font-weight="700" fill="#0d1b2a">${value}</text>
${sep ? `<line x1="48" y1="${sep_y}" x2="452" y2="${sep_y}" stroke="black" stroke-opacity="0.07" stroke-width="1"/>` : ''}`;
  }).join('');

  const kidsNoteEl = !kidsAllowed
    ? `<text x="250" y="${BOX_Y + BOX_H + 22}" text-anchor="middle" direction="rtl" font-family="Cairo,sans-serif" font-size="11" fill="#cc3300">* لا يسمح بدخول الاطفال تحت سن 15 عاما</text>`
    : '';

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="500" height="700">
<defs><style>${fontCSS}</style></defs>
${bgEl}
<rect width="500" height="700" fill="white" fill-opacity="0.28"/>
<text x="250" y="54"  text-anchor="middle" direction="rtl" font-family="Cairo,sans-serif" font-size="22" font-weight="700" fill="#0d1b2a">تصريح دخول</text>
<text x="250" y="75"  text-anchor="middle" direction="rtl" font-family="Cairo,sans-serif" font-size="13" fill="#555">للاستخدام مرة واحدة</text>
<rect x="90" y="90" width="320" height="310" rx="18" fill="white"/>
<image xlink:href="data:image/png;base64,${qrB64}" x="100" y="100" width="300" height="290"/>
<rect x="28" y="${BOX_Y}" width="444" height="${BOX_H}" rx="16" fill="#f2f2f2" fill-opacity="0.93"/>
${rowsSVG}
${kidsNoteEl}
</svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

// ── English card via Satori ────────────────────────────────────────────────
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

  const bgPath = path.join(process.cwd(), 'public', 'qr-bg.png');
  let bgDataUrl = '';
  try {
    const buf = await sharp(bgPath).resize(500, 700, { fit: 'cover', position: 'center' }).toBuffer();
    bgDataUrl = `data:image/png;base64,${buf.toString('base64')}`;
  } catch {}

  const qrBuf = await QRCode.toBuffer(inviteUrl, {
    width: 290, margin: 1, color: { dark: '#000000', light: '#ffffff' },
  });
  const qrDataUrl = `data:image/png;base64,${qrBuf.toString('base64')}`;

  const infoRow = (label, value) => ({
    type: 'div',
    props: {
      style: {
        display: 'flex', flexDirection: 'row',
        justifyContent: 'space-between', alignItems: 'center',
        width: '100%', padding: '9px 0',
        borderBottom: '1px solid rgba(0,0,0,0.07)',
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
        backgroundImage: bgDataUrl ? `url(${bgDataUrl})` : undefined,
        backgroundSize: 'cover',
        backgroundColor: '#d2e6f5',
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
              infoRow('Guest',          guestName),
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

  const svg = await satori(card, { width: 500, height: 700, fonts: getFonts() });
  return sharp(Buffer.from(svg)).png().toBuffer();
}

// ── Public entry point ─────────────────────────────────────────────────────
export async function generateQRCard(guest, token) {
  const isArabic = (guest?.language ?? 'ar') !== 'en';
  return isArabic
    ? generateArabicQRCard(guest, token)
    : generateEnglishQRCard(guest, token);
}
