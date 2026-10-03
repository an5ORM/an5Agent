/** Read column metadata through the adapter's supported raw-query API. */
export async function describeColumns(adapter: any, table: string, schema?: string): Promise<any[]> {
  if (adapter.dialect === 'sqlite') {
    // table-valued PRAGMA accepts a bound name and cannot inject identifiers.
    const rows = await adapter.exec('SELECT * FROM pragma_table_info(@p_0)', { p_0: table });
    return rows.map((row: any) => ({ name: row.name, type: row.type,
      isNullable: !row.notnull && !row.pk, isPrimaryKey: !!row.pk,
      ...(row.dflt_value != null ? { defaultValue: String(row.dflt_value) } : {}) }));
  }
  if (!['mssql', 'postgres', 'mysql'].includes(adapter.dialect)) {
    throw new Error(`Table introspection is unsupported for ${adapter.dialect}`);
  }
  const defaultSchema = adapter.dialect === 'postgres' ? 'public' : 'dbo';
  const schemaFilter = adapter.dialect === 'mysql' && !schema ? 'DATABASE()' : '@p_1';
  const rows = await adapter.exec(`SELECT c.COLUMN_NAME AS name, c.DATA_TYPE AS type,
    c.IS_NULLABLE AS nullable, c.CHARACTER_MAXIMUM_LENGTH AS max_length,
    c.COLUMN_DEFAULT AS default_value,
    CASE WHEN EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
      JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE k ON k.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
        AND k.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA AND k.TABLE_NAME = tc.TABLE_NAME
      WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY' AND tc.TABLE_NAME = c.TABLE_NAME
        AND tc.TABLE_SCHEMA = c.TABLE_SCHEMA AND k.COLUMN_NAME = c.COLUMN_NAME)
      THEN 1 ELSE 0 END AS primary_key
    FROM INFORMATION_SCHEMA.COLUMNS c
    WHERE c.TABLE_NAME = @p_0 AND c.TABLE_SCHEMA = ${schemaFilter}
    ORDER BY c.ORDINAL_POSITION`, { p_0: table, ...(schemaFilter === '@p_1' ? { p_1: schema || defaultSchema } : {}) });
  return rows.map((row: any) => ({ name: row.name, type: row.type,
    isNullable: row.nullable === 'YES', isPrimaryKey: Number(row.primary_key) === 1,
    ...(row.max_length != null ? { maxLength: Number(row.max_length) } : {}),
    ...(row.default_value != null ? { defaultValue: String(row.default_value) } : {}) }));
}
