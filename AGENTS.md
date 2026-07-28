# an5Agent Agent Guide

## Purpose
an5Agent is the agent-facing library for the AN5 ORM ecosystem. It provides tools for database understanding, schema exploration, query generation, and RAG-powered context retrieval.

## Architecture

```
src/
├── index.ts              # An5Agent class (261 lines)
├── tools/
│   ├── index.ts          # Barrel export
│   ├── tool-types.ts     # Tool interface, Zod schemas
│   ├── schema-tools.ts   # listModels, describeModel, getRelations
│   ├── query-tools.ts    # generateQuery, explainQuery, validateQuery
│   ├── database-tools.ts # executeQuery, describeTable, healthCheck
│   ├── codegen-tools.ts  # generateClientCode, analyzeSchema
│   ├── rag-tools.ts      # retrieveSchema, retrieveQuerySamples
│   └── metadata.ts       # Load metadata from an5Client
└── rag/
    ├── index.ts          # Genkit singleton + vector store config
    ├── indexer.ts         # Schema + query sample indexing
    └── embedder.ts       # Custom embedding (OpenAI/Cohere/dummy)
```

## Tools (13 total)

### Schema Exploration
- `listModels` — List all models/tables in schema
- `describeModel` — Get detailed model info (fields, types, constraints)
- `getRelations` — Get foreign key relationships

### Query Operations
- `generateQuery` — Generate SQL from natural language description
- `explainQuery` — Analyze SQL intent, tables, complexity
- `validateQuery` — Validate SQL against schema

### Database Operations
- `executeQuery` — Run SQL queries (requires connection string)
- `describeTable` — Get column/index details for a table
- `databaseHealthCheck` — Test database connectivity

### Code Generation
- `generateClientCode` — Generate TS/Python/.NET client code
- `analyzeSchema` — Analyze schema for design issues

### RAG (Retrieval-Augmented Generation)
- `retrieveSchema` — Semantic search over schema documentation
- `retrieveQuerySamples` — Find similar query examples

## Tool Interface

```typescript
interface Tool {
  name: string;
  description: string;
  inputSchema: ZodTypeAny;
  outputSchema: ZodTypeAny;
  execute: (input: any, context?: ToolContext) => Promise<any>;
}
```

## Responsibilities
- Accept user questions and database context.
- Produce clear, structured, explainable responses.
- Provide RAG-powered context retrieval for schema understanding.
- Generate SQL queries from natural language.
- Validate and explain existing SQL queries.

## Genkit Integration
Uses Genkit v1.39 for:
- Local vector store for schema/query indexing
- Custom embedder with OpenAI/Cohere/dummy fallback
- Document indexing and semantic retrieval

## Extension Ideas
- Schema summarization (auto-generate table descriptions)
- Relationship-aware explanations (traverse FK chains)
- Multi-turn conversation memory (Genkit session)
- Streaming responses for real-time UI feedback
- Eval framework for RAG quality measurement
- Production vector store (Firestore/Pinecone)

## Cross-Repo Dependencies
| Module | How Used |
|--------|----------|
| `an5Adapters` | `An5Adapter` for DB operations |
| `an5Client` | Types and metadata |
| `an5Schema` | `.an5` schema files |
| `an5Tasks` | Task format for issue tracking |
