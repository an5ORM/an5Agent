import { z } from 'zod';
import type { Tool } from './tool-types';
import { QueryExplainSchema } from './tool-types';

const queryInputSchema = z.object({
  action: z.enum(['generate', 'explain', 'validate']).describe('Action to perform'),
  description: z.string().optional().describe('Natural language description (for generate)'),
  sql: z.string().optional().describe('SQL query (for explain/validate)'),
  tables: z.array(z.string()).optional().describe('Specific tables to query (for generate)'),
  dialect: z.enum(['mssql', 'tsql']).optional().default('mssql').describe('SQL dialect (for generate)'),
});

const queryOutputSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('generate'),
    sql: z.string(),
    explanation: z.string(),
    tables: z.array(z.string()),
    warnings: z.array(z.string()).optional(),
  }),
  QueryExplainSchema.extend({ action: z.literal('explain') }),
  z.object({
    action: z.literal('validate'),
    isValid: z.boolean(),
    errors: z.array(z.string()),
    warnings: z.array(z.string()),
    suggestions: z.array(z.string()).optional(),
  }),
]);

export const queryTool: Tool = {
  name: 'query',
  description:
    'Work with SQL queries. Actions: generate (from description), explain (analyze SQL), validate (check SQL).',
  inputSchema: queryInputSchema,
  outputSchema: queryOutputSchema,
  async execute(input: z.infer<typeof queryInputSchema>, _context) {
    switch (input.action) {
      case 'generate': {
        const sql = generateSqlFromDescription(input.description || '', input.tables);
        return {
          action: 'generate' as const,
          sql,
          explanation: `Generated a T-SQL query${input.tables ? ` targeting tables: ${input.tables.join(', ')}` : ''} based on the description: "${input.description}"`,
          tables: input.tables ?? extractTableNames(sql),
          warnings: sql.includes('SELECT *') ? ['SELECT * retrieves all columns; consider specifying only needed columns for better performance'] : undefined,
        };
      }
      case 'explain': {
        return { action: 'explain' as const, ...explainSqlQuery(input.sql || '') };
      }
      case 'validate': {
        return { action: 'validate' as const, ...validateSqlQuery(input.sql || '') };
      }
    }
  },
};

function generateSqlFromDescription(description: string, tables?: string[]): string {
  const desc = description.toLowerCase();
  if (desc.includes('select') && desc.includes('from')) { return description; }
  if (desc.includes('count') && desc.includes('user')) { tables ??= ['Users']; return `SELECT COUNT(*) AS UserCount\nFROM [dbo].[${tables[0] ?? 'Users'}] WITH (NOLOCK);`; }
  if ((desc.includes('all') || desc.includes('list')) && (desc.includes('user') || desc.includes('customer'))) { tables ??= ['Users']; return `SELECT *\nFROM [dbo].[${tables[0] ?? 'Users'}] WITH (NOLOCK)\nORDER BY [createdAt] DESC;`; }
  if (desc.includes('recent') || desc.includes('latest') || desc.includes('last')) { tables ??= ['Orders']; return `SELECT TOP 10 *\nFROM [dbo].[${tables[0] ?? 'Orders'}] WITH (NOLOCK)\nORDER BY [createdAt] DESC;`; }
  if (desc.includes('join') || (desc.includes('with') && (desc.includes('order') || desc.includes('user')))) {
    return `SELECT u.[id], u.[email], u.[name], o.[id] AS OrderId, o.[total], o.[createdAt] AS OrderDate\nFROM [dbo].[User] u WITH (NOLOCK)\nLEFT JOIN [dbo].[Order] o WITH (NOLOCK) ON u.[id] = o.[userId]\nORDER BY u.[name] ASC;`;
  }
  tables ??= ['Users'];
  return `SELECT *\nFROM [dbo].[${tables[0] ?? 'Users'}] WITH (NOLOCK);`;
}

function extractTableNames(sql: string): string[] {
  const tables: string[] = [];
  const regex = /(?:FROM|JOIN)\s+\[?(\w+)\]?\.?\[?(\w+)\]?/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(sql)) !== null) {
    const t = match[2] ?? match[1];
    if (t !== undefined) tables.push(t);
  }
  return [...new Set(tables)];
}

function explainSqlQuery(sql: string) {
  const tables = extractTableNames(sql);
  const hasJoin = /\bJOIN\b/i.test(sql);
  const hasWhere = /\bWHERE\b/i.test(sql);
  const hasGroupBy = /\bGROUP\s+BY\b/i.test(sql);
  const hasSubquery = /\(\s*SELECT\b/i.test(sql);
  const hasAggregate = /\b(COUNT|SUM|AVG|MIN|MAX)\s*\(/i.test(sql);
  const hasNolock = /\bWITH\s*\(\s*NOLOCK\s*\)/i.test(sql);

  let complexity: 'simple' | 'moderate' | 'complex' = 'simple';
  if (hasSubquery || (hasJoin && hasAggregate && hasGroupBy)) complexity = 'complex';
  else if (hasJoin || hasGroupBy || hasAggregate) complexity = 'moderate';

  const notes: string[] = [];
  if (!hasNolock) notes.push('Consider adding WITH (NOLOCK) for read-only queries to avoid blocking');
  if (!hasWhere && /\bUPDATE|DELETE\b/i.test(sql)) notes.push('WARNING: No WHERE clause - this will affect ALL rows');
  if (hasSubquery) notes.push('Contains subquery - verify execution plan for performance');
  if (/\bSELECT\s+\*\b/i.test(sql)) notes.push('SELECT * returns all columns; consider selecting only needed columns');

  return {
    original: sql,
    interpretedIntent: hasJoin ? 'Joining multiple tables to retrieve related data' : hasAggregate ? 'Aggregating data across rows' : 'Retrieving rows from a table',
    generatedSql: sql,
    tables,
    estimatedComplexity: complexity,
    notes: notes.length > 0 ? notes : undefined,
  };
}

function validateSqlQuery(sql: string) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const suggestions: string[] = [];

  if (!sql || sql.trim().length === 0) { errors.push('Query is empty'); return { isValid: false, errors, warnings, suggestions: ['Provide a valid SQL query'] }; }

  const upper = sql.toUpperCase().trim();
  if (!/^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|MERGE|WITH|EXEC)\b/i.test(upper)) { errors.push('Query must start with a valid SQL statement'); }
  if (/\bDROP\b/i.test(upper)) warnings.push('Query contains DROP statement - verify this is intentional');
  if (/\bTRUNCATE\b/i.test(upper)) warnings.push('Query contains TRUNCATE - this will remove all data from the table');
  if (/\bEXEC\b|\bsp_executesql\b/i.test(upper)) warnings.push('Query uses dynamic execution - verify SQL injection is not possible');
  if (/'''.*OR.*1=1/i.test(upper) || /'''.*OR.*'1'='1/i.test(upper)) errors.push('Query appears to contain a SQL injection pattern');
  if (/\bSELECT\s+\*\b/i.test(upper)) suggestions.push('Replace SELECT * with specific column names for better performance and clarity');
  if (!/\bWHERE\b/i.test(upper) && /^\s*(UPDATE|DELETE)/i.test(upper)) errors.push('UPDATE/DELETE without WHERE clause will affect ALL rows - add a WHERE condition');

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    suggestions: suggestions.length > 0 ? suggestions : undefined,
  };
}
