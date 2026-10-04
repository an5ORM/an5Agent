# an5Agent

AI agent library for AN5 ORM. Provides 8 consolidated tools for schema exploration, query generation, database operations, code generation, task workflows, and RAG-powered semantic search.

## Features

- **Schema tools** — List models, describe tables, explore relations
- **Query tools** — Generate, explain, validate SQL queries
- **Database tools** — Execute queries, health checks, table inspection
- **Codegen tools** — Generate client code, analyze schema health
- **RAG pipeline** — Semantic search over schema and query samples

## Installation

```bash
npm install @an5/agent
```

## Usage

```typescript
import { createAgent } from '@an5/agent';

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
const models = await agent.executeTool('schema', {
  action: 'list',
  schemaPath: '../an5Schema',
});

const sql = await agent.executeTool('query', {
  action: 'generate',
  description: 'Find top 10 customers by total spend',
});
```

## Available Tools

| Tool | Actions | Description |
|------|---------|-------------|
| `schema` | `list`, `describe`, `relations` | Explore models, fields, and relationships |
| `query` | `generate`, `explain`, `validate` | Work with SQL from natural language or existing queries |
| `database` | `execute`, `describe`, `health` | Run safe database operations and inspect tables |
| `generateClientCode` | n/a | Generate TypeScript/Python/.NET/Go/Rust code via the `@an5/orm` generator |
| `analyzeSchema` | n/a | Find schema design issues |
| `retrieve` | `schema`, `queries` | RAG semantic search over schema and query samples |
| `task` | `create`, `list`, `update`, `delete` | Manage task workflows |

## RAG Pipeline

Index schema and query samples for semantic search:

```bash
# Index schema into vector store
npm run rag:index

# Query samples are stored in query-samples.json
```

## Custom Tools

```typescript
import { createAgent, Tool } from '@an5/agent';

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
    ├─► schema (list, describe, relations)
    ├─► query (generate, explain, validate)
    ├─► database (execute, describe, health)
    ├─► Codegen Tools (generateClientCode, analyzeSchema)
    ├─► retrieve (schema, queries)
    └─► task (create, list, update, delete)
           │
           ▼
       AgentResponse { answer, toolCalls }
```

## License

MIT

## Application code from a request

`generateCode` accepts `request`, optional `language` (`auto`, `typescript`, `python`, `dotnet`, `golang`, `rust`), `projectRoot` and `schemaPath`. Auto detection reads manifests in the selected application directory; multiple or missing language markers require an explicit selection. It returns parsed models and generated API references without changing the project. Configure `ToolContext.generateCode` to call your application's model; without it the status is `context_ready`, not generated code. Provider output is uncompiled and needs application validation. Vietnamese requests such as “Viết hàm lấy email của User” route directly to this tool. <!-- an5:allow-non-english -->

```ts
const response = await agent.process({
  userQuestion: 'Viết hàm lấy email của User', // an5:allow-non-english
  toolContext: {
    projectRoot: '/path/to/application',
    schemaPath: 'an5Schema',
    generateCode: async context => yourModel(JSON.stringify(context)),
  },
});
```

`yourModel` is an application callback, not a built-in AN5 model provider.
