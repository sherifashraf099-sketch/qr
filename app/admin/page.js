import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import AdminDashboard from './AdminDashboard';

// Always fetch fresh guest data
export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const { data: guests, error } = await supabase
    .from('guests')
    .select('*')
    .order('name');

  if (error) {
    return (
      <div className="admin-page">
        <div className="admin-topbar">
          <h1>Wedding Guest Manager</h1>
        </div>
        <p className="error-text">Error loading guests: {error.message}</p>
      </div>
    );
  }

  const total = guests.length;
  const checkedIn = guests.filter((g) => g.checked_in).length;

  return (
    <div className="admin-page">
      <div className="admin-topbar">
        <h1>Wedding Guest Manager</h1>
        <a href="/api/admin/logout" className="btn-logout">Logout</a>
      </div>

      <div className="stats-row">
        <div className="stat-box">
          <span className="stat-num">{total}</span>
          <span className="stat-lbl">Total</span>
        </div>
        <div className="stat-box">
          <span className="stat-num green">{checkedIn}</span>
          <span className="stat-lbl">Checked In</span>
        </div>
        <div className="stat-box">
          <span className="stat-num orange">{total - checkedIn}</span>
          <span className="stat-lbl">Remaining</span>
        </div>
      </div>

      <AdminDashboard guests={guests} />
    </div>
  );
}
