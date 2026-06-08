'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function CheckInForm({ guest }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Guest already checked in — show warning
  if (guest.checked_in) {
    const entryTime = new Date(guest.checked_in_at).toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    return (
      <div className="warning-box">
        <h3>⚠ Already Checked In</h3>
        <p>This invitation was already used.</p>
        <p className="entry-time">Entry recorded at: {entryTime}</p>
      </div>
    );
  }

  async function handleCheckIn() {
    if (!password.trim()) {
      setError('Please enter the security password.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: guest.token, password }),
      });

      const data = await res.json();

      if (res.ok) {
        // Refresh the server component so the page re-fetches updated data
        router.refresh();
      } else {
        setError(data.message || 'Something went wrong.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="form-stack">
      <div className="status-badge valid">✓ Valid Invitation</div>

      <div className="field">
        <label htmlFor="sec-password">Security Password</label>
        <input
          id="sec-password"
          type="password"
          placeholder="Enter password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          onKeyDown={(e) => e.key === 'Enter' && handleCheckIn()}
        />
      </div>

      {error && <p className="error-text">{error}</p>}

      <button
        className="btn-checkin"
        onClick={handleCheckIn}
        disabled={loading}
      >
        {loading ? 'Processing...' : 'Mark as Entered'}
      </button>
    </div>
  );
}
