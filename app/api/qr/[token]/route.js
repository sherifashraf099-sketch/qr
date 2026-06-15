import { generateQRCard } from '@/lib/qr-generator';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(_, { params }) {
  const { token } = await params;

  const { data: guest } = await supabaseAdmin
    .from('guests')
    .select('name, allowed_guests, language, kids_allowed, kids_count, kids_names')
    .eq('token', token)
    .single();

  try {
    const pngBuffer = await generateQRCard(guest, token);
    const encodedFilename = encodeURIComponent((guest?.name ?? 'invite') + '.png');

    return new Response(pngBuffer, {
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': `attachment; filename="invite.png"; filename*=UTF-8''${encodedFilename}`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error(`QR generation failed — token: ${token}, guest: ${guest?.name}, lang: ${guest?.language}`, err);
    return new Response(JSON.stringify({ error: err.message, token, name: guest?.name }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
