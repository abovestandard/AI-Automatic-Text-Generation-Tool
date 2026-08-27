import type { ApplyMode, FieldMapping, MappedField } from './types';

export function mapGeneratedContent(
  generatedContent: Record<string, string>,
  mappings: FieldMapping[],
  existingValues: Record<string, string> = {},
  applyMode: ApplyMode = 'preview'
): MappedField[] {
  return mappings.map((mapping) => {
    const value = generatedContent[mapping.aiOutputKey] ?? '';
    const existingKey = `${mapping.targetType}:${mapping.targetField}`;
    const existing = existingValues[existingKey] ?? existingValues[mapping.targetField] ?? '';

    let applied = false;
    let skippedReason: string | undefined;

    switch (applyMode) {
      case 'generate_only':
        applied = false;
        skippedReason = 'Generate only mode – not applied';
        break;
      case 'preview':
        applied = false;
        skippedReason = 'Preview mode – awaiting user approval';
        break;
      case 'empty_only':
        if (existing.trim()) {
          applied = false;
          skippedReason = 'Field already has content';
        } else {
          applied = true;
        }
        break;
      case 'replace':
      case 'save_draft':
      case 'publish':
        applied = true;
        break;
    }

    return {
      aiOutputKey: mapping.aiOutputKey,
      targetType: mapping.targetType,
      targetField: mapping.targetField,
      value,
      applied,
      skippedReason,
    };
  });
}

export function getMappingForPrompt(
  allMappings: FieldMapping[],
  promptId: string
): FieldMapping[] {
  return allMappings.filter((m) => m.promptId === promptId);
}
