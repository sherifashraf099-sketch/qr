import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

export async function GET() {
  // Count guests in DB by language
  const { data: guests, error } = await supabaseAdmin
    .from('guests')
    .select('name, language');

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const ar = guests.filter(g => g.language === 'ar');
  const en = guests.filter(g => g.language === 'en');

  // Try rendering one Arabic card to check if it errors
  let arabicRenderResult = 'skipped (no arabic guests)';
  if (ar.length > 0) {
    try {
      const { generateQRCard } = await import('@/lib/qr-generator');
      const testGuest = ar[0];
      const { data: fullGuest } = await supabaseAdmin
        .from('guests')
        .select('*')
        .eq('name', testGuest.name)
        .single();
      await generateQRCard(fullGuest, 'debug-token-test');
      arabicRenderResult = `OK — rendered "${testGuest.name}" successfully`;
    } catch (e) {
      arabicRenderResult = `ERROR: ${e.message}`;
    }
  }

  return new Response(
    JSON.stringify({
      totalInDB: guests.length,
      arabicGuests: ar.length,
      englishGuests: en.length,
      sampleArabicNames: ar.slice(0, 5).map(g => g.name),
      arabicRenderTest: arabicRenderResult,
    }, null, 2),
    { headers: { 'Content-Type': 'application/json' } }
  );
}
