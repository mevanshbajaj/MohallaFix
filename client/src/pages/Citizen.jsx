import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errMsg } from '../api';
import { Badge, PriorityBadge, Empty, Spinner, ago } from '../components/ui';
import { MapView, Legend, DEFAULT_CENTER } from '../components/Maps';

export function ComplaintRow({ c, to }) {
  return (
    <Link to={to || `/c/${c.id}`} className="card flex gap-3 items-center hover:border-brand">
      {c.thumb ? <img src={c.thumb} alt="" className="w-16 h-16 rounded-md object-cover" /> : <div className="w-16 h-16 rounded-md bg-slate-100 grid place-items-center text-2xl">{c.category_icon}</div>}
      <div className="flex-1 min-w-0">
        <div className="font-semibold truncate">{c.category_icon} {c.category_label}</div>
        <div className="text-sm text-slate-500">#{c.public_id} · {c.area_name || 'Unknown area'} · {ago(c.created_at)}</div>
        {c.sla_breached && !['resolved', 'verified'].includes(c.status) && <div className="text-xs font-semibold text-pending mt-0.5">Past target date</div>}
      </div>
      <div className="flex flex-col items-end gap-1"><Badge status={c.status} />{c.priority && <PriorityBadge priority={c.priority} />}</div>
    </Link>
  );
}

export function MyComplaints() {
  const [rows, setRows] = useState(null);
  useEffect(() => { api.get('/complaints/mine').then((r) => setRows(r.data)); }, []);
  if (!rows) return <Spinner />;
  const waiting = rows.filter((r) => r.status === 'resolved');
  return (
    <div className="max-w-xl mx-auto space-y-3">
      <h1 className="text-2xl font-bold">My reports</h1>
      {waiting.length > 0 && <div className="rounded-md bg-green-50 border border-green-200 p-3 text-sm text-green-900">{waiting.length} fixed {waiting.length === 1 ? 'problem needs' : 'problems need'} your confirmation. Open it and tell us if it is really fixed.</div>}
      {rows.length === 0 ? <Empty>You have not reported anything yet. <Link to="/" className="text-brand underline">Report a problem</Link></Empty> : rows.map((c) => <ComplaintRow key={c.id} c={c} />)}
    </div>
  );
}

export function Nearby() {
  const [me, setMe] = useState(null);
  const [rows, setRows] = useState(null);
  const [msg, setMsg] = useState('');
  const load = (lat, lng) => api.get('/complaints/nearby', { params: { lat, lng, radius: 2000 } }).then((r) => setRows(r.data)).catch((e) => setMsg(errMsg(e)));
  useEffect(() => {
    const fallback = () => { setMsg('Showing the default area. Allow location to see problems near you.'); load(...DEFAULT_CENTER); };
    if (!navigator.geolocation) return fallback();
    navigator.geolocation.getCurrentPosition((p) => { setMe([p.coords.latitude, p.coords.longitude]); load(p.coords.latitude, p.coords.longitude); }, fallback, { timeout: 8000 });
  }, []);
  const meToo = async (id) => {
    try { await api.post(`/complaints/${id}/upvote`); setRows((r) => r.map((x) => (x.id === id ? { ...x, upvotes: x.upvotes + 1, voted: true } : x))); } catch (e) { setMsg(errMsg(e)); }
  };
  if (!rows) return <Spinner />;
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-bold">Open problems nearby</h1>
      {msg && <p className="text-sm text-slate-600" role="status">{msg}</p>}
      <MapView points={rows} center={me || DEFAULT_CENTER} me={me} height={360}
        renderPopup={(p) => (
          <div className="text-sm"><div className="font-semibold">{p.category_icon} {p.category_label}</div><div>#{p.public_id} · {ago(p.created_at)}</div>
            <button className="mt-2 text-brand underline disabled:text-slate-400" disabled={p.voted} onClick={() => meToo(p.id)}>{p.voted ? 'Thanks, counted' : `Me too (${p.upvotes})`}</button></div>
        )} />
      <Legend />
      <p className="text-sm text-slate-600">{rows.length} open {rows.length === 1 ? 'problem' : 'problems'} within 2 km. Seeing the same one? Tap it and press “Me too” instead of reporting again.</p>
    </div>
  );
}
