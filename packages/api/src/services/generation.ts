import OpenAI from 'openai';
import {
  buildOutputSchemaInstruction,
  renderTemplate,
  parseJsonResponse,
  mapGeneratedContent,
  getMappingForPrompt,
} from '@ai-content/core';
import type {
  GenerationRequest,
  GenerationResult,
  Prompt,
  Project,
  FieldMapping,
  ImageInput,
} from '@ai-content/core';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db';

interface PromptRow {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  system_prompt: string;
  user_prompt_template: string;
  output_fields: string;
  model: string | null;
  supports_vision: number;
  response_format: string;
  variables: string;
}

interface ProjectRow {
  id: string;
  openai_api_key: string | null;
  default_model: string;
}

function rowToPrompt(row: PromptRow): Prompt {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    description: row.description ?? undefined,
    systemPrompt: row.system_prompt,
    userPromptTemplate: row.user_prompt_template,
    outputFields: JSON.parse(row.output_fields),
    model: row.model ?? undefined,
    supportsVision: row.supports_vision === 1,
    responseFormat: row.response_format as 'json' | 'text',
    variables: JSON.parse(row.variables),
    createdAt: '',
    updatedAt: '',
  };
}

export async function generateContent(
  request: GenerationRequest
): Promise<GenerationResult> {
  const db = getDb();
  const resultId = uuidv4();

  const promptRow = db
    .prepare('SELECT * FROM prompts WHERE id = ? AND project_id = ?')
    .get(request.promptId, request.projectId) as PromptRow | undefined;

  if (!promptRow) {
    return errorResult(resultId, request, 'Prompt not found');
  }

  const projectRow = db
    .prepare('SELECT * FROM projects WHERE id = ?')
    .get(request.projectId) as ProjectRow | undefined;

  if (!projectRow) {
    return errorResult(resultId, request, 'Project not found');
  }

  const apiKey = projectRow.openai_api_key || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return errorResult(resultId, request, 'OpenAI API key not configured');
  }

  const prompt = rowToPrompt(promptRow);
  const openai = new OpenAI({ apiKey });
  const model = prompt.model || projectRow.default_model || 'gpt-4o';

  const renderedUserPrompt = renderTemplate(prompt.userPromptTemplate, request.sourceData);
  const schemaInstruction = buildOutputSchemaInstruction(prompt.outputFields);
  const fullUserPrompt = `${renderedUserPrompt}\n\n${schemaInstruction}`;

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: prompt.systemPrompt },
  ];

  if (prompt.supportsVision && request.images && request.images.length > 0) {
    const contentParts: OpenAI.Chat.ChatCompletionContentPart[] = [
      { type: 'text', text: fullUserPrompt },
    ];

    for (const img of request.images) {
      const imageUrl = img.base64
        ? `data:${img.mimeType || 'image/jpeg'};base64,${img.base64}`
        : img.url;
      contentParts.push({
        type: 'image_url',
        image_url: { url: imageUrl, detail: 'auto' },
      });
    }

    messages.push({ role: 'user', content: contentParts });
  } else {
    messages.push({ role: 'user', content: fullUserPrompt });
  }

  try {
    const completion = await openai.chat.completions.create({
      model,
      messages,
      response_format: prompt.responseFormat === 'json' ? { type: 'json_object' } : undefined,
      temperature: 0.7,
    });

    const rawResponse = completion.choices[0]?.message?.content || '';
    let generatedContent: Record<string, string>;

    if (prompt.responseFormat === 'json') {
      generatedContent = parseJsonResponse(rawResponse);
    } else {
      generatedContent = { content: rawResponse };
    }

    const mappingRows = db
      .prepare('SELECT * FROM field_mappings WHERE prompt_id = ?')
      .all(request.promptId) as Array<{
      id: string;
      project_id: string;
      prompt_id: string;
      ai_output_key: string;
      target_type: string;
      target_field: string;
      target_selector: string | null;
      content_type: string | null;
      term_taxonomy: string | null;
    }>;

    const mappings: FieldMapping[] = mappingRows.map((r) => ({
      id: r.id,
      projectId: r.project_id,
      promptId: r.prompt_id,
      aiOutputKey: r.ai_output_key,
      targetType: r.target_type as FieldMapping['targetType'],
      targetField: r.target_field,
      targetSelector: r.target_selector ?? undefined,
      contentType: r.content_type ?? undefined,
      termTaxonomy: r.term_taxonomy ?? undefined,
    }));

    const existingValues = extractExistingValues(request.sourceData);
    const mappedFields = mapGeneratedContent(
      generatedContent,
      request.fieldMappings || mappings,
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
      tokensUsed: completion.usage?.total_tokens,
      createdAt: new Date().toISOString(),
    };

    db.prepare(`
      INSERT INTO generation_results
        (id, project_id, prompt_id, item_id, item_type, status, generated_content, mapped_fields, raw_response, tokens_used, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      resultId,
      request.projectId,
      request.promptId,
      String(request.itemId),
      request.itemType,
      'success',
      JSON.stringify(generatedContent),
      JSON.stringify(mappedFields),
      rawResponse,
      result.tokensUsed ?? null,
      result.createdAt
    );

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

function errorResult(
  id: string,
  request: GenerationRequest,
  error: string
): GenerationResult {
  const db = getDb();
  const result: GenerationResult = {
    id,
    requestId: id,
    status: 'error',
    generatedContent: {},
    mappedFields: [],
    error,
    createdAt: new Date().toISOString(),
  };

  db.prepare(`
    INSERT INTO generation_results
      (id, project_id, prompt_id, item_id, item_type, status, error, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    request.projectId,
    request.promptId,
    String(request.itemId),
    request.itemType,
    'error',
    error,
    result.createdAt
  );

  return result;
}
