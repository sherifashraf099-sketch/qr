import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(request) {
  const body = await request.json();
  const guests = body.guests;

  if (!Array.isArray(guests) || guests.length === 0) {
    return Response.json({ message: 'No guests provided.' }, { status: 400 });
  }

  const rows = guests
    .filter(g => String(g.name || '').trim())
    .map(g => ({
      name:           String(g.name).trim(),
      allowed_guests: Math.max(1, parseInt(g.allowed_guests) || 1),
      language:       g.language === 'en' ? 'en' : 'ar',
    }));

  if (rows.length === 0) {
    return Response.json({ message: 'No valid rows found.' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('guests')
    .insert(rows)
    .select('name, token');

  if (error) return Response.json({ message: error.message }, { status: 500 });

  return Response.json({ added: rows.length, guests: data });
}
