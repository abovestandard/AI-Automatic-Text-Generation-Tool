import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, Project } from '../api';

export default function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [openaiKey, setOpenaiKey] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (projectId) api.getProject(projectId).then(setProject);
  }, [projectId]);

  async function handleSave() {
    if (!projectId) return;
    await api.updateProject(projectId, { openaiApiKey: openaiKey } as Partial<Project>);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (!project) return <div className="loading">Loading...</div>;

  return (
    <div>
      <div className="page-header">
        <h2>{project.name}</h2>
        <div className="breadcrumb">
          <Link to="/">Projects</Link> / {project.name}
        </div>
      </div>

      <div className="card">
        <h3>Project Configuration</h3>
        <div className="form-group">
          <label>Project ID (use in WordPress plugin)</label>
          <input value={project.id} readOnly className="mono" />
        </div>
        <div className="form-group">
          <label>WordPress URL</label>
          <input value={project.wordpressUrl || ''} readOnly />
        </div>
        <div className="form-group">
          <label>Default Model</label>
          <input value={project.defaultModel} readOnly />
        </div>
        <div className="form-group">
          <label>OpenAI API Key</label>
          <input type="password" value={openaiKey} onChange={e => setOpenaiKey(e.target.value)}
                 placeholder={project.hasOpenaiKey ? 'Key is set (enter new to replace)' : 'sk-...'} />
        </div>
        <button className="btn btn-primary" onClick={handleSave}>
          {saved ? 'Saved!' : 'Save API Key'}
        </button>
      </div>

      <div className="grid" style={{ marginTop: 24 }}>
        <Link to={`/projects/${projectId}/prompts`} className="card link-card">
          <h3>Prompts</h3>
          <p>Manage reusable AI prompt templates with dynamic variables.</p>
        </Link>
        <Link to={`/projects/${projectId}/mappings`} className="card link-card">
          <h3>Field Mappings</h3>
          <p>Configure how AI output maps to WordPress/ACF fields.</p>
        </Link>
      </div>
    </div>
  );
}
