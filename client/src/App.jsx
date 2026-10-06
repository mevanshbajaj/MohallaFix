import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import Layout from './components/Layout';
import { Spinner } from './components/ui';
import { Login, Register } from './pages/Auth';
import Report from './pages/Report';
import { MyComplaints, Nearby } from './pages/Citizen';
import Detail, { PublicTrack } from './pages/Detail';
import Tasks from './pages/Worker';
import { Dashboard, Complaints, Analytics, Workers } from './pages/Admin';

const HOME = { citizen: '/', worker: '/tasks', admin: '/admin' };

/** Only lets the listed roles through; sends others to their own home */
function Guard({ roles, children }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={HOME[user.role]} replace />;
  return children;
}

export default function App() {
  const { user } = useAuth();
  const home = user ? HOME[user.role] : '/login';
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={home} replace /> : <Login />} />
      <Route path="/register" element={user ? <Navigate to={home} replace /> : <Register />} />
      <Route path="/track/:publicId" element={<PublicTrack />} />
      <Route element={<Guard><Layout /></Guard>}>
        <Route path="/" element={<Guard roles={['citizen']}><Report /></Guard>} />
        <Route path="/mine" element={<Guard roles={['citizen']}><MyComplaints /></Guard>} />
        <Route path="/nearby" element={<Guard roles={['citizen']}><Nearby /></Guard>} />
        <Route path="/tasks" element={<Guard roles={['worker']}><Tasks /></Guard>} />
        <Route path="/admin" element={<Guard roles={['admin']}><Dashboard /></Guard>} />
        <Route path="/admin/complaints" element={<Guard roles={['admin']}><Complaints /></Guard>} />
        <Route path="/admin/analytics" element={<Guard roles={['admin']}><Analytics /></Guard>} />
        <Route path="/admin/workers" element={<Guard roles={['admin']}><Workers /></Guard>} />
        <Route path="/c/:id" element={<Detail />} />
      </Route>
      <Route path="*" element={<Navigate to={home} replace />} />
    </Routes>
  );
}
