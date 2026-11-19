const importErrorCodes = new Set([2304, 2311, 2503, 2552, 2662, 2663, 2686, 2833]);

export interface SourceSpan {
  start: number;
  end: number;
}

export interface ProtocolEdit {
  startLine: number;
  startOffset: number;
  endLine: number;
  endOffset: number;
  newText: string;
}

export function typeNameSpan(
  text: string,
  binding: string,
  typeName: string,
): SourceSpan | undefined {
  const marker = `const ${binding} =`;
  const from = text.indexOf(marker);
  if (from < 0 || !/^[A-Za-z_$][\w$]*$/.test(typeName)) return undefined;
  const statement = statementEnd(text, from);
  const pattern = new RegExp(`\\b${typeName}\\b`);
  const match = pattern.exec(text.slice(from, statement));
  if (!match) return undefined;
  const start = from + match.index;
  return { start, end: start + typeName.length };
}

export function importErrorCodesIn(result: unknown, span: SourceSpan, text: string): number[] {
  const body = responseBody(result);
  if (!Array.isArray(body)) return [];
  const codes: number[] = [];
  for (const item of body) {
    if (!item || typeof item !== "object") continue;
    const code = (item as { code?: unknown }).code;
    if (typeof code !== "number" || !importErrorCodes.has(code) || codes.includes(code)) continue;
    const range = diagnosticRange(item, text);
    if (!range || range.end <= span.start || range.start >= span.end) continue;
    codes.push(code);
  }
  return codes;
}

export function firstImportEdits(filePath: string, result: unknown): ProtocolEdit[] {
  const body = responseBody(result);
  if (!Array.isArray(body)) return [];
  for (const item of body) {
    if (!item || typeof item !== "object" || (item as { fixName?: unknown }).fixName !== "import")
      continue;
    const edits = editsForFile(filePath, item);
    if (edits.length) return edits;
  }
  return [];
}

function editsForFile(filePath: string, fix: object): ProtocolEdit[] {
  const changes = (fix as { changes?: unknown }).changes;
  if (!Array.isArray(changes)) return [];
  const edits: ProtocolEdit[] = [];
  for (const change of changes) {
    if (!change || typeof change !== "object") continue;
    const fileName = (change as { fileName?: unknown }).fileName;
    if (typeof fileName !== "string" || !sameFile(fileName, filePath)) continue;
    const textChanges = (change as { textChanges?: unknown }).textChanges;
    if (!Array.isArray(textChanges)) continue;
    for (const textChange of textChanges) {
      const edit = protocolEdit(textChange);
      if (edit) edits.push(edit);
    }
  }
  return edits;
}

function protocolEdit(value: unknown): ProtocolEdit | undefined {
  if (!value || typeof value !== "object") return undefined;
  const change = value as { start?: unknown; end?: unknown; newText?: unknown };
  const start = point(change.start);
  const end = point(change.end);
  if (!start || !end || typeof change.newText !== "string") return undefined;
  return {
    startLine: start.line,
    startOffset: start.offset,
    endLine: end.line,
    endOffset: end.offset,
    newText: change.newText,
  };
}

function point(value: unknown): { line: number; offset: number } | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as { line?: unknown; offset?: unknown };
  if (typeof candidate.line !== "number" || typeof candidate.offset !== "number") return undefined;
  return { line: candidate.line, offset: candidate.offset };
}

function diagnosticRange(item: object, text: string): SourceSpan | undefined {
  const startLocation = (item as { startLocation?: unknown }).startLocation;
  const endLocation = (item as { endLocation?: unknown }).endLocation;
  const start = lineOffset(startLocation, text);
  const end = lineOffset(endLocation, text);
  if (start === undefined || end === undefined) return undefined;
  return { start, end };
}

function lineOffset(value: unknown, text: string): number | undefined {
  if (!value || typeof value !== "object") return undefined;
  const point = value as { line?: unknown; offset?: unknown };
  if (typeof point.line !== "number" || typeof point.offset !== "number") return undefined;
  let line = 1;
  let index = 0;
  while (line < point.line && index < text.length) {
    if (text[index] === "\n") line += 1;
    index += 1;
  }
  if (line !== point.line) return undefined;
  return index + point.offset - 1;
}

function responseBody(result: unknown): unknown {
  if (!result || typeof result !== "object") return undefined;
  const record = result as { success?: boolean; body?: unknown };
  if (record.success === false) return undefined;
  return "body" in record ? record.body : result;
}

function sameFile(left: string, right: string): boolean {
  return left.replaceAll("\\", "/") === right.replaceAll("\\", "/");
}

function statementEnd(text: string, start: number): number {
  let depth = 0;
  let quote = "";
  for (let index = start; index < text.length; index += 1) {
    const character = text[index] ?? "";
    if (quote) {
      if (character === "\\") {
        index += 1;
        continue;
      }
      if (character === quote) quote = "";
      continue;
    }
    if (character === "'" || character === '"' || character === "`") {
      quote = character;
      continue;
    }
    if (character === "(" || character === "{" || character === "[") depth += 1;
    else if ((character === ")" || character === "}" || character === "]") && depth > 0) depth -= 1;
    else if (character === ";" && depth === 0) return index + 1;
  }
  return text.length;
}
