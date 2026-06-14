import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('guests')
    .select('*')
    .order('name');

  if (error) {
    return Response.json({ message: error.message }, { status: 500 });
  }

  return Response.json(data);
}

export async function DELETE() {
  const { error } = await supabaseAdmin
    .from('guests')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000'); // filter required by Supabase for mass delete

  if (error) return Response.json({ message: error.message }, { status: 500 });
  return Response.json({ deleted: true });
}

export async function POST(request) {
  const { name, allowed_guests, language, kids_allowed, kids_count, kids_names } = await request.json();

  if (!name || typeof name !== 'string' || !name.trim()) {
    return Response.json({ message: 'Guest name is required.' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('guests')
    .insert({
      name:          name.trim(),
      allowed_guests: allowed_guests || 1,
      language:      language || 'ar',
      kids_allowed:  kids_allowed ?? false,
      kids_count:    Math.max(0, parseInt(kids_count) || 0),
      kids_names:    String(kids_names || '').trim(),
    })
    .select()
    .single();

  if (error) {
    return Response.json({ message: error.message }, { status: 500 });
  }

  return Response.json(data, { status: 201 });
}
