import ts from "typescript";

export interface InferredCallback {
  /** Type text per parameter. A hole means that parameter keeps no annotation. */
  types: readonly (string | undefined)[];
  /** The contextual parameter is optional and the source has no `?` yet. */
  optional: readonly boolean[];
  /** Type-parameter list, including the angle brackets. */
  typeParameters?: string;
}

const pairs: Record<string, string> = { "(": ")", "{": "}", "[": "]", "<": ">" };

export function parameterTypesFromSignature(display: string): InferredCallback | undefined {
  const keyword = display.indexOf("function");
  if (keyword < 0) return undefined;
  let index = keyword + "function".length;
  if (display[index] === ")") index += 1;
  index = skipSpace(display, index);
  let typeParameters: string | undefined;
  if (display[index] === "<") {
    const end = matchingClose(display, index);
    typeParameters = `<${display
      .slice(index + 1, end - 1)
      .trim()
      .replace(/\s+/g, " ")}>`;
    index = end;
  }
  index = skipSpace(display, index);
  if (display[index] !== "(") return undefined;
  const listEnd = matchingClose(display, index);
  const types: (string | undefined)[] = [];
  const optional: boolean[] = [];
  for (const parameter of splitTopLevel(display.slice(index + 1, listEnd - 1), ",")) {
    const parsed = splitParameter(parameter);
    types.push(parsed.type);
    optional.push(parsed.optional);
  }
  return { types, optional, typeParameters: typeParameters === "<>" ? undefined : typeParameters };
}

export function callbackNeedsTypes(expression: ts.Expression): boolean {
  const fn = callbackFunction(expression);
  return !!fn?.parameters.some((parameter) => !parameter.type);
}

export function callbackQuickInfoOffset(
  sourceFile: ts.SourceFile,
  expression: ts.Expression,
): number | undefined {
  const fn = callbackFunction(expression);
  if (!fn) return undefined;
  if (ts.isArrowFunction(fn)) return fn.equalsGreaterThanToken.getStart(sourceFile);
  const keyword = fn
    .getChildren(sourceFile)
    .find((child) => child.kind === ts.SyntaxKind.FunctionKeyword);
  return (keyword ?? fn).getStart(sourceFile);
}

export function annotateCallback(
  sourceFile: ts.SourceFile,
  expression: ts.Expression,
  inferred: InferredCallback | undefined,
): string {
  const text = expression.getText(sourceFile);
  const fn = callbackFunction(expression);
  if (!fn || !inferred) return text;
  const origin = expression.getStart(sourceFile);
  const bare = ts.isArrowFunction(fn) && lacksParens(fn, sourceFile);
  const insertions: { index: number; text: string }[] = [];
  let annotated = false;
  for (let index = 0; index < fn.parameters.length; index += 1) {
    const parameter = fn.parameters[index]!;
    if (parameter.type) continue;
    const type = inferred.types[index];
    if (!type) continue;
    annotated = true;
    const at = (parameter.questionToken ?? parameter.name).getEnd() - origin;
    const question = inferred.optional[index] && !parameter.questionToken ? "?" : "";
    const annotation = `${question}: ${type}`;
    if (bare) insertions.push({ index: parameter.getStart(sourceFile) - origin, text: "(" });
    insertions.push({ index: at, text: bare ? `${annotation})` : annotation });
  }
  if (annotated && inferred.typeParameters && !fn.typeParameters?.length) {
    const paren = parameterParenIndex(fn, sourceFile, origin, bare);
    if (paren !== undefined) {
      const jsx = sourceFile.fileName.endsWith("tsx") || sourceFile.fileName.endsWith("jsx");
      insertions.unshift({ index: paren, text: printTypeParameters(inferred.typeParameters, jsx) });
    }
  }
  return applyInsertions(text, insertions);
}

function callbackFunction(
  expression: ts.Expression,
): ts.ArrowFunction | ts.FunctionExpression | undefined {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  if (ts.isArrowFunction(current)) return current;
  if (ts.isFunctionExpression(current) && !current.asteriskToken) return current;
  return undefined;
}

function lacksParens(fn: ts.ArrowFunction, sourceFile: ts.SourceFile): boolean {
  if (fn.parameters.length !== 1) return false;
  const start = fn.parameters[0]!.getStart(sourceFile);
  let index = start - 1;
  const text = sourceFile.text;
  while (index >= 0 && /\s/.test(text[index] ?? "")) index -= 1;
  return text[index] !== "(";
}

function parameterParenIndex(
  fn: ts.ArrowFunction | ts.FunctionExpression,
  sourceFile: ts.SourceFile,
  origin: number,
  bare: boolean,
): number | undefined {
  const parameter = fn.parameters[0];
  if (!parameter) return undefined;
  if (bare) return parameter.getStart(sourceFile) - origin;
  let index = parameter.getStart(sourceFile) - 1;
  const text = sourceFile.text;
  while (index >= 0 && /\s/.test(text[index] ?? "")) index -= 1;
  if (text[index] !== "(") return undefined;
  return index - origin;
}

function printTypeParameters(list: string, jsx: boolean): string {
  const inner = list.slice(1, -1).trim().replace(/\s+/g, " ");
  if (!jsx || commaOutsideBrackets(inner)) return `<${inner}>`;
  return `<${inner},>`;
}

function splitParameter(parameter: string): { type?: string; optional: boolean } {
  const colon = indexOutsideBrackets(parameter, ":");
  if (colon < 0) return { optional: false };
  const equals = indexOutsideBrackets(parameter, "=", colon + 1);
  const type = collapse(parameter.slice(colon + 1, equals < 0 ? parameter.length : equals));
  if (!type || type === "any" || type.endsWith("...")) return { optional: false };
  return { type, optional: parameter.slice(0, colon).trim().endsWith("?") };
}

function splitTopLevel(text: string, separator: string): string[] {
  const parts: string[] = [];
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    index = jump(text, index);
    if (index >= text.length) break;
    if (depthAt(text, index) === 0 && text[index] === separator) {
      parts.push(text.slice(start, index));
      start = index + 1;
    }
  }
  if (text.trim()) parts.push(text.slice(start));
  return parts;
}

function indexOutsideBrackets(text: string, token: string, from = 0): number {
  for (let index = from; index < text.length; index += 1) {
    index = jump(text, index);
    if (index >= text.length) return -1;
    if (depthAt(text, index) === 0 && text[index] === token) return index;
  }
  return -1;
}

function commaOutsideBrackets(text: string): boolean {
  return indexOutsideBrackets(text, ",") >= 0;
}

function depthAt(text: string, at: number): number {
  let depth = 0;
  for (let index = 0; index < at; index += 1) {
    const next = jump(text, index);
    if (next !== index) {
      index = next - 1;
      continue;
    }
    const close = pairs[text[index] ?? ""];
    if (close) depth += 1;
    else if (depth > 0 && isClose(text[index])) depth -= 1;
  }
  return depth;
}

function isClose(character: string | undefined): boolean {
  return character === ")" || character === "}" || character === "]" || character === ">";
}

function jump(text: string, index: number): number {
  const character = text[index];
  if (character === ">" && text[index - 1] === "=") return index;
  if (character === "'" || character === '"' || character === "`") return endOfString(text, index);
  return index;
}

function endOfString(text: string, start: number): number {
  const quote = text[start];
  for (let index = start + 1; index < text.length; index += 1) {
    if (text[index] === "\\") {
      index += 1;
      continue;
    }
    if (text[index] === quote) return index + 1;
  }
  return text.length;
}

function matchingClose(text: string, openAt: number): number {
  const close = pairs[text[openAt] ?? ""];
  if (!close) return text.length;
  let depth = 0;
  for (let index = openAt; index < text.length; index += 1) {
    const jumped = jump(text, index);
    if (jumped !== index) {
      index = jumped - 1;
      continue;
    }
    if (pairs[text[index] ?? ""]) depth += 1;
    else if (text[index] === close || (depth > 0 && isClose(text[index]))) {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  return text.length;
}

function collapse(text: string): string {
  let result = "";
  let pending = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index] ?? "";
    if (character === "'" || character === '"' || character === "`") {
      const end = endOfString(text, index);
      if (pending) result += " ";
      pending = false;
      result += text.slice(index, end);
      index = end - 1;
      continue;
    }
    if (/\s/.test(character)) {
      pending = result.length > 0;
      continue;
    }
    if (pending) result += " ";
    pending = false;
    result += character;
  }
  return result.trim();
}

function skipSpace(text: string, index: number): number {
  while (index < text.length && /\s/.test(text[index] ?? "")) index += 1;
  return index;
}

function applyInsertions(text: string, insertions: { index: number; text: string }[]): string {
  const grouped = new Map<number, string[]>();
  for (const insertion of insertions) {
    const existing = grouped.get(insertion.index);
    if (existing) existing.push(insertion.text);
    else grouped.set(insertion.index, [insertion.text]);
  }
  const indexes = [...grouped.keys()].sort((left, right) => right - left);
  let result = text;
  for (const index of indexes) {
    const chunk = grouped.get(index)?.join("") ?? "";
    result = result.slice(0, index) + chunk + result.slice(index);
  }
  return result;
}
