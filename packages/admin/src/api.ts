const API_BASE = '/api';

let authToken: string | null = null;

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  setToken: (token: string | null) => { authToken = token; },

  getAuthStatus: () => request<{ needsBootstrap: boolean; userCount: number }>('/auth/status'),
  login: (email: string, password: string) => request<{ token: string; user: AuthUser }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  bootstrap: (email: string, password: string, name: string) => request<{ token: string; user: AuthUser }>('/auth/bootstrap', { method: 'POST', body: JSON.stringify({ email, password, name }) }),
  getMe: () => request<AuthUser>('/auth/me'),

  getWebsites: () => request<Website[]>('/websites'),
  getWebsite: (id: string) => request<Website>(`/websites/${id}`),
  createWebsite: (data: Partial<Website>) => request<Website>('/websites', { method: 'POST', body: JSON.stringify(data) }),
  updateWebsite: (id: string, data: Partial<Website>) => request<Website>(`/websites/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteWebsite: (id: string) => request<void>(`/websites/${id}`, { method: 'DELETE' }),
  getWebsiteMembers: (id: string) => request<WebsiteMember[]>(`/websites/${id}/members`),
  addWebsiteMember: (id: string, data: { email: string; name: string; password: string; role: string }) =>
    request<WebsiteMember>(`/websites/${id}/members`, { method: 'POST', body: JSON.stringify(data) }),
  removeWebsiteMember: (websiteId: string, memberId: string) => request<void>(`/websites/${websiteId}/members/${memberId}`, { method: 'DELETE' }),
  getWebsiteApiKeys: (id: string) => request<SiteApiKey[]>(`/websites/${id}/api-keys`),
  createWebsiteApiKey: (id: string, label: string) => request<{ apiKey: string; id: string }>(`/websites/${id}/api-keys`, { method: 'POST', body: JSON.stringify({ label }) }),
  revokeWebsiteApiKey: (websiteId: string, keyId: string) => request<void>(`/websites/${websiteId}/api-keys/${keyId}`, { method: 'DELETE' }),

  getUsers: () => request<AuthUser[]>('/users'),
  createUser: (data: { name: string; email: string; password: string; isSuperAdmin?: boolean }) =>
    request<AuthUser>('/users', { method: 'POST', body: JSON.stringify(data) }),
  deleteUser: (id: string) => request<void>(`/users/${id}`, { method: 'DELETE' }),

  getProjects: () => request<Project[]>('/projects'),
  getProject: (id: string) => request<Project>(`/projects/${id}`),
  createProject: (data: Partial<Project> & { websiteId?: string }) => request<Project>('/projects', { method: 'POST', body: JSON.stringify(data) }),
  updateProject: (id: string, data: Partial<Project>) => request<Project>(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteProject: (id: string) => request<void>(`/projects/${id}`, { method: 'DELETE' }),

  getPrompts: (projectId: string) => request<Prompt[]>(`/projects/${projectId}/prompts`),
  createPrompt: (projectId: string, data: Partial<Prompt>) => request<Prompt>(`/projects/${projectId}/prompts`, { method: 'POST', body: JSON.stringify(data) }),
  updatePrompt: (id: string, data: Partial<Prompt>) => request<Prompt>(`/prompts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePrompt: (id: string) => request<void>(`/prompts/${id}`, { method: 'DELETE' }),

  getMappings: (projectId: string, promptId?: string) => {
    const q = promptId ? `?promptId=${promptId}` : '';
    return request<FieldMapping[]>(`/projects/${projectId}/mappings${q}`);
  },
  createMapping: (projectId: string, data: Partial<FieldMapping>) => request<FieldMapping>(`/projects/${projectId}/mappings`, { method: 'POST', body: JSON.stringify(data) }),
  deleteMapping: (id: string) => request<void>(`/mappings/${id}`, { method: 'DELETE' }),

  getModels: () => request<AIModel[]>('/models'),
};

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  isSuperAdmin: boolean;
  websiteIds: string[];
  rolesByWebsite: Record<string, string>;
  createdAt?: string;
}

export interface Website {
  id: string;
  name: string;
  domain?: string;
  slug: string;
  defaultProjectId?: string;
  settings?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface WebsiteMember {
  id: string;
  userId: string;
  websiteId: string;
  role: string;
  email: string;
  name: string;
  createdAt: string;
}

export interface SiteApiKey {
  id: string;
  websiteId: string;
  label: string;
  lastUsedAt?: string;
  revokedAt?: string;
  createdAt: string;
  isRevoked: boolean;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  websiteId?: string;
  wordpressUrl?: string;
  defaultModel: string;
  defaultLanguage: string;
  hasOpenaiKey: boolean;
  hasGeminiKey: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AIModel {
  id: string;
  label: string;
  provider: 'openai' | 'google';
  supportsVision: boolean;
  description?: string;
  freeTier?: boolean;
}

export interface Prompt {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  systemPrompt: string;
  userPromptTemplate: string;
  outputFields: OutputField[];
  model?: string;
  supportsVision: boolean;
  responseFormat: string;
  variables: string[];
  createdAt: string;
  updatedAt: string;
}

export interface OutputField {
  key: string;
  label: string;
  description?: string;
  type: string;
}

export interface FieldMapping {
  id: string;
  projectId: string;
  promptId: string;
  aiOutputKey: string;
  targetType: string;
  targetField: string;
  targetSelector?: string;
  contentType?: string;
  termTaxonomy?: string;
}
