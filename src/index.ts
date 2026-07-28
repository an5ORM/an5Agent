import type { Tool, ToolContext } from './tools';
import {
  listModels,
  describeModel,
  getRelations,
  generateQuery,
  explainQuery,
  validateQuery,
  executeQuery,
  describeTable,
  healthCheck,
  generateClientCode,
  analyzeSchema,
  retrieveSchemaTool,
  retrieveQuerySamplesTool,
  createTask,
  listTasks,
  updateTaskTool,
  deleteTask,
} from './tools';

export type { Tool, ToolContext } from './tools';
export {
  listModels,
  describeModel,
  getRelations,
  generateQuery,
  explainQuery,
  validateQuery,
  executeQuery,
  describeTable,
  healthCheck as databaseHealthCheck,
  generateClientCode,
  analyzeSchema,
  retrieveSchemaTool,
  retrieveQuerySamplesTool,
  createTask,
  listTasks,
  updateTaskTool,
  deleteTask,
} from './tools';
export { indexSchema, indexQuerySamples, retrieveSchema, retrieveQuerySamples, parseAn5Schema } from './rag/indexer';

export interface DatabaseInsight {
  databaseName?: string;
  schemaName?: string;
  tables: string[];
  notes?: string[];
}

export interface AgentContext {
  userQuestion: string;
  database?: DatabaseInsight;
  toolContext?: ToolContext;
}

export interface AgentResponse {
  answer: string;
  toolCalls?: Array<{ tool: string; input: unknown; output: unknown }>;
}

const DEFAULT_TOOLS: Tool[] = [
  listModels, describeModel, getRelations,
  generateQuery, explainQuery, validateQuery,
  executeQuery, describeTable, healthCheck,
  generateClientCode, analyzeSchema,
  retrieveSchemaTool, retrieveQuerySamplesTool,
  createTask, listTasks, updateTaskTool, deleteTask,
];

export class An5Agent {
  private tools: Map<string, Tool>;

  constructor(tools?: Tool[]) {
    this.tools = new Map();
    const allTools = [...DEFAULT_TOOLS, ...(tools ?? [])];
    for (const tool of allTools) {
      this.tools.set(tool.name, tool);
    }
  }

  getTools(): Tool[] {
    return Array.from(this.tools.values());
  }

  getTool(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  addTool(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  async executeTool(name: string, input: unknown, context?: ToolContext): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool "${name}" not found. Available tools: ${Array.from(this.tools.keys()).join(', ')}`);
    }
    return tool.execute(input, context);
  }

  async process(context: AgentContext): Promise<AgentResponse> {
    const { userQuestion, database, toolContext } = context;
    const q = userQuestion.toLowerCase();
    const toolCalls: Array<{ tool: string; input: unknown; output: unknown }> = [];

    if ((q.includes('list') || q.includes('what') || q.includes('show') || q.includes('schema?')) && (q.includes('model') || q.includes('table') || q.includes('schema'))) {
      const output = await this.executeTool('listModels', { schemaPath: toolContext?.schemaPath }, toolContext);
      toolCalls.push({ tool: 'listModels', input: {}, output });
    }

    if (q.includes('describe') || q.includes('detail') || q.includes('structure')) {
      const modelName = extractModelName(userQuestion);
      if (modelName) {
        const output = await this.executeTool('describeModel', { modelName, schemaPath: toolContext?.schemaPath }, toolContext);
        toolCalls.push({ tool: 'describeModel', input: { modelName }, output });
      }
    }

    if (q.includes('relation') || q.includes('foreign') || q.includes('join') || q.includes('connect')) {
      const output = await this.executeTool('getRelations', { schemaPath: toolContext?.schemaPath }, toolContext);
      toolCalls.push({ tool: 'getRelations', input: {}, output });
    }

    if (q.includes('query') || q.includes('sql') || q.includes('select') || q.includes('generate')) {
      const output = await this.executeTool('generateQuery', { description: userQuestion }, toolContext);
      toolCalls.push({ tool: 'generateQuery', input: { description: userQuestion }, output });
    }

    const sqlBlock = userQuestion.match(/```sql\s*([\s\S]*?)```/);
    if (sqlBlock) {
      if ((q.includes('explain') || q.includes('understand'))) {
        const output = await this.executeTool('explainQuery', { sql: sqlBlock[1] }, toolContext);
        toolCalls.push({ tool: 'explainQuery', input: { sql: sqlBlock[1] }, output });
      }
      if (q.includes('validate') || q.includes('check') || q.includes('test')) {
        const output = await this.executeTool('validateQuery', { sql: sqlBlock[1] }, toolContext);
        toolCalls.push({ tool: 'validateQuery', input: { sql: sqlBlock[1] }, output });
      }
      if (q.includes('execute') || q.includes('run')) {
        const output = await this.executeTool('executeQuery', { sql: sqlBlock[1], connectionString: toolContext?.connectionString }, toolContext);
        toolCalls.push({ tool: 'executeQuery', input: { sql: sqlBlock[1] }, output });
      }
    }

    if (q.includes('generate') && (q.includes('client') || q.includes('code') || q.includes('typescript') || q.includes('python') || q.includes('c#'))) {
      const lang = q.includes('python') ? 'python' : q.includes('c#') || q.includes('dotnet') ? 'dotnet' : 'typescript';
      const output = await this.executeTool('generateClientCode', { schemaPath: toolContext?.schemaPath || '.', language: lang }, toolContext);
      toolCalls.push({ tool: 'generateClientCode', input: { language: lang }, output });
    }

    if (q.includes('analyze') || q.includes('review') || q.includes('health')) {
      const output = await this.executeTool('analyzeSchema', { schemaPath: toolContext?.schemaPath }, toolContext);
      toolCalls.push({ tool: 'analyzeSchema', input: {}, output });
    }

    if (q.includes('ping') || q.includes('status') || q.includes('connect')) {
      const output = await this.executeTool('databaseHealthCheck', { connectionString: toolContext?.connectionString }, toolContext);
      toolCalls.push({ tool: 'databaseHealthCheck', input: {}, output });
    }

    if (q.includes('task') || q.includes('todo') || q.includes('issue list')) {
      if (q.includes('create') || q.includes('add') || q.includes('new')) {
        const typeMatch = userQuestion.match(/\b(bug|warning|todo|issue|optimization|concern)\b/i);
        const type = typeMatch ? typeMatch[1].toUpperCase() : 'ISSUE';
        const output = await this.executeTool('createTask', { type, description: userQuestion, workspaceDir: toolContext?.schemaPath }, toolContext);
        toolCalls.push({ tool: 'createTask', input: { type, description: userQuestion }, output });
      } else if (q.includes('delete') || q.includes('remove')) {
        const idMatch = userQuestion.match(/TASK-[\d]+-[\w]+/);
        if (idMatch) {
          const output = await this.executeTool('deleteTask', { taskId: idMatch[0], workspaceDir: toolContext?.schemaPath }, toolContext);
          toolCalls.push({ tool: 'deleteTask', input: { taskId: idMatch[0] }, output });
        }
      } else {
        const statusMatch = userQuestion.match(/\b(todo|in-progress|done)\b/i);
        const output = await this.executeTool('listTasks', { status: statusMatch?.[1], workspaceDir: toolContext?.schemaPath }, toolContext);
        toolCalls.push({ tool: 'listTasks', input: { status: statusMatch?.[1] }, output });
      }
    }

    return {
      toolCalls,
      answer: buildAnswer(userQuestion, database, toolCalls),
    };
  }
}

export function createAgent(tools?: Tool[]): An5Agent {
  return new An5Agent(tools);
}

function extractModelName(question: string): string | null {
  const patterns = [
    /describe\s+(?:the\s+)?(\w+)\s+(?:model|table)/i,
    /(\w+)\s+(?:model|table)\s+(?:details|structure|schema)/i,
    /tell\s+me\s+about\s+(\w+)/i,
    /what\s+is\s+(\w+)/i,
  ];
  for (const pattern of patterns) {
    const match = question.match(pattern);
    if (match) {
      const name = match[1];
      if (!['the', 'a', 'an', 'this', 'that', 'your', 'my'].includes(name.toLowerCase())) {
        return name;
      }
    }
  }
  return null;
}

function buildAnswer(question: string, _database?: DatabaseInsight, toolCalls?: Array<{ tool: string; input: unknown; output: unknown }>): string {
  if (toolCalls && toolCalls.length > 0) {
    return toolCalls.map((tc) => formatToolOutput(tc.tool, tc.output)).join('\n\n');
  }
  const parts = [`Question: ${question}`, 'No specific tools were triggered. Try asking about:'];
  parts.push('- List models/tables in the schema');
  parts.push('- Describe a specific table structure');
  parts.push('- Generate a SQL query from description');
  parts.push('- Explain or validate a SQL query');
  parts.push('- Analyze schema for issues');
  parts.push('- Generate client code');
  return parts.join('\n');
}

function formatToolOutput(toolName: string, output: any): string {
  switch (toolName) {
    case 'listModels': {
      const models = output.models ?? [];
      if (models.length === 0) return 'No models found in schema.';
      const lines = models.map((m: any) => `  - **${m.name}** (${m.fieldCount} fields, ${m.relationCount} relations)`);
      return `Found **${output.totalModels}** models:\n${lines.join('\n')}`;
    }
    case 'describeModel': {
      if (!output.found) return 'Model not found.';
      const m = output.model;
      if (!m) return 'Model not found.';
      const fields = (m.fields ?? []).map((f: any) =>
        `  - \`${f.name}\`: ${f.type}${f.isRequired ? '' : '?'}${f.isId ? ' 🔑' : ''}${f.isUnique ? ' ⚡' : ''}${f.dbType ? ` [${f.dbType}]` : ''}${f.relation ? ` → ${f.relation}` : ''}`
      ).join('\n');
      return `**${m.name}** ${m.schema ? `(${m.schema})` : ''}\n\nFields:\n${fields}`;
    }
    case 'getRelations': {
      const rels = output.relations ?? [];
      if (rels.length === 0) return 'No relations defined.';
      return rels.map((r: any) => `  - \`${r.fromModel}.${r.fromField}\` → \`${r.toModel}.${r.toField}\` (${r.type})`).join('\n');
    }
    case 'generateQuery': {
      return `**Generated SQL:**\n\`\`\`sql\n${output.sql}\n\`\`\`\n${output.explanation}${output.warnings?.length ? '\n\n⚠️ ' + output.warnings.join('\n') : ''}`;
    }
    case 'explainQuery': {
      return `**Query Analysis:**\n- Intent: ${output.interpretedIntent}\n- Tables: ${output.tables.join(', ')}\n- Complexity: ${output.estimatedComplexity}${output.notes?.length ? '\n- Notes:\n  - ' + output.notes.join('\n  - ') : ''}`;
    }
    case 'validateQuery': {
      if (output.isValid) return '✅ Query looks valid.' + (output.warnings?.length ? '\n\n⚠️ Warnings:\n- ' + output.warnings.join('\n- ') : '');
      return '❌ Validation errors:\n- ' + (output.errors ?? []).join('\n- ') + (output.suggestions?.length ? '\n\n💡 Suggestions:\n- ' + output.suggestions.join('\n- ') : '');
    }
    case 'executeQuery': {
      if (!output.success) return `❌ Query failed: ${output.error}`;
      const rows = output.rows ?? [];
      return `✅ Query returned ${output.rowCount} rows in ${output.executionTimeMs}ms\n\`\`\`json\n${JSON.stringify(rows, null, 2)}\n\`\`\``;
    }
    case 'databaseHealthCheck': {
      if (!output.connected) return `❌ Connection failed: ${output.error}`;
      return `✅ Connected to **${output.databaseName}**\n- Server: ${output.serverVersion}\n- Latency: ${output.latencyMs}ms`;
    }
    case 'generateClientCode': {
      if (!output.success) return `❌ Generation failed: ${output.message}`;
      return `✅ ${output.message}\n\nFiles:\n${output.files.map((f: any) => `  - \`${f.path}\``).join('\n')}`;
    }
    case 'analyzeSchema': {
      const issues = output.issues ?? [];
      const summary = output.summary ?? {};
      const parts = [`**Schema Analysis:**`];
      parts.push(`- Models: ${summary.totalModels}, Fields: ${summary.totalFields}, Relations: ${summary.totalRelations}`);
      if (summary.missingPrimaryKeys > 0) parts.push(`- ⚠️ Missing PKs: ${summary.missingPrimaryKeys}`);
      if (issues.length > 0) {
        parts.push('', 'Issues:');
        for (const issue of issues) {
          const icon = issue.severity === 'error' ? '❌' : issue.severity === 'warning' ? '⚠️' : '💡';
          parts.push(`  ${icon} [${issue.model}] ${issue.message}`);
          if (issue.suggestion) parts.push(`     → ${issue.suggestion}`);
        }
      }
      return parts.join('\n');
    }
    case 'createTask': {
      if (!output) return '❌ Failed to create task';
      return `✅ Task created: **${output.id}**\n- Title: ${output.title}\n- Priority: ${output.priority}\n- Status: ${output.status}`;
    }
    case 'listTasks': {
      const tasks = output ?? [];
      if (tasks.length === 0) return '📋 No tasks found.';
      const lines = tasks.map((t: any) => `  - \`${t.id}\` [${t.status}] ${t.priority} — ${t.title}`);
      return `📋 **${tasks.length}** tasks:\n${lines.join('\n')}`;
    }
    case 'updateTask': {
      if (!output) return '❌ Task not found or update failed';
      return `✅ Task ${output.id} updated: status=${output.status}, priority=${output.priority}`;
    }
    case 'deleteTask': {
      return output ? '✅ Task deleted' : '❌ Task not found';
    }
    default:
      return JSON.stringify(output, null, 2);
  }
}
