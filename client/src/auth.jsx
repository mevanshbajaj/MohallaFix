import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!!localStorage.getItem('mf_token'));

  useEffect(() => {
    if (!localStorage.getItem('mf_token')) return;
    api.get('/auth/me').then((r) => setUser(r.data.user)).catch(() => localStorage.removeItem('mf_token')).finally(() => setLoading(false));
  }, []);

  const finish = ({ data }) => { localStorage.setItem('mf_token', data.token); setUser(data.user); return data.user; };
  const login = (email, password) => api.post('/auth/login', { email, password }).then(finish);
  const register = (body) => api.post('/auth/register', body).then(finish);
  const logout = () => { localStorage.removeItem('mf_token'); setUser(null); };

  return <Ctx.Provider value={{ user, loading, login, register, logout }}>{children}</Ctx.Provider>;
}
