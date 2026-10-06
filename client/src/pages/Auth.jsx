import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { errMsg } from '../api';
import { ErrorBox } from '../components/ui';

function Shell({ title, children, footer }) {
  const nav = useNavigate();
  const [pid, setPid] = useState('');
  return (
    <div className="min-h-screen grid md:grid-cols-2">
      <div className="bg-brand text-white p-8 md:p-12 flex flex-col justify-center">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight">MohallaFix</h1>
        <p className="mt-3 text-lg text-white/85 max-w-sm">Spot a broken streetlight, a pothole or a garbage pile? Report it in a minute and follow it until it is fixed.</p>
        <form className="mt-8 max-w-sm" onSubmit={(e) => { e.preventDefault(); pid && nav(`/track/${pid.replace('#', '')}`); }}>
          <label className="text-sm text-white/80" htmlFor="tid">Already reported? Track by complaint ID</label>
          <div className="flex gap-2 mt-1">
            <input id="tid" value={pid} onChange={(e) => setPid(e.target.value)} placeholder="MH10293" className="flex-1 rounded-md px-3 min-h-[44px] text-ink" />
            <button className="btn bg-white text-brand font-semibold">Track</button>
          </div>
        </form>
      </div>
      <div className="p-6 md:p-12 flex flex-col justify-center max-w-md w-full mx-auto">
        <h2 className="text-2xl font-bold mb-5">{title}</h2>
        {children}
        <p className="mt-5 text-sm text-slate-600">{footer}</p>
      </div>
    </div>
  );
}

export function Login() {
  const { login } = useAuth();
  const [f, setF] = useState({ email: '', password: '' });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { await login(f.email, f.password); } catch (x) { setErr(errMsg(x)); setBusy(false); }
  };
  return (
    <Shell title="Sign in" footer={<>New here? <Link className="text-brand underline" to="/register">Create an account</Link></>}>
      <form onSubmit={submit} className="space-y-4">
        <ErrorBox msg={err} />
        <div><label className="label" htmlFor="e">Email</label><input id="e" type="email" required autoComplete="email" className="input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
        <div><label className="label" htmlFor="p">Password</label><input id="p" type="password" required autoComplete="current-password" className="input" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></div>
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
      <p className="mt-4 text-xs text-slate-500">Demo: citizen1@demo.in, worker1@demo.in or admin@demo.in · password Demo@1234</p>
    </Shell>
  );
}

export function Register() {
  const { register } = useAuth();
  const [f, setF] = useState({ name: '', email: '', phone: '', password: '' });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { await register(f); } catch (x) { setErr(errMsg(x)); setBusy(false); }
  };
  return (
    <Shell title="Create your account" footer={<>Have an account? <Link className="text-brand underline" to="/login">Sign in</Link></>}>
      <form onSubmit={submit} className="space-y-4">
        <ErrorBox msg={err} />
        <div><label className="label" htmlFor="n">Full name</label><input id="n" required minLength={2} className="input" value={f.name} onChange={set('name')} /></div>
        <div><label className="label" htmlFor="e">Email</label><input id="e" type="email" required className="input" value={f.email} onChange={set('email')} /></div>
        <div><label className="label" htmlFor="ph">Phone <span className="font-normal text-slate-500">(optional)</span></label><input id="ph" type="tel" className="input" value={f.phone} onChange={set('phone')} /></div>
        <div><label className="label" htmlFor="p">Password</label><input id="p" type="password" required minLength={8} autoComplete="new-password" className="input" value={f.password} onChange={set('password')} /><p className="text-xs text-slate-500 mt-1">At least 8 characters</p></div>
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
      </form>
    </Shell>
  );
}
