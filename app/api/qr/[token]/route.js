import { generateQRCard } from '@/lib/qr-generator';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

export async function GET(_, { params }) {
  const { token } = await params;

  const { data: guest } = await supabaseAdmin
    .from('guests')
    .select('name, allowed_guests, language')
    .eq('token', token)
    .single();

  const pngBuffer = await generateQRCard(guest, token);
  const encodedFilename = encodeURIComponent((guest?.name ?? 'invite') + '.png');

  return new Response(pngBuffer, {
    headers: {
      'Content-Type': 'image/png',
      'Content-Disposition': `attachment; filename="invite.png"; filename*=UTF-8''${encodedFilename}`,
      'Cache-Control': 'no-store',
    },
  });
}
