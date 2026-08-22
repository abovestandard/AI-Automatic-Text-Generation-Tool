/**
 * Prompt template engine – replaces {{variables}} with actual data.
 */

const VARIABLE_PATTERN = /\{\{(\w+)\}\}/g;

export function extractVariables(template: string): string[] {
  const vars = new Set<string>();
  let match: RegExpExecArray | null;
  const regex = new RegExp(VARIABLE_PATTERN.source, 'g');
  while ((match = regex.exec(template)) !== null) {
    vars.add(match[1]);
  }
  return Array.from(vars);
}

export function renderTemplate(
  template: string,
  data: Record<string, unknown>
): string {
  return template.replace(VARIABLE_PATTERN, (_, key: string) => {
    const value = data[key];
    if (value === undefined || value === null) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  });
}

export function buildOutputSchemaInstruction(
  outputFields: Array<{ key: string; label: string; description?: string; type: string }>
): string {
  const fields = outputFields.map((f) => {
    const desc = f.description ? ` – ${f.description}` : '';
    return `  "${f.key}": "${f.label}${desc} (${f.type})"`;
  });
  return [
    'Respond with a valid JSON object containing exactly these fields:',
    '{',
    fields.join(',\n'),
    '}',
    'Do not include any text outside the JSON object.',
  ].join('\n');
}

export function parseJsonResponse(text: string): Record<string, string> {
  const trimmed = text.trim();
  const jsonMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, trimmed];
  const jsonStr = (jsonMatch[1] ?? trimmed).trim();
  const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (value === null || value === undefined) {
      result[key] = '';
    } else if (typeof value === 'object') {
      result[key] = JSON.stringify(value);
    } else {
      result[key] = String(value);
    }
  }
  return result;
}
