import { z } from 'zod';
import type { Tool } from './tool-types';
import { retrieveSchema, retrieveQuerySamples } from '../rag/indexer';

const retrieveInputSchema = z.object({
  action: z.enum(['schema', 'queries']).describe('Action to perform'),
  query: z.string().describe('Natural language query for semantic search'),
  k: z.number().optional().describe('Max number of results to retrieve (default: 3)'),
});

const retrieveOutputSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('schema'),
    results: z.array(
      z.object({
        content: z.string(),
        score: z.number().optional(),
      })
    ),
    query: z.string(),
  }),
  z.object({
    action: z.literal('queries'),
    results: z.array(z.object({ content: z.string(), score: z.number().optional() })),
    query: z.string(),
  }),
]);

export const retrieveTool: Tool = {
  name: 'retrieve',
  description:
    'Semantic search over schema and queries. Actions: schema (find models/tables), queries (find similar SQL samples).',
  inputSchema: retrieveInputSchema,
  outputSchema: retrieveOutputSchema,
  async execute(input: z.infer<typeof retrieveInputSchema>, _context) {
    switch (input.action) {
      case 'schema': {
        try {
          const docs = await retrieveSchema(input.query, input.k || 3);
          return {
            action: 'schema' as const,
            results: docs.map((content, i) => ({ content, score: 1 - i * 0.1 })),
            query: input.query,
          };
        } catch (err: any) {
          return { action: 'schema' as const, results: [], query: input.query };
        }
      }
      case 'queries': {
        try {
          const docs = await retrieveQuerySamples(input.query, input.k || 3);
          return {
            action: 'queries' as const,
            results: docs.map((content, i) => ({ content, score: 1 - i * 0.1 })),
            query: input.query,
          };
        } catch (err: any) {
          return { action: 'queries' as const, results: [], query: input.query };
        }
      }
    }
  },
};
