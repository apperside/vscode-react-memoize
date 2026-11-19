import ts from "typescript";
import type { TextEdit } from "./buildEdits.js";
import type { InferredCallback } from "./callbackTypes.js";

const keywords = new Set([
  "as",
  "asserts",
  "async",
  "await",
  "const",
  "default",
  "extends",
  "false",
  "from",
  "function",
  "import",
  "infer",
  "interface",
  "is",
  "keyof",
  "never",
  "new",
  "null",
  "readonly",
  "this",
  "true",
  "type",
  "typeof",
  "undefined",
  "unique",
  "void",
]);

const libTypes = new Set([
  "any",
  "Array",
  "Awaited",
  "bigint",
  "boolean",
  "ConstructorParameters",
  "Document",
  "Element",
  "Event",
  "EventTarget",
  "Exclude",
  "Extract",
  "HTMLButtonElement",
  "HTMLDivElement",
  "HTMLElement",
  "HTMLInputElement",
  "HTMLSpanElement",
  "InstanceType",
  "Map",
  "never",
  "Node",
  "NoInfer",
  "NonNullable",
  "null",
  "number",
  "object",
  "Omit",
  "Parameters",
  "Partial",
  "Pick",
  "Promise",
  "Readonly",
  "ReadonlyArray",
  "Record",
  "Required",
  "ReturnType",
  "Set",
  "string",
  "SVGElement",
  "symbol",
  "ThisType",
  "undefined",
  "unknown",
  "void",
  "WeakMap",
  "WeakSet",
  "Window",
]);

const reactEventTypes = new Set([
  "AnimationEvent",
  "ChangeEvent",
  "ClipboardEvent",
  "CompositionEvent",
  "DragEvent",
  "FocusEvent",
  "FormEvent",
  "KeyboardEvent",
  "MouseEvent",
  "PointerEvent",
  "SyntheticEvent",
  "TouchEvent",
  "TransitionEvent",
  "UIEvent",
  "WheelEvent",
]);

export interface PreparedTypes {
  inferred: InferredCallback;
  edits: TextEdit[];
  reactTypes: readonly string[];
  imported: ReadonlySet<string>;
}

export function prepareTypeImports(
  sourceFile: ts.SourceFile,
  inferred: InferredCallback,
): PreparedTypes {
  const scope = namesInScope(sourceFile);
  const imported = new Set<string>();
  const specs = new Map<string, string[]>();
  const types = inferred.types.map((type) => {
    if (!type) return type;
    const rewritten = rewriteImportTypes(type, scope, imported, specs);
    claimReactEvents(rewritten, scope, imported, specs);
    return simplifyShadowed(rewritten, imported);
  });
  const reactTypes = specs.get("react") ?? [];
  specs.delete("react");
  return {
    inferred: { ...inferred, types },
    edits: editsForSpecs(sourceFile, specs),
    reactTypes,
    imported,
  };
}

export function missingTypeNames(sourceFile: ts.SourceFile, inferred: InferredCallback): string[] {
  const known = namesInScope(sourceFile);
  for (const name of typeParameterNames(inferred.typeParameters)) known.add(name);
  const missing: string[] = [];
  const seen = new Set<string>();
  for (const type of inferred.types) {
    if (!type) continue;
    for (const name of typeIdentifiers(type)) {
      if (known.has(name) || seen.has(name) || isKnownLib(name) || keywords.has(name)) continue;
      seen.add(name);
      missing.push(name);
    }
  }
  return missing;
}

function rewriteImportTypes(
  type: string,
  scope: Set<string>,
  imported: Set<string>,
  specs: Map<string, string[]>,
): string {
  const pattern = /import\((['"])([^'"]+)\1\)\.([A-Za-z_$][\w$]*)/g;
  return type.replace(pattern, (_original, _quote: string, moduleName: string, name: string) => {
    if (scope.has(name) || imported.has(name)) return name;
    const names = specs.get(moduleName) ?? [];
    if (!names.includes(name)) names.push(name);
    specs.set(moduleName, names);
    imported.add(name);
    scope.add(name);
    return name;
  });
}

function claimReactEvents(
  type: string,
  scope: Set<string>,
  imported: Set<string>,
  specs: Map<string, string[]>,
): void {
  const names = specs.get("react") ?? [];
  for (const name of typeIdentifiers(type)) {
    if (!reactEventTypes.has(name) || scope.has(name) || imported.has(name)) continue;
    if (!names.includes(name)) names.push(name);
    imported.add(name);
    scope.add(name);
  }
  if (names.length) specs.set("react", names);
}

function simplifyShadowed(type: string, imported: ReadonlySet<string>): string {
  if (!imported.size) return type;
  let result = "";
  for (let index = 0; index < type.length; index += 1) {
    const character = type[index] ?? "";
    if (character === "'" || character === '"' || character === "`") {
      const end = endOfString(type, index);
      result += type.slice(index, end);
      index = end - 1;
      continue;
    }
    if (character === ".") {
      result += character;
      index += 1;
      while (isIdent(type[index] ?? "")) {
        result += type[index];
        index += 1;
      }
      index -= 1;
      continue;
    }
    if (!isIdentStart(character)) {
      result += character;
      continue;
    }
    const start = index;
    index += 1;
    while (isIdent(type[index] ?? "")) index += 1;
    const name = type.slice(start, index);
    const bracket = skipSpace(type, index);
    if (!imported.has(name) || type[bracket] !== "<") {
      result += name;
      index -= 1;
      continue;
    }
    const close = closeAngle(type, bracket);
    const args = splitTop(type.slice(bracket + 1, close - 1));
    const kept = args.filter((arg) => arg.trim() !== name);
    if (kept.length === args.length) {
      result += type.slice(start, close);
      index = close - 1;
      continue;
    }
    const rendered = kept.map((arg) => arg.trim()).filter((arg) => arg.length > 0);
    result += rendered.length ? `${name}<${rendered.join(", ")}>` : name;
    index = close - 1;
  }
  return result;
}

function editsForSpecs(sourceFile: ts.SourceFile, specs: Map<string, string[]>): TextEdit[] {
  const quote = quoteOf(sourceFile);
  const edits: TextEdit[] = [];
  for (const [moduleName, names] of specs) {
    const edit = editForModule(sourceFile, moduleName, names, quote);
    if (edit) edits.push(edit);
  }
  return edits;
}

function editForModule(
  sourceFile: ts.SourceFile,
  moduleName: string,
  names: string[],
  quote: '"' | "'",
): TextEdit | undefined {
  const typeImport = sourceFile.statements.find(
    (statement): statement is ts.ImportDeclaration =>
      ts.isImportDeclaration(statement) &&
      moduleNameOf(statement) === moduleName &&
      !!statement.importClause?.isTypeOnly &&
      !!statement.importClause.namedBindings &&
      ts.isNamedImports(statement.importClause.namedBindings),
  );
  if (!typeImport) return newImport(sourceFile, moduleName, names, quote);
  const named = typeImport.importClause?.namedBindings;
  if (!named || !ts.isNamedImports(named)) return newImport(sourceFile, moduleName, names, quote);
  const pending = names.filter((name) => !clauseHas(typeImport.importClause, name));
  if (!pending.length) return undefined;
  const last = named.elements[named.elements.length - 1];
  if (!last)
    return { start: named.getStart() + 1, end: named.getStart() + 1, newText: pending.join(", ") };
  return { start: last.getEnd(), end: last.getEnd(), newText: `, ${pending.join(", ")}` };
}

function newImport(
  sourceFile: ts.SourceFile,
  moduleName: string,
  names: string[],
  quote: '"' | "'",
): TextEdit {
  const line = `import type { ${names.join(", ")} } from ${quote}${moduleName}${quote};`;
  const imports = sourceFile.statements.filter(ts.isImportDeclaration);
  const anchor = imports[imports.length - 1];
  if (anchor) return { start: anchor.getEnd(), end: anchor.getEnd(), newText: `\n${line}` };
  const first = sourceFile.statements[0];
  const position = first ? first.getStart(sourceFile) : 0;
  return { start: position, end: position, newText: `${line}\n` };
}

function clauseHas(clause: ts.ImportClause | undefined, name: string): boolean {
  if (!clause) return false;
  if (clause.name?.text === name) return true;
  const named = clause.namedBindings;
  if (named && ts.isNamespaceImport(named)) return named.name.text === name;
  if (named && ts.isNamedImports(named))
    return named.elements.some((element) => element.name.text === name);
  return false;
}

function moduleNameOf(statement: ts.ImportDeclaration): string | undefined {
  return ts.isStringLiteral(statement.moduleSpecifier) ? statement.moduleSpecifier.text : undefined;
}

function quoteOf(sourceFile: ts.SourceFile): '"' | "'" {
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier))
      continue;
    if (statement.moduleSpecifier.getText(sourceFile).startsWith("'")) return "'";
  }
  return '"';
}

function namesInScope(sourceFile: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      if (clause?.name) names.add(clause.name.text);
      const named = clause?.namedBindings;
      if (named && ts.isNamespaceImport(named)) names.add(named.name.text);
      if (named && ts.isNamedImports(named)) {
        for (const element of named.elements) names.add(element.name.text);
      }
    }
    if (
      (ts.isInterfaceDeclaration(node) ||
        ts.isTypeAliasDeclaration(node) ||
        ts.isClassDeclaration(node) ||
        ts.isEnumDeclaration(node) ||
        ts.isFunctionDeclaration(node) ||
        ts.isModuleDeclaration(node)) &&
      node.name &&
      ts.isIdentifier(node.name)
    ) {
      names.add(node.name.text);
    }
    if (ts.isTypeParameterDeclaration(node)) names.add(node.name.text);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return names;
}

function typeParameterNames(list: string | undefined): string[] {
  if (!list) return [];
  const inner = list.slice(1, -1);
  const names: string[] = [];
  for (const part of splitTop(inner)) {
    const match = /[A-Za-z_$][\w$]*/.exec(part);
    if (match) names.push(match[0]);
  }
  return names;
}

function splitTop(text: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === "<" || character === "(") depth += 1;
    else if ((character === ">" || character === ")") && depth > 0) depth -= 1;
    else if (character === "," && depth === 0) {
      parts.push(text.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

function isKnownLib(name: string): boolean {
  return libTypes.has(name) || name.startsWith("HTML") || name.startsWith("SVG");
}

function typeIdentifiers(type: string): string[] {
  const names: string[] = [];
  for (let index = 0; index < type.length; index += 1) {
    const character = type[index] ?? "";
    if (character === "'" || character === '"' || character === "`") {
      index = endOfString(type, index) - 1;
      continue;
    }
    if (character === ".") {
      index += 1;
      while (isIdent(type[index] ?? "")) index += 1;
      index -= 1;
      continue;
    }
    if (!isIdentStart(character)) continue;
    const start = index;
    index += 1;
    while (isIdent(type[index] ?? "")) index += 1;
    names.push(type.slice(start, index));
    index -= 1;
  }
  return names;
}

function closeAngle(text: string, start: number): number {
  let depth = 0;
  for (let index = start; index < text.length; index += 1) {
    const character = text[index] ?? "";
    if (character === "'" || character === '"' || character === "`") {
      index = endOfString(text, index) - 1;
      continue;
    }
    if (character === "<") depth += 1;
    else if (character === ">") {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  return text.length;
}

function skipSpace(text: string, index: number): number {
  while (text[index] === " " || text[index] === "\n" || text[index] === "\t") index += 1;
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

function isIdentStart(character: string): boolean {
  return /[A-Za-z_$]/.test(character);
}

function isIdent(character: string): boolean {
  return /[A-Za-z0-9_$]/.test(character);
}
