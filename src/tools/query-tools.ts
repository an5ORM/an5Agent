import { z } from 'zod';
import type { Tool } from './tool-types';
import { QueryExplainSchema } from './tool-types';

const generateQueryInputSchema = z.object({
  description: z.string().describe('Natural language description of the query you want to generate'),
  tables: z.array(z.string()).optional().describe('Specific tables to query (optional, inferred if omitted)'),
  dialect: z.enum(['mssql', 'tsql']).optional().default('mssql').describe('SQL dialect'),
});

const generateQueryOutputSchema = z.object({
  sql: z.string().describe('Generated SQL query'),
  explanation: z.string().describe('Explanation of what the query does'),
  tables: z.array(z.string()).describe('Tables referenced in the query'),
  warnings: z.array(z.string()).optional().describe('Warnings about potential issues'),
});

export const generateQuery: Tool = {
  name: 'generateQuery',
  description:
    'Generate a SQL Server (T-SQL) query from a natural language description. Use this when the user wants to write a SQL query, needs help with SQL syntax, or wants to convert a question into a database query.',
  inputSchema: generateQueryInputSchema,
  outputSchema: generateQueryOutputSchema,
  async execute(input: { description: string; tables?: string[]; dialect?: string }, _context) {
    const sql = generateSqlFromDescription(input.description, input.tables);
    return {
      sql,
      explanation: `Generated a T-SQL query${input.tables ? ` targeting tables: ${input.tables.join(', ')}` : ''} based on the description: "${input.description}"`,
      tables: input.tables ?? extractTableNames(sql),
      warnings: sql.includes('SELECT *') ? ['SELECT * retrieves all columns; consider specifying only needed columns for better performance'] : undefined,
    };
  },
};

const explainQueryInputSchema = z.object({
  sql: z.string().describe('The SQL query to explain'),
});

const explainQueryOutputSchema = QueryExplainSchema;

export const explainQuery: Tool = {
  name: 'explainQuery',
  description:
    'Explain what a SQL Server query does, including the tables involved, conditions, joins, and estimated complexity. Use this when the user pastes a SQL query and wants to understand it, or needs help debugging a query.',
  inputSchema: explainQueryInputSchema,
  outputSchema: explainQueryOutputSchema,
  async execute(input: { sql: string }, _context) {
    return explainSqlQuery(input.sql);
  },
};

const validateQueryInputSchema = z.object({
  sql: z.string().describe('The SQL query to validate'),
  schemaPath: z.string().optional().describe('Path to .an5 schema for table/column validation'),
});

const validateQueryOutputSchema = z.object({
  isValid: z.boolean().describe('Whether the query appears valid'),
  errors: z.array(z.string()).describe('Validation errors found'),
  warnings: z.array(z.string()).describe('Warnings about potential issues'),
  suggestions: z.array(z.string()).optional().describe('Suggestions for improvement'),
});

export const validateQuery: Tool = {
  name: 'validateQuery',
  description:
    'Validate a SQL Server query for syntax issues, common mistakes, and best practices. Checks for things like missing WHERE clauses on UPDATE/DELETE, NOLOCK usage, and basic SQL injection risks.',
  inputSchema: validateQueryInputSchema,
  outputSchema: validateQueryOutputSchema,
  async execute(input: { sql: string; schemaPath?: string }, _context) {
    return validateSqlQuery(input.sql);
  },
};

function generateSqlFromDescription(description: string, tables?: string[]): string {
  const desc = description.toLowerCase();
  if (desc.includes('select') && desc.includes('from')) { return description; }
  if (desc.includes('count') && desc.includes('user')) { tables ??= ['Users']; return `SELECT COUNT(*) AS UserCount\nFROM [dbo].[${tables[0]}] WITH (NOLOCK);`; }
  if ((desc.includes('all') || desc.includes('list')) && (desc.includes('user') || desc.includes('customer'))) { tables ??= ['Users']; return `SELECT *\nFROM [dbo].[${tables[0]}] WITH (NOLOCK)\nORDER BY [createdAt] DESC;`; }
  if (desc.includes('recent') || desc.includes('latest') || desc.includes('last')) { tables ??= ['Orders']; return `SELECT TOP 10 *\nFROM [dbo].[${tables[0]}] WITH (NOLOCK)\nORDER BY [createdAt] DESC;`; }
  if (desc.includes('join') || (desc.includes('with') && (desc.includes('order') || desc.includes('user')))) {
    return `SELECT u.[id], u.[email], u.[name], o.[id] AS OrderId, o.[total], o.[createdAt] AS OrderDate\nFROM [dbo].[User] u WITH (NOLOCK)\nLEFT JOIN [dbo].[Order] o WITH (NOLOCK) ON u.[id] = o.[userId]\nORDER BY u.[name] ASC;`;
  }
  tables ??= ['Users'];
  return `SELECT *\nFROM [dbo].[${tables[0]}] WITH (NOLOCK);`;
}

function extractTableNames(sql: string): string[] {
  const tables: string[] = [];
  const regex = /(?:FROM|JOIN)\s+\[?(\w+)\]?\.?\[?(\w+)\]?/gi;
  let match;
  while ((match = regex.exec(sql)) !== null) { tables.push(match[2] || match[1]); }
  return [...new Set(tables)];
}

function explainSqlQuery(sql: string) {
  const tables = extractTableNames(sql);
  const hasJoin = /\bJOIN\b/i.test(sql);
  const hasWhere = /\bWHERE\b/i.test(sql);
  const hasGroupBy = /\bGROUP\s+BY\b/i.test(sql);
  const hasOrderBy = /\bORDER\s+BY\b/i.test(sql);
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
