import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errMsg } from '../api';
import { ErrorBox, PhotoPicker, PriorityBadge } from '../components/ui';
import { LocationPicker } from '../components/Maps';

const Step = ({ n, title, children }) => (
  <section className="card space-y-3">
    <h2 className="font-semibold text-lg"><span className="text-brand">{n}.</span> {title}</h2>
    {children}
  </section>
);
const HINTS = [['low', 'Low', 'Minor, can wait'], ['medium', 'Medium', 'Needs fixing soon'], ['high', 'High', 'Dangerous or affects many']];

export default function Report() {
  const [cats, setCats] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [loc, setLoc] = useState(null); // {lat,lng,source,accuracy}
  const [cat, setCat] = useState(null); const [sub, setSub] = useState(null);
  const [hint, setHint] = useState('medium');
  const [desc, setDesc] = useState(''); const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const [gpsMsg, setGpsMsg] = useState('');
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);

  useEffect(() => { api.get('/meta/categories').then((r) => setCats(r.data)); }, []);
  const chosen = cats.find((c) => c.id === cat);

  const locate = () => {
    setGpsMsg('Finding your location…');
    if (!navigator.geolocation) return setGpsMsg('GPS is not available on this device. Tap the map to place the pin.');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLoc({ lat: p.coords.latitude, lng: p.coords.longitude, source: 'gps', accuracy: p.coords.accuracy });
        setGpsMsg(p.coords.accuracy > 100 ? `Location is rough (±${Math.round(p.coords.accuracy)} m). Tap the map to move the pin to the exact spot.` : 'Location found. Tap the map to adjust if needed.');
      },
      (e) => setGpsMsg(e.code === 1 ? 'Location permission is off. Tap the map to place the pin instead.' : 'Could not get your location. Tap the map to place the pin.'),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const ready = photos.length > 0 && loc && cat && !busy;
  const submit = async () => {
    setBusy(true); setErr('');
    const fd = new FormData();
    photos.forEach((p) => fd.append('photos', p));
    fd.append('category_id', sub || cat); fd.append('priority_hint', hint);
    fd.append('lat', loc.lat); fd.append('lng', loc.lng); fd.append('location_source', loc.source);
    if (desc.trim()) fd.append('description', desc.trim());
    if (address.trim()) fd.append('address', address.trim());
    try { setDone((await api.post('/complaints', fd)).data); }
    catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };

  if (done) {
    return (
      <div className="card text-center max-w-md mx-auto py-8">
        <div className="text-5xl" aria-hidden>✅</div>
        <h1 className="text-2xl font-bold mt-3">Complaint submitted</h1>
        <p className="text-slate-600 mt-1">Your complaint ID</p>
        <div className="text-4xl font-bold text-brand my-2 font-display">#{done.public_id}</div>
        <div className="flex justify-center mb-2"><PriorityBadge priority={done.priority} /></div>
        {done.nearby_duplicates?.length > 0 && <p className="text-sm text-amber-700 mb-2">Similar problems were already reported close by. Yours helps us prioritise it.</p>}
        <p className="text-sm text-slate-600">Expected fix by {new Date(done.sla_due_at).toLocaleDateString([], { day: 'numeric', month: 'short' })}. Our team reviews every report and confirms its priority. We will ask you to confirm once it is done.</p>
        <div className="flex gap-2 justify-center mt-5">
          <Link to={`/c/${done.id}`} className="btn-primary">Track this complaint</Link>
          <button className="btn-ghost" onClick={() => { setDone(null); setPhotos([]); setLoc(null); setCat(null); setSub(null); setDesc(''); setAddress(''); }}>Report another</button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <div><h1 className="text-2xl font-bold">Report a problem</h1><p className="text-slate-600">Takes about a minute. A photo and location help the team find and fix it faster.</p></div>
      <Step n={1} title="Add photos"><PhotoPicker files={photos} onChange={setPhotos} /></Step>
      <Step n={2} title="Where is it?">
        <button className="btn-ghost w-full" onClick={locate}>📍 Use my current location</button>
        {gpsMsg && <p className="text-sm text-slate-600" role="status">{gpsMsg}</p>}
        <LocationPicker value={loc} onPick={(lat, lng) => setLoc({ lat, lng, source: 'manual' })} />
        <p className="text-xs text-slate-500">{loc ? `Pin set (${loc.source === 'gps' ? 'GPS' : 'placed on map'})` : 'Tap the map to drop a pin.'}</p>
        <div><label className="label" htmlFor="addr">Landmark or address <span className="font-normal text-slate-500">(optional)</span></label>
          <input id="addr" className="input" maxLength={200} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="e.g. Opposite the vegetable market, Model Town" /></div>
      </Step>
      <Step n={3} title="What kind of problem?">
        <div className="grid grid-cols-2 gap-2">
          {cats.map((c) => (
            <button key={c.id} onClick={() => { setCat(c.id); setSub(null); }} aria-pressed={cat === c.id}
              className={`min-h-[56px] rounded-md border p-3 text-left text-sm font-medium ${cat === c.id ? 'border-brand bg-brand-light ring-2 ring-brand' : 'bg-white border-slate-300'}`}>
              <span className="text-xl mr-1">{c.icon}</span> {c.label}
            </button>
          ))}
        </div>
        {chosen?.children.length > 0 && (
          <div><p className="label">More specific <span className="font-normal text-slate-500">(optional)</span></p>
            <div className="flex flex-wrap gap-2">{chosen.children.map((s) => (
              <button key={s.id} onClick={() => setSub(sub === s.id ? null : s.id)} aria-pressed={sub === s.id}
                className={`rounded-full border px-3 min-h-[40px] text-sm ${sub === s.id ? 'border-brand bg-brand-light font-semibold' : 'bg-white border-slate-300'}`}>{s.icon} {s.label}</button>))}</div></div>
        )}
      </Step>
      <Step n={4} title="How serious is it?">
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Seriousness">
          {HINTS.map(([v, l, d]) => (
            <button key={v} role="radio" aria-checked={hint === v} onClick={() => setHint(v)}
              className={`rounded-md border p-2 text-center min-h-[64px] ${hint === v ? 'border-brand bg-brand-light ring-2 ring-brand' : 'bg-white border-slate-300'}`}>
              <div className="font-semibold text-sm">{l}</div><div className="text-[11px] text-slate-500 leading-tight">{d}</div>
            </button>))}
        </div>
        <p className="text-xs text-slate-500">This is your view. Our team checks it and sets the final priority. In an emergency, also contact your local emergency services.</p>
      </Step>
      <Step n={5} title="Anything else? (optional)">
        <textarea className="input" rows={3} maxLength={500} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="For example: deep pothole near the park gate, dangerous at night" />
      </Step>
      <ErrorBox msg={err} />
      <button className="btn-primary w-full text-lg" disabled={!ready} onClick={submit}>{busy ? 'Uploading and submitting…' : 'Submit complaint'}</button>
      {!ready && !busy && <p className="text-sm text-center text-slate-500">Still needed: {[!photos.length && 'photo', !loc && 'location', !cat && 'problem type'].filter(Boolean).join(', ')}</p>}
    </div>
  );
}
