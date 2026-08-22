import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api, Project } from '../api';

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', wordpressUrl: '', defaultModel: 'gpt-4o' });
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadProjects(); }, []);

  async function loadProjects() {
    try {
      const data = await api.getProjects();
      setProjects(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await api.createProject(form);
    setShowForm(false);
    setForm({ name: '', description: '', wordpressUrl: '', defaultModel: 'gpt-4o' });
    loadProjects();
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this project?')) return;
    await api.deleteProject(id);
    loadProjects();
  }

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div>
      <div className="page-header">
        <h2>Projects</h2>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : 'New Project'}
        </button>
      </div>

      {showForm && (
        <form className="card form-card" onSubmit={handleCreate}>
          <div className="form-group">
            <label>Project Name</label>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="form-group">
            <label>WordPress URL</label>
            <input value={form.wordpressUrl} onChange={e => setForm({ ...form, wordpressUrl: e.target.value })} placeholder="https://example.com" />
          </div>
          <div className="form-group">
            <label>Default AI Model</label>
            <select value={form.defaultModel} onChange={e => setForm({ ...form, defaultModel: e.target.value })}>
              <option value="gpt-4o">GPT-4o</option>
              <option value="gpt-4o-mini">GPT-4o Mini</option>
              <option value="gpt-4-turbo">GPT-4 Turbo</option>
            </select>
          </div>
          <button type="submit" className="btn btn-primary">Create Project</button>
        </form>
      )}

      <div className="grid">
        {projects.map(p => (
          <div key={p.id} className="card project-card">
            <h3>{p.name}</h3>
            {p.description && <p className="text-muted">{p.description}</p>}
            <div className="card-meta">
              <span>Model: {p.defaultModel}</span>
              <span>{p.hasOpenaiKey ? 'API Key: Set' : 'API Key: Not set'}</span>
            </div>
            <div className="card-actions">
              <Link to={`/projects/${p.id}`} className="btn btn-sm">Configure</Link>
              <Link to={`/projects/${p.id}/prompts`} className="btn btn-sm">Prompts</Link>
              <Link to={`/projects/${p.id}/mappings`} className="btn btn-sm">Mappings</Link>
              <button className="btn btn-sm btn-danger" onClick={() => handleDelete(p.id)}>Delete</button>
            </div>
            <div className="project-id">ID: <code>{p.id}</code></div>
          </div>
        ))}
      </div>

      {projects.length === 0 && !showForm && (
        <div className="empty-state">
          <p>No projects yet. Create your first project to get started.</p>
        </div>
      )}
    </div>
  );
}
