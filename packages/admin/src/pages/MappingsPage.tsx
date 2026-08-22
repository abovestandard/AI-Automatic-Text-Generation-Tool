import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, FieldMapping, Prompt } from '../api';

const TARGET_TYPES = [
  { value: 'acf', label: 'ACF Field' },
  { value: 'post_field', label: 'WordPress Post Field' },
  { value: 'term_field', label: 'WordPress Term Field' },
  { value: 'meta', label: 'Meta Field' },
  { value: 'html_input', label: 'HTML Input' },
  { value: 'html_textarea', label: 'HTML Textarea' },
  { value: 'wysiwyg', label: 'WYSIWYG Editor' },
  { value: 'gutenberg', label: 'Gutenberg' },
  { value: 'custom', label: 'Custom' },
];

export default function MappingsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [mappings, setMappings] = useState<FieldMapping[]>([]);
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [filterPrompt, setFilterPrompt] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    promptId: '',
    aiOutputKey: '',
    targetType: 'acf',
    targetField: '',
    targetSelector: '',
    contentType: '',
    termTaxonomy: '',
  });

  useEffect(() => {
    if (projectId) {
      api.getPrompts(projectId).then(setPrompts);
      loadMappings();
    }
  }, [projectId, filterPrompt]);

  async function loadMappings() {
    const data = await api.getMappings(projectId!, filterPrompt || undefined);
    setMappings(data);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await api.createMapping(projectId!, form);
    setShowForm(false);
    setForm({ promptId: '', aiOutputKey: '', targetType: 'acf', targetField: '', targetSelector: '', contentType: '', termTaxonomy: '' });
    loadMappings();
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this mapping?')) return;
    await api.deleteMapping(id);
    loadMappings();
  }

  const selectedPrompt = prompts.find(p => p.id === form.promptId);

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="breadcrumb"><Link to="/">Projects</Link> / <Link to={`/projects/${projectId}`}>Project</Link> / Field Mappings</div>
          <h2>Field Mappings</h2>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : 'New Mapping'}
        </button>
      </div>

      <div className="filter-bar">
        <label>Filter by prompt:</label>
        <select value={filterPrompt} onChange={e => setFilterPrompt(e.target.value)}>
          <option value="">All prompts</option>
          {prompts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {showForm && (
        <form className="card form-card" onSubmit={handleSubmit}>
          <h3>Create Field Mapping</h3>
          <p className="help-text">Map AI output fields to WordPress/ACF form fields.</p>

          <div className="form-row">
            <div className="form-group">
              <label>Prompt</label>
              <select value={form.promptId} onChange={e => setForm({ ...form, promptId: e.target.value })} required>
                <option value="">Select prompt...</option>
                {prompts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>AI Output Field</label>
              {selectedPrompt ? (
                <select value={form.aiOutputKey} onChange={e => setForm({ ...form, aiOutputKey: e.target.value })} required>
                  <option value="">Select field...</option>
                  {selectedPrompt.outputFields.map(f => <option key={f.key} value={f.key}>{f.label} ({f.key})</option>)}
                </select>
              ) : (
                <input value={form.aiOutputKey} onChange={e => setForm({ ...form, aiOutputKey: e.target.value })} placeholder="e.g. seo_title" required />
              )}
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Target Type</label>
              <select value={form.targetType} onChange={e => setForm({ ...form, targetType: e.target.value })}>
                {TARGET_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Target Field</label>
              <input value={form.targetField} onChange={e => setForm({ ...form, targetField: e.target.value })}
                     placeholder="e.g. category_description, post_excerpt, seo_title" required />
            </div>
          </div>

          <div className="form-group">
            <label>CSS Selector (optional)</label>
            <input value={form.targetSelector} onChange={e => setForm({ ...form, targetSelector: e.target.value })}
                   placeholder="e.g. #seo_title, [data-name='category_description']" />
          </div>

          <button type="submit" className="btn btn-primary">Create Mapping</button>
        </form>
      )}

      <table className="data-table">
        <thead>
          <tr>
            <th>AI Output</th>
            <th>→</th>
            <th>Target Type</th>
            <th>Target Field</th>
            <th>Prompt</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {mappings.map(m => (
            <tr key={m.id}>
              <td><code>{m.aiOutputKey}</code></td>
              <td>→</td>
              <td><span className="badge">{m.targetType}</span></td>
              <td><code>{m.targetField}</code></td>
              <td>{prompts.find(p => p.id === m.promptId)?.name || m.promptId}</td>
              <td><button className="btn btn-sm btn-danger" onClick={() => handleDelete(m.id)}>Delete</button></td>
            </tr>
          ))}
        </tbody>
      </table>

      {mappings.length === 0 && (
        <div className="empty-state">
          <p>No field mappings configured. Create mappings to connect AI output to WordPress fields.</p>
        </div>
      )}
    </div>
  );
}
