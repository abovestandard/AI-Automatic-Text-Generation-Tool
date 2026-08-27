import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, Website, WebsiteMember, SiteApiKey, AuthUser } from '../api';
import { useAuth } from '../context/AuthContext';

type MemberAddMode = 'existing' | 'new';

export default function WebsiteDetailPage() {
  const { websiteId } = useParams<{ websiteId: string }>();
  const { user } = useAuth();
  const [website, setWebsite] = useState<Website | null>(null);
  const [members, setMembers] = useState<WebsiteMember[]>([]);
  const [platformUsers, setPlatformUsers] = useState<AuthUser[]>([]);
  const [apiKeys, setApiKeys] = useState<SiteApiKey[]>([]);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [showMemberForm, setShowMemberForm] = useState(false);
  const [memberAddMode, setMemberAddMode] = useState<MemberAddMode>('existing');
  const [memberForm, setMemberForm] = useState({ userId: '', email: '', name: '', password: '', role: 'website_admin' });
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [editingRole, setEditingRole] = useState('website_admin');
  const [memberError, setMemberError] = useState('');
  const [form, setForm] = useState({ name: '', domain: '' });
  const [saved, setSaved] = useState(false);

  const canManage = user?.isSuperAdmin || (websiteId && user?.rolesByWebsite?.[websiteId] === 'website_admin');

  const availableUsers = useMemo(() => {
    const memberUserIds = new Set(members.map((m) => m.userId));
    return platformUsers.filter((u) => !u.isSuperAdmin && !memberUserIds.has(u.id));
  }, [platformUsers, members]);

  useEffect(() => {
    if (websiteId) loadData();
  }, [websiteId]);

  async function loadData() {
    if (!websiteId) return;
    const [w, m, k, users] = await Promise.all([
      api.getWebsite(websiteId),
      api.getWebsiteMembers(websiteId).catch(() => []),
      api.getWebsiteApiKeys(websiteId).catch(() => []),
      user?.isSuperAdmin ? api.getUsers().catch(() => []) : Promise.resolve([]),
    ]);
    setWebsite(w);
    setForm({ name: w.name, domain: w.domain || '' });
    setMembers(m);
    setApiKeys(k);
    setPlatformUsers(users);
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

  function resetMemberForm() {
    setMemberForm({ userId: '', email: '', name: '', password: '', role: 'website_admin' });
    setMemberAddMode('existing');
    setMemberError('');
    setShowMemberForm(false);
  }

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    if (!websiteId) return;
    setMemberError('');

    try {
      if (memberAddMode === 'existing') {
        if (!memberForm.userId) {
          setMemberError('Select a platform user to add.');
          return;
        }
        await api.addWebsiteMember(websiteId, {
          userId: memberForm.userId,
          role: memberForm.role,
        });
      } else {
        await api.addWebsiteMember(websiteId, {
          email: memberForm.email,
          name: memberForm.name,
          password: memberForm.password,
          role: memberForm.role,
        });
      }
      resetMemberForm();
      loadData();
    } catch (err) {
      setMemberError(err instanceof Error ? err.message : 'Failed to add member');
    }
  }

  async function handleUpdateMemberRole(memberId: string) {
    if (!websiteId) return;
    try {
      await api.updateWebsiteMember(websiteId, memberId, { role: editingRole });
      setEditingMemberId(null);
      loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update member');
    }
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
              <p className="help-text">
                Assign platform users to this website. Users created in the Users tab must be added here before they can access this site in the CRM.
              </p>
            </div>

            <button type="button" className="btn btn-sm" onClick={() => setShowMemberForm(!showMemberForm)}>
              {showMemberForm ? 'Cancel' : 'Add Member'}
            </button>

            {showMemberForm && (
              <form onSubmit={handleAddMember} style={{ marginTop: 16 }}>
                {memberError && <div className="alert alert-error">{memberError}</div>}

                <div className="form-group">
                  <label>Add member by</label>
                  <select value={memberAddMode} onChange={e => setMemberAddMode(e.target.value as MemberAddMode)}>
                    <option value="existing">Select existing platform user</option>
                    <option value="new">Create new user</option>
                  </select>
                </div>

                {memberAddMode === 'existing' ? (
                  <div className="form-row">
                    <div className="form-group">
                      <label>Platform User</label>
                      <select
                        value={memberForm.userId}
                        onChange={e => setMemberForm({ ...memberForm, userId: e.target.value })}
                        required
                      >
                        <option value="">Select user...</option>
                        {availableUsers.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name || u.email} ({u.email})
                          </option>
                        ))}
                      </select>
                      {availableUsers.length === 0 && (
                        <p className="help-text">No unassigned users available. Create users in the Users tab first.</p>
                      )}
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
                ) : (
                  <>
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
                  </>
                )}

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
                      <td>
                        {editingMemberId === m.id ? (
                          <select value={editingRole} onChange={e => setEditingRole(e.target.value)}>
                            <option value="website_admin">Website Admin</option>
                            <option value="editor">Editor</option>
                            <option value="viewer">Viewer</option>
                          </select>
                        ) : (
                          <span className="badge">{m.role}</span>
                        )}
                      </td>
                      <td className="table-actions">
                        {editingMemberId === m.id ? (
                          <>
                            <button className="btn btn-sm btn-primary" onClick={() => handleUpdateMemberRole(m.id)}>Save</button>
                            <button className="btn btn-sm" onClick={() => setEditingMemberId(null)}>Cancel</button>
                          </>
                        ) : (
                          <>
                            <button className="btn btn-sm" onClick={() => { setEditingMemberId(m.id); setEditingRole(m.role); }}>Edit</button>
                            <button className="btn btn-sm btn-danger" onClick={() => handleRemoveMember(m.id)}>Remove</button>
                          </>
                        )}
                      </td>
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
