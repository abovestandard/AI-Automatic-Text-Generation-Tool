import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import SetupPage from './pages/SetupPage';
import WebsitesPage from './pages/WebsitesPage';
import WebsiteDetailPage from './pages/WebsiteDetailPage';
import UsersPage from './pages/UsersPage';
import ProjectsPage from './pages/ProjectsPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import PromptsPage from './pages/PromptsPage';
import MappingsPage from './pages/MappingsPage';

function AppLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="app">
      <nav className="sidebar">
        <div className="sidebar-header">
          <h1>AI Content CRM</h1>
          <span className="subtitle">Central Administration</span>
        </div>
        <ul>
          <li><NavLink to="/" end>Websites</NavLink></li>
          <li><NavLink to="/projects">Projects</NavLink></li>
          {user?.isSuperAdmin && <li><NavLink to="/users">Users</NavLink></li>}
        </ul>
        <div className="sidebar-footer">
          <div className="user-info">
            <span className="user-name">{user?.name || user?.email}</span>
            {user?.isSuperAdmin && <span className="badge badge-sm">Super Admin</span>}
          </div>
          <button className="btn btn-sm btn-ghost" onClick={logout}>Sign Out</button>
        </div>
      </nav>
      <main className="content">
        <Routes>
          <Route path="/" element={<WebsitesPage />} />
          <Route path="/websites/:websiteId" element={<WebsiteDetailPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
          <Route path="/projects/:projectId/prompts" element={<PromptsPage />} />
          <Route path="/projects/:projectId/mappings" element={<MappingsPage />} />
          <Route path="/users" element={<ProtectedRoute superAdminOnly><UsersPage /></ProtectedRoute>} />
        </Routes>
      </main>
    </div>
  );
}

function AppRoutes() {
  const { user, loading, needsBootstrap } = useAuth();

  if (loading) return <div className="loading-screen">Loading...</div>;

  return (
    <Routes>
      <Route path="/setup" element={needsBootstrap ? <SetupPage /> : <Navigate to="/" replace />} />
      <Route path="/login" element={!user ? <LoginPage /> : <Navigate to="/" replace />} />
      <Route path="/*" element={
        <ProtectedRoute>
          <AppLayout />
        </ProtectedRoute>
      } />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
