import QRCode from 'qrcode';
import sharp from 'sharp';
import path from 'path';

function xml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatWeddingDate(dateStr, isArabic) {
  const parts = (dateStr || '').split('/');
  if (parts.length !== 3) return xml(dateStr || '');
  const [d, m, y] = parts.map(Number);
  const date = new Date(y, m - 1, d);
  try {
    if (isArabic) {
      return xml(date.toLocaleDateString('ar-EG', { weekday: 'long', month: 'long', day: 'numeric' }));
    }
    return xml(date.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric' }));
  } catch {
    return xml(dateStr);
  }
}

export async function generateQRCard(guest, token) {
  const isArabic = (guest?.language ?? 'ar') !== 'en';
  const appUrl   = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const inviteUrl = `${appUrl}/invite/${token}`;
  const formattedDate = formatWeddingDate(process.env.WEDDING_DATE || '', isArabic);
  const guestName     = guest?.name ?? (isArabic ? 'ضيف' : 'Guest');
  const allowedGuests = guest?.allowed_guests ?? 1;

  const T = isArabic
    ? { title: 'تصريح دخول',      subtitle: 'للاستخدام مرة واحدة',
        lDate: 'التاريخ',          lGuests: 'عدد المدعوين', lVisitor: 'المدعو', dir: 'rtl' }
    : { title: 'INVITATION PASS', subtitle: 'Single Use Pass',
        lDate: 'Date',             lGuests: 'Allowed Guests', lVisitor: 'Guest',  dir: 'ltr' };

  const W = 500, H = 700, QR = 290, QR_X = 105, QR_Y = 139;
  const INFO_Y = 463, INFO_H = 152, ROW1_Y = 488, ROW2_Y = 538, ROW3_Y = 588;

  const bgPath = path.join(process.cwd(), 'public', 'qr-bg.png');
  let bgBuffer;
  try {
    bgBuffer = await sharp(bgPath)
      .resize(W, H, { fit: 'cover', position: 'center' })
      .toBuffer();
  } catch {
    bgBuffer = await sharp({
      create: { width: W, height: H, channels: 4, background: { r: 210, g: 230, b: 245, alpha: 1 } },
    }).png().toBuffer();
  }

  const qrBuffer = await QRCode.toBuffer(inviteUrl, {
    width: QR, margin: 1, color: { dark: '#000000', light: '#ffffff' },
  });

  const F = `font-family="'Tahoma','Arial Unicode MS','Arial',sans-serif"`;
  function infoRow(y, label, value) {
    return `
      <text x="50"  y="${y}" ${F} font-size="13" fill="#888" text-anchor="start">${xml(label)}</text>
      <text x="448" y="${y}" ${F} font-size="15" font-weight="bold" fill="#0d1b2a" text-anchor="end" direction="auto">${xml(String(value))}</text>`;
  }

  const shapeSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${W}" height="${H}" fill="rgba(255,255,255,0.32)"/>
    <rect x="99" y="133" width="310" height="318" rx="18" fill="rgba(0,0,0,0.08)"/>
    <rect x="95" y="129" width="310" height="318" rx="18" fill="white"/>
    <rect x="32" y="${INFO_Y + 4}" width="440" height="${INFO_H}" rx="16" fill="rgba(0,0,0,0.07)"/>
    <rect x="28" y="${INFO_Y}"     width="440" height="${INFO_H}" rx="16" fill="rgba(242,242,242,0.93)"/>
  </svg>`;

  const textSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <text x="250" y="99"  ${F} font-size="22" font-weight="bold" fill="#0d1b2a" text-anchor="middle" direction="${T.dir}">${xml(T.title)}</text>
    <text x="250" y="119" ${F} font-size="13" fill="#555" text-anchor="middle" direction="${T.dir}">${xml(T.subtitle)}</text>
    ${infoRow(ROW1_Y, T.lDate,    formattedDate)}
    ${infoRow(ROW2_Y, T.lGuests,  String(allowedGuests))}
    ${infoRow(ROW3_Y, T.lVisitor, guestName)}
  </svg>`;

  return await sharp(bgBuffer)
    .composite([
      { input: Buffer.from(shapeSvg), top: 0,     left: 0    },
      { input: qrBuffer,              top: QR_Y,   left: QR_X },
      { input: Buffer.from(textSvg),  top: 0,     left: 0    },
    ])
    .png()
    .toBuffer();
}
