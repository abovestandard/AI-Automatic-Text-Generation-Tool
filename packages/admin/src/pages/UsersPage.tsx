import { useState, useEffect } from 'react';
import { api, AuthUser } from '../api';

export default function UsersPage() {
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', isSuperAdmin: false });
  const [loading, setLoading] = useState(true);

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

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await api.createUser(form);
    setShowForm(false);
    setForm({ name: '', email: '', password: '', isSuperAdmin: false });
    loadUsers();
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
          <p className="help-text">Manage CRM users. Super admins can access all websites. Other users need website memberships.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : 'Add User'}
        </button>
      </div>

      {showForm && (
        <form className="card form-card" onSubmit={handleCreate}>
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
              <label>Password</label>
              <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required minLength={8} />
            </div>
            <div className="form-group">
              <label className="checkbox-label">
                <input type="checkbox" checked={form.isSuperAdmin} onChange={e => setForm({ ...form, isSuperAdmin: e.target.checked })} />
                Super Admin (full platform access)
              </label>
            </div>
          </div>
          <button type="submit" className="btn btn-primary">Create User</button>
        </form>
      )}

      <table className="data-table card" style={{ padding: 0, overflow: 'hidden' }}>
        <thead>
          <tr><th>Name</th><th>Email</th><th>Role</th><th>Created</th><th></th></tr>
        </thead>
        <tbody>
          {users.map(u => (
            <tr key={u.id}>
              <td>{u.name}</td>
              <td>{u.email}</td>
              <td>{u.isSuperAdmin ? <span className="badge badge-primary">Super Admin</span> : <span className="badge">Member</span>}</td>
              <td>{u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}</td>
              <td>{!u.isSuperAdmin && <button className="btn btn-sm btn-danger" onClick={() => handleDelete(u.id)}>Delete</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
