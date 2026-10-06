import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errMsg } from '../api';
import { ErrorBox, PhotoCapture } from '../components/ui';
import { LocationPicker } from '../components/Maps';

const Step = ({ n, title, children }) => (
  <section className="card space-y-3">
    <h2 className="font-semibold text-lg"><span className="text-brand">{n}.</span> {title}</h2>
    {children}
  </section>
);

export default function Report() {
  const [cats, setCats] = useState([]);
  const [photo, setPhoto] = useState(null);
  const [loc, setLoc] = useState(null); // {lat,lng,source,accuracy}
  const [cat, setCat] = useState(null);
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);
  const [gpsMsg, setGpsMsg] = useState('');
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);

  useEffect(() => { api.get('/meta/categories').then((r) => setCats(r.data)); }, []);

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

  const ready = photo && loc && cat && !busy;
  const submit = async () => {
    setBusy(true); setErr('');
    const fd = new FormData();
    fd.append('photo', photo); fd.append('category_id', cat);
    fd.append('lat', loc.lat); fd.append('lng', loc.lng); fd.append('location_source', loc.source);
    if (desc.trim()) fd.append('description', desc.trim());
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
        {done.nearby_duplicates?.length > 0 && <p className="text-sm text-amber-700 mb-2">Similar problems were already reported close by. Yours helps us prioritise it.</p>}
        <p className="text-sm text-slate-600">Expected fix by {new Date(done.sla_due_at).toLocaleDateString([], { day: 'numeric', month: 'short' })}. We will ask you to confirm once it is done.</p>
        <div className="flex gap-2 justify-center mt-5">
          <Link to={`/c/${done.id}`} className="btn-primary">Track this complaint</Link>
          <button className="btn-ghost" onClick={() => { setDone(null); setPhoto(null); setLoc(null); setCat(null); setDesc(''); }}>Report another</button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <div><h1 className="text-2xl font-bold">Report a problem</h1><p className="text-slate-600">Takes about a minute. A photo and location help the team find and fix it faster.</p></div>
      <Step n={1} title="Add a photo"><PhotoCapture onChange={setPhoto} /></Step>
      <Step n={2} title="Where is it?">
        <button className="btn-ghost w-full" onClick={locate}>📍 Use my current location</button>
        {gpsMsg && <p className="text-sm text-slate-600" role="status">{gpsMsg}</p>}
        <LocationPicker value={loc} onPick={(lat, lng) => setLoc({ lat, lng, source: 'manual' })} />
        <p className="text-xs text-slate-500">{loc ? `Pin set (${loc.source === 'gps' ? 'GPS' : 'placed on map'})` : 'Tap the map to drop a pin.'}</p>
      </Step>
      <Step n={3} title="What kind of problem?">
        <div className="grid grid-cols-2 gap-2">
          {cats.map((c) => (
            <button key={c.id} onClick={() => setCat(c.id)} aria-pressed={cat === c.id}
              className={`min-h-[56px] rounded-md border p-3 text-left text-sm font-medium ${cat === c.id ? 'border-brand bg-brand-light ring-2 ring-brand' : 'bg-white border-slate-300'}`}>
              <span className="text-xl mr-1">{c.icon}</span> {c.label}
            </button>
          ))}
        </div>
      </Step>
      <Step n={4} title="Anything else? (optional)">
        <textarea className="input" rows={3} maxLength={500} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="For example: deep pothole near the park gate, dangerous at night" />
      </Step>
      <ErrorBox msg={err} />
      <button className="btn-primary w-full text-lg" disabled={!ready} onClick={submit}>{busy ? 'Submitting…' : 'Submit complaint'}</button>
      {!ready && !busy && <p className="text-sm text-center text-slate-500">Still needed: {[!photo && 'photo', !loc && 'location', !cat && 'problem type'].filter(Boolean).join(', ')}</p>}
    </div>
  );
}
