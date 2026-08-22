import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, Prompt, OutputField } from '../api';
import ModelSelect from '../components/ModelSelect';

const DEFAULT_OUTPUT_FIELDS: OutputField[] = [
  { key: 'seo_title', label: 'SEO Title', type: 'text' },
  { key: 'meta_description', label: 'Meta Description', type: 'text' },
  { key: 'short_description', label: 'Short Description', type: 'text' },
  { key: 'category_description', label: 'Category Description', type: 'html' },
  { key: 'faq_content', label: 'FAQ Content', type: 'html' },
];

const EXAMPLE_TEMPLATE = `Generate content for the following category:

Category Name: {{category_name}}
Existing Description: {{existing_description}}
Language: {{language}}

Please generate SEO-optimized content based on the category image and name.`;

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
        </div>
        <button className="btn btn-primary" onClick={() => { resetForm(); setShowForm(true); }}>New Prompt</button>
      </div>

      {showForm && (
        <form className="card form-card" onSubmit={handleSubmit}>
          <h3>{editing ? 'Edit Prompt' : 'Create Prompt'}</h3>

          <div className="form-row">
            <div className="form-group">
              <label>Name</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>Model (optional override)</label>
              <ModelSelect
                value={form.model}
                onChange={(v) => setForm({ ...form, model: v })}
                includeDefault
                defaultLabel="Use project default"
              />
            </div>
          </div>

          <div className="form-group">
            <label>Description</label>
            <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          </div>

          <div className="form-group">
            <label>System Prompt</label>
            <textarea rows={3} value={form.systemPrompt} onChange={e => setForm({ ...form, systemPrompt: e.target.value })} required />
          </div>

          <div className="form-group">
            <label>User Prompt Template</label>
            <p className="help-text">Use {'{{variable_name}}'} for dynamic data. Available: category_name, product_name, existing_description, language, etc.</p>
            <textarea rows={6} value={form.userPromptTemplate} onChange={e => setForm({ ...form, userPromptTemplate: e.target.value })} required />
          </div>

          <label className="checkbox-label">
            <input type="checkbox" checked={form.supportsVision} onChange={e => setForm({ ...form, supportsVision: e.target.checked })} />
            Support image input (vision)
          </label>

          <h4>Output Fields</h4>
          <p className="help-text">Define the structured fields the AI should generate.</p>
          {form.outputFields.map((field, i) => (
            <div key={i} className="form-row output-field-row">
              <input placeholder="key" value={field.key} onChange={e => updateOutputField(i, { key: e.target.value })} />
              <input placeholder="Label" value={field.label} onChange={e => updateOutputField(i, { label: e.target.value })} />
              <select value={field.type} onChange={e => updateOutputField(i, { type: e.target.value })}>
                <option value="text">Text</option>
                <option value="html">HTML</option>
                <option value="markdown">Markdown</option>
              </select>
              <button type="button" className="btn btn-sm btn-danger" onClick={() => removeOutputField(i)}>×</button>
            </div>
          ))}
          <button type="button" className="btn btn-sm" onClick={addOutputField}>+ Add Field</button>

          <div className="form-actions">
            <button type="submit" className="btn btn-primary">{editing ? 'Update' : 'Create'} Prompt</button>
            <button type="button" className="btn" onClick={resetForm}>Cancel</button>
          </div>
        </form>
      )}

      <div className="list">
        {prompts.map(p => (
          <div key={p.id} className="card list-item">
            <div className="list-item-header">
              <h3>{p.name}</h3>
              <div className="badges">
                {p.supportsVision && <span className="badge">Vision</span>}
                <span className="badge">{p.outputFields.length} fields</span>
              </div>
            </div>
            {p.description && <p className="text-muted">{p.description}</p>}
            <div className="variables">
              Variables: {p.variables.map(v => <code key={v}>{'{{' + v + '}}'}</code>)}
            </div>
            <div className="card-actions">
              <button className="btn btn-sm" onClick={() => startEdit(p)}>Edit</button>
              <button className="btn btn-sm btn-danger" onClick={() => handleDelete(p.id)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
