import type {
  Project,
  Prompt,
  FieldMapping,
  Website,
  BulkJob,
  GenerationResult as GenerationResultRow,
} from '@prisma/client';
import type { BulkJob as BulkJobType, BulkJobItem } from '@ai-content/core';

export function formatWebsite(row: Website) {
  return {
    id: row.id,
    name: row.name,
    domain: row.domain,
    slug: row.slug,
    defaultProjectId: row.defaultProjectId,
    settings: (row.settings as Record<string, unknown>) ?? {},
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function formatProject(row: Project) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    websiteId: row.websiteId,
    wordpressUrl: row.wordpressUrl,
    wordpressApiKey: row.wordpressApiKey ? '***' : null,
    hasOpenaiKey: !!row.openaiApiKey,
    hasGeminiKey: !!row.geminiApiKey,
    defaultModel: row.defaultModel,
    defaultLanguage: row.defaultLanguage,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function formatProjectSummary(row: Project) {
  return {
    id: row.id,
    name: row.name,
    websiteId: row.websiteId,
    defaultModel: row.defaultModel,
    createdAt: row.createdAt.toISOString(),
  };
}

export function formatPrompt(row: Prompt) {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    description: row.description,
    systemPrompt: row.systemPrompt,
    userPromptTemplate: row.userPromptTemplate,
    outputFields: row.outputFields as unknown[],
    model: row.model,
    supportsVision: row.supportsVision,
    responseFormat: row.responseFormat,
    variables: row.variables as string[],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function formatMapping(row: FieldMapping) {
  return {
    id: row.id,
    projectId: row.projectId,
    promptId: row.promptId,
    aiOutputKey: row.aiOutputKey,
    targetType: row.targetType,
    targetField: row.targetField,
    targetSelector: row.targetSelector,
    contentType: row.contentType,
    termTaxonomy: row.termTaxonomy,
  };
}

export function formatGenerationResult(row: GenerationResultRow) {
  return {
    id: row.id,
    projectId: row.projectId,
    promptId: row.promptId,
    itemId: row.itemId,
    itemType: row.itemType,
    status: row.status,
    generatedContent: (row.generatedContent as Record<string, string>) ?? {},
    mappedFields: (row.mappedFields as unknown[]) ?? [],
    rawResponse: row.rawResponse,
    error: row.error,
    tokensUsed: row.tokensUsed,
    createdAt: row.createdAt.toISOString(),
  };
}

export function formatBulkJobRow(row: BulkJob): BulkJobType {
  return {
    id: row.id,
    projectId: row.projectId,
    promptId: row.promptId,
    name: row.name,
    status: row.status as BulkJobType['status'],
    applyMode: row.applyMode as BulkJobType['applyMode'],
    items: row.items as unknown as BulkJobItem[],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    completedAt: row.completedAt?.toISOString(),
  };
}
