import { useState, useEffect } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { api, FieldMapping, Prompt } from '../api';

const TARGET_TYPES = [
  { value: 'acf_nested', label: 'ACF Nested (Groups / Repeaters)' },
  { value: 'acf', label: 'ACF Field (top-level)' },
  { value: 'post_field', label: 'WordPress Post Field' },
  { value: 'term_field', label: 'WordPress Term Field' },
  { value: 'meta', label: 'Meta Field' },
  { value: 'html_input', label: 'HTML Input' },
  { value: 'html_textarea', label: 'HTML Textarea' },
  { value: 'wysiwyg', label: 'WYSIWYG Editor' },
  { value: 'gutenberg', label: 'Gutenberg' },
  { value: 'custom', label: 'Custom' },
];

const ACF_EXAMPLES = [
  { path: 'indstillinger_for_produktvisning.afsnit_1.underoverskrift', desc: 'Group → sub-group → text field' },
  { path: 'indstillinger_for_produktvisning.afsnit_1.beskrivelse', desc: 'Group → sub-group → text editor' },
  { path: 'indstillinger_for_produktvisning.afsnit_2', desc: 'Repeater (AI outputs JSON array of rows)' },
];

export default function MappingsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [searchParams] = useSearchParams();
  const [mappings, setMappings] = useState<FieldMapping[]>([]);
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [filterPrompt, setFilterPrompt] = useState(searchParams.get('prompt') || '');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    promptId: searchParams.get('prompt') || '',
    aiOutputKey: '',
    targetType: 'acf_nested',
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
    setForm({ promptId: filterPrompt, aiOutputKey: '', targetType: 'acf_nested', targetField: '', targetSelector: '', contentType: '', termTaxonomy: '' });
    loadMappings();
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this mapping?')) return;
    await api.deleteMapping(id);
    loadMappings();
  }

  const selectedPrompt = prompts.find(p => p.id === form.promptId);
  const isNestedAcf = form.targetType === 'acf_nested';

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="breadcrumb"><Link to="/">Projects</Link> / <Link to={`/projects/${projectId}`}>Project</Link> / Field Mappings</div>
          <h2>Field Mappings</h2>
          <p className="text-muted" style={{ marginTop: 4 }}>Connect AI output fields to WordPress and ACF fields. Use dot notation for nested ACF structures.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : '+ New Mapping'}
        </button>
      </div>

      <div className="card" style={{ marginBottom: 20, padding: '16px 20px' }}>
        <h4 style={{ fontSize: 14, marginBottom: 8 }}>ACF Nested Field Paths</h4>
        <p className="help-text" style={{ marginBottom: 10 }}>For Groups and Repeaters, use dot notation. The plugin merges values into the existing ACF structure.</p>
        <div className="acf-examples">
          {ACF_EXAMPLES.map(ex => (
            <div key={ex.path} className="acf-example-row">
              <code>{ex.path}</code>
              <span className="text-muted">{ex.desc}</span>
            </div>
          ))}
        </div>
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
          <p className="help-text">Map an AI output field to a WordPress or ACF target field.</p>

          <div className="form-row">
            <div className="form-group">
              <label>Prompt</label>
              <select value={form.promptId} onChange={e => setForm({ ...form, promptId: e.target.value, aiOutputKey: '' })} required>
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
                <input value={form.aiOutputKey} onChange={e => setForm({ ...form, aiOutputKey: e.target.value })} placeholder="e.g. underoverskrift_til_kategori" required />
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
              <input
                value={form.targetField}
                onChange={e => setForm({ ...form, targetField: e.target.value })}
                placeholder={isNestedAcf ? 'e.g. indstillinger_for_produktvisning.afsnit_1.underoverskrift' : 'e.g. post_excerpt, category_description'}
                required
                className={isNestedAcf ? 'mono' : ''}
              />
              {isNestedAcf && (
                <p className="help-text">Use dot notation for nested Groups. For Repeaters, map to the repeater path and have the AI output a JSON array.</p>
              )}
            </div>
          </div>

          <div className="form-group">
            <label>CSS Selector (optional)</label>
            <input value={form.targetSelector} onChange={e => setForm({ ...form, targetSelector: e.target.value })}
                   placeholder="e.g. [data-name='category_description']" />
            <p className="help-text">Only needed for live preview on edit screens. Server-side saving uses the target field path.</p>
          </div>

          <button type="submit" className="btn btn-primary">Create Mapping</button>
        </form>
      )}

      <table className="data-table">
        <thead>
          <tr>
            <th>AI Output</th>
            <th></th>
            <th>Target</th>
            <th>Prompt</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {mappings.map(m => (
            <tr key={m.id}>
              <td><code>{m.aiOutputKey}</code></td>
              <td style={{ color: '#94a3b8' }}>→</td>
              <td>
                <span className="badge" style={{ marginRight: 6 }}>{m.targetType}</span>
                <code>{m.targetField}</code>
              </td>
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
