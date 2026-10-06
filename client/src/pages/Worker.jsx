import { useEffect, useState } from 'react';
import { api } from '../api';
import { Empty, Spinner } from '../components/ui';
import { ComplaintRow } from './Citizen';

export default function Tasks() {
  const [done, setDone] = useState(false);
  const [rows, setRows] = useState(null);
  useEffect(() => { setRows(null); api.get('/worker/tasks', { params: { done } }).then((r) => setRows(r.data)); }, [done]);
  return (
    <div className="max-w-xl mx-auto space-y-3">
      <h1 className="text-2xl font-bold">My tasks</h1>
      <div className="flex gap-2" role="tablist">
        {[[false, 'To do'], [true, 'Completed']].map(([v, l]) => (
          <button key={l} role="tab" aria-selected={done === v} onClick={() => setDone(v)} className={`btn ${done === v ? 'bg-brand text-white' : 'btn-ghost'}`}>{l}</button>
        ))}
      </div>
      {!rows ? <Spinner /> : rows.length === 0 ? <Empty>{done ? 'No completed tasks yet.' : 'Nothing assigned right now.'}</Empty> : rows.map((c) => <ComplaintRow key={c.id} c={c} />)}
      {!done && rows?.length > 0 && <p className="text-xs text-slate-500">Most urgent first (earliest target date).</p>}
    </div>
  );
}
