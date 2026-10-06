import { useRef, useState } from 'react';

export const STATUS_LABEL = {
  submitted: 'Submitted', assigned: 'Assigned', worker_notified: 'Worker notified',
  in_progress: 'In progress', resolved: 'Resolved', verified: 'Verified', reopened: 'Reopened',
};
export const FLOW = ['submitted', 'assigned', 'worker_notified', 'in_progress', 'resolved', 'verified'];

export const groupOf = (s) => (s === 'in_progress' ? 'progress' : s === 'resolved' || s === 'verified' ? 'done' : 'pending');
export const COLOR = { pending: '#c62828', progress: '#c98400', done: '#2e7d32' };
export const statusColor = (s) => COLOR[groupOf(s)];

export const fmtDate = (d) => new Date(d).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
export function ago(d) {
  const h = (Date.now() - new Date(d)) / 36e5;
  if (h < 1) return 'just now';
  if (h < 48) return `${Math.round(h)}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export const Badge = ({ status }) => (
  <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold text-white" style={{ background: statusColor(status) }}>
    {STATUS_LABEL[status]}
  </span>
);

export const Spinner = () => <div className="p-10 text-center text-slate-500" role="status">Loading…</div>;
export const ErrorBox = ({ msg }) => (msg ? <div role="alert" className="rounded-md bg-red-50 border border-red-200 text-red-800 text-sm p-3">{msg}</div> : null);
export const Empty = ({ children }) => <div className="card text-center text-slate-500 py-10">{children}</div>;

/** Six-step lifecycle bar + event history. */
export function Timeline({ status, events }) {
  const idx = status === 'reopened' ? 0 : FLOW.indexOf(status);
  return (
    <div>
      <ol className="flex items-center mb-4" aria-label="Progress">
        {FLOW.map((s, i) => (
          <li key={s} className="flex-1 flex flex-col items-center text-center relative">
            {i > 0 && <span className={`absolute top-3 right-1/2 w-full h-0.5 ${i <= idx ? 'bg-done' : 'bg-slate-200'}`} />}
            <span className={`relative z-10 w-6 h-6 rounded-full grid place-items-center text-xs text-white ${i <= idx ? 'bg-done' : 'bg-slate-300'}`}>{i <= idx ? '✓' : ''}</span>
            <span className={`mt-1 text-[11px] leading-tight ${i <= idx ? 'font-semibold' : 'text-slate-400'}`}>{STATUS_LABEL[s]}</span>
          </li>
        ))}
      </ol>
      <ul className="space-y-3 border-l-2 border-slate-200 ml-2 pl-4">
        {[...events].reverse().map((e) => (
          <li key={e.id} className="text-sm">
            <div className="font-medium">{STATUS_LABEL[e.to_status]} <span className="font-normal text-slate-500">· {fmtDate(e.created_at)}</span></div>
            {e.note && <div className="text-slate-600">{e.note}</div>}
            {e.actor_name && <div className="text-xs text-slate-400">by {e.actor_name}</div>}
          </li>
        ))}
      </ul>
    </div>
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

/** Camera/gallery picker with preview. onChange(File|null) */
export function PhotoCapture({ onChange, label = 'Take or upload a photo' }) {
  const [url, setUrl] = useState(null);
  const ref = useRef();
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
      <input ref={ref} type="file" accept="image/*" capture="environment" className="sr-only" onChange={pick} />
    </label>
  );
}
