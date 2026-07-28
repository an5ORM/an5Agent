import { z } from 'zod';

export interface Tool {
  name: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  outputSchema: z.ZodTypeAny;
  execute: (input: any, context?: ToolContext) => Promise<any>;
}

export interface ToolContext {
  schemaPath?: string;
  connectionString?: string;
}

export const FieldSchema = z.object({
  name: z.string().describe('Field/column name'),
  type: z.string().describe('Data type (e.g., String, Int, DateTime)'),
  isRequired: z.boolean().describe('Whether the field is required'),
  isUnique: z.boolean().optional().describe('Whether the field has a unique constraint'),
  isId: z.boolean().optional().describe('Whether the field is the primary key'),
  hasDefault: z.boolean().optional().describe('Whether the field has a default value'),
  dbType: z.string().optional().describe('Native database type (e.g., NVarChar, Int)'),
  relation: z.string().optional().describe('Relation target model if this is a relation field'),
});

export const ModelSchema = z.object({
  name: z.string().describe('Model/table name'),
  schema: z.string().optional().describe('Database schema (default: dbo)'),
  fields: z.array(FieldSchema).describe('Fields/columns of the model'),
  relations: z
    .array(
      z.object({
        fromField: z.string(),
        toModel: z.string(),
        toField: z.string(),
        type: z.enum(['one-to-many', 'many-to-one', 'one-to-one', 'many-to-many']),
      })
    )
    .optional()
    .describe('Relations to other models'),
});

export const QueryExplainSchema = z.object({
  original: z.string().describe('Original input query or request'),
  interpretedIntent: z.string().describe('What the query is trying to do'),
  generatedSql: z.string().optional().describe('Generated or parsed SQL'),
  tables: z.array(z.string()).describe('Tables involved'),
  estimatedComplexity: z.enum(['simple', 'moderate', 'complex']).describe('Query complexity'),
  notes: z.array(z.string()).optional().describe('Additional notes or warnings'),
});

export const SchemaIssueSchema = z.object({
  severity: z.enum(['info', 'warning', 'error']).describe('Issue severity'),
  model: z.string().describe('Affected model/table'),
  field: z.string().optional().describe('Affected field if applicable'),
  message: z.string().describe('Description of the issue'),
  suggestion: z.string().optional().describe('Suggested fix'),
});
