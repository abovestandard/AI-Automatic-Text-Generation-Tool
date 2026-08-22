import { useEffect, useState } from 'react';
import { api, AIModel } from '../api';

interface ModelSelectProps {
  value: string;
  onChange: (value: string) => void;
  includeDefault?: boolean;
  defaultLabel?: string;
  id?: string;
}

export default function ModelSelect({ value, onChange, includeDefault, defaultLabel, id }: ModelSelectProps) {
  const [models, setModels] = useState<AIModel[]>([]);

  useEffect(() => {
    api.getModels().then(setModels).catch(() => {
      setModels([
        { id: 'gpt-4o', label: 'GPT-4o', provider: 'openai', supportsVision: true },
        { id: 'gpt-4o-mini', label: 'GPT-4o Mini', provider: 'openai', supportsVision: true },
        { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', provider: 'google', supportsVision: true, freeTier: true },
      ]);
    });
  }, []);

  const openaiModels = models.filter((m) => m.provider === 'openai');
  const googleModels = models.filter((m) => m.provider === 'google');

  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="model-select">
      {includeDefault && (
        <option value="">{defaultLabel || 'Project default'}</option>
      )}
      {openaiModels.length > 0 && (
        <optgroup label="OpenAI">
          {openaiModels.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}{m.description ? ` – ${m.description}` : ''}
            </option>
          ))}
        </optgroup>
      )}
      {googleModels.length > 0 && (
        <optgroup label="Google Gemini (free tier available)">
          {googleModels.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}{m.freeTier ? ' ★ Free' : ''}{m.description ? ` – ${m.description}` : ''}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}
