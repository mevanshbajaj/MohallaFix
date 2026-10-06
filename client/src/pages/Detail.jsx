import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, errMsg } from '../api';
import { useAuth } from '../auth';
import { Badge, PriorityBadge, ErrorBox, PhotoCapture, Spinner, Timeline, STATUS_LABEL, PRIORITY, fmtDate } from '../components/ui';
import { MapView } from '../components/Maps';

const NEXT = { submitted: ['under_review', 'assigned', 'rejected'], under_review: ['assigned', 'rejected'], assigned: ['worker_notified', 'in_progress'], worker_notified: ['in_progress'], in_progress: ['resolved'], resolved: ['verified', 'reopened'], reopened: ['under_review', 'assigned', 'rejected'], rejected: ['reopened'], verified: [] };

function Photos({ media }) {
  const label = { before: 'Reported', after: 'Work done', verification: 'Citizen check' };
  if (!media.length) return null;
  return (
    <div className="grid grid-cols-2 gap-2">
      {media.map((m) => (
        <a key={m.id} href={m.url} target="_blank" rel="noreferrer" className="block">
          <img src={m.url} alt={label[m.kind]} className="w-full h-40 object-cover rounded-md border border-slate-200" />
          <span className="text-xs text-slate-500">{label[m.kind]}</span>
        </a>
      ))}
    </div>
  );
}

function Summary({ c }) {
  const open = !['resolved', 'verified', 'rejected'].includes(c.status);
  return (
    <div className="card space-y-3">
      <div className="flex justify-between gap-3 items-start">
        <div>
          <h1 className="text-2xl font-bold">{c.category_icon} {c.category_label}</h1>
          <p className="text-slate-500 text-sm">#{c.public_id} · {c.area_name || 'Unknown area'} · reported {fmtDate(c.created_at)}</p>
        </div>
        <div className="flex flex-col items-end gap-1"><Badge status={c.status} />{c.priority && <PriorityBadge priority={c.priority} />}</div>
      </div>
      {c.address_text && <p className="text-sm">📍 {c.address_text}</p>}
      {c.description && <p>{c.description}</p>}
      <p className={`text-sm ${open && c.sla_breached ? 'text-pending font-semibold' : 'text-slate-600'}`}>
        {open ? (c.sla_breached ? 'Past the target date of ' : 'Target fix date: ') : 'Target was '}{fmtDate(c.sla_due_at)}
        {c.worker_name && <> · Assigned to {c.worker_name}</>}
      </p>
      <Photos media={c.media} />
      <MapView points={[{ id: c.id, lat: c.lat, lng: c.lng, status: c.status }]} center={[c.lat, c.lng]} zoom={16} height={180} />
    </div>
  );
}

/** Citizen: confirm the fix (yes) or reopen (no) */
function VerifyBox({ c, reload }) {
  const [comment, setComment] = useState(''); const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const send = async (yes) => {
    setBusy(true); setErr('');
    const fd = new FormData(); fd.append('is_resolved', yes); if (comment) fd.append('comment', comment); if (photo) fd.append('photo', photo);
    try { await api.post(`/complaints/${c.id}/verify`, fd); reload(); } catch (e) { setErr(errMsg(e)); setBusy(false); }
  };
  return (
    <div className="card border-green-300 bg-green-50 space-y-3">
      <h2 className="font-semibold text-lg">Is the problem fixed?</h2>
      <textarea className="input" rows={2} placeholder="Add a comment (optional)" value={comment} onChange={(e) => setComment(e.target.value)} />
      <PhotoCapture onChange={setPhoto} label="Add a photo (optional)" />
      <ErrorBox msg={err} />
      <div className="grid grid-cols-2 gap-2">
        <button className="btn-primary !bg-done" disabled={busy} onClick={() => send(true)}>Yes, it is fixed</button>
        <button className="btn-danger" disabled={busy} onClick={() => send(false)}>No, reopen it</button>
      </div>
    </div>
  );
}

/** Worker: start work / mark resolved (photo required) */
function WorkerBox({ c, reload }) {
  const [note, setNote] = useState(''); const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const go = async (status) => {
    setBusy(true); setErr('');
    const fd = new FormData(); fd.append('status', status); if (note) fd.append('note', note); if (photo) fd.append('photo', photo);
    try { await api.patch(`/worker/tasks/${c.id}/status`, fd); setNote(''); setPhoto(null); reload(); } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };
  if (!['assigned', 'worker_notified', 'in_progress'].includes(c.status)) return null;
  return (
    <div className="card space-y-3">
      <h2 className="font-semibold text-lg">Update this task</h2>
      <input className="input" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      {c.status === 'in_progress' ? (
        <>
          <PhotoCapture onChange={setPhoto} label="Photo of the finished work (required)" />
          <ErrorBox msg={err} />
          <button className="btn-primary w-full" disabled={busy || !photo} onClick={() => go('resolved')}>Mark as resolved</button>
        </>
      ) : (
        <>
          <ErrorBox msg={err} />
          <button className="btn-primary w-full" disabled={busy} onClick={() => go('in_progress')}>Start work</button>
        </>
      )}
    </div>
  );
}

/** Admin: assign, change status, internal notes */
function AdminBox({ c, reload }) {
  const [workers, setWorkers] = useState([]);
  const [w, setW] = useState(c.assigned_worker_id || '');
  const [note, setNote] = useState(''); const [reason, setReason] = useState(''); const [pri, setPri] = useState(c.priority); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { api.get('/admin/workers').then((r) => setWorkers(r.data.filter((x) => x.is_active))); }, []);
  const run = async (fn) => { setBusy(true); setErr(''); try { await fn(); await reload(); } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); } };
  const canAssign = !['resolved', 'verified', 'rejected'].includes(c.status);
  const setStatus = (s) => {
    if (s === 'rejected' && !reason.trim()) return setErr('Please write the reason for rejecting this complaint first.');
    return run(() => api.patch(`/admin/complaints/${c.id}/status`, { status: s, note: reason.trim() || undefined }).then(() => setReason('')));
  };
  const moves = NEXT[c.status].filter((s) => !['assigned', 'worker_notified'].includes(s));
  return (
    <div className="card space-y-4">
      <h2 className="font-semibold text-lg">Manage</h2>
      <ErrorBox msg={err} />
      {canAssign && (
        <div className="flex gap-2">
          <select className="input" value={w} onChange={(e) => setW(e.target.value)} aria-label="Worker">
            <option value="">Choose a worker…</option>
            {workers.map((x) => <option key={x.id} value={x.id}>{x.name} · {x.department} ({x.open_tasks} open)</option>)}
          </select>
          <button className="btn-primary" disabled={!w || busy} onClick={() => run(() => api.patch(`/admin/complaints/${c.id}/assign`, { worker_id: w }))}>{c.assigned_worker_id ? 'Reassign' : 'Assign'}</button>
        </div>
      )}
      <div>
        <label className="label" htmlFor="pri">Priority {c.priority_suggested && <span className="font-normal text-slate-500">· citizen suggested {PRIORITY[c.priority_suggested].label}</span>}</label>
        <div className="flex gap-2">
          <select id="pri" className="input" value={pri} onChange={(e) => setPri(e.target.value)}>{Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
          <button className="btn-ghost" disabled={busy || pri === c.priority} onClick={() => run(() => api.patch(`/admin/complaints/${c.id}/priority`, { priority: pri }))}>Save</button>
        </div>
      </div>
      {moves.length > 0 && (
        <div className="space-y-2">
          <input className="input" placeholder="Reason / remark (required to reject)" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason or remark" />
          <div className="flex gap-2 flex-wrap">{moves.map((s) => <button key={s} className={s === 'rejected' ? 'btn-danger' : 'btn-ghost'} disabled={busy} onClick={() => setStatus(s)}>{s === 'reopened' ? 'Reopen' : s === 'rejected' ? 'Reject' : `Mark ${STATUS_LABEL[s].toLowerCase()}`}</button>)}</div>
        </div>
      )}
      <div>
        <label className="label" htmlFor="note">Internal note <span className="font-normal text-slate-500">(staff only)</span></label>
        <div className="flex gap-2">
          <input id="note" className="input" value={note} onChange={(e) => setNote(e.target.value)} />
          <button className="btn-ghost" disabled={!note.trim() || busy} onClick={() => run(async () => { await api.post(`/admin/complaints/${c.id}/notes`, { body: note }); setNote(''); })}>Add</button>
        </div>
        <ul className="mt-3 space-y-2">{c.notes?.map((n) => <li key={n.id} className="text-sm bg-amber-50 rounded-md p-2">🔒 {n.body}<div className="text-xs text-slate-500">{n.author} · {fmtDate(n.created_at)}</div></li>)}</ul>
      </div>
    </div>
  );
}

export default function Detail() {
  const { id } = useParams(); const { user } = useAuth(); const nav = useNavigate();
  const [c, setC] = useState(null); const [err, setErr] = useState('');
  const load = useCallback(() => api.get(`/complaints/${id}`).then((r) => setC(r.data)).catch((e) => setErr(errMsg(e))), [id]);
  useEffect(() => { load(); }, [load]);
  if (err) return <div className="max-w-xl mx-auto space-y-3"><ErrorBox msg={err} /><button className="btn-ghost" onClick={() => nav(-1)}>Go back</button></div>;
  if (!c) return <Spinner />;
  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <button onClick={() => nav(-1)} className="text-sm text-brand underline">← Back</button>
      <Summary c={c} />
      {user.role === 'citizen' && c.status === 'resolved' && c.citizen_id === user.id && <VerifyBox c={c} reload={load} />}
      {user.role === 'citizen' && c.verification && <div className="card text-sm">Your answer: <b>{c.verification.is_resolved ? 'Fixed' : 'Not fixed'}</b>{c.verification.comment && ` · ${c.verification.comment}`}</div>}
      {user.role === 'worker' && <WorkerBox c={c} reload={load} />}
      {user.role === 'admin' && <AdminBox c={c} reload={load} />}
      <div className="card"><h2 className="font-semibold text-lg mb-3">Progress</h2><Timeline status={c.status} events={c.events} /></div>
    </div>
  );
}

/** Public page: track by ID without signing in. No names, rounded coordinates. */
export function PublicTrack() {
  const { publicId } = useParams(); const [c, setC] = useState(null); const [err, setErr] = useState('');
  useEffect(() => { api.get(`/complaints/track/${publicId}`).then((r) => setC(r.data)).catch((e) => setErr(e.response?.status === 404 ? `No complaint found with ID ${publicId}` : errMsg(e))); }, [publicId]);
  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <Link to="/" className="font-display text-xl font-bold text-brand">MohallaFix</Link>
      {err ? <ErrorBox msg={err} /> : !c ? <Spinner /> : (<><Summary c={c} /><div className="card"><h2 className="font-semibold text-lg mb-3">Progress</h2><Timeline status={c.status} events={c.events} /></div></>)}
    </div>
  );
}
