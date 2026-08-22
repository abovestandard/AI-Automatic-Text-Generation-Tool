import type { WordPressPost, WordPressTerm } from '@ai-content/core';

export interface WordPressConfig {
  url: string;
  apiKey?: string;
  username?: string;
  password?: string;
}

export class WordPressClient {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(config: WordPressConfig) {
    this.baseUrl = config.url.replace(/\/$/, '') + '/wp-json/wp/v2';
    this.headers = { 'Content-Type': 'application/json' };

    if (config.apiKey) {
      this.headers['Authorization'] = `Bearer ${config.apiKey}`;
    } else if (config.username && config.password) {
      const encoded = Buffer.from(`${config.username}:${config.password}`).toString('base64');
      this.headers['Authorization'] = `Basic ${encoded}`;
    }
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: { ...this.headers, ...(options.headers as Record<string, string>) },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`WordPress API error ${response.status}: ${body}`);
    }

    return response.json() as Promise<T>;
  }

  async getPost(id: number): Promise<WordPressPost> {
    const post = await this.request<Record<string, unknown>>(`/posts/${id}?context=edit`);
    return this.normalizePost(post);
  }

  async getPosts(params: Record<string, string> = {}): Promise<WordPressPost[]> {
    const query = new URLSearchParams({ per_page: '100', ...params }).toString();
    const posts = await this.request<Record<string, unknown>[]>(`/posts?${query}`);
    return posts.map((p) => this.normalizePost(p));
  }

  async getTerm(taxonomy: string, id: number): Promise<WordPressTerm> {
    const term = await this.request<Record<string, unknown>>(`/${taxonomy}/${id}?context=edit`);
    return this.normalizeTerm(term);
  }

  async getTerms(taxonomy: string, params: Record<string, string> = {}): Promise<WordPressTerm[]> {
    const query = new URLSearchParams({ per_page: '100', ...params }).toString();
    const terms = await this.request<Record<string, unknown>[]>('/' + taxonomy + '?' + query);
    return terms.map((t) => this.normalizeTerm(t));
  }

  async updatePost(id: number, data: Partial<WordPressPost>): Promise<WordPressPost> {
    const body: Record<string, unknown> = {};
    if (data.title !== undefined) body.title = data.title;
    if (data.content !== undefined) body.content = data.content;
    if (data.excerpt !== undefined) body.excerpt = data.excerpt;
    if (data.status !== undefined) body.status = data.status;
    if (data.acf) body.acf = data.acf;
    if (data.meta) body.meta = data.meta;

    const post = await this.request<Record<string, unknown>>(`/posts/${id}`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return this.normalizePost(post);
  }

  async updateTerm(taxonomy: string, id: number, data: Partial<WordPressTerm>): Promise<WordPressTerm> {
    const body: Record<string, unknown> = {};
    if (data.name !== undefined) body.name = data.name;
    if (data.description !== undefined) body.description = data.description;
    if (data.acf) body.acf = data.acf;
    if (data.meta) body.meta = data.meta;

    const term = await this.request<Record<string, unknown>>(`/${taxonomy}/${id}`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return this.normalizeTerm(term);
  }

  async getMedia(id: number): Promise<{ id: number; source_url: string; mime_type: string }> {
    return this.request(`/media/${id}`);
  }

  private normalizePost(raw: Record<string, unknown>): WordPressPost {
    return {
      id: raw.id as number,
      title: typeof raw.title === 'object' ? (raw.title as { rendered: string }).rendered : String(raw.title),
      content: typeof raw.content === 'object' ? (raw.content as { rendered: string }).rendered : String(raw.content || ''),
      excerpt: typeof raw.excerpt === 'object' ? (raw.excerpt as { rendered: string }).rendered : String(raw.excerpt || ''),
      status: String(raw.status),
      type: String(raw.type),
      featured_media: raw.featured_media as number | undefined,
      meta: raw.meta as Record<string, unknown> | undefined,
      acf: raw.acf as Record<string, unknown> | undefined,
    };
  }

  private normalizeTerm(raw: Record<string, unknown>): WordPressTerm {
    return {
      id: raw.id as number,
      name: String(raw.name),
      slug: String(raw.slug),
      description: String(raw.description || ''),
      taxonomy: String(raw.taxonomy),
      parent: (raw.parent as number) || 0,
      meta: raw.meta as Record<string, unknown> | undefined,
      acf: raw.acf as Record<string, unknown> | undefined,
    };
  }
}

export function buildSourceDataFromPost(
  post: WordPressPost,
  extraFields: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    product_name: post.title,
    post_title: post.title,
    post_content: post.content,
    post_excerpt: post.excerpt,
    existing_description: post.content,
    existing_content: post.content,
    short_description: post.excerpt,
    acf: post.acf || {},
    ...extraFields,
  };
}

export function buildSourceDataFromTerm(
  term: WordPressTerm,
  extraFields: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    category_name: term.name,
    term_name: term.name,
    existing_description: term.description,
    description: term.description,
    acf: term.acf || {},
    ...extraFields,
  };
}
