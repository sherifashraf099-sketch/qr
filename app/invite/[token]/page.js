import { supabaseAdmin } from '@/lib/supabase-admin';

// Always fetch fresh — never cache
export const dynamic = 'force-dynamic';

export default async function InvitePage({ params }) {
  const { token } = await params;

  const { data: guest, error } = await supabaseAdmin
    .from('guests')
    .select('*')
    .eq('token', token)
    .single();

  if (error || !guest) {
    return (
      <div className="container rtl">
        <div className="card invalid-card">
          <h1>دعوة غير صالحة</h1>
          <p>رمز QR هذا غير صالح أو تم حذفه.</p>
        </div>
      </div>
    );
  }

  // Guest already checked in — show warning, do nothing
  if (guest.checked_in) {
    const entryTime = new Date(guest.checked_in_at).toLocaleString('ar-EG', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    return (
      <div className="container rtl">
        <div className="card">
          <div className="page-header">
            <h1>تسجيل الدخول</h1>
          </div>
          <div className="guest-info">
            <h2 dir="auto">{guest.name}</h2>
            <p className="seats">
              {guest.allowed_guests} {guest.allowed_guests === 1 ? 'مدعو' : 'مدعوون'}
            </p>
          </div>
          <div className="warning-box">
            <h3>⚠ تم استخدام هذه الدعوة مسبقاً</h3>
            <p>هذه الدعوة مستخدمة بالفعل</p>
            <p className="entry-time">وقت الدخول: {entryTime}</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Auto check-in ──
  // .eq('checked_in', false) prevents a race condition if scanned twice at the same moment
  const checkedInAt = new Date().toISOString();
  await supabaseAdmin
    .from('guests')
    .update({ checked_in: true, checked_in_at: checkedInAt })
    .eq('id', guest.id)
    .eq('checked_in', false);

  const entryTime = new Date(checkedInAt).toLocaleString('ar-EG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <div className="container rtl">
      <div className="card">
        <div className="page-header">
          <h1>تسجيل الدخول</h1>
        </div>
        <div className="guest-info">
          <h2 dir="auto">{guest.name}</h2>
          <p className="seats">
            {guest.allowed_guests} {guest.allowed_guests === 1 ? 'مدعو' : 'مدعوون'}
          </p>
        </div>
        <div className="success-box">
          <h3>✓ تم التسجيل بنجاح</h3>
          <p className="entry-time">وقت الدخول: {entryTime}</p>
        </div>
      </div>
    </div>
  );
}
