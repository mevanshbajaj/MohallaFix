import axios from 'axios';

export const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api/v1', timeout: 30000 });

api.interceptors.request.use((cfg) => {
  const t = localStorage.getItem('mf_token');
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

// Expired session: clear it and go to sign-in
api.interceptors.response.use(
  (r) => r,
  (err) => {
    const url = err.config?.url || '';
    if (err.response?.status === 401 && !url.includes('/auth/')) {
      localStorage.removeItem('mf_token');
      if (!location.pathname.startsWith('/login')) location.href = '/login';
    }
    return Promise.reject(err);
  }
);

/** Human-readable message from any API/network error */
export const errMsg = (e) =>
  e.response?.data?.error?.message ||
  (e.code === 'ERR_NETWORK' ? 'No connection. Check your internet and try again.' : e.message || 'Something went wrong');
