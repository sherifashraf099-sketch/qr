'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtNow() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ── CSV parsing ───────────────────────────────────────────────────────────────

function parseCSVLine(line) {
  const result = []; let cur = '', inQ = false;
  for (const ch of line) {
    if (ch === '"') inQ = !inQ;
    else if (ch === ',' && !inQ) { result.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  result.push(cur.trim()); return result;
}

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { error: 'CSV has no data rows.' };
  const headers = parseCSVLine(lines[0]).map(h => h.replace(/^"|"$/g, '').toLowerCase().trim());
  const nameIdx   = headers.findIndex(h => ['name','guest name','guest','اسم','الاسم'].includes(h));
  const guestsIdx = headers.findIndex(h => ['allowed guests','allowed_guests','guests','seats','count','number of allowed guests','عدد المدعوين','عدد'].includes(h));
  const langIdx   = headers.findIndex(h => ['language','lang','لغة'].includes(h));
  if (nameIdx === -1) return { error: 'No "Name" column found. Make sure the first row has column headers.' };
  const rows = lines.slice(1).map(l => parseCSVLine(l)).filter(v => v[nameIdx]?.trim()).map(v => ({
    name:           v[nameIdx],
    allowed_guests: guestsIdx >= 0 ? Math.max(1, parseInt(v[guestsIdx]) || 1) : 1,
    language:       langIdx >= 0 && ['en','english','إنجليزي'].includes((v[langIdx]||'').toLowerCase()) ? 'en' : 'ar',
  }));
  if (rows.length === 0) return { error: 'No valid guest rows found.' };
  return rows;
}

// ── ZIP helper ────────────────────────────────────────────────────────────────

async function downloadGuestsAsZip(guestList, zipName, onProgress) {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  for (let i = 0; i < guestList.length; i++) {
    const g = guestList[i];
    try {
      const res = await fetch(`/api/qr/${g.token}`);
      if (res.ok) {
        const safe = (g.name || g.token).replace(/[/\\:*?"<>|]/g, '_');
        zip.file(`${safe}.png`, await res.arrayBuffer());
      }
    } catch { /* skip */ }
    onProgress(Math.round((i + 1) / guestList.length * 100));
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement('a'), { href: url, download: zipName }).click();
  URL.revokeObjectURL(url);
  onProgress(0);
}

// ── Export CSV helper ─────────────────────────────────────────────────────────

function exportCSV(guests) {
  const header = 'Name,Allowed Guests,Language,Checked In,Check-in Time';
  const rows = guests.map(g => [
    `"${String(g.name).replace(/"/g, '""')}"`,
    g.allowed_guests,
    g.language,
    g.checked_in ? 'Yes' : 'No',
    g.checked_in_at ? new Date(g.checked_in_at).toLocaleString() : '',
  ].join(','));
  // BOM prefix so Excel renders Arabic correctly
  const blob = new Blob(['﻿' + [header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement('a'), { href: url, download: 'guests.csv' }).click();
  URL.revokeObjectURL(url);
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminDashboard({ guests }) {
  const router     = useRouter();
  const fileInputRef = useRef(null);

  // Add form
  const [name, setName]         = useState('');
  const [seats, setSeats]       = useState(1);
  const [language, setLanguage] = useState('ar');
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError]     = useState('');

  // Per-row: delete / QR / language toggle
  const [deletingId, setDeletingId]             = useState(null);
  const [downloadingToken, setDownloadingToken] = useState(null);
  const [togglingId, setTogglingId]             = useState(null);

  // Inline edit
  const [editingId, setEditingId]   = useState(null);
  const [editName, setEditName]     = useState('');
  const [editGuests, setEditGuests] = useState(1);
  const [editLang, setEditLang]     = useState('ar');
  const [editLoading, setEditLoading] = useState(false);

  // Undo check-in
  const [resettingId, setResettingId] = useState(null);

  // Copy invite link
  const [copiedToken, setCopiedToken] = useState(null);

  // Search & status filter
  const [search, setSearch]             = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Checkbox selection
  const [selectedIds, setSelectedIds] = useState(new Set());

  // CSV upload
  const [csvFile, setCsvFile]         = useState(null);
  const [csvLoading, setCsvLoading]   = useState(false);
  const [csvStatus, setCsvStatus]     = useState('');
  const [csvIsError, setCsvIsError]   = useState(false);

  // Separate progress per bulk action
  const [dlCsvPct,  setDlCsvPct]  = useState(0);
  const [dlAllPct,  setDlAllPct]  = useState(0);
  const [dlSelPct,  setDlSelPct]  = useState(0);
  const [dlCsvBusy, setDlCsvBusy] = useState(false);
  const [dlAllBusy, setDlAllBusy] = useState(false);
  const [dlSelBusy, setDlSelBusy] = useState(false);

  // Bulk delete
  const [deletingAll, setDeletingAll]           = useState(false);
  const [deletingSelected, setDeletingSelected] = useState(false);

  // Auto-refresh
  const [lastRefreshed, setLastRefreshed] = useState('');

  useEffect(() => {
    const channel = supabase
      .channel('guests-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'guests' }, () => {
        router.refresh();
        setLastRefreshed(fmtNow());
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [router]);

  // ── Derived ──
  const filtered = guests.filter(g => {
    const matchSearch = g.name.toLowerCase().includes(search.toLowerCase());
    const matchStatus =
      statusFilter === 'checked' ?  g.checked_in :
      statusFilter === 'waiting' ? !g.checked_in : true;
    return matchSearch && matchStatus;
  });

  const allFilteredSelected = filtered.length > 0 && filtered.every(g => selectedIds.has(g.id));
  const selectedGuests      = guests.filter(g => selectedIds.has(g.id));
  const anyBusy = dlCsvBusy || dlAllBusy || dlSelBusy || deletingAll || deletingSelected;

  // ── Selection ──
  function toggleSelect(id) {
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleSelectAll() {
    if (allFilteredSelected) {
      setSelectedIds(prev => { const n = new Set(prev); filtered.forEach(g => n.delete(g.id)); return n; });
    } else {
      setSelectedIds(prev => { const n = new Set(prev); filtered.forEach(g => n.add(g.id)); return n; });
    }
  }

  // ── Add guest ──
  async function handleAdd(e) {
    e.preventDefault();
    if (!name.trim()) { setAddError('Please enter a guest name.'); return; }
    setAddLoading(true); setAddError('');
    const res = await fetch('/api/admin/guests', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), allowed_guests: seats, language }),
    });
    if (res.ok) { setName(''); setSeats(1); setLanguage('ar'); router.refresh(); }
    else { const d = await res.json(); setAddError(d.message || 'Failed to add guest.'); }
    setAddLoading(false);
  }

  // ── Edit guest ──
  function startEdit(guest) {
    setEditingId(guest.id);
    setEditName(guest.name);
    setEditGuests(guest.allowed_guests);
    setEditLang(guest.language || 'ar');
  }

  async function handleSaveEdit(id) {
    if (!editName.trim()) return;
    setEditLoading(true);
    await fetch(`/api/admin/guests/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName, allowed_guests: editGuests, language: editLang }),
    });
    setEditingId(null);
    setEditLoading(false);
    router.refresh();
  }

  // ── Undo check-in ──
  async function handleUndoCheckin(id) {
    setResettingId(id);
    await fetch(`/api/admin/guests/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checked_in: false }),
    });
    setResettingId(null);
    router.refresh();
  }

  // ── Delete single ──
  async function handleDelete(id, guestName) {
    if (!confirm(`Remove "${guestName}" from the guest list?`)) return;
    setDeletingId(id);
    await fetch(`/api/admin/guests/${id}`, { method: 'DELETE' });
    setDeletingId(null);
    setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    router.refresh();
  }

  // ── Delete selected ──
  async function handleDeleteSelected() {
    if (!confirm(`Delete ${selectedGuests.length} selected guests? This cannot be undone.`)) return;
    setDeletingSelected(true);
    await Promise.all(selectedGuests.map(g => fetch(`/api/admin/guests/${g.id}`, { method: 'DELETE' })));
    setSelectedIds(new Set());
    setDeletingSelected(false);
    router.refresh();
  }

  // ── Delete all ──
  async function handleDeleteAll() {
    if (!confirm(`Delete ALL ${guests.length} guests? This cannot be undone.`)) return;
    setDeletingAll(true);
    await fetch('/api/admin/guests', { method: 'DELETE' });
    setSelectedIds(new Set());
    setDeletingAll(false);
    router.refresh();
  }

  // ── Toggle language ──
  async function handleToggleLanguage(id, current) {
    setTogglingId(id);
    await fetch(`/api/admin/guests/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: current === 'ar' ? 'en' : 'ar' }),
    });
    setTogglingId(null);
    router.refresh();
  }

  // ── Copy invite link ──
  async function handleCopyLink(token) {
    const url = `${window.location.origin}/invite/${token}`;
    await navigator.clipboard.writeText(url);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  }

  // ── Download single QR ──
  async function handleDownloadQR(token, guestName) {
    setDownloadingToken(token);
    try {
      const res = await fetch(`/api/qr/${token}`);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      Object.assign(document.createElement('a'), { href: url, download: `${guestName}.png` }).click();
      URL.revokeObjectURL(url);
    } catch { alert('Failed to download QR code.'); }
    setDownloadingToken(null);
  }

  // ── Download selected ZIP ──
  async function handleDownloadSelected() {
    if (!selectedGuests.length) return;
    setDlSelBusy(true);
    await downloadGuestsAsZip(selectedGuests, 'selected-guests-qr-codes.zip', setDlSelPct);
    setDlSelBusy(false);
  }

  // ── Download all ZIP ──
  async function handleDownloadAll() {
    if (!guests.length) return;
    setDlAllBusy(true);
    await downloadGuestsAsZip(guests, 'all-guests-qr-codes.zip', setDlAllPct);
    setDlAllBusy(false);
  }

  // ── CSV upload → auto-download only new guests ──
  async function handleCSVUpload() {
    if (!csvFile) return;
    setCsvLoading(true); setCsvStatus(''); setCsvIsError(false);
    let rows;
    try {
      const result = parseCSV(await csvFile.text());
      if (result.error) { setCsvStatus(result.error); setCsvIsError(true); setCsvLoading(false); return; }
      rows = result;
    } catch { setCsvStatus('Could not read file.'); setCsvIsError(true); setCsvLoading(false); return; }

    const res = await fetch('/api/admin/guests/bulk', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guests: rows }),
    });
    if (!res.ok) {
      const d = await res.json();
      setCsvStatus(d.message || 'Upload failed.'); setCsvIsError(true); setCsvLoading(false); return;
    }
    const { added, guests: newGuests } = await res.json();
    setCsvStatus(`Added ${added} guests. Generating QR codes…`);
    setDlCsvBusy(true);
    await downloadGuestsAsZip(newGuests, 'new-guests-qr-codes.zip', setDlCsvPct);
    setDlCsvBusy(false);
    setCsvStatus(`✓ Added ${added} guests — QR codes downloaded.`);
    setCsvFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setCsvLoading(false);
    router.refresh();
  }

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Add Guest ── */}
      <div className="card">
        <h2>Add New Guest</h2>
        <form onSubmit={handleAdd} className="add-form">
          <div className="field name-field">
            <label>Name</label>
            <input type="text" placeholder="e.g. Ahmed Mohamed"
              value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="field seats-field">
            <label>Allowed Guests</label>
            <input type="number" min="1" max="20"
              value={seats} onChange={e => setSeats(Number(e.target.value))} />
          </div>
          <div className="field lang-field">
            <label>QR Card</label>
            <select value={language} onChange={e => setLanguage(e.target.value)}>
              <option value="ar">عربي</option>
              <option value="en">English</option>
            </select>
          </div>
          <button className="btn-primary" type="submit" disabled={addLoading}>
            {addLoading ? 'Adding…' : 'Add Guest'}
          </button>
        </form>
        {addError && <p className="error-text" style={{ marginTop: '0.5rem' }}>{addError}</p>}
      </div>

      {/* ── CSV Bulk Upload ── */}
      <div className="card">
        <h2>Bulk Import from Google Sheets</h2>
        <p className="csv-hint">
          In Google Sheets: <strong>File → Download → CSV</strong>.
          Required columns: <code>Name</code>, <code>Allowed Guests</code>, <code>Language</code> (ar / en).
        </p>
        <div className="csv-row">
          <label className="btn-file">
            {csvFile ? csvFile.name : 'Choose CSV file'}
            <input ref={fileInputRef} type="file" accept=".csv"
              onChange={e => { setCsvFile(e.target.files[0] || null); setCsvStatus(''); }} />
          </label>
          <button className="btn-upload" onClick={handleCSVUpload}
            disabled={!csvFile || csvLoading || dlCsvBusy}>
            {csvLoading || dlCsvBusy ? `${dlCsvPct || '…'}%` : 'Upload & Download QR Codes'}
          </button>
        </div>
        {dlCsvBusy && (
          <div className="progress-wrap">
            <div className="progress-bar" style={{ width: `${dlCsvPct}%` }} />
          </div>
        )}
        {csvStatus && (
          <p className={csvIsError ? 'error-text' : 'success-text'} style={{ marginTop: '0.6rem' }}>
            {csvStatus}
          </p>
        )}
      </div>

      {/* ── Guest List ── */}
      <div className="card">

        {/* Header */}
        <div className="list-header">
          <h2>Guest List ({guests.length})</h2>
          <div className="list-header-actions">
            {lastRefreshed && (
              <span className="last-refreshed">↻ {lastRefreshed}</span>
            )}
            {guests.length > 0 && (
              <>
                <button className="btn-export" onClick={() => exportCSV(guests)}>Export CSV</button>
                <button className="btn-dl-all" onClick={handleDownloadAll} disabled={anyBusy}>
                  {dlAllBusy ? `${dlAllPct}%` : '⬇ All QR'}
                </button>
                <button className="btn-del-all" onClick={handleDeleteAll} disabled={anyBusy}>
                  {deletingAll ? '…' : 'Delete All'}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Search */}
        <input className="search-input" type="text"
          placeholder="Search guests by name…"
          value={search} onChange={e => setSearch(e.target.value)} />

        {/* Status filter */}
        <div className="status-filters">
          {[
            { key: 'all',     label: `All (${guests.length})` },
            { key: 'checked', label: `Checked In (${guests.filter(g => g.checked_in).length})` },
            { key: 'waiting', label: `Waiting (${guests.filter(g => !g.checked_in).length})` },
          ].map(({ key, label }) => (
            <button key={key}
              className={`filter-btn ${statusFilter === key ? 'filter-active' : ''}`}
              onClick={() => setStatusFilter(key)}>
              {label}
            </button>
          ))}
        </div>

        {/* Selection bar */}
        {selectedIds.size > 0 && (
          <div className="selection-bar">
            <span className="sel-count">{selectedIds.size} selected</span>
            <button className="btn-dl-sel" onClick={handleDownloadSelected} disabled={anyBusy}>
              {dlSelBusy ? `${dlSelPct}%` : '⬇ Download QR'}
            </button>
            <button className="btn-del-sel" onClick={handleDeleteSelected} disabled={anyBusy}>
              {deletingSelected ? '…' : 'Delete'}
            </button>
            <button className="btn-clear-sel" onClick={() => setSelectedIds(new Set())}>
              Clear
            </button>
          </div>
        )}
        {dlSelBusy && (
          <div className="progress-wrap" style={{ marginBottom: '0.5rem' }}>
            <div className="progress-bar" style={{ width: `${dlSelPct}%` }} />
          </div>
        )}

        {guests.length === 0 ? (
          <p className="empty-msg">No guests yet. Add your first guest above.</p>
        ) : filtered.length === 0 ? (
          <p className="empty-msg">No guests match your current filter.</p>
        ) : (
          <div className="guest-list">

            {/* Select all */}
            <div className="select-all-row">
              <input type="checkbox" className="row-check"
                checked={allFilteredSelected} onChange={toggleSelectAll} />
              <span className="select-all-label">
                {allFilteredSelected ? 'Deselect all' : `Select all (${filtered.length})`}
              </span>
            </div>

            {filtered.map(guest => (
              <div key={guest.id}
                className={`guest-row ${guest.checked_in ? 'is-checked' : ''} ${selectedIds.has(guest.id) ? 'is-selected' : ''}`}>

                {editingId === guest.id ? (
                  /* ── Edit mode ── */
                  <>
                    <div className="edit-fields">
                      <input className="edit-input-name" value={editName}
                        onChange={e => setEditName(e.target.value)}
                        placeholder="Name" />
                      <input className="edit-input-num" type="number" min="1" max="20"
                        value={editGuests} onChange={e => setEditGuests(Number(e.target.value))} />
                      <select value={editLang} onChange={e => setEditLang(e.target.value)}>
                        <option value="ar">AR</option>
                        <option value="en">EN</option>
                      </select>
                    </div>
                    <div className="edit-actions">
                      <button className="btn-save"
                        onClick={() => handleSaveEdit(guest.id)} disabled={editLoading}>
                        {editLoading ? '…' : 'Save'}
                      </button>
                      <button className="btn-cancel" onClick={() => setEditingId(null)}>
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  /* ── Normal mode ── */
                  <>
                    <input type="checkbox" className="row-check"
                      checked={selectedIds.has(guest.id)}
                      onChange={() => toggleSelect(guest.id)} />

                    <div className="guest-row-info">
                      <span className="guest-name">{guest.name}</span>
                      <span className="seat-count">
                        ({guest.allowed_guests} {guest.allowed_guests === 1 ? 'guest' : 'guests'})
                      </span>
                      {guest.checked_in ? (
                        <>
                          <span className="badge checked">✓ Checked In</span>
                          {guest.checked_in_at && (
                            <span className="checkin-time">{fmtTime(guest.checked_in_at)}</span>
                          )}
                          <button className="btn-undo"
                            onClick={() => handleUndoCheckin(guest.id)}
                            disabled={resettingId === guest.id}
                            title="Undo check-in">
                            {resettingId === guest.id ? '…' : 'Undo'}
                          </button>
                        </>
                      ) : (
                        <span className="badge waiting">Waiting</span>
                      )}
                      <button
                        className={`badge-lang ${guest.language === 'en' ? 'lang-en' : 'lang-ar'}`}
                        onClick={() => handleToggleLanguage(guest.id, guest.language || 'ar')}
                        disabled={togglingId === guest.id}
                        title="Click to switch QR card language">
                        {togglingId === guest.id ? '…' : guest.language === 'en' ? 'EN' : 'AR'}
                      </button>
                    </div>

                    <div className="guest-row-actions">
                      <button className="btn-copy"
                        onClick={() => handleCopyLink(guest.token)}
                        title="Copy invite link">
                        {copiedToken === guest.token ? '✓' : 'Link'}
                      </button>
                      <button className="btn-qr"
                        onClick={() => handleDownloadQR(guest.token, guest.name)}
                        disabled={downloadingToken === guest.token}>
                        {downloadingToken === guest.token ? '…' : 'QR'}
                      </button>
                      <button className="btn-edit"
                        onClick={() => startEdit(guest)}>
                        Edit
                      </button>
                      <button className="btn-delete"
                        onClick={() => handleDelete(guest.id, guest.name)}
                        disabled={deletingId === guest.id}>
                        {deletingId === guest.id ? '…' : 'Del'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
