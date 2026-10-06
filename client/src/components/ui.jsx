import { useEffect, useMemo, useRef, useState } from 'react';

export const STATUS_LABEL = {
  submitted: 'Submitted', under_review: 'Under review', assigned: 'Assigned', worker_notified: 'Worker notified',
  in_progress: 'In progress', resolved: 'Resolved', verified: 'Verified by citizen', rejected: 'Rejected', reopened: 'Reopened',
};
const ICON = { submitted: '📝', under_review: '🔍', assigned: '👷', worker_notified: '🔔', in_progress: '🚧', resolved: '✅', verified: '🎉', rejected: '⛔', reopened: '🔁' };
// Steps shown as "coming next" on the timeline (worker_notified is part of "assigned")
const PATH = ['submitted', 'under_review', 'assigned', 'in_progress', 'resolved', 'verified'];

export const groupOf = (s) => (s === 'in_progress' ? 'progress' : s === 'resolved' || s === 'verified' ? 'done' : s === 'rejected' ? 'closed' : 'pending');
export const COLOR = { pending: '#c62828', progress: '#c98400', done: '#2e7d32', closed: '#64748b' };
export const statusColor = (s) => COLOR[groupOf(s)];

export const fmtDate = (d) => new Date(d).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
export function ago(d) {
  const h = (Date.now() - new Date(d)) / 36e5;
  if (h < 1) return 'just now';
  if (h < 48) return `${Math.round(h)}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export const Badge = ({ status }) => (
  <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold text-white whitespace-nowrap" style={{ background: statusColor(status) }}>
    {STATUS_LABEL[status]}
  </span>
);

export const PRIORITY = {
  low: { label: 'Low', color: '#4b6b7c', mark: '▽' },
  medium: { label: 'Medium', color: '#8a6100', mark: '◇' },
  high: { label: 'High', color: '#c2410c', mark: '△' },
  critical: { label: 'Critical', color: '#b00020', mark: '▲' },
};
/** Always shows the word (not just a colour) so it is readable without colour vision. */
export const PriorityBadge = ({ priority }) => {
  const p = PRIORITY[priority] || PRIORITY.medium;
  const solid = priority === 'critical';
  return (
    <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap"
      style={solid ? { background: p.color, borderColor: p.color, color: '#fff' } : { borderColor: p.color, color: p.color }}>
      <span aria-hidden>{p.mark}</span>{p.label}
    </span>
  );
};

export const Spinner = () => <div className="p-10 text-center text-slate-500" role="status">Loading…</div>;
export const ErrorBox = ({ msg }) => (msg ? <div role="alert" className="rounded-md bg-red-50 border border-red-200 text-red-800 text-sm p-3">{msg}</div> : null);
export const Empty = ({ children }) => <div className="card text-center text-slate-500 py-10">{children}</div>;

/** Vertical status history: what has happened (oldest first) followed by the steps still to come. */
export function Timeline({ status, events }) {
  const closed = status === 'verified' || status === 'rejected';
  const cur = status === 'worker_notified' ? 'assigned' : status === 'reopened' ? 'submitted' : status;
  const upcoming = closed ? [] : PATH.slice(PATH.indexOf(cur) + 1).filter((s) => s !== 'under_review' || cur === 'submitted');
  return (
    <ol className="relative" aria-label="Status history">
      {events.map((e, i) => {
        const note = e.from_status && e.from_status === e.to_status; // reassignment / priority change, not a new status
        const last = i === events.length - 1;
        return (
          <li key={e.id} className="flex gap-3 pb-5 last:pb-0 relative">
            {(!last || upcoming.length > 0) && <span className="absolute left-[15px] top-8 bottom-0 w-0.5 bg-slate-200" aria-hidden />}
            <span className={`relative z-10 w-8 h-8 shrink-0 rounded-full grid place-items-center text-base ${last && !upcoming.length ? 'ring-2 ring-offset-2' : ''} ${note ? 'bg-slate-100' : 'bg-brand-light'}`}
              style={last ? { '--tw-ring-color': '#0f5c78' } : undefined} aria-hidden>{note ? '📌' : ICON[e.to_status]}</span>
            <div className="text-sm pt-1 min-w-0">
              <div className="font-semibold">{note ? 'Update' : STATUS_LABEL[e.to_status]}{last && <span className="ml-2 text-xs font-medium text-brand">Latest</span>}</div>
              {e.note && <div className="text-slate-700">{e.note}</div>}
              <div className="text-xs text-slate-500">{fmtDate(e.created_at)}{e.actor_name && ` · ${e.actor_name}`}</div>
            </div>
          </li>
        );
      })}
      {upcoming.map((s, i) => (
        <li key={s} className="flex gap-3 pb-5 last:pb-0 relative opacity-50">
          {i < upcoming.length - 1 && <span className="absolute left-[15px] top-8 bottom-0 w-0.5 border-l-2 border-dashed border-slate-300" aria-hidden />}
          <span className="relative z-10 w-8 h-8 shrink-0 rounded-full grid place-items-center border-2 border-dashed border-slate-300 bg-white text-base grayscale" aria-hidden>{ICON[s]}</span>
          <div className="text-sm pt-1.5 text-slate-500">{STATUS_LABEL[s]}</div>
        </li>
      ))}
    </ol>
  );
}

/** Downscale phone photos (often 4-12 MB) to ~1600px JPEG before upload. Falls back to the original file. */
export async function compressImage(file, max = 1600) {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.82));
    return blob && blob.size < file.size ? new File([blob], 'photo.jpg', { type: 'image/jpeg' }) : file;
  } catch { return file; }
}

/** Single camera/gallery picker with preview. onChange(File|null) */
export function PhotoCapture({ onChange, label = 'Take or upload a photo' }) {
  const [url, setUrl] = useState(null);
  const pick = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const small = await compressImage(f);
    setUrl(URL.createObjectURL(small));
    onChange(small);
  };
  return (
    <label className="block cursor-pointer rounded-lg border-2 border-dashed border-slate-300 bg-white p-4 text-center hover:border-brand">
      {url ? <img src={url} alt="Selected" className="mx-auto max-h-56 rounded-md" /> : <span className="text-slate-600">📷 {label}</span>}
      {url && <span className="block mt-2 text-sm text-brand">Change photo</span>}
      <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={pick} />
    </label>
  );
}

/** Up to `max` photos with thumbnails and remove buttons. files: File[] */
export function PhotoPicker({ files, onChange, max = 4 }) {
  const ref = useRef();
  const urls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => urls.forEach(URL.revokeObjectURL), [urls]);
  const add = async (e) => {
    const picked = await Promise.all([...e.target.files].map((f) => compressImage(f)));
    onChange([...files, ...picked].slice(0, max));
    e.target.value = '';
  };
  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {urls.map((u, i) => (
          <div key={u} className="relative">
            <img src={u} alt={`Photo ${i + 1}`} className="w-full h-24 object-cover rounded-md border border-slate-200" />
            <button type="button" aria-label={`Remove photo ${i + 1}`} onClick={() => onChange(files.filter((_, j) => j !== i))}
              className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-ink text-white text-sm">×</button>
          </div>
        ))}
        {files.length < max && (
          <button type="button" onClick={() => ref.current.click()} className="h-24 rounded-md border-2 border-dashed border-slate-300 bg-white text-slate-600 text-sm hover:border-brand">
            📷 {files.length ? 'Add another' : 'Add photo'}
          </button>
        )}
      </div>
      <input ref={ref} type="file" accept="image/*" multiple capture="environment" className="sr-only" onChange={add} />
      <p className="text-xs text-slate-500 mt-1">Up to {max} photos. Clear photos help the team find and fix it faster.</p>
    </div>
  );
}
