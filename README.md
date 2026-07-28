# an5Agent

AI agent library for AN5 ORM. Provides 13 tools for schema exploration, query generation, database operations, code generation, and RAG-powered semantic search.

## Features

- **Schema tools** — List models, describe tables, explore relations
- **Query tools** — Generate, explain, validate SQL queries
- **Database tools** — Execute queries, health checks, table inspection
- **Codegen tools** — Generate client code, analyze schema health
- **RAG pipeline** — Semantic search over schema and query samples

## Installation

```bash
npm install
```

## Usage

```typescript
import { createAgent } from 'an5-agent';

const agent = createAgent();

// Process natural language questions
const response = await agent.process({
  userQuestion: 'List all users with their orders',
  toolContext: {
    schemaPath: '../an5Schema',
    connectionString: process.env.DATABASE_URL,
  },
});

console.log(response.answer);
console.log(response.toolCalls);

// Execute individual tools
const models = await agent.executeTool('listModels', {
  schemaPath: '../an5Schema',
});

const sql = await agent.executeTool('generateQuery', {
  description: 'Find top 10 customers by total spend',
});
```

## Available Tools

| Tool | Description |
|------|-------------|
| `listModels` | List all models in schema |
| `describeModel` | Get detailed model structure |
| `getRelations` | List all relations |
| `generateQuery` | Generate SQL from description |
| `explainQuery` | Analyze SQL query intent |
| `validateQuery` | Check SQL for errors |
| `executeQuery` | Run SELECT queries |
| `describeTable` | Get table columns and indexes |
| `healthCheck` | Check database connectivity |
| `generateClientCode` | Generate TS/Python/.NET code |
| `analyzeSchema` | Find schema issues |
| `retrieveSchema` | RAG semantic schema search |
| `retrieveQuerySamples` | RAG semantic query search |

## RAG Pipeline

Index schema and query samples for semantic search:

```bash
# Index schema into vector store
npm run rag:index

# Query samples are stored in query-samples.json
```

## Custom Tools

```typescript
import { createAgent, Tool } from 'an5-agent';

const myTool: Tool = {
  name: 'myCustomTool',
  description: 'Does something custom',
  inputSchema: z.object({ input: z.string() }),
  outputSchema: z.object({ result: z.string() }),
  async execute(input) {
    return { result: `Processed: ${input.input}` };
  },
};

const agent = createAgent([myTool]);
```

## Testing

```bash
# Unit tests
node test/unit.test.js

# Smoke test
npm test
```

## Architecture

```
User Question
     │
     ▼
An5Agent.process()
     │
     ├─► Schema Tools (listModels, describeModel, ...)
     ├─► Query Tools (generateQuery, explainQuery, ...)
     ├─► Database Tools (executeQuery, healthCheck, ...)
     ├─► Codegen Tools (generateClientCode, analyzeSchema)
     └─► RAG Tools (retrieveSchema, retrieveQuerySamples)
           │
           ▼
       AgentResponse { answer, toolCalls }
```

## License

MIT
