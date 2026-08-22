import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, Project } from '../api';
import ModelSelect from '../components/ModelSelect';

export default function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [form, setForm] = useState({
    name: '',
    description: '',
    wordpressUrl: '',
    defaultModel: 'gpt-4o-mini',
    defaultLanguage: 'en',
    openaiApiKey: '',
    geminiApiKey: '',
  });
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (projectId) {
      api.getProject(projectId).then((p) => {
        setProject(p);
        setForm({
          name: p.name || '',
          description: p.description || '',
          wordpressUrl: p.wordpressUrl || '',
          defaultModel: p.defaultModel || 'gpt-4o-mini',
          defaultLanguage: p.defaultLanguage || 'en',
          openaiApiKey: '',
          geminiApiKey: '',
        });
      });
    }
  }, [projectId]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId) return;
    setSaving(true);

    const payload: Record<string, string> = {
      name: form.name,
      description: form.description,
      wordpressUrl: form.wordpressUrl,
      defaultModel: form.defaultModel,
      defaultLanguage: form.defaultLanguage,
    };
    if (form.openaiApiKey) payload.openaiApiKey = form.openaiApiKey;
    if (form.geminiApiKey) payload.geminiApiKey = form.geminiApiKey;

    const updated = await api.updateProject(projectId, payload);
    setProject(updated);
    setForm((f) => ({ ...f, openaiApiKey: '', geminiApiKey: '' }));
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  if (!project) return <div className="loading">Loading...</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="breadcrumb"><Link to="/">Projects</Link> / {project.name}</div>
          <h2>{form.name || project.name}</h2>
        </div>
      </div>

      <form className="card form-card" onSubmit={handleSave}>
        <div className="section-header">
          <h3>Project Configuration</h3>
          <p className="help-text">Update your project settings. API keys are only changed when you enter a new value.</p>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="project-name">Project Name</label>
            <input id="project-name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div className="form-group">
            <label htmlFor="project-language">Language</label>
            <select id="project-language" value={form.defaultLanguage} onChange={e => setForm({ ...form, defaultLanguage: e.target.value })}>
              <option value="en">English</option>
              <option value="da">Danish</option>
              <option value="de">German</option>
              <option value="fr">French</option>
              <option value="es">Spanish</option>
            </select>
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="project-description">Description</label>
          <textarea id="project-description" rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Optional project description" />
        </div>

        <div className="form-group">
          <label htmlFor="project-id">Project ID</label>
          <input id="project-id" value={project.id} readOnly className="mono input-readonly" />
          <p className="help-text">Copy this ID into the WordPress plugin settings.</p>
        </div>

        <div className="form-divider" />

        <div className="section-header">
          <h3>WordPress Connection</h3>
        </div>

        <div className="form-group">
          <label htmlFor="wordpress-url">WordPress URL</label>
          <input
            id="wordpress-url"
            type="url"
            value={form.wordpressUrl}
            onChange={e => setForm({ ...form, wordpressUrl: e.target.value })}
            placeholder="http://localhost/gmc"
          />
          <p className="help-text">The URL of your WordPress site (not the API URL).</p>
        </div>

        <div className="form-divider" />

        <div className="section-header">
          <h3>AI Model &amp; API Keys</h3>
        </div>

        <div className="form-group">
          <label htmlFor="default-model">Default AI Model</label>
          <ModelSelect
            id="default-model"
            value={form.defaultModel}
            onChange={(v) => setForm({ ...form, defaultModel: v })}
          />
          <p className="help-text">Gemini models marked ★ Free work with Google&apos;s free API tier.</p>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="openai-key">OpenAI API Key</label>
            <input
              id="openai-key"
              type="password"
              value={form.openaiApiKey}
              onChange={e => setForm({ ...form, openaiApiKey: e.target.value })}
              placeholder={project.hasOpenaiKey ? 'Key is set – enter new to replace' : 'sk-...'}
            />
          </div>
          <div className="form-group">
            <label htmlFor="gemini-key">Google Gemini API Key</label>
            <input
              id="gemini-key"
              type="password"
              value={form.geminiApiKey}
              onChange={e => setForm({ ...form, geminiApiKey: e.target.value })}
              placeholder={project.hasGeminiKey ? 'Key is set – enter new to replace' : 'AIza...'}
            />
            <p className="help-text">
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">Get a free Gemini API key</a>
            </p>
          </div>
        </div>

        <div className="api-status-row">
          <span className={`status-pill ${project.hasOpenaiKey ? 'active' : ''}`}>OpenAI {project.hasOpenaiKey ? '✓' : '○'}</span>
          <span className={`status-pill ${project.hasGeminiKey ? 'active' : ''}`}>Gemini {project.hasGeminiKey ? '✓' : '○'}</span>
        </div>

        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saved ? 'Saved!' : saving ? 'Saving...' : 'Save Configuration'}
          </button>
        </div>
      </form>

      <div className="grid">
        <Link to={`/projects/${projectId}/prompts`} className="card link-card">
          <div className="link-card-icon">📝</div>
          <h3>Prompts</h3>
          <p>Manage reusable AI prompt templates with dynamic variables.</p>
        </Link>
        <Link to={`/projects/${projectId}/mappings`} className="card link-card">
          <div className="link-card-icon">🔗</div>
          <h3>Field Mappings</h3>
          <p>Configure how AI output maps to WordPress/ACF fields.</p>
        </Link>
      </div>
    </div>
  );
}
