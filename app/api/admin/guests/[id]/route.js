import { supabaseAdmin } from '@/lib/supabase-admin';

export async function DELETE(_, { params }) {
  const { id } = await params;
  const { error } = await supabaseAdmin.from('guests').delete().eq('id', id);
  if (error) return Response.json({ message: error.message }, { status: 500 });
  return Response.json({ message: 'Guest deleted.' });
}

export async function PATCH(request, { params }) {
  const { id } = await params;
  const body = await request.json();

  const update = {};

  if ('language' in body) {
    if (body.language !== 'ar' && body.language !== 'en')
      return Response.json({ message: 'Invalid language.' }, { status: 400 });
    update.language = body.language;
  }

  if ('name' in body) {
    if (!String(body.name || '').trim())
      return Response.json({ message: 'Name is required.' }, { status: 400 });
    update.name = String(body.name).trim();
  }

  if ('allowed_guests' in body) {
    update.allowed_guests = Math.max(1, parseInt(body.allowed_guests) || 1);
  }

  if ('checked_in' in body) {
    update.checked_in    = Boolean(body.checked_in);
    update.checked_in_at = body.checked_in ? new Date().toISOString() : null;
  }

  if (Object.keys(update).length === 0)
    return Response.json({ message: 'Nothing to update.' }, { status: 400 });

  const { error } = await supabaseAdmin.from('guests').update(update).eq('id', id);
  if (error) return Response.json({ message: error.message }, { status: 500 });
  return Response.json({ updated: true });
}
