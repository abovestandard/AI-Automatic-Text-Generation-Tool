import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AI_MODELS, extractVariables } from '@ai-content/core';
import { prisma } from '../db';
import { generateContent } from '../services/generation';
import { createBulkJob, getBulkJob, processBulkJob, retryFailedItems, getJobStats } from '../services/bulk-queue';
import {
  authenticate,
  requireAdmin,
  requireAdminOrSiteKey,
  requireProjectAccess,
  blockSiteKey,
  getAdminUser,
  canAccessProject,
} from '../middleware/auth';
import {
  formatProject,
  formatPrompt,
  formatMapping,
  formatGenerationResult,
  formatBulkJobRow,
} from '../lib/formatters';

export const apiRouter = Router();

apiRouter.get('/models', (_req: Request, res: Response) => {
  res.json(AI_MODELS);
});

apiRouter.get('/site/context', authenticate, requireAdminOrSiteKey, (req: Request, res: Response) => {
  if (req.auth?.type !== 'site') {
    res.status(403).json({ error: 'Site API key required' });
    return;
  }

  prisma.website.findUnique({
    where: { id: req.auth.websiteId! },
    include: { projects: { where: { id: req.auth.projectId! } } },
  }).then((website) => {
    if (!website) {
      res.status(404).json({ error: 'Website not found' });
      return;
    }
    const project = website.projects[0];
    res.json({
      websiteId: website.id,
      websiteName: website.name,
      projectId: req.auth!.projectId,
      projectName: project?.name,
      domain: website.domain,
    });
  }).catch((err) => {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load context' });
  });
});

apiRouter.use(authenticate);

// ─── Projects ───────────────────────────────────────────────

apiRouter.get('/projects', requireAdmin, async (req: Request, res: Response) => {
  const user = getAdminUser(req)!;
  const rows = user.isSuperAdmin
    ? await prisma.project.findMany({ orderBy: { createdAt: 'desc' } })
    : user.websiteIds.length === 0
      ? []
      : await prisma.project.findMany({
          where: { websiteId: { in: user.websiteIds } },
          orderBy: { createdAt: 'desc' },
        });
  res.json(rows.map(formatProject));
});

apiRouter.get('/projects/:id', requireAdminOrSiteKey, requireProjectAccess('id'), async (req: Request, res: Response) => {
  const row = await prisma.project.findUnique({ where: { id: req.params.id } });
  if (!row) return res.status(404).json({ error: 'Project not found' });
  res.json(formatProject(row));
});

apiRouter.post('/projects', requireAdmin, blockSiteKey, async (req: Request, res: Response) => {
  const user = getAdminUser(req)!;
  const { name, description, wordpressUrl, wordpressApiKey, openaiApiKey, geminiApiKey, defaultModel, defaultLanguage, websiteId } = req.body;

  if (!websiteId) {
    res.status(400).json({ error: 'websiteId is required' });
    return;
  }
  if (!user.isSuperAdmin && !user.websiteIds.includes(websiteId)) {
    res.status(403).json({ error: 'Access denied to this website' });
    return;
  }

  const row = await prisma.project.create({
    data: {
      name,
      description: description || null,
      wordpressUrl: wordpressUrl || null,
      wordpressApiKey: wordpressApiKey || null,
      openaiApiKey: openaiApiKey || null,
      geminiApiKey: geminiApiKey || null,
      defaultModel: defaultModel || 'gemini-3.6-flash',
      defaultLanguage: defaultLanguage || 'en',
      websiteId,
    },
  });
  res.status(201).json(formatProject(row));
});

apiRouter.put('/projects/:id', requireAdmin, blockSiteKey, requireProjectAccess('id'), async (req: Request, res: Response) => {
  const existing = await prisma.project.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Project not found' });

  const { name, description, wordpressUrl, wordpressApiKey, openaiApiKey, geminiApiKey, defaultModel, defaultLanguage } = req.body;

  const row = await prisma.project.update({
    where: { id: req.params.id },
    data: {
      name: name ?? existing.name,
      description: description !== undefined ? description : existing.description,
      wordpressUrl: wordpressUrl !== undefined ? wordpressUrl : existing.wordpressUrl,
      wordpressApiKey: wordpressApiKey !== undefined ? wordpressApiKey : existing.wordpressApiKey,
      openaiApiKey: openaiApiKey !== undefined && openaiApiKey !== '' ? openaiApiKey : existing.openaiApiKey,
      geminiApiKey: geminiApiKey !== undefined && geminiApiKey !== '' ? geminiApiKey : existing.geminiApiKey,
      defaultModel: defaultModel ?? existing.defaultModel,
      defaultLanguage: defaultLanguage ?? existing.defaultLanguage,
    },
  });
  res.json(formatProject(row));
});

apiRouter.delete('/projects/:id', requireAdmin, blockSiteKey, requireProjectAccess('id'), async (req: Request, res: Response) => {
  await prisma.project.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

// ─── Prompts ────────────────────────────────────────────────

apiRouter.get('/projects/:projectId/prompts', requireAdminOrSiteKey, requireProjectAccess('projectId'), async (req: Request, res: Response) => {
  const rows = await prisma.prompt.findMany({
    where: { projectId: req.params.projectId },
    orderBy: { createdAt: 'desc' },
  });
  res.json(rows.map(formatPrompt));
});

apiRouter.get('/prompts/:id', requireAdminOrSiteKey, async (req: Request, res: Response) => {
  const row = await prisma.prompt.findUnique({ where: { id: req.params.id } });
  if (!row) return res.status(404).json({ error: 'Prompt not found' });
  if (!(await canAccessProject(req, row.projectId))) {
    return res.status(403).json({ error: 'Access denied' });
  }
  res.json(formatPrompt(row));
});

apiRouter.post('/projects/:projectId/prompts', requireAdmin, blockSiteKey, requireProjectAccess('projectId'), async (req: Request, res: Response) => {
  const { name, description, systemPrompt, userPromptTemplate, outputFields, model, supportsVision, responseFormat } = req.body;
  const variables = extractVariables(systemPrompt + ' ' + userPromptTemplate);

  const row = await prisma.prompt.create({
    data: {
      projectId: req.params.projectId,
      name,
      description: description || null,
      systemPrompt,
      userPromptTemplate,
      outputFields: outputFields || [],
      model: model || null,
      supportsVision: !!supportsVision,
      responseFormat: responseFormat || 'json',
      variables,
    },
  });
  res.status(201).json(formatPrompt(row));
});

apiRouter.put('/prompts/:id', requireAdmin, blockSiteKey, async (req: Request, res: Response) => {
  const existing = await prisma.prompt.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Prompt not found' });
  if (!(await canAccessProject(req, existing.projectId))) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const { name, description, systemPrompt, userPromptTemplate, outputFields, model, supportsVision, responseFormat } = req.body;
  const sysPrompt = systemPrompt ?? existing.systemPrompt;
  const userPrompt = userPromptTemplate ?? existing.userPromptTemplate;
  const variables = extractVariables(String(sysPrompt) + ' ' + String(userPrompt));

  const row = await prisma.prompt.update({
    where: { id: req.params.id },
    data: {
      name: name ?? existing.name,
      description: description ?? existing.description,
      systemPrompt: sysPrompt,
      userPromptTemplate: userPrompt,
      outputFields: outputFields ?? existing.outputFields,
      model: model ?? existing.model,
      supportsVision: supportsVision !== undefined ? !!supportsVision : existing.supportsVision,
      responseFormat: responseFormat ?? existing.responseFormat,
      variables,
    },
  });
  res.json(formatPrompt(row));
});

apiRouter.delete('/prompts/:id', requireAdmin, blockSiteKey, async (req: Request, res: Response) => {
  const existing = await prisma.prompt.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Prompt not found' });
  if (!(await canAccessProject(req, existing.projectId))) {
    return res.status(403).json({ error: 'Access denied' });
  }
  await prisma.prompt.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

// ─── Field Mappings ─────────────────────────────────────────

apiRouter.get('/projects/:projectId/mappings', requireAdminOrSiteKey, requireProjectAccess('projectId'), async (req: Request, res: Response) => {
  const { promptId } = req.query;
  const rows = await prisma.fieldMapping.findMany({
    where: promptId
      ? { projectId: req.params.projectId, promptId: String(promptId) }
      : { projectId: req.params.projectId },
  });
  res.json(rows.map(formatMapping));
});

apiRouter.post('/projects/:projectId/mappings', requireAdmin, blockSiteKey, requireProjectAccess('projectId'), async (req: Request, res: Response) => {
  const { promptId, aiOutputKey, targetType, targetField, targetSelector, contentType, termTaxonomy } = req.body;
  const row = await prisma.fieldMapping.create({
    data: {
      projectId: req.params.projectId,
      promptId,
      aiOutputKey,
      targetType,
      targetField,
      targetSelector: targetSelector || null,
      contentType: contentType || null,
      termTaxonomy: termTaxonomy || null,
    },
  });
  res.status(201).json(formatMapping(row));
});

apiRouter.put('/mappings/:id', requireAdmin, blockSiteKey, async (req: Request, res: Response) => {
  const existing = await prisma.fieldMapping.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Mapping not found' });
  if (!(await canAccessProject(req, existing.projectId))) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const { aiOutputKey, targetType, targetField, targetSelector, contentType, termTaxonomy } = req.body;
  const row = await prisma.fieldMapping.update({
    where: { id: req.params.id },
    data: {
      aiOutputKey: aiOutputKey ?? existing.aiOutputKey,
      targetType: targetType ?? existing.targetType,
      targetField: targetField ?? existing.targetField,
      targetSelector: targetSelector ?? existing.targetSelector,
      contentType: contentType ?? existing.contentType,
      termTaxonomy: termTaxonomy ?? existing.termTaxonomy,
    },
  });
  res.json(formatMapping(row));
});

apiRouter.delete('/mappings/:id', requireAdmin, blockSiteKey, async (req: Request, res: Response) => {
  const existing = await prisma.fieldMapping.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Mapping not found' });
  if (!(await canAccessProject(req, existing.projectId))) {
    return res.status(403).json({ error: 'Access denied' });
  }
  await prisma.fieldMapping.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

// ─── Generation ─────────────────────────────────────────────

apiRouter.post('/generate', requireAdminOrSiteKey, async (req: Request, res: Response) => {
  const projectId = req.body.projectId as string;
  if (!projectId) {
    res.status(400).json({ error: 'projectId is required' });
    return;
  }
  if (!(await canAccessProject(req, projectId))) {
    res.status(403).json({ error: 'Access denied to this project' });
    return;
  }

  try {
    const result = await generateContent(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Generation failed' });
  }
});

apiRouter.get('/results/:id', requireAdminOrSiteKey, async (req: Request, res: Response) => {
  const row = await prisma.generationResult.findUnique({ where: { id: req.params.id } });
  if (!row) return res.status(404).json({ error: 'Result not found' });
  if (!(await canAccessProject(req, row.projectId))) {
    return res.status(403).json({ error: 'Access denied' });
  }
  res.json(formatGenerationResult(row));
});

// ─── Bulk Jobs ──────────────────────────────────────────────

apiRouter.post('/projects/:projectId/bulk-jobs', requireAdmin, blockSiteKey, requireProjectAccess('projectId'), async (req: Request, res: Response) => {
  const { promptId, name, items, applyMode } = req.body;
  const job = await createBulkJob(req.params.projectId, promptId, name, items, applyMode);
  res.status(201).json(job);
});

apiRouter.get('/bulk-jobs/:id', requireAdmin, blockSiteKey, async (req: Request, res: Response) => {
  const job = await getBulkJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (!(await canAccessProject(req, job.projectId))) {
    return res.status(403).json({ error: 'Access denied' });
  }
  res.json({ ...job, stats: getJobStats(job) });
});

apiRouter.post('/bulk-jobs/:id/start', requireAdmin, blockSiteKey, async (req: Request, res: Response) => {
  const job = await getBulkJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (!(await canAccessProject(req, job.projectId))) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const itemDataMap: Record<string, { sourceData: Record<string, unknown>; images?: Array<{ key: string; url: string }> }> =
    req.body.itemData || {};

  processBulkJob(req.params.id, async (item) => {
    const key = String(item.itemId);
    if (itemDataMap[key]) return itemDataMap[key];
    return { sourceData: { item_id: item.itemId, item_label: item.itemLabel } };
  }).catch(console.error);

  res.json({ message: 'Job started', jobId: req.params.id });
});

apiRouter.post('/bulk-jobs/:id/retry', requireAdmin, blockSiteKey, async (req: Request, res: Response) => {
  const job = await getBulkJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (!(await canAccessProject(req, job.projectId))) {
    return res.status(403).json({ error: 'Access denied' });
  }
  const retried = await retryFailedItems(req.params.id);
  if (!retried) return res.status(404).json({ error: 'Job not found' });
  res.json(retried);
});

apiRouter.get('/projects/:projectId/bulk-jobs', requireAdmin, blockSiteKey, requireProjectAccess('projectId'), async (req: Request, res: Response) => {
  const rows = await prisma.bulkJob.findMany({
    where: { projectId: req.params.projectId },
    orderBy: { createdAt: 'desc' },
  });
  res.json(rows.map((row) => {
    const job = formatBulkJobRow(row);
    return { ...job, stats: getJobStats(job) };
  }));
});
