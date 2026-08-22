import { Routes, Route, NavLink } from 'react-router-dom';
import ProjectsPage from './pages/ProjectsPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import PromptsPage from './pages/PromptsPage';
import MappingsPage from './pages/MappingsPage';

export default function App() {
  return (
    <div className="app">
      <nav className="sidebar">
        <div className="sidebar-header">
          <h1>AI Content</h1>
          <span className="subtitle">Automation Platform</span>
        </div>
        <ul>
          <li><NavLink to="/" end>Projects</NavLink></li>
        </ul>
      </nav>
      <main className="content">
        <Routes>
          <Route path="/" element={<ProjectsPage />} />
          <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
          <Route path="/projects/:projectId/prompts" element={<PromptsPage />} />
          <Route path="/projects/:projectId/mappings" element={<MappingsPage />} />
        </Routes>
      </main>
    </div>
  );
}
