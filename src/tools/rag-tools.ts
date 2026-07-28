import { z } from 'zod';
import type { Tool } from './tool-types';
import { retrieveSchema, retrieveQuerySamples } from '../rag/indexer';

const retrieveSchemaInputSchema = z.object({
  query: z.string().describe('Natural language query describing the schema context needed (e.g. "user orders and their items")'),
  k: z.number().optional().describe('Max number of relevant schema documents to retrieve (default: 3)'),
});

const retrieveSchemaOutputSchema = z.object({
  results: z.array(
    z.object({
      content: z.string(),
      score: z.number().optional(),
    })
  ),
  query: z.string(),
});

export const retrieveSchemaTool: Tool = {
  name: 'retrieveSchema',
  description:
    'Retrieve relevant schema models/tables from the embedded vector store using semantic search. Use this before generating queries or analyzing schema when the user describes a domain concept. Returns model definitions most similar to the query.',
  inputSchema: retrieveSchemaInputSchema,
  outputSchema: retrieveSchemaOutputSchema,
  async execute(input: { query: string; k?: number }) {
    try {
      const docs = await retrieveSchema(input.query, input.k || 3);
      return {
        results: docs.map((content, i) => ({ content, score: 1 - i * 0.1 })),
        query: input.query,
      };
    } catch (err: any) {
      return { results: [], query: input.query };
    }
  },
};

const retrieveQueryInputSchema = z.object({
  query: z.string().describe('Natural language description of the query intent (e.g. "find top 10 customers by total spend")'),
  k: z.number().optional().describe('Max number of similar query samples to retrieve (default: 3)'),
});

const retrieveQueryOutputSchema = z.object({
  results: z.array(z.object({ content: z.string(), score: z.number().optional() })),
  query: z.string(),
});

export const retrieveQuerySamplesTool: Tool = {
  name: 'retrieveQuerySamples',
  description:
    'Retrieve similar SQL query samples from the vector store based on natural language intent. Use this to find past query patterns when constructing new queries or explaining query patterns.',
  inputSchema: retrieveQueryInputSchema,
  outputSchema: retrieveQueryOutputSchema,
  async execute(input: { query: string; k?: number }) {
    try {
      const docs = await retrieveQuerySamples(input.query, input.k || 3);
      return {
        results: docs.map((content, i) => ({ content, score: 1 - i * 0.1 })),
        query: input.query,
      };
    } catch (err: any) {
      return { results: [], query: input.query };
    }
  },
};
