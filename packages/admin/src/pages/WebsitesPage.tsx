import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api, Website } from '../api';
import { useAuth } from '../context/AuthContext';

export default function WebsitesPage() {
  const { user } = useAuth();
  const [websites, setWebsites] = useState<Website[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', domain: '', description: '' });
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadWebsites(); }, []);

  async function loadWebsites() {
    try {
      const data = await api.getWebsites();
      setWebsites(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await api.createWebsite(form);
    setShowForm(false);
    setForm({ name: '', domain: '', description: '' });
    loadWebsites();
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this website and all its projects?')) return;
    await api.deleteWebsite(id);
    loadWebsites();
  }

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Websites</h2>
          <p className="help-text">Manage all connected WordPress websites from this central dashboard.</p>
        </div>
        {user?.isSuperAdmin && (
          <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Cancel' : 'Add Website'}
          </button>
        )}
      </div>

      {showForm && (
        <form className="card form-card" onSubmit={handleCreate}>
          <div className="form-group">
            <label>Website Name</label>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required placeholder="My WordPress Site" />
          </div>
          <div className="form-group">
            <label>Domain / URL</label>
            <input value={form.domain} onChange={e => setForm({ ...form, domain: e.target.value })} placeholder="https://example.com" />
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          </div>
          <button type="submit" className="btn btn-primary">Create Website</button>
        </form>
      )}

      <div className="grid">
        {websites.map(w => (
          <div key={w.id} className="card project-card">
            <h3>{w.name}</h3>
            {w.domain && <p className="text-muted">{w.domain}</p>}
            <div className="card-meta">
              <span className="badge">{w.slug}</span>
            </div>
            <div className="card-actions">
              <Link to={`/websites/${w.id}`} className="btn btn-sm">Manage</Link>
              {w.defaultProjectId && (
                <>
                  <Link to={`/projects/${w.defaultProjectId}/prompts`} className="btn btn-sm">Prompts</Link>
                  <Link to={`/projects/${w.defaultProjectId}`} className="btn btn-sm">Project</Link>
                </>
              )}
              {user?.isSuperAdmin && (
                <button className="btn btn-sm btn-danger" onClick={() => handleDelete(w.id)}>Delete</button>
              )}
            </div>
            <div className="project-id">ID: <code>{w.id}</code></div>
          </div>
        ))}
      </div>

      {websites.length === 0 && !showForm && (
        <div className="empty-state">
          <p>No websites connected yet. {user?.isSuperAdmin ? 'Add your first website to get started.' : 'Contact your platform administrator.'}</p>
        </div>
      )}
    </div>
  );
}
