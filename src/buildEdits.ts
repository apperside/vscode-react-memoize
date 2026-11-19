import ts from "typescript";
import { annotateCallback, type InferredCallback } from "./callbackTypes.js";
import {
  isInlineExtract,
  type DeclarationExtractTarget,
  type ExtractTarget,
  type InlineExtractTarget,
} from "./findExtractTarget.js";

export interface TextEdit {
  start: number;
  end: number;
  newText: string;
  /** Inline extract: this edit contains the binding name as a snippet placeholder. */
  placeholder?: "declaration" | "usage";
}

export function buildEdits(
  sourceFile: ts.SourceFile,
  target: ExtractTarget,
  dependencies: readonly string[],
  inferred?: InferredCallback,
  reactTypes: readonly string[] = [],
): TextEdit[] {
  if (isInlineExtract(target))
    return inlineEdits(sourceFile, target, dependencies, inferred, reactTypes);
  const qualifier = reactNamespace(sourceFile);
  const callee = qualifier ? `${qualifier}.${target.hook}` : target.hook;
  const statementStart = target.statement.getStart(sourceFile);
  const baseIndent = indentAt(sourceFile.text, statementStart);
  const edits: TextEdit[] = [
    {
      start: statementStart,
      end: target.statement.getEnd(),
      newText: rewriteStatement(sourceFile, target, callee, dependencies, baseIndent),
    },
  ];
  if (!qualifier) {
    const importEdit = ensureReactImport(sourceFile, target.hook, []);
    if (importEdit) edits.push(importEdit);
  }
  return edits;
}

function inlineEdits(
  sourceFile: ts.SourceFile,
  target: InlineExtractTarget,
  dependencies: readonly string[],
  inferred: InferredCallback | undefined,
  reactTypes: readonly string[],
): TextEdit[] {
  if (target.implicitReturn || !target.statement)
    return implicitInlineEdits(sourceFile, target, dependencies, inferred, reactTypes);
  const qualifier = reactNamespace(sourceFile);
  const callee = qualifier ? `${qualifier}.${target.hook}` : target.hook;
  const statementStart = target.statement.getStart(sourceFile);
  const baseIndent = indentAt(sourceFile.text, statementStart);
  const callback =
    target.hook === "useCallback"
      ? annotateCallback(sourceFile, target.expression, inferred)
      : `() => ${initializerText(target.expression, sourceFile)}`;
  const call = printCall(
    callee,
    callback,
    dependencies,
    target.expression.getText(sourceFile).includes("\n"),
    baseIndent,
  );
  const edits: TextEdit[] = [
    {
      start: target.expression.getStart(sourceFile),
      end: target.expression.getEnd(),
      newText: target.name,
      placeholder: "usage",
    },
    {
      start: statementStart,
      end: statementStart,
      newText: `const ${target.name} = ${call};\n${baseIndent}`,
      placeholder: "declaration",
    },
  ];
  if (!qualifier) {
    const importEdit = ensureReactImport(sourceFile, target.hook, reactTypes);
    if (importEdit) edits.push(importEdit);
  } else if (reactTypes.length) {
    const importEdit = typeOnlyReactImport(sourceFile, reactTypes);
    if (importEdit) edits.push(importEdit);
  }
  return edits;
}

function implicitInlineEdits(
  sourceFile: ts.SourceFile,
  target: InlineExtractTarget,
  dependencies: readonly string[],
  inferred: InferredCallback | undefined,
  reactTypes: readonly string[],
): TextEdit[] {
  const body = target.reactiveFunction.body;
  if (!body || ts.isBlock(body)) return [];
  const qualifier = reactNamespace(sourceFile);
  const callee = qualifier ? `${qualifier}.${target.hook}` : target.hook;
  const indent = indentAt(sourceFile.text, target.reactiveFunction.getStart(sourceFile));
  const inner = `${indent}  `;
  const callback =
    target.hook === "useCallback"
      ? annotateCallback(sourceFile, target.expression, inferred)
      : `() => ${initializerText(target.expression, sourceFile)}`;
  const call = printCall(
    callee,
    callback,
    dependencies,
    target.expression.getText(sourceFile).includes("\n"),
    inner,
  );
  const edits: TextEdit[] = [
    {
      start: target.expression.getStart(sourceFile),
      end: target.expression.getEnd(),
      newText: target.name,
      placeholder: "usage",
    },
    {
      start: body.getStart(sourceFile),
      end: body.getStart(sourceFile),
      newText: `{\n${inner}const ${target.name} = ${call};\n${inner}return `,
      placeholder: "declaration",
    },
    {
      start: body.getEnd(),
      end: body.getEnd(),
      newText: `;\n${indent}}`,
    },
  ];
  if (!qualifier) {
    const importEdit = ensureReactImport(sourceFile, target.hook, reactTypes);
    if (importEdit) edits.push(importEdit);
  } else if (reactTypes.length) {
    const importEdit = typeOnlyReactImport(sourceFile, reactTypes);
    if (importEdit) edits.push(importEdit);
  }
  return edits;
}

function typeOnlyReactImport(
  sourceFile: ts.SourceFile,
  reactTypes: readonly string[],
): TextEdit | undefined {
  const imports = sourceFile.statements.filter(ts.isImportDeclaration);
  const line = `import type { ${reactTypes.join(", ")} } from "react";`;
  const anchor = imports[imports.length - 1];
  if (anchor) return { start: anchor.getEnd(), end: anchor.getEnd(), newText: `\n${line}` };
  const first = sourceFile.statements[0];
  const position = first ? first.getStart(sourceFile) : 0;
  return { start: position, end: position, newText: `${line}\n` };
}

function rewriteStatement(
  sourceFile: ts.SourceFile,
  target: DeclarationExtractTarget,
  callee: string,
  dependencies: readonly string[],
  baseIndent: string,
): string {
  if (ts.isFunctionDeclaration(target.declaration)) {
    const arrow = printArrow(target.declaration, sourceFile);
    const call = printCall(
      callee,
      arrow,
      dependencies,
      target.declaration.getText(sourceFile).includes("\n"),
      baseIndent,
    );
    return `const ${target.declaration.name?.text ?? ""} = ${call};`;
  }
  const declaration = target.declaration;
  const initializer = declaration.initializer;
  if (!initializer) return target.statement.getText(sourceFile);
  const callback =
    target.hook === "useCallback"
      ? initializer.getText(sourceFile)
      : `() => ${initializerText(initializer, sourceFile)}`;
  const multiline = (
    target.hook === "useCallback"
      ? initializer.getText(sourceFile)
      : initializer.getText(sourceFile)
  ).includes("\n");
  const call = printCall(callee, callback, dependencies, multiline, baseIndent);
  const type = declaration.type ? `: ${declaration.type.getText(sourceFile)}` : "";
  const extracted = `const ${declaration.name.getText(sourceFile)}${type} = ${call};`;
  const list = declaration.parent;
  if (!ts.isVariableDeclarationList(list) || list.declarations.length === 1) return extracted;
  const keyword = list.flags & ts.NodeFlags.Const ? "const" : "let";
  const rest = list.declarations
    .filter((item) => item !== declaration)
    .map((item) => item.getText(sourceFile));
  if (rest.length === 0) return extracted;
  return `${keyword} ${rest.join(", ")};\n${baseIndent}${extracted}`;
}

function initializerText(initializer: ts.Expression, sourceFile: ts.SourceFile): string {
  const text = initializer.getText(sourceFile);
  if (startsWithObject(initializer) && !text.trimStart().startsWith("(")) return `(${text})`;
  return text;
}

function startsWithObject(expr: ts.Expression): boolean {
  let current = expr;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isPropertyAccessExpression(current) ||
    ts.isElementAccessExpression(current)
  ) {
    current = current.expression;
  }
  return ts.isObjectLiteralExpression(current);
}

function printArrow(fn: ts.FunctionDeclaration, sourceFile: ts.SourceFile): string {
  const asyncPrefix = hasModifier(fn, ts.SyntaxKind.AsyncKeyword) ? "async " : "";
  const typeParameters = printTypeParameters(fn, sourceFile);
  const parameters = fn.parameters.map((parameter) => parameter.getText(sourceFile)).join(", ");
  const returnType = fn.type ? `: ${fn.type.getText(sourceFile)}` : "";
  const body = fn.body ? fn.body.getText(sourceFile) : "{}";
  return `${asyncPrefix}${typeParameters}(${parameters})${returnType} => ${body}`;
}

function printTypeParameters(fn: ts.FunctionDeclaration, sourceFile: ts.SourceFile): string {
  if (!fn.typeParameters?.length) return "";
  const parts = fn.typeParameters.map((parameter) => parameter.getText(sourceFile));
  const jsx = sourceFile.fileName.endsWith("tsx") || sourceFile.fileName.endsWith("jsx");
  if (parts.length === 1 && jsx) return `<${parts[0]},>`;
  return `<${parts.join(", ")}>`;
}

function printCall(
  callee: string,
  callback: string,
  dependencies: readonly string[],
  multiline: boolean,
  baseIndent: string,
): string {
  const list = dependencies.join(", ");
  if (!multiline) return `${callee}(${callback}, [${list}])`;
  const inner = `${baseIndent}  `;
  return `${callee}(\n${inner}${callback},\n${inner}[${list}],\n${baseIndent})`;
}

function reactNamespace(sourceFile: ts.SourceFile): string | undefined {
  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !isReactModule(statement) ||
      statement.importClause?.isTypeOnly
    )
      continue;
    const named = statement.importClause?.namedBindings;
    if (named && ts.isNamespaceImport(named)) return named.name.text;
  }
  return undefined;
}

function ensureReactImport(
  sourceFile: ts.SourceFile,
  hook: string,
  reactTypes: readonly string[],
): TextEdit | undefined {
  const imports = sourceFile.statements.filter(
    (statement): statement is ts.ImportDeclaration =>
      ts.isImportDeclaration(statement) && isReactModule(statement),
  );
  const valueImport = imports.find((statement) => !statement.importClause?.isTypeOnly);
  const types = reactTypes.filter(
    (name) => !imports.some((statement) => clauseHas(statement, name)),
  );
  const hookNeeded = !valueImport || !hasValueSpecifier(valueImport, hook);
  const specifiers = [...(hookNeeded ? [hook] : []), ...types.map((name) => `type ${name}`)];
  if (!specifiers.length) return undefined;
  const rendered = specifiers.join(", ");
  if (valueImport?.importClause) {
    const clause = valueImport.importClause;
    const named = clause.namedBindings;
    if (named && ts.isNamedImports(named) && named.elements.length > 0) {
      const last = named.elements[named.elements.length - 1]!;
      return { start: last.getEnd(), end: last.getEnd(), newText: `, ${rendered}` };
    }
    if (clause.name && !named) {
      return {
        start: clause.name.getEnd(),
        end: clause.name.getEnd(),
        newText: `, { ${rendered} }`,
      };
    }
  }
  const line = `import { ${rendered} } from "react";`;
  const anchor = imports.length > 0 ? imports[imports.length - 1] : undefined;
  if (anchor) return { start: anchor.getEnd(), end: anchor.getEnd(), newText: `\n${line}` };
  const prologue = directiveEnd(sourceFile);
  if (prologue > 0) return { start: prologue, end: prologue, newText: `\n${line}` };
  const first = sourceFile.statements[0];
  const position = first ? first.getStart(sourceFile) : 0;
  return { start: position, end: position, newText: `${line}\n` };
}

function clauseHas(statement: ts.ImportDeclaration, name: string): boolean {
  const clause = statement.importClause;
  if (!clause) return false;
  if (clause.name?.text === name) return true;
  const named = clause.namedBindings;
  if (named && ts.isNamespaceImport(named)) return named.name.text === name;
  if (named && ts.isNamedImports(named))
    return named.elements.some((element) => element.name.text === name);
  return false;
}

function directiveEnd(sourceFile: ts.SourceFile): number {
  let end = 0;
  for (const statement of sourceFile.statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) break;
    end = statement.getEnd();
  }
  return end;
}

function hasValueSpecifier(statement: ts.ImportDeclaration, hook: string): boolean {
  const named = statement.importClause?.namedBindings;
  if (!named || !ts.isNamedImports(named)) return false;
  return named.elements.some((element) => element.name.text === hook && !element.isTypeOnly);
}

function isReactModule(statement: ts.ImportDeclaration): boolean {
  return (
    ts.isStringLiteral(statement.moduleSpecifier) && statement.moduleSpecifier.text === "react"
  );
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return (
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node)?.some((modifier) => modifier.kind === kind) ?? false)
  );
}

function indentAt(source: string, position: number): string {
  const lineStart = source.lastIndexOf("\n", position - 1) + 1;
  return /^[ \t]*/.exec(source.slice(lineStart, position))?.[0] ?? "";
}
