import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(request) {
  const { token, password } = await request.json();

  if (!token || !password) {
    return Response.json({ message: 'Missing fields.' }, { status: 400 });
  }

  if (password !== process.env.SECURITY_PASSWORD) {
    return Response.json({ message: 'Wrong password.' }, { status: 401 });
  }

  const { data: guest, error: fetchError } = await supabaseAdmin
    .from('guests')
    .select('id, checked_in')
    .eq('token', token)
    .single();

  if (fetchError || !guest) {
    return Response.json({ message: 'Guest not found.' }, { status: 404 });
  }

  if (guest.checked_in) {
    return Response.json({ message: 'This guest is already checked in.' }, { status: 400 });
  }

  const { error: updateError } = await supabaseAdmin
    .from('guests')
    .update({ checked_in: true, checked_in_at: new Date().toISOString() })
    .eq('id', guest.id);

  if (updateError) {
    return Response.json({ message: 'Failed to update. Try again.' }, { status: 500 });
  }

  return Response.json({ message: 'Checked in successfully.' });
}
