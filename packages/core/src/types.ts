/** Core type definitions for the AI Content Automation platform */

export type FieldTargetType =
  | 'acf'
  | 'acf_nested'
  | 'post_field'
  | 'term_field'
  | 'meta'
  | 'html_input'
  | 'html_textarea'
  | 'wysiwyg'
  | 'gutenberg'
  | 'custom';

export type ApplyMode =
  | 'generate_only'
  | 'preview'
  | 'empty_only'
  | 'replace'
  | 'save_draft'
  | 'publish';

export type JobItemStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'skipped';

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface Project {
  id: string;
  name: string;
  description?: string;
  wordpressUrl?: string;
  wordpressApiKey?: string;
  openaiApiKey?: string;
  defaultModel: string;
  defaultLanguage: string;
  createdAt: string;
  updatedAt: string;
}

export interface PromptOutputField {
  key: string;
  label: string;
  description?: string;
  type: 'text' | 'html' | 'markdown';
}

export interface Prompt {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  systemPrompt: string;
  userPromptTemplate: string;
  outputFields: PromptOutputField[];
  model?: string;
  supportsVision: boolean;
  responseFormat: 'json' | 'text';
  variables: string[];
  createdAt: string;
  updatedAt: string;
}

export interface FieldMapping {
  id: string;
  projectId: string;
  promptId: string;
  aiOutputKey: string;
  targetType: FieldTargetType;
  targetField: string;
  targetSelector?: string;
  contentType?: string;
  termTaxonomy?: string;
}

export interface GenerationRequest {
  projectId: string;
  promptId: string;
  itemId: string | number;
  itemType: 'post' | 'term' | 'custom';
  taxonomy?: string;
  postType?: string;
  sourceData: Record<string, unknown>;
  images?: ImageInput[];
  applyMode: ApplyMode;
  fieldMappings?: FieldMapping[];
  /** When true, use acfSchema from WordPress instead of manual output fields/mappings. */
  acfAuto?: boolean;
  acfSchema?: {
    outputFields: PromptOutputField[];
    schemaInstruction: string;
    mappings: Array<Pick<FieldMapping, 'aiOutputKey' | 'targetType' | 'targetField'>>;
  };
}

export interface ImageInput {
  key: string;
  url: string;
  base64?: string;
  mimeType?: string;
}

export interface GenerationResult {
  id: string;
  requestId: string;
  status: 'success' | 'error';
  generatedContent: Record<string, string>;
  mappedFields: MappedField[];
  rawResponse?: string;
  error?: string;
  tokensUsed?: number;
  createdAt: string;
  /** True when ACF Auto Mode supplied the output schema */
  acfAutoUsed?: boolean;
  acfFieldCount?: number;
}

export interface MappedField {
  aiOutputKey: string;
  targetType: FieldTargetType;
  targetField: string;
  value: string;
  applied: boolean;
  skippedReason?: string;
}

export interface BulkJob {
  id: string;
  projectId: string;
  promptId: string;
  name: string;
  status: JobStatus;
  applyMode: ApplyMode;
  items: BulkJobItem[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface BulkJobItem {
  id: string;
  itemId: string | number;
  itemType: 'post' | 'term' | 'custom';
  itemLabel: string;
  taxonomy?: string;
  postType?: string;
  status: JobItemStatus;
  error?: string;
  generationResultId?: string;
  retryCount: number;
}
