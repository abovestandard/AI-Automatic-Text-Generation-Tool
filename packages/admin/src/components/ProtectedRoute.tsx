import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children, superAdminOnly = false }: { children: React.ReactNode; superAdminOnly?: boolean }) {
  const { user, loading, needsBootstrap } = useAuth();

  if (loading) return <div className="loading-screen">Loading...</div>;
  if (needsBootstrap) return <Navigate to="/setup" replace />;
  if (!user) return <Navigate to="/login" replace />;
  if (superAdminOnly && !user.isSuperAdmin) return <Navigate to="/" replace />;

  return <>{children}</>;
}
