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
│   ├── schema-tools.ts   # schema action tool: list, describe, relations
│   ├── query-tools.ts    # query action tool: generate, explain, validate
│   ├── database-tools.ts # database action tool: execute, describe, health
│   ├── codegen-tools.ts  # generateClientCode, analyzeSchema
│   ├── rag-tools.ts      # retrieve action tool: schema, queries
│   ├── task-tools.ts     # task action tool: create, list, update, delete
│   └── metadata.ts       # Load metadata from an5Client
└── rag/
    ├── index.ts          # Genkit singleton + vector store config
    ├── indexer.ts         # Schema + query sample indexing
    └── embedder.ts       # Custom embedding (OpenAI/Cohere/dummy)
```

## Tools (7 total)

### Schema Exploration
- `schema` — Actions: `list`, `describe`, `relations`

### Query Operations
- `query` — Actions: `generate`, `explain`, `validate`

### Database Operations
- `database` — Actions: `execute`, `describe`, `health`

### Code Generation
- `generateClientCode` — Generate client code for TypeScript, Python, .NET/C#, Go or Rust via the real `@an5/orm` generator
- `analyzeSchema` — Analyze schema for design issues

### RAG (Retrieval-Augmented Generation)
- `retrieve` — Actions: `schema`, `queries`

### Task Workflows
- `task` — Actions: `create`, `list`, `update`, `delete`

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
