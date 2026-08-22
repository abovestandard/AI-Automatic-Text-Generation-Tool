export interface AIModel {
  id: string;
  label: string;
  provider: 'openai' | 'google';
  supportsVision: boolean;
  description?: string;
  freeTier?: boolean;
}

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
  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', provider: 'google', supportsVision: true, freeTier: true, description: 'Free tier – fast, multimodal' },
  { id: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite', provider: 'google', supportsVision: true, freeTier: true, description: 'Free tier – lightweight' },
  { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash', provider: 'google', supportsVision: true, freeTier: true, description: 'Free tier – reliable' },
  { id: 'gemini-1.5-flash-8b', label: 'Gemini 1.5 Flash 8B', provider: 'google', supportsVision: true, freeTier: true },
  { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro', provider: 'google', supportsVision: true, description: 'Higher quality Gemini' },
];

export function getModelProvider(modelId: string): 'openai' | 'google' {
  const model = AI_MODELS.find((m) => m.id === modelId);
  if (model) return model.provider;
  if (modelId.startsWith('gemini-')) return 'google';
  return 'openai';
}

export function getModelInfo(modelId: string): AIModel | undefined {
  return AI_MODELS.find((m) => m.id === modelId);
}

export function modelSupportsVision(modelId: string): boolean {
  const info = getModelInfo(modelId);
  if (info) return info.supportsVision;
  return modelId.startsWith('gemini-') || modelId.includes('4o') || modelId.includes('turbo');
}
