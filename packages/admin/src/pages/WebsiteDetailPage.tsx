import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, Website, WebsiteMember, SiteApiKey } from '../api';
import { useAuth } from '../context/AuthContext';

export default function WebsiteDetailPage() {
  const { websiteId } = useParams<{ websiteId: string }>();
  const { user } = useAuth();
  const [website, setWebsite] = useState<Website | null>(null);
  const [members, setMembers] = useState<WebsiteMember[]>([]);
  const [apiKeys, setApiKeys] = useState<SiteApiKey[]>([]);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [showMemberForm, setShowMemberForm] = useState(false);
  const [memberForm, setMemberForm] = useState({ email: '', name: '', password: '', role: 'website_admin' });
  const [form, setForm] = useState({ name: '', domain: '' });
  const [saved, setSaved] = useState(false);

  const canManage = user?.isSuperAdmin || (websiteId && user?.rolesByWebsite?.[websiteId] === 'website_admin');

  useEffect(() => {
    if (websiteId) loadData();
  }, [websiteId]);

  async function loadData() {
    if (!websiteId) return;
    const [w, m, k] = await Promise.all([
      api.getWebsite(websiteId),
      api.getWebsiteMembers(websiteId).catch(() => []),
      api.getWebsiteApiKeys(websiteId).catch(() => []),
    ]);
    setWebsite(w);
    setForm({ name: w.name, domain: w.domain || '' });
    setMembers(m);
    setApiKeys(k);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!websiteId) return;
    const updated = await api.updateWebsite(websiteId, form);
    setWebsite(updated);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  async function handleCreateKey() {
    if (!websiteId) return;
    const result = await api.createWebsiteApiKey(websiteId, 'WordPress Site');
    setNewKey(result.apiKey);
    loadData();
  }

  async function handleRevokeKey(keyId: string) {
    if (!websiteId || !confirm('Revoke this API key? WordPress sites using it will lose access.')) return;
    await api.revokeWebsiteApiKey(websiteId, keyId);
    loadData();
  }

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    if (!websiteId) return;
    await api.addWebsiteMember(websiteId, memberForm);
    setShowMemberForm(false);
    setMemberForm({ email: '', name: '', password: '', role: 'website_admin' });
    loadData();
  }

  async function handleRemoveMember(memberId: string) {
    if (!websiteId || !confirm('Remove this member?')) return;
    await api.removeWebsiteMember(websiteId, memberId);
    loadData();
  }

  if (!website) return <div className="loading">Loading...</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="breadcrumb"><Link to="/">Websites</Link> / {website.name}</div>
          <h2>{website.name}</h2>
        </div>
        {website.defaultProjectId && (
          <Link to={`/projects/${website.defaultProjectId}/prompts`} className="btn btn-primary">Manage Prompts</Link>
        )}
      </div>

      <form className="card form-card" onSubmit={handleSave}>
        <div className="section-header">
          <h3>Website Settings</h3>
          <p className="help-text">Basic information for this connected website.</p>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Name</label>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} disabled={!canManage} />
          </div>
          <div className="form-group">
            <label>Domain / URL</label>
            <input value={form.domain} onChange={e => setForm({ ...form, domain: e.target.value })} disabled={!canManage} />
          </div>
        </div>
        {canManage && (
          <div className="form-actions">
            <button type="submit" className="btn btn-primary">Save Settings</button>
            {saved && <span className="save-indicator">Saved ✓</span>}
          </div>
        )}
      </form>

      {canManage && (
        <>
          <div className="card form-card" style={{ marginTop: 24 }}>
            <div className="section-header">
              <h3>WordPress Site API Keys</h3>
              <p className="help-text">Generate an API key for the WordPress plugin. Each connected site uses its own key — site admins cannot access the CRM or other websites.</p>
            </div>

            {newKey && (
              <div className="alert alert-success api-key-reveal">
                <strong>Copy this API key now — it will not be shown again:</strong>
                <code className="api-key-value">{newKey}</code>
                <button type="button" className="btn btn-sm" onClick={() => { navigator.clipboard.writeText(newKey); }}>Copy</button>
              </div>
            )}

            <button type="button" className="btn btn-primary" onClick={handleCreateKey}>Generate New API Key</button>

            {apiKeys.length > 0 && (
              <table className="data-table" style={{ marginTop: 16 }}>
                <thead>
                  <tr><th>Label</th><th>Created</th><th>Last Used</th><th>Status</th><th></th></tr>
                </thead>
                <tbody>
                  {apiKeys.map(k => (
                    <tr key={k.id}>
                      <td>{k.label}</td>
                      <td>{new Date(k.createdAt).toLocaleDateString()}</td>
                      <td>{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString() : '—'}</td>
                      <td>{k.isRevoked ? <span className="badge badge-danger">Revoked</span> : <span className="badge badge-success">Active</span>}</td>
                      <td>{!k.isRevoked && <button className="btn btn-sm btn-danger" onClick={() => handleRevokeKey(k.id)}>Revoke</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card form-card" style={{ marginTop: 24 }}>
            <div className="section-header">
              <h3>Website Members</h3>
              <p className="help-text">Control who can access this website in the CRM. Website admins can manage prompts and settings for their site only.</p>
            </div>

            <button type="button" className="btn btn-sm" onClick={() => setShowMemberForm(!showMemberForm)}>
              {showMemberForm ? 'Cancel' : 'Add Member'}
            </button>

            {showMemberForm && (
              <form onSubmit={handleAddMember} style={{ marginTop: 16 }}>
                <div className="form-row">
                  <div className="form-group">
                    <label>Name</label>
                    <input value={memberForm.name} onChange={e => setMemberForm({ ...memberForm, name: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label>Email</label>
                    <input type="email" value={memberForm.email} onChange={e => setMemberForm({ ...memberForm, email: e.target.value })} required />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Password</label>
                    <input type="password" value={memberForm.password} onChange={e => setMemberForm({ ...memberForm, password: e.target.value })} required minLength={8} />
                  </div>
                  <div className="form-group">
                    <label>Role</label>
                    <select value={memberForm.role} onChange={e => setMemberForm({ ...memberForm, role: e.target.value })}>
                      <option value="website_admin">Website Admin</option>
                      <option value="editor">Editor</option>
                      <option value="viewer">Viewer</option>
                    </select>
                  </div>
                </div>
                <button type="submit" className="btn btn-primary">Add Member</button>
              </form>
            )}

            {members.length > 0 && (
              <table className="data-table" style={{ marginTop: 16 }}>
                <thead>
                  <tr><th>Name</th><th>Email</th><th>Role</th><th></th></tr>
                </thead>
                <tbody>
                  {members.map(m => (
                    <tr key={m.id}>
                      <td>{m.name}</td>
                      <td>{m.email}</td>
                      <td><span className="badge">{m.role}</span></td>
                      <td><button className="btn btn-sm btn-danger" onClick={() => handleRemoveMember(m.id)}>Remove</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      <div className="card form-card" style={{ marginTop: 24 }}>
        <div className="section-header">
          <h3>WordPress Plugin Setup</h3>
          <p className="help-text">In WordPress → AI Content → Settings, enter the Platform API URL and the Site API Key generated above. Do not share the CRM login with site admins.</p>
        </div>
        <ol className="setup-steps">
          <li>Generate a Site API Key above</li>
          <li>In WordPress, go to <strong>AI Content → Settings</strong></li>
          <li>Enter the Platform API URL (this CRM server)</li>
          <li>Paste the Site API Key</li>
          <li>Site admins can generate content but cannot edit prompts in the CRM</li>
        </ol>
      </div>
    </div>
  );
}
