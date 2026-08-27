import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, Prompt, OutputField } from '../api';
import ModelSelect from '../components/ModelSelect';

const DEFAULT_OUTPUT_FIELDS: OutputField[] = [
  { key: 'underoverskrift_til_kategori', label: 'Underoverskrift til kategori', type: 'text' },
];

const EXAMPLE_TEMPLATE = `Generate content for the following category:

Category Name: {{category_name}}
Existing Description: {{existing_description}}
Language: {{language}}

Please generate SEO-optimized content based on the category image and name.`;

const VARIABLE_HINTS = [
  'category_name', 'product_name', 'existing_description', 'language',
  'post_title', 'post_content', 'term_name', 'term_description',
];

export default function PromptsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Prompt | null>(null);
  const [form, setForm] = useState({
    name: '',
    description: '',
    systemPrompt: 'You are an expert SEO content writer. Generate high-quality, engaging content.',
    userPromptTemplate: EXAMPLE_TEMPLATE,
    outputFields: DEFAULT_OUTPUT_FIELDS,
    supportsVision: true,
    model: '',
    responseFormat: 'json',
  });

  useEffect(() => { if (projectId) loadPrompts(); }, [projectId]);

  async function loadPrompts() {
    const data = await api.getPrompts(projectId!);
    setPrompts(data);
  }

  function resetForm() {
    setForm({
      name: '', description: '',
      systemPrompt: 'You are an expert SEO content writer. Generate high-quality, engaging content.',
      userPromptTemplate: EXAMPLE_TEMPLATE,
      outputFields: DEFAULT_OUTPUT_FIELDS,
      supportsVision: true, model: '', responseFormat: 'json',
    });
    setEditing(null);
    setShowForm(false);
  }

  function startEdit(prompt: Prompt) {
    setEditing(prompt);
    setForm({
      name: prompt.name,
      description: prompt.description || '',
      systemPrompt: prompt.systemPrompt,
      userPromptTemplate: prompt.userPromptTemplate,
      outputFields: prompt.outputFields,
      supportsVision: prompt.supportsVision,
      model: prompt.model || '',
      responseFormat: prompt.responseFormat,
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (editing) {
      await api.updatePrompt(editing.id, form);
    } else {
      await api.createPrompt(projectId!, form);
    }
    resetForm();
    loadPrompts();
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this prompt?')) return;
    await api.deletePrompt(id);
    loadPrompts();
  }

  function addOutputField() {
    setForm({
      ...form,
      outputFields: [...form.outputFields, { key: '', label: '', type: 'text' }],
    });
  }

  function updateOutputField(index: number, field: Partial<OutputField>) {
    const fields = [...form.outputFields];
    fields[index] = { ...fields[index], ...field };
    if (field.label && !fields[index].key) {
      fields[index].key = field.label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    }
    setForm({ ...form, outputFields: fields });
  }

  function removeOutputField(index: number) {
    setForm({ ...form, outputFields: form.outputFields.filter((_, i) => i !== index) });
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="breadcrumb"><Link to="/">Projects</Link> / <Link to={`/projects/${projectId}`}>Project</Link> / Prompts</div>
          <h2>Prompts</h2>
          <p className="text-muted" style={{ marginTop: 4 }}>Define what the AI generates. Each prompt has a template, output fields, and optional vision support.</p>
        </div>
        {!showForm && (
          <button className="btn btn-primary" onClick={() => { resetForm(); setShowForm(true); }}>+ New Prompt</button>
        )}
      </div>

      {showForm && (
        <form className="card form-card" onSubmit={handleSubmit}>
          <div className="section-header">
            <h3>{editing ? 'Edit Prompt' : 'Create Prompt'}</h3>
            <p className="help-text">Configure the AI instructions and define which fields it should return.</p>
          </div>

          {/* Section 1: Basic info */}
          <div className="form-section">
            <h4 className="form-section-title">Basic Information</h4>
            <div className="form-row">
              <div className="form-group">
                <label>Prompt Name</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Category SEO Content" required />
              </div>
              <div className="form-group">
                <label>Model Override</label>
                <ModelSelect
                  value={form.model}
                  onChange={(v) => setForm({ ...form, model: v })}
                  includeDefault
                  defaultLabel="Use project default"
                />
              </div>
            </div>
            <div className="form-group">
              <label>Description (optional)</label>
              <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Brief description of what this prompt does" />
            </div>
          </div>

          <div className="form-divider" />

          {/* Section 2: AI Instructions */}
          <div className="form-section">
            <h4 className="form-section-title">AI Instructions</h4>
            <div className="form-group">
              <label>System Prompt</label>
              <p className="help-text">Sets the AI's role and behavior. This is sent as the system message.</p>
              <textarea rows={3} value={form.systemPrompt} onChange={e => setForm({ ...form, systemPrompt: e.target.value })} required />
            </div>

            <div className="form-group">
              <label>User Prompt Template</label>
              <p className="help-text">
                The prompt sent for each item. Use <code>{'{{variable_name}}'}</code> for dynamic data.
                Common variables: {VARIABLE_HINTS.map(v => <code key={v} style={{ marginRight: 4 }}>{'{{' + v + '}}'}</code>)}
              </p>
              <textarea rows={8} className="mono" value={form.userPromptTemplate} onChange={e => setForm({ ...form, userPromptTemplate: e.target.value })} required />
            </div>

            <label className="checkbox-label">
              <input type="checkbox" checked={form.supportsVision} onChange={e => setForm({ ...form, supportsVision: e.target.checked })} />
              Enable image input (vision) — allows reference images from WordPress or uploads
            </label>
          </div>

          <div className="form-divider" />

          {/* Section 3: Output Fields */}
          <div className="form-section">
            <h4 className="form-section-title">Output Fields</h4>
            <p className="help-text">Define the structured fields the AI should generate. These keys are used in field mappings to save content to WordPress/ACF.</p>

            <div className="output-fields-table">
              <div className="output-fields-header">
                <span>Field Key</span>
                <span>Label</span>
                <span>Type</span>
                <span></span>
              </div>
              {form.outputFields.map((field, i) => (
                <div key={i} className="output-fields-row">
                  <input placeholder="field_key" value={field.key} onChange={e => updateOutputField(i, { key: e.target.value })} />
                  <input placeholder="Human-readable label" value={field.label} onChange={e => updateOutputField(i, { label: e.target.value })} />
                  <select value={field.type} onChange={e => updateOutputField(i, { type: e.target.value })}>
                    <option value="text">Text</option>
                    <option value="html">HTML</option>
                    <option value="markdown">Markdown</option>
                  </select>
                  <button type="button" className="btn btn-sm btn-danger" onClick={() => removeOutputField(i)} title="Remove field">×</button>
                </div>
              ))}
            </div>
            <button type="button" className="btn btn-sm" onClick={addOutputField} style={{ marginTop: 12 }}>+ Add Field</button>
          </div>

          <div className="form-actions">
            <button type="submit" className="btn btn-primary">{editing ? 'Update Prompt' : 'Create Prompt'}</button>
            <button type="button" className="btn" onClick={resetForm}>Cancel</button>
          </div>
        </form>
      )}

      {!showForm && (
        <div className="prompts-list">
          {prompts.length === 0 ? (
            <div className="empty-state">
              <p>No prompts yet. Create your first prompt to start generating content.</p>
              <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setShowForm(true)}>+ Create Prompt</button>
            </div>
          ) : (
            prompts.map(p => (
              <div key={p.id} className="card list-item prompt-list-card">
                <div className="list-item-header">
                  <div>
                    <h3>{p.name}</h3>
                    {p.description && <p className="text-muted" style={{ marginTop: 2 }}>{p.description}</p>}
                  </div>
                  <div className="badges">
                    {p.supportsVision && <span className="badge">Vision</span>}
                    <span className="badge">{p.outputFields.length} fields</span>
                    {p.model && <span className="badge">{p.model}</span>}
                  </div>
                </div>
                <div className="prompt-output-preview">
                  <span className="text-muted" style={{ fontSize: 12 }}>Output fields:</span>
                  {p.outputFields.map(f => (
                    <code key={f.key}>{f.key}</code>
                  ))}
                </div>
                {p.variables.length > 0 && (
                  <div className="variables">
                    Variables: {p.variables.map(v => <code key={v}>{'{{' + v + '}}'}</code>)}
                  </div>
                )}
                <div className="card-actions">
                  <button className="btn btn-sm" onClick={() => startEdit(p)}>Edit</button>
                  <Link className="btn btn-sm" to={`/projects/${projectId}/mappings?prompt=${p.id}`}>Mappings</Link>
                  <button className="btn btn-sm btn-danger" onClick={() => handleDelete(p.id)}>Delete</button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
