import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, errMsg } from '../api';
import { ErrorBox, Empty, Spinner } from '../components/ui';
import { MapView, Legend } from '../components/Maps';
import { ComplaintRow } from './Citizen';

const Stat = ({ label, value, color }) => (
  <div className="card"><div className="text-sm text-slate-500">{label}</div><div className="text-3xl font-bold font-display" style={{ color }}>{value ?? '–'}</div></div>
);
const Bars = ({ rows, label, value, max }) => {
  const m = max ?? Math.max(1, ...rows.map((r) => r[value]));
  return <div className="space-y-2">{rows.map((r) => (
    <div key={r[label]} className="flex items-center gap-3 text-sm">
      <div className="w-36 shrink-0 truncate">{r.icon} {r[label]}</div>
      <div className="flex-1 h-3 bg-slate-100 rounded"><div className="h-3 rounded bg-brand" style={{ width: `${(r[value] / m) * 100}%` }} /></div>
      <div className="w-8 text-right tabular-nums">{r[value]}</div>
    </div>))}</div>;
};

export function Dashboard() {
  const [s, setS] = useState(null); const [pts, setPts] = useState([]); const [cats, setCats] = useState([]); const [late, setLate] = useState([]);
  useEffect(() => {
    api.get('/admin/stats').then((r) => setS(r.data));
    api.get('/admin/map').then((r) => setPts(r.data));
    api.get('/admin/analytics/summary').then((r) => setCats(r.data.by_category));
    api.get('/admin/complaints', { params: { overdue: 'true' } }).then((r) => setLate(r.data.slice(0, 5)));
  }, []);
  if (!s) return <Spinner />;
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Overview</h1>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="Total complaints" value={s.total} /><Stat label="Pending" value={s.pending} color="#c62828" />
        <Stat label="In progress" value={s.in_progress} color="#c98400" /><Stat label="Resolved" value={s.resolved} color="#2e7d32" /><Stat label="Critical (open)" value={s.critical} color="#b00020" />
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="card space-y-2"><h2 className="font-semibold text-lg">Complaint map</h2>
          <MapView points={pts} height={340} renderPopup={(p) => <Link className="text-brand underline" to={`/c/${p.id}`}>{p.category_icon} {p.category_label} · #{p.public_id}</Link>} /><Legend /></div>
        <div className="card"><h2 className="font-semibold text-lg mb-3">By category</h2><Bars rows={cats} label="label" value="total" /></div>
      </div>
      <div className="space-y-2">
        <h2 className="font-semibold text-lg">Overdue ({s.sla_open_breached})</h2>
        {late.length === 0 ? <Empty>Nothing is past its target date.</Empty> : late.map((c) => <ComplaintRow key={c.id} c={c} />)}
        {s.sla_open_breached > 5 && <Link to="/admin/complaints?overdue=true" className="text-brand underline text-sm">See all overdue</Link>}
      </div>
    </div>
  );
}

export function Complaints() {
  const [sp] = useSearchParams();
  const [f, setF] = useState({ status: '', priority: '', category: '', overdue: sp.get('overdue') === 'true', q: '' });
  const [cats, setCats] = useState([]); const [rows, setRows] = useState(null); const [err, setErr] = useState('');
  useEffect(() => { api.get('/meta/categories').then((r) => setCats(r.data)); }, []);
  useEffect(() => {
    const t = setTimeout(() => {
      const params = {}; if (f.status) params.status = f.status; if (f.category) params.category = f.category; if (f.priority) params.priority = f.priority; if (f.overdue) params.overdue = 'true'; if (f.q) params.q = f.q;
      setRows(null); api.get('/admin/complaints', { params }).then((r) => setRows(r.data)).catch((e) => setErr(errMsg(e)));
    }, 250);
    return () => clearTimeout(t);
  }, [f]);
  const exportCsv = async () => {
    const r = await api.get('/admin/export.csv', { responseType: 'blob' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(r.data); a.download = 'mohallafix-complaints.csv'; a.click();
  };
  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center"><h1 className="text-2xl font-bold">Complaints</h1><button className="btn-ghost" onClick={exportCsv}>Export CSV</button></div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <input className="input col-span-2 md:col-span-1" placeholder="Search ID or text" aria-label="Search" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
        <select className="input" aria-label="Status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="">All statuses</option><option value="pending">Pending</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option><option value="rejected">Rejected</option></select>
        <select className="input" aria-label="Priority" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}><option value="">All priorities</option><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select>
        <select className="input" aria-label="Category" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}><option value="">All categories</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
        <label className="flex items-center gap-2 text-sm min-h-[44px]"><input type="checkbox" checked={f.overdue} onChange={(e) => setF({ ...f, overdue: e.target.checked })} /> Overdue only</label>
      </div>
      <ErrorBox msg={err} />
      {!rows ? <Spinner /> : rows.length === 0 ? <Empty>No complaints match these filters.</Empty> : <div className="space-y-2">{rows.map((c) => <ComplaintRow key={c.id} c={c} />)}</div>}
    </div>
  );
}

export function Analytics() {
  const [a, setA] = useState(null); const [w, setW] = useState([]);
  useEffect(() => { api.get('/admin/analytics/summary').then((r) => setA(r.data)); api.get('/admin/analytics/workers').then((r) => setW(r.data)); }, []);
  if (!a) return <Spinner />;
  const rate = a.sla.total ? Math.round((a.sla.breached / a.sla.total) * 100) : 0;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Analytics</h1>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Average time to resolve" value={a.avg_resolution_hours != null ? `${a.avg_resolution_hours} h` : '–'} />
        <Stat label="Missed target date" value={`${rate}%`} color={rate > 25 ? '#c62828' : undefined} />
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="card"><h2 className="font-semibold text-lg mb-3">Complaints by colony</h2><Bars rows={a.by_area} label="name" value="total" /></div>
        <div className="card"><h2 className="font-semibold text-lg mb-3">Time to resolve by category (hours)</h2><Bars rows={a.by_category.filter((c) => c.avg_hours)} label="label" value="avg_hours" /></div>
      </div>
      <div className="card"><h2 className="font-semibold text-lg mb-1">Repeat problem spots</h2><p className="text-sm text-slate-500 mb-3">Same problem reported 3+ times within about 100 m in the last 90 days.</p>
        {a.repeat_locations.length === 0 ? <p className="text-slate-500">No repeat spots found.</p> : (
          <ul className="divide-y">{a.repeat_locations.map((r, i) => <li key={i} className="py-2 flex justify-between text-sm"><span>{r.icon} {r.label} · {r.area_name}</span><span className="font-semibold">{r.n} reports</span></li>)}</ul>)}
      </div>
      <div className="card overflow-x-auto"><h2 className="font-semibold text-lg mb-3">Worker performance</h2>
        <table className="w-full text-sm min-w-[480px]"><thead><tr className="text-left text-slate-500"><th className="py-1">Worker</th><th>Assigned</th><th>Resolved</th><th>Open</th><th>Avg hours</th><th>Missed target</th></tr></thead>
          <tbody>{w.map((x) => <tr key={x.id} className="border-t"><td className="py-2">{x.name}<div className="text-xs text-slate-500">{x.department}</div></td><td>{x.assigned}</td><td>{x.resolved}</td><td>{x.open}</td><td>{x.avg_hours ?? '–'}</td><td className={x.sla_breached ? 'text-pending font-semibold' : ''}>{x.sla_breached}</td></tr>)}</tbody></table>
      </div>
    </div>
  );
}

export function Workers() {
  const [rows, setRows] = useState(null); const [depts, setDepts] = useState([]);
  const [f, setF] = useState({ name: '', email: '', password: '', department_id: '' }); const [err, setErr] = useState('');
  const load = () => api.get('/admin/workers').then((r) => setRows(r.data));
  useEffect(() => { load(); api.get('/admin/departments').then((r) => setDepts(r.data)); }, []);
  const add = async (e) => { e.preventDefault(); setErr(''); try { await api.post('/admin/workers', f); setF({ name: '', email: '', password: '', department_id: '' }); load(); } catch (x) { setErr(errMsg(x)); } };
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="space-y-4 max-w-2xl">
      <h1 className="text-2xl font-bold">Workers</h1>
      <form onSubmit={add} className="card grid sm:grid-cols-2 gap-3">
        <input className="input" placeholder="Name" required value={f.name} onChange={set('name')} aria-label="Name" />
        <input className="input" type="email" placeholder="Email" required value={f.email} onChange={set('email')} aria-label="Email" />
        <input className="input" type="password" placeholder="Temporary password (8+ characters)" required minLength={8} value={f.password} onChange={set('password')} aria-label="Password" />
        <select className="input" required value={f.department_id} onChange={set('department_id')} aria-label="Department"><option value="">Department…</option>{depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
        <div className="sm:col-span-2"><ErrorBox msg={err} /><button className="btn-primary mt-2">Add worker</button></div>
      </form>
      {!rows ? <Spinner /> : <div className="space-y-2">{rows.map((w) => <div key={w.id} className="card flex justify-between"><div><div className="font-semibold">{w.name}</div><div className="text-sm text-slate-500">{w.department} · {w.email}</div></div><div className="text-sm text-right"><b>{w.open_tasks}</b> open</div></div>)}</div>}
    </div>
  );
}
