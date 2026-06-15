import satori from 'satori';
import sharp from 'sharp';
import QRCode from 'qrcode';
import path from 'path';
import fs from 'fs';

// ── Fonts (loaded once, cached) ────────────────────────────────────────────
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

// ── Info row: label (left) | value (right) ─────────────────────────────────
function infoRow(label, value) {
  return {
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
  };
}

// ── Main generator ─────────────────────────────────────────────────────────
export async function generateQRCard(guest, token) {
  const isArabic = (guest?.language ?? 'ar') !== 'en';
  const appUrl    = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const inviteUrl = `${appUrl}/invite/${token}`;

  const formattedDate = formatWeddingDate(process.env.WEDDING_DATE || '', isArabic);
  const guestName     = guest?.name          ?? (isArabic ? 'ضيف' : 'Guest');
  const allowedGuests = guest?.allowed_guests ?? 1;
  const kidsAllowed   = guest?.kids_allowed   ?? false;
  const kidsCount     = guest?.kids_count     ?? 0;

  const T = isArabic
    ? {
        title: 'تصريح دخول',      subtitle: 'للاستخدام مرة واحدة',
        lDate: 'التاريخ',          lGuests: 'عدد المدعوين', lVisitor: 'المدعو', lKids: 'الأطفال',
        noKids: 'غير مسموح',       kidsUnit1: 'طفل',  kidsUnitN: 'أطفال',
        kidsNote: '* لا يُسمح بدخول الأطفال تحت سن 15 عاماً',
        dir: 'rtl',
      }
    : {
        title: 'INVITATION PASS', subtitle: 'Single Use Pass',
        lDate: 'Date',             lGuests: 'Allowed Guests', lVisitor: 'Guest', lKids: 'Kids',
        noKids: 'Not Allowed',     kidsUnit1: 'Kid',  kidsUnitN: 'Kids',
        kidsNote: '* Children under 15 are not permitted',
        dir: 'ltr',
      };

  const kidsValue = kidsAllowed
    ? `${kidsCount} ${kidsCount === 1 ? T.kidsUnit1 : T.kidsUnitN}`
    : T.noKids;

  // Background as data URL
  const bgPath = path.join(process.cwd(), 'public', 'qr-bg.png');
  let bgDataUrl = '';
  try {
    const buf = await sharp(bgPath).resize(500, 700, { fit: 'cover', position: 'center' }).toBuffer();
    bgDataUrl = `data:image/png;base64,${buf.toString('base64')}`;
  } catch { /* fallback: solid colour from backgroundColor */ }

  // QR code as data URL
  const qrBuf = await QRCode.toBuffer(inviteUrl, {
    width: 290, margin: 1, color: { dark: '#000000', light: '#ffffff' },
  });
  const qrDataUrl = `data:image/png;base64,${qrBuf.toString('base64')}`;

  // ── Card layout ───────────────────────────────────────────────────────────
  const card = {
    type: 'div',
    props: {
      style: {
        width: 500, height: 700,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '0 28px 16px',
        fontFamily: '"CairoAR","CairoEN"',
        direction: T.dir,
        backgroundImage: bgDataUrl ? `url(${bgDataUrl})` : undefined,
        backgroundSize: 'cover',
        backgroundColor: '#d2e6f5',
        position: 'relative',
      },
      children: [
        // Frosted white overlay (absolute)
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(255,255,255,0.28)',
            },
            children: '',
          },
        },

        // Spacer to push content down (matches original top ~80px)
        { type: 'div', props: { style: { display: 'flex', height: 26 }, children: '' } },

        // Title
        {
          type: 'div',
          props: {
            style: { display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 14 },
            children: [
              { type: 'span', props: { style: { fontSize: 22, fontWeight: 700, color: '#0d1b2a' }, children: T.title } },
              { type: 'span', props: { style: { fontSize: 13, color: '#555', marginTop: 4 }, children: T.subtitle } },
            ],
          },
        },

        // QR white card
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              background: 'white', borderRadius: 18, padding: 10,
              boxShadow: '4px 4px 16px rgba(0,0,0,0.10)',
            },
            children: { type: 'img', props: { src: qrDataUrl, width: 290, height: 290 } },
          },
        },

        // Info box
        {
          type: 'div',
          props: {
            style: {
              display: 'flex', flexDirection: 'column',
              width: '100%',
              background: 'rgba(242,242,242,0.93)',
              borderRadius: 16, padding: '4px 20px',
              marginTop: 18,
              direction: 'ltr',
            },
            children: [
              infoRow(T.lDate,    formattedDate),
              infoRow(T.lGuests,  String(allowedGuests)),
              infoRow(T.lKids,    kidsValue),
              infoRow(T.lVisitor, guestName),
            ],
          },
        },

        // Kids note (only when kids not allowed)
        ...(!kidsAllowed ? [{
          type: 'div',
          props: {
            style: { display: 'flex', marginTop: 9 },
            children: {
              type: 'span',
              props: {
                style: { fontSize: 11, color: '#cc3300', textAlign: 'center', direction: T.dir },
                children: T.kidsNote,
              },
            },
          },
        }] : []),
      ],
    },
  };

  const svg = await satori(card, { width: 500, height: 700, fonts: getFonts() });
  return await sharp(Buffer.from(svg)).png().toBuffer();
}
