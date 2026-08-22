import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { extractVariables } from '@ai-content/core';
import { getDb } from '../db';
import { generateContent } from '../services/generation';
import { createBulkJob, getBulkJob, processBulkJob, retryFailedItems, getJobStats } from '../services/bulk-queue';

export const apiRouter = Router();

// ─── Projects ───────────────────────────────────────────────

apiRouter.get('/projects', (_req: Request, res: Response) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all();
  res.json(rows.map(formatProject));
});

apiRouter.get('/projects/:id', (req: Request, res: Response) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Project not found' });
  res.json(formatProject(row));
});

apiRouter.post('/projects', (req: Request, res: Response) => {
  const db = getDb();
  const id = uuidv4();
  const now = new Date().toISOString();
  const { name, description, wordpressUrl, wordpressApiKey, openaiApiKey, defaultModel, defaultLanguage } = req.body;

  db.prepare(`
    INSERT INTO projects (id, name, description, wordpress_url, wordpress_api_key, openai_api_key, default_model, default_language, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, description || null, wordpressUrl || null, wordpressApiKey || null, openaiApiKey || null, defaultModel || 'gpt-4o', defaultLanguage || 'en', now, now);

  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  res.status(201).json(formatProject(row));
});

apiRouter.put('/projects/:id', (req: Request, res: Response) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Project not found' });

  const { name, description, wordpressUrl, wordpressApiKey, openaiApiKey, defaultModel, defaultLanguage } = req.body;
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE projects SET name = ?, description = ?, wordpress_url = ?, wordpress_api_key = ?,
    openai_api_key = ?, default_model = ?, default_language = ?, updated_at = ? WHERE id = ?
  `).run(
    name ?? (existing as { name: string }).name,
    description ?? (existing as { description: string }).description,
    wordpressUrl ?? (existing as { wordpress_url: string }).wordpress_url,
    wordpressApiKey ?? (existing as { wordpress_api_key: string }).wordpress_api_key,
    openaiApiKey ?? (existing as { openai_api_key: string }).openai_api_key,
    defaultModel ?? (existing as { default_model: string }).default_model,
    defaultLanguage ?? (existing as { default_language: string }).default_language,
    now,
    req.params.id
  );

  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  res.json(formatProject(row));
});

apiRouter.delete('/projects/:id', (req: Request, res: Response) => {
  const db = getDb();
  db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

// ─── Prompts ────────────────────────────────────────────────

apiRouter.get('/projects/:projectId/prompts', (req: Request, res: Response) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM prompts WHERE project_id = ? ORDER BY created_at DESC').all(req.params.projectId);
  res.json(rows.map(formatPrompt));
});

apiRouter.get('/prompts/:id', (req: Request, res: Response) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM prompts WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Prompt not found' });
  res.json(formatPrompt(row));
});

apiRouter.post('/projects/:projectId/prompts', (req: Request, res: Response) => {
  const db = getDb();
  const id = uuidv4();
  const now = new Date().toISOString();
  const { name, description, systemPrompt, userPromptTemplate, outputFields, model, supportsVision, responseFormat } = req.body;

  const variables = extractVariables(systemPrompt + ' ' + userPromptTemplate);

  db.prepare(`
    INSERT INTO prompts (id, project_id, name, description, system_prompt, user_prompt_template, output_fields, model, supports_vision, response_format, variables, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, req.params.projectId, name, description || null, systemPrompt, userPromptTemplate,
    JSON.stringify(outputFields || []), model || null, supportsVision ? 1 : 0,
    responseFormat || 'json', JSON.stringify(variables), now, now
  );

  const row = db.prepare('SELECT * FROM prompts WHERE id = ?').get(id);
  res.status(201).json(formatPrompt(row));
});

apiRouter.put('/prompts/:id', (req: Request, res: Response) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM prompts WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!existing) return res.status(404).json({ error: 'Prompt not found' });

  const { name, description, systemPrompt, userPromptTemplate, outputFields, model, supportsVision, responseFormat } = req.body;
  const now = new Date().toISOString();
  const sysPrompt = systemPrompt ?? existing.system_prompt;
  const userPrompt = userPromptTemplate ?? existing.user_prompt_template;
  const variables = extractVariables(String(sysPrompt) + ' ' + String(userPrompt));

  db.prepare(`
    UPDATE prompts SET name = ?, description = ?, system_prompt = ?, user_prompt_template = ?,
    output_fields = ?, model = ?, supports_vision = ?, response_format = ?, variables = ?, updated_at = ?
    WHERE id = ?
  `).run(
    name ?? existing.name, description ?? existing.description, sysPrompt, userPrompt,
    JSON.stringify(outputFields ?? JSON.parse(String(existing.output_fields))),
    model ?? (existing.model as string | null),
    supportsVision !== undefined ? (supportsVision ? 1 : 0) : (existing.supports_vision as number),
    responseFormat ?? existing.response_format, JSON.stringify(variables), now, req.params.id
  );

  const row = db.prepare('SELECT * FROM prompts WHERE id = ?').get(req.params.id);
  res.json(formatPrompt(row));
});

apiRouter.delete('/prompts/:id', (req: Request, res: Response) => {
  const db = getDb();
  db.prepare('DELETE FROM prompts WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

// ─── Field Mappings ─────────────────────────────────────────

apiRouter.get('/projects/:projectId/mappings', (req: Request, res: Response) => {
  const db = getDb();
  const { promptId } = req.query;
  let rows;
  if (promptId) {
    rows = db.prepare('SELECT * FROM field_mappings WHERE project_id = ? AND prompt_id = ?').all(req.params.projectId, String(promptId));
  } else {
    rows = db.prepare('SELECT * FROM field_mappings WHERE project_id = ?').all(req.params.projectId);
  }
  res.json(rows.map(formatMapping));
});

apiRouter.post('/projects/:projectId/mappings', (req: Request, res: Response) => {
  const db = getDb();
  const id = uuidv4();
  const { promptId, aiOutputKey, targetType, targetField, targetSelector, contentType, termTaxonomy } = req.body;

  db.prepare(`
    INSERT INTO field_mappings (id, project_id, prompt_id, ai_output_key, target_type, target_field, target_selector, content_type, term_taxonomy)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.params.projectId, promptId, aiOutputKey, targetType, targetField, targetSelector || null, contentType || null, termTaxonomy || null);

  const row = db.prepare('SELECT * FROM field_mappings WHERE id = ?').get(id);
  res.status(201).json(formatMapping(row));
});

apiRouter.put('/mappings/:id', (req: Request, res: Response) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM field_mappings WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!existing) return res.status(404).json({ error: 'Mapping not found' });

  const { aiOutputKey, targetType, targetField, targetSelector, contentType, termTaxonomy } = req.body;
  db.prepare(`
    UPDATE field_mappings SET ai_output_key = ?, target_type = ?, target_field = ?, target_selector = ?, content_type = ?, term_taxonomy = ?
    WHERE id = ?
  `).run(
    aiOutputKey ?? existing.ai_output_key, targetType ?? existing.target_type,
    targetField ?? existing.target_field, targetSelector ?? existing.target_selector,
    contentType ?? existing.content_type, termTaxonomy ?? existing.term_taxonomy, req.params.id
  );

  const row = db.prepare('SELECT * FROM field_mappings WHERE id = ?').get(req.params.id);
  res.json(formatMapping(row));
});

apiRouter.delete('/mappings/:id', (req: Request, res: Response) => {
  const db = getDb();
  db.prepare('DELETE FROM field_mappings WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

// ─── Generation ─────────────────────────────────────────────

apiRouter.post('/generate', async (req: Request, res: Response) => {
  try {
    const result = await generateContent(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Generation failed' });
  }
});

apiRouter.get('/results/:id', (req: Request, res: Response) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM generation_results WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!row) return res.status(404).json({ error: 'Result not found' });
  res.json({
    id: row.id,
    projectId: row.project_id,
    promptId: row.prompt_id,
    itemId: row.item_id,
    itemType: row.item_type,
    status: row.status,
    generatedContent: row.generated_content ? JSON.parse(String(row.generated_content)) : {},
    mappedFields: row.mapped_fields ? JSON.parse(String(row.mapped_fields)) : [],
    rawResponse: row.raw_response,
    error: row.error,
    tokensUsed: row.tokens_used,
    createdAt: row.created_at,
  });
});

// ─── Bulk Jobs ──────────────────────────────────────────────

apiRouter.post('/projects/:projectId/bulk-jobs', (req: Request, res: Response) => {
  const { promptId, name, items, applyMode } = req.body;
  const job = createBulkJob(req.params.projectId, promptId, name, items, applyMode);
  res.status(201).json(job);
});

apiRouter.get('/bulk-jobs/:id', (req: Request, res: Response) => {
  const job = getBulkJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json({ ...job, stats: getJobStats(job) });
});

apiRouter.post('/bulk-jobs/:id/start', async (req: Request, res: Response) => {
  const job = getBulkJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  const itemDataMap: Record<string, { sourceData: Record<string, unknown>; images?: Array<{ key: string; url: string }> }> =
    req.body.itemData || {};

  processBulkJob(req.params.id, async (item) => {
    const key = String(item.itemId);
    if (itemDataMap[key]) return itemDataMap[key];
    return { sourceData: { item_id: item.itemId, item_label: item.itemLabel } };
  }).catch(console.error);

  res.json({ message: 'Job started', jobId: req.params.id });
});

apiRouter.post('/bulk-jobs/:id/retry', (req: Request, res: Response) => {
  const job = retryFailedItems(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

apiRouter.get('/projects/:projectId/bulk-jobs', (req: Request, res: Response) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM bulk_jobs WHERE project_id = ? ORDER BY created_at DESC').all(req.params.projectId);
  res.json(rows.map((row) => {
    const r = row as Record<string, unknown>;
    const items = JSON.parse(String(r.items));
    const job = {
      id: r.id, projectId: r.project_id, promptId: r.prompt_id, name: r.name,
      status: r.status, applyMode: r.apply_mode, items,
      createdAt: r.created_at, updatedAt: r.updated_at, completedAt: r.completed_at,
    };
    return { ...job, stats: getJobStats(job as Parameters<typeof getJobStats>[0]) };
  }));
});

// ─── Formatters ─────────────────────────────────────────────

function formatProject(row: unknown) {
  const r = row as Record<string, unknown>;
  return {
    id: r.id, name: r.name, description: r.description,
    wordpressUrl: r.wordpress_url, wordpressApiKey: r.wordpress_api_key ? '***' : null,
    hasOpenaiKey: !!r.openai_api_key, defaultModel: r.default_model, defaultLanguage: r.default_language,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

function formatPrompt(row: unknown) {
  const r = row as Record<string, unknown>;
  return {
    id: r.id, projectId: r.project_id, name: r.name, description: r.description,
    systemPrompt: r.system_prompt, userPromptTemplate: r.user_prompt_template,
    outputFields: JSON.parse(String(r.output_fields)), model: r.model,
    supportsVision: r.supports_vision === 1, responseFormat: r.response_format,
    variables: JSON.parse(String(r.variables)), createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

function formatMapping(row: unknown) {
  const r = row as Record<string, unknown>;
  return {
    id: r.id, projectId: r.project_id, promptId: r.prompt_id,
    aiOutputKey: r.ai_output_key, targetType: r.target_type, targetField: r.target_field,
    targetSelector: r.target_selector, contentType: r.content_type, termTaxonomy: r.term_taxonomy,
  };
}
