import type { FieldMapping, PromptOutputField } from './types';

export interface AcfSchemaField {
  name: string;
  label: string;
  type: string;
  path: string;
  children?: AcfSchemaField[];
  isRepeater?: boolean;
}

export interface AcfAutoSchema {
  outputFields: PromptOutputField[];
  mappings: Array<Pick<FieldMapping, 'aiOutputKey' | 'targetType' | 'targetField'>>;
  schemaInstruction: string;
}

/** Normalize schema payload from WordPress REST API. */
export function normalizeAcfAutoSchema(payload: AcfAutoSchema): AcfAutoSchema {
  return {
    outputFields: payload.outputFields ?? [],
    mappings: payload.mappings ?? [],
    schemaInstruction: payload.schemaInstruction ?? '',
  };
}
