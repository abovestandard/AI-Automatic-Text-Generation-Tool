const API_BASE = '/api';

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers as Record<string, string> },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  getProjects: () => request<Project[]>('/projects'),
  getProject: (id: string) => request<Project>(`/projects/${id}`),
  createProject: (data: Partial<Project>) => request<Project>('/projects', { method: 'POST', body: JSON.stringify(data) }),
  updateProject: (id: string, data: Partial<Project>) => request<Project>(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteProject: (id: string) => request<void>(`/projects/${id}`, { method: 'DELETE' }),

  getPrompts: (projectId: string) => request<Prompt[]>(`/projects/${projectId}/prompts`),
  getPrompt: (id: string) => request<Prompt>(`/prompts/${id}`),
  createPrompt: (projectId: string, data: Partial<Prompt>) => request<Prompt>(`/projects/${projectId}/prompts`, { method: 'POST', body: JSON.stringify(data) }),
  updatePrompt: (id: string, data: Partial<Prompt>) => request<Prompt>(`/prompts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePrompt: (id: string) => request<void>(`/prompts/${id}`, { method: 'DELETE' }),

  getMappings: (projectId: string, promptId?: string) => {
    const q = promptId ? `?promptId=${promptId}` : '';
    return request<FieldMapping[]>(`/projects/${projectId}/mappings${q}`);
  },
  createMapping: (projectId: string, data: Partial<FieldMapping>) => request<FieldMapping>(`/projects/${projectId}/mappings`, { method: 'POST', body: JSON.stringify(data) }),
  updateMapping: (id: string, data: Partial<FieldMapping>) => request<FieldMapping>(`/mappings/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteMapping: (id: string) => request<void>(`/mappings/${id}`, { method: 'DELETE' }),

  generate: (data: Record<string, unknown>) => request<GenerationResult>('/generate', { method: 'POST', body: JSON.stringify(data) }),
  getBulkJobs: (projectId: string) => request<BulkJob[]>(`/projects/${projectId}/bulk-jobs`),
};

export interface Project {
  id: string;
  name: string;
  description?: string;
  wordpressUrl?: string;
  defaultModel: string;
  defaultLanguage: string;
  hasOpenaiKey: boolean;
  createdAt: string;
  updatedAt: string;
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

export interface GenerationResult {
  id: string;
  status: string;
  generatedContent: Record<string, string>;
  mappedFields: Array<{ aiOutputKey: string; targetField: string; value: string; applied: boolean; skippedReason?: string }>;
  error?: string;
  tokensUsed?: number;
}

export interface BulkJob {
  id: string;
  name: string;
  status: string;
  stats?: { total: number; completed: number; processing: number; pending: number; failed: number };
}
