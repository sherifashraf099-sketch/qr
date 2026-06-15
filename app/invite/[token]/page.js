import { supabaseAdmin } from '@/lib/supabase-admin';

// Always fetch fresh — never cache
export const dynamic = 'force-dynamic';

export default async function InvitePage({ params }) {
  const { token } = await params;

  let guest, dbError;
  try {
    const result = await supabaseAdmin
      .from('guests')
      .select('*')
      .eq('token', token)
      .single();
    guest = result.data;
    dbError = result.error;
  } catch (err) {
    dbError = err;
  }

  if (dbError || !guest) {
    return (
      <div className="container rtl">
        <div className="card invalid-card">
          <h1>دعوة غير صالحة</h1>
          <p>رمز QR هذا غير صالح أو تم حذفه.</p>
          {process.env.NODE_ENV !== 'production' && dbError && (
            <pre style={{ fontSize: 11, color: '#888', marginTop: 8, textAlign: 'left', direction: 'ltr' }}>
              {String(dbError?.message ?? dbError)}
            </pre>
          )}
        </div>
      </div>
    );
  }

  // kids_names may be a comma-separated string or a JS array depending on the DB column type
  const rawKidsNames = guest.kids_names;
  const kidsNames = Array.isArray(rawKidsNames)
    ? rawKidsNames.map(s => String(s).trim()).filter(Boolean)
    : (rawKidsNames || '').split(',').map(s => s.trim()).filter(Boolean);

  function KidsSection() {
    if (!guest.kids_allowed) {
      return (
        <div className="kids-section kids-denied">
          <span className="kids-icon">🚫</span>
          <span>لا يُسمح بدخول الأطفال تحت سن 15 سنة</span>
        </div>
      );
    }
    return (
      <div className="kids-section kids-ok">
        <span className="kids-icon">👶</span>
        <div>
          <strong>
            مسموح بـ {guest.kids_count} {guest.kids_count === 1 ? 'طفل' : 'أطفال'}
          </strong>
          {kidsNames.length > 0 && (
            <ul className="kids-names-list">
              {kidsNames.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
          )}
        </div>
      </div>
    );
  }

  function fmtTime(iso) {
    try {
      return new Date(iso).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' });
    } catch {
      return new Date(iso).toLocaleString();
    }
  }

  // Guest already checked in — show warning, do nothing
  if (guest.checked_in) {
    const entryTime = fmtTime(guest.checked_in_at);

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
          <KidsSection />
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

  const entryTime = fmtTime(checkedInAt);

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
        <KidsSection />
        <div className="success-box">
          <h3>✓ تم التسجيل بنجاح</h3>
          <p className="entry-time">وقت الدخول: {entryTime}</p>
        </div>
      </div>
    </div>
  );
}
