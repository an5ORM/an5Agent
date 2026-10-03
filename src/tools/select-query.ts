/** Conservative guard for one SELECT; quoted text and comments are not SQL keywords.
 * Database permissions remain the authority for functions with side effects.
 */
export function assertSelectQuery(sql: string): void {
  const tokens: string[] = [];
  let ended = false;
  for (let i = 0; i < sql.length;) {
    const rest = sql.slice(i);
    if (/^\s/.test(rest)) { i++; continue; }
    if (rest.startsWith('--')) { const end = sql.indexOf('\n', i); i = end < 0 ? sql.length : end + 1; continue; }
    if (/^\/\*[!+]|^\/\*M!/i.test(rest)) throw new Error('Executable SQL comments are not allowed.');
    if (rest.startsWith('/*')) {
      let depth = 1; i += 2;
      while (i < sql.length && depth) {
        if (sql.startsWith('/*', i)) throw new Error('Nested SQL comments are not allowed.');
        else if (sql.startsWith('*/', i)) { depth--; i += 2; }
        else i++;
      }
      if (depth) throw new Error('Unterminated SQL comment.');
      continue;
    }
    if (ended) throw new Error('Multiple statements are not allowed in one call.');
    const quote = sql[i];
    if (quote === "'" || quote === '"' || quote === '`' || quote === '[') {
      const close = quote === '[' ? ']' : quote;
      let closed = false; i++;
      while (i < sql.length) {
        // Backslash quoting varies by driver configuration; refuse ambiguous text.
        if (sql[i] === '\\') throw new Error('Use doubled quotes instead of backslash SQL escapes.');
        if (sql[i++] === close) {
          if (sql[i] === close) { i++; continue; }
          closed = true; break;
        }
      }
      if (!closed) throw new Error('Unterminated SQL quote.');
      continue;
    }
    const dollar = rest.match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)?.[0];
    if (dollar) {
      const end = sql.indexOf(dollar, i + dollar.length);
      if (end < 0) throw new Error('Unterminated SQL quote.');
      i = end + dollar.length; continue;
    }
    if (quote === ';') { ended = true; i++; continue; }
    const word = rest.match(/^[A-Za-z_][A-Za-z0-9_$]*/)?.[0];
    if (word) { tokens.push(word.toUpperCase()); i += word.length; }
    else i++;
  }
  if (tokens[0] !== 'SELECT') throw new Error('Only SELECT statements are allowed.');
  if (tokens.some(token => ['INTO', 'INSERT', 'UPDATE', 'DELETE', 'MERGE', 'CREATE', 'ALTER', 'DROP', 'EXEC', 'EXECUTE', 'CALL', 'OUTFILE', 'DUMPFILE', 'LOCK'].includes(token))) {
    throw new Error('Only read-only SELECT statements are allowed.');
  }
}
