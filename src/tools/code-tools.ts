import path from 'path';
import { z } from 'zod';
import { prepareCodeRequest } from '@an5/orm/generator';
import type { Tool } from './tool-types';

const inputSchema = z.object({ request: z.string().min(1).max(12000), language: z.enum(['auto', 'typescript', 'python', 'dotnet', 'golang', 'rust', 'java', 'kotlin', 'swift']).optional(), projectRoot: z.string().optional(), schemaPath: z.string().optional() });

export const generateCode: Tool = {
  name: 'generateCode',
  description: 'Prepare schema-grounded application code from a user request in the project language. Returns actual code when ToolContext.generateCode is configured; otherwise returns context for the calling model. Never writes files or executes SQL.',
  inputSchema,
  outputSchema: z.object({ status: z.enum(['generated', 'context_ready']), language: z.string(), code: z.string().optional() }).passthrough(),
  async execute(raw, context) {
    const input = inputSchema.parse(raw);
    const projectRoot = path.resolve(input.projectRoot || context?.projectRoot || process.cwd());
    if (typeof prepareCodeRequest !== 'function') throw new Error('Installed @an5/orm lacks prepareCodeRequest; upgrade the ORM');
    const prepared = await prepareCodeRequest({ request: input.request, projectRoot, schemaPath: input.schemaPath || context?.schemaPath || 'an5Schema', ...(input.language ? { language: input.language } : {}) });
    if (!context?.generateCode) return prepared;
    const code = await context.generateCode(prepared);
    if (typeof code !== 'string' || !code.trim()) throw new Error('Code generation returned empty code');
    return { ...prepared, status: 'generated', code, validation: 'not_compiled' };
  },
};
