export interface AIModel {
  id: string;
  label: string;
  provider: 'openai' | 'google';
  supportsVision: boolean;
  description?: string;
  freeTier?: boolean;
}

/** Maps deprecated model IDs to their current replacements. */
export const DEPRECATED_MODEL_MAP: Record<string, string> = {
  'gemini-2.0-flash': 'gemini-3.6-flash',
  'gemini-2.0-flash-lite': 'gemini-3.5-flash-lite',
  'gemini-1.5-flash': 'gemini-3.6-flash',
  'gemini-1.5-flash-8b': 'gemini-3.5-flash-lite',
  'gemini-1.5-pro': 'gemini-3.6-flash',
};

export const AI_MODELS: AIModel[] = [
  // OpenAI
  { id: 'gpt-4o', label: 'GPT-4o', provider: 'openai', supportsVision: true, description: 'Best overall quality' },
  { id: 'gpt-4o-mini', label: 'GPT-4o Mini', provider: 'openai', supportsVision: true, description: 'Fast and affordable' },
  { id: 'gpt-4-turbo', label: 'GPT-4 Turbo', provider: 'openai', supportsVision: true },
  { id: 'gpt-4', label: 'GPT-4', provider: 'openai', supportsVision: false },
  { id: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo', provider: 'openai', supportsVision: false, description: 'Legacy, cheapest OpenAI' },
  { id: 'o1', label: 'o1', provider: 'openai', supportsVision: true, description: 'Advanced reasoning' },
  { id: 'o1-mini', label: 'o1 Mini', provider: 'openai', supportsVision: false },
  { id: 'o3-mini', label: 'o3 Mini', provider: 'openai', supportsVision: false, description: 'Latest reasoning model' },
  // Google Gemini (free tier available)
  { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash', provider: 'google', supportsVision: true, freeTier: true, description: 'Recommended – fast, multimodal, free tier' },
  { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash Lite', provider: 'google', supportsVision: true, freeTier: true, description: 'Free tier – fastest, lowest cost' },
  { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash', provider: 'google', supportsVision: true, freeTier: true, description: 'Free tier – balanced' },
];

export function resolveModelId(modelId: string): string {
  return DEPRECATED_MODEL_MAP[modelId] || modelId;
}

export function getModelProvider(modelId: string): 'openai' | 'google' {
  const resolved = resolveModelId(modelId);
  const model = AI_MODELS.find((m) => m.id === resolved);
  if (model) return model.provider;
  if (resolved.startsWith('gemini-')) return 'google';
  return 'openai';
}

export function getModelInfo(modelId: string): AIModel | undefined {
  return AI_MODELS.find((m) => m.id === resolveModelId(modelId));
}

export function modelSupportsVision(modelId: string): boolean {
  const info = getModelInfo(modelId);
  if (info) return info.supportsVision;
  const resolved = resolveModelId(modelId);
  return resolved.startsWith('gemini-') || resolved.includes('4o') || resolved.includes('turbo');
}
