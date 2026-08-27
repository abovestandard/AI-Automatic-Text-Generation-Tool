import { useState, useEffect } from 'react';
import { api, AuthUser } from '../api';

const emptyForm = { name: '', email: '', password: '', isSuperAdmin: false };

export default function UsersPage() {
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { loadUsers(); }, []);

  async function loadUsers() {
    try {
      const data = await api.getUsers();
      setUsers(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
    setError('');
  }

  function startEdit(user: AuthUser) {
    setEditingId(user.id);
    setShowForm(true);
    setForm({
      name: user.name || '',
      email: user.email,
      password: '',
      isSuperAdmin: user.isSuperAdmin,
    });
    setError('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    try {
      if (editingId) {
        const payload: { name: string; email: string; isSuperAdmin: boolean; password?: string } = {
          name: form.name,
          email: form.email,
          isSuperAdmin: form.isSuperAdmin,
        };
        if (form.password) payload.password = form.password;
        await api.updateUser(editingId, payload);
      } else {
        await api.createUser(form);
      }
      resetForm();
      loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save user');
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this user?')) return;
    await api.deleteUser(id);
    loadUsers();
  }

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Platform Users</h2>
          <p className="help-text">
            Manage CRM users. Super admins can access all websites. Other users must be assigned to websites under Website → Members.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => { resetForm(); setShowForm(!showForm); }}>
          {showForm && !editingId ? 'Cancel' : 'Add User'}
        </button>
      </div>

      {showForm && (
        <form className="card form-card" onSubmit={handleSubmit}>
          <h3>{editingId ? 'Edit User' : 'Add User'}</h3>
          {error && <div className="alert alert-error">{error}</div>}
          <div className="form-row">
            <div className="form-group">
              <label>Name</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>{editingId ? 'New Password (leave blank to keep current)' : 'Password'}</label>
              <input
                type="password"
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                required={!editingId}
                minLength={editingId ? undefined : 8}
              />
            </div>
            <div className="form-group">
              <label className="checkbox-label">
                <input type="checkbox" checked={form.isSuperAdmin} onChange={e => setForm({ ...form, isSuperAdmin: e.target.checked })} />
                Super Admin (full platform access)
              </label>
            </div>
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary">{editingId ? 'Save Changes' : 'Create User'}</button>
            <button type="button" className="btn" onClick={resetForm}>Cancel</button>
          </div>
        </form>
      )}

      <table className="data-table card" style={{ padding: 0, overflow: 'hidden' }}>
        <thead>
          <tr><th>Name</th><th>Email</th><th>Role</th><th>Websites</th><th>Created</th><th></th></tr>
        </thead>
        <tbody>
          {users.map(u => (
            <tr key={u.id}>
              <td>{u.name}</td>
              <td>{u.email}</td>
              <td>{u.isSuperAdmin ? <span className="badge badge-primary">Super Admin</span> : <span className="badge">Member</span>}</td>
              <td>
                {u.isSuperAdmin ? (
                  <span className="text-muted">All websites</span>
                ) : u.memberships?.length ? (
                  u.memberships.map((m) => (
                    <span key={m.id} className="badge" style={{ marginRight: 6, marginBottom: 4 }}>
                      {m.websiteName} ({m.role})
                    </span>
                  ))
                ) : (
                  <span className="text-muted">Not assigned</span>
                )}
              </td>
              <td>{u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}</td>
              <td className="table-actions">
                <button className="btn btn-sm" onClick={() => startEdit(u)}>Edit</button>
                {!u.isSuperAdmin && <button className="btn btn-sm btn-danger" onClick={() => handleDelete(u.id)}>Delete</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
