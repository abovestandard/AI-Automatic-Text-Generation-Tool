import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getModelProvider } from '@ai-content/core';

export interface AICompletionRequest {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  responseFormat: 'json' | 'text';
  images?: Array<{ url: string; base64?: string; mimeType?: string }>;
  openaiApiKey?: string;
  geminiApiKey?: string;
}

export interface AICompletionResult {
  content: string;
  tokensUsed?: number;
  provider: 'openai' | 'google';
}

export async function completeAI(request: AICompletionRequest): Promise<AICompletionResult> {
  const provider = getModelProvider(request.model);

  if (provider === 'google') {
    return completeGemini(request);
  }
  return completeOpenAI(request);
}

async function completeOpenAI(request: AICompletionRequest): Promise<AICompletionResult> {
  const apiKey = request.openaiApiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OpenAI API key not configured. Add it in Project Settings.');
  }

  const openai = new OpenAI({ apiKey });
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: request.systemPrompt },
  ];

  if (request.images && request.images.length > 0) {
    const parts: OpenAI.Chat.ChatCompletionContentPart[] = [
      { type: 'text', text: request.userPrompt },
    ];
    for (const img of request.images) {
      const imageUrl = img.base64
        ? `data:${img.mimeType || 'image/jpeg'};base64,${img.base64}`
        : img.url;
      parts.push({ type: 'image_url', image_url: { url: imageUrl, detail: 'auto' } });
    }
    messages.push({ role: 'user', content: parts });
  } else {
    messages.push({ role: 'user', content: request.userPrompt });
  }

  const completion = await openai.chat.completions.create({
    model: request.model,
    messages,
    response_format: request.responseFormat === 'json' ? { type: 'json_object' } : undefined,
    temperature: 0.7,
  });

  return {
    content: completion.choices[0]?.message?.content || '',
    tokensUsed: completion.usage?.total_tokens,
    provider: 'openai',
  };
}

async function completeGemini(request: AICompletionRequest): Promise<AICompletionResult> {
  const apiKey = request.geminiApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Google Gemini API key not configured. Get a free key at https://aistudio.google.com/apikey');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const generationConfig: Record<string, unknown> = {
    temperature: 0.7,
  };
  if (request.responseFormat === 'json') {
    generationConfig.responseMimeType = 'application/json';
  }

  const model = genAI.getGenerativeModel({
    model: request.model,
    systemInstruction: request.systemPrompt,
    generationConfig,
  });

  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
    { text: request.userPrompt },
  ];

  if (request.images && request.images.length > 0) {
    for (const img of request.images) {
      if (img.base64) {
        parts.push({
          inlineData: {
            mimeType: img.mimeType || 'image/jpeg',
            data: img.base64,
          },
        });
      } else if (img.url) {
        try {
          const response = await fetch(img.url);
          const buffer = await response.arrayBuffer();
          const base64 = Buffer.from(buffer).toString('base64');
          const mimeType = response.headers.get('content-type') || 'image/jpeg';
          parts.push({ inlineData: { mimeType, data: base64 } });
        } catch {
          // Skip images that fail to fetch
        }
      }
    }
  }

  const result = await model.generateContent({ contents: [{ role: 'user', parts }] });
  const content = result.response.text();

  return {
    content,
    tokensUsed: result.response.usageMetadata?.totalTokenCount,
    provider: 'google',
  };
}
