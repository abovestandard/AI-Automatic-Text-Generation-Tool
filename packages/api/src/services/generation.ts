import {
  buildOutputSchemaInstruction,
  renderTemplate,
  parseJsonResponse,
  mapGeneratedContent,
  resolveModelId,
} from '@ai-content/core';
import type {
  GenerationRequest,
  GenerationResult,
  Prompt,
  FieldMapping,
} from '@ai-content/core';
import crypto from 'crypto';
import { prisma } from '../db';
import { completeAI } from './ai-providers';
import type { Prompt as PromptRow } from '@prisma/client';

function rowToPrompt(row: PromptRow): Prompt {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    description: row.description ?? undefined,
    systemPrompt: row.systemPrompt,
    userPromptTemplate: row.userPromptTemplate,
    outputFields: row.outputFields as unknown as Prompt['outputFields'],
    model: row.model ?? undefined,
    supportsVision: row.supportsVision,
    responseFormat: row.responseFormat as 'json' | 'text',
    variables: row.variables as string[],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function generateContent(
  request: GenerationRequest
): Promise<GenerationResult> {
  const resultId = crypto.randomUUID();

  const promptRow = await prisma.prompt.findFirst({
    where: { id: request.promptId, projectId: request.projectId },
  });

  if (!promptRow) {
    return errorResult(resultId, request, 'Prompt not found');
  }

  const projectRow = await prisma.project.findUnique({
    where: { id: request.projectId },
  });

  if (!projectRow) {
    return errorResult(resultId, request, 'Project not found');
  }

  const prompt = rowToPrompt(promptRow);
  const model = resolveModelId(prompt.model || projectRow.defaultModel || 'gemini-3.6-flash');

  if (request.acfAuto && !request.acfSchema?.outputFields?.length) {
    return errorResult(
      resultId,
      request,
      'ACF Auto Mode is enabled but no generatable ACF fields were found. Check your ACF field group assignment.'
    );
  }

  const useAcfAuto = Boolean(request.acfAuto && request.acfSchema?.outputFields?.length);
  const outputFields = useAcfAuto
    ? request.acfSchema!.outputFields
    : prompt.outputFields;

  const renderedUserPrompt = renderTemplate(prompt.userPromptTemplate, request.sourceData);
  const schemaInstruction = useAcfAuto
    ? request.acfSchema!.schemaInstruction
    : buildOutputSchemaInstruction(prompt.outputFields);
  const fullUserPrompt = `${renderedUserPrompt}\n\n${schemaInstruction}`;

  const images = prompt.supportsVision && request.images?.length
    ? request.images.map((img) => ({
        url: img.url,
        base64: img.base64,
        mimeType: img.mimeType,
      }))
    : undefined;

  try {
    const completion = await completeAI({
      model,
      systemPrompt: prompt.systemPrompt,
      userPrompt: fullUserPrompt,
      responseFormat: prompt.responseFormat,
      images,
      openaiApiKey: projectRow.openaiApiKey || process.env.OPENAI_API_KEY,
      geminiApiKey: projectRow.geminiApiKey || process.env.GEMINI_API_KEY,
    });

    const rawResponse = completion.content;
    let generatedContent: Record<string, string>;

    if (prompt.responseFormat === 'json') {
      try {
        generatedContent = parseJsonResponse(rawResponse);
      } catch (parseErr) {
        const parseMessage = parseErr instanceof Error ? parseErr.message : 'Invalid JSON';
        return errorResult(
          resultId,
          request,
          `Failed to parse AI JSON response: ${parseMessage}`
        );
      }
    } else {
      generatedContent = { content: rawResponse };
    }

    const mappingRows = await prisma.fieldMapping.findMany({
      where: { promptId: request.promptId },
    });

    const mappings: FieldMapping[] = mappingRows.map((r) => ({
      id: r.id,
      projectId: r.projectId,
      promptId: r.promptId,
      aiOutputKey: r.aiOutputKey,
      targetType: r.targetType as FieldMapping['targetType'],
      targetField: r.targetField,
      targetSelector: r.targetSelector ?? undefined,
      contentType: r.contentType ?? undefined,
      termTaxonomy: r.termTaxonomy ?? undefined,
    }));

    const autoMappings: FieldMapping[] = useAcfAuto
      ? (request.acfSchema!.mappings ?? []).map((m, i) => ({
          id: `acf-auto-${i}`,
          projectId: request.projectId,
          promptId: request.promptId,
          aiOutputKey: m.aiOutputKey,
          targetType: m.targetType as FieldMapping['targetType'],
          targetField: m.targetField,
        }))
      : [];

    const activeMappings = request.fieldMappings
      ?? (autoMappings.length ? autoMappings : mappings);
    const existingValues = extractExistingValues(request.sourceData);
    const mappedFields = mapGeneratedContent(
      generatedContent,
      activeMappings,
      existingValues,
      request.applyMode
    );

    const result: GenerationResult = {
      id: resultId,
      requestId: resultId,
      status: 'success',
      generatedContent,
      mappedFields,
      rawResponse,
      tokensUsed: completion.tokensUsed,
      createdAt: new Date().toISOString(),
      acfAutoUsed: useAcfAuto,
      acfFieldCount: useAcfAuto ? outputFields.length : undefined,
    };

    await prisma.generationResult.create({
      data: {
        id: resultId,
        projectId: request.projectId,
        promptId: request.promptId,
        itemId: String(request.itemId),
        itemType: request.itemType,
        status: 'success',
        generatedContent: generatedContent as object,
        mappedFields: mappedFields as object,
        rawResponse,
        tokensUsed: result.tokensUsed ?? null,
      },
    });

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown generation error';
    return errorResult(resultId, request, message);
  }
}

function extractExistingValues(sourceData: Record<string, unknown>): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(sourceData)) {
    if (typeof value === 'string') {
      values[key] = value;
    }
  }
  if (sourceData.acf && typeof sourceData.acf === 'object') {
    for (const [key, value] of Object.entries(sourceData.acf as Record<string, unknown>)) {
      if (typeof value === 'string') values[key] = value;
    }
  }
  return values;
}

async function errorResult(
  id: string,
  request: GenerationRequest,
  error: string
): Promise<GenerationResult> {
  const result: GenerationResult = {
    id,
    requestId: id,
    status: 'error',
    generatedContent: {},
    mappedFields: [],
    error,
    createdAt: new Date().toISOString(),
  };

  await prisma.generationResult.create({
    data: {
      id,
      projectId: request.projectId,
      promptId: request.promptId,
      itemId: String(request.itemId),
      itemType: request.itemType,
      status: 'error',
      error,
    },
  });

  return result;
}
