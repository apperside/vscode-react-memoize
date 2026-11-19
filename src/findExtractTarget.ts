import ts from "typescript";
import { capturesNestedScope } from "./collectDependencies.js";

export interface Selection {
  start: number;
  end: number;
}

export type HookKind = "useMemo" | "useCallback";

export interface DeclarationExtractTarget {
  reactiveFunction: ts.FunctionLikeDeclaration;
  statement: ts.Statement;
  declaration: ts.VariableDeclaration | ts.FunctionDeclaration;
  hook: HookKind;
  callback: ts.Node;
}

export interface InlineExtractTarget {
  reactiveFunction: ts.FunctionLikeDeclaration;
  statement?: ts.Statement;
  expression: ts.Expression;
  name: string;
  hook: HookKind;
  callback: ts.Expression;
  /** Arrow with no block: the edit wraps the body in `{ return ... }`. */
  implicitReturn?: boolean;
}

export type ExtractTarget = DeclarationExtractTarget | InlineExtractTarget;

export function isInlineExtract(target: ExtractTarget): target is InlineExtractTarget {
  return "expression" in target;
}

export function findExtractTarget(
  sourceFile: ts.SourceFile,
  selection: Selection,
): ExtractTarget | undefined {
  if (sourceFile.text.length === 0 || selection.start > sourceFile.text.length) return undefined;
  const position = Math.min(selection.start, sourceFile.text.length - 1);
  let current: ts.Node | undefined = nodeAt(sourceFile, position);
  while (current) {
    const declarations = declarationsOf(current);
    if (declarations) {
      for (const declaration of declarations) {
        const target = targetForNode(sourceFile, declaration, selection);
        if (target) return target;
      }
    } else {
      const target = targetForNode(sourceFile, current, selection);
      if (target) return target;
    }
    current = current.parent;
  }
  return pickInline(sourceFile, selection);
}

export function inlineInsertStatement(
  target: InlineExtractTarget,
  dependencies: readonly string[],
): ts.Statement | undefined {
  if (target.implicitReturn) return undefined;
  const statement = target.statement;
  const body = target.reactiveFunction.body;
  if (!statement || !body || !ts.isBlock(body)) return undefined;
  const index = body.statements.indexOf(statement);
  if (index < 0) return undefined;
  let anchor = statement;
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (exitsOutsideNestedFunction(body.statements[cursor]!)) {
      anchor = body.statements[cursor]!;
      break;
    }
  }
  if (!bindingsReady(body, anchor, dependencies)) return undefined;
  return anchor;
}

function nodeAt(root: ts.Node, position: number): ts.Node {
  let current = root;
  let child = childContaining(current, position);
  while (child) {
    current = child;
    child = childContaining(current, position);
  }
  return current;
}

function childContaining(node: ts.Node, position: number): ts.Node | undefined {
  let found: ts.Node | undefined;
  ts.forEachChild(node, (child) => {
    if (!found && position >= child.pos && position < child.end) found = child;
  });
  return found;
}

function declarationsOf(node: ts.Node): readonly ts.VariableDeclaration[] | undefined {
  if (ts.isVariableStatement(node)) return node.declarationList.declarations;
  if (ts.isVariableDeclarationList(node)) return node.declarations;
  return undefined;
}

function inlineFromAttribute(
  sourceFile: ts.SourceFile,
  node: ts.Node,
  selection: Selection,
): InlineExtractTarget | undefined {
  if (
    !ts.isJsxAttribute(node) ||
    !node.initializer ||
    !ts.isJsxExpression(node.initializer) ||
    !node.initializer.expression ||
    !ts.isIdentifier(node.name)
  ) {
    return undefined;
  }
  const expression = node.initializer.expression;
  const span = { start: expression.getStart(sourceFile), end: expression.getEnd() };
  if (!overlaps(selection, span) || !isInlineExpression(expression)) return undefined;
  return inlineTarget(expression, node.name.text);
}

function targetForNode(
  sourceFile: ts.SourceFile,
  node: ts.Node,
  selection: Selection,
): ExtractTarget | undefined {
  if (ts.isFunctionDeclaration(node)) {
    if (!node.name || !overlaps(selection, functionSpan(sourceFile, node))) return undefined;
    return finish(node, node);
  }
  if (ts.isVariableDeclaration(node) && node.initializer) {
    if (!overlaps(selection, spanOf(node.name))) return undefined;
    const statement = statementOf(node);
    if (!statement || !ts.isVariableStatement(statement)) return undefined;
    return finish(node, statement);
  }
  return undefined;
}

function isInlineExpression(expression: ts.Expression): boolean {
  const unwrapped = unwrapExpression(expression);
  return (
    ts.isObjectLiteralExpression(unwrapped) ||
    ts.isArrayLiteralExpression(unwrapped) ||
    isCallbackInitializer(unwrapped)
  );
}

function pickInline(
  sourceFile: ts.SourceFile,
  selection: Selection,
): InlineExtractTarget | undefined {
  let best: InlineExtractTarget | undefined;
  const visit = (node: ts.Node) => {
    const candidate = inlineFromAttribute(sourceFile, node, selection);
    if (candidate && (!best || preferInline(candidate, best, selection))) best = candidate;
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return best;
}

function preferInline(
  candidate: InlineExtractTarget,
  best: InlineExtractTarget,
  selection: Selection,
): boolean {
  const candidateCovers = covers(candidate.expression, selection);
  const bestCovers = covers(best.expression, selection);
  if (candidateCovers !== bestCovers) return candidateCovers;
  return spanLength(candidate.expression) < spanLength(best.expression);
}

function covers(node: ts.Node, selection: Selection): boolean {
  return node.getStart() <= selection.start && node.getEnd() >= selection.end;
}

function spanLength(node: ts.Node): number {
  return node.getEnd() - node.getStart();
}

function inlineTarget(
  expression: ts.Expression,
  attribute: string,
): InlineExtractTarget | undefined {
  if (isInsideClass(expression) || isGenerator(unwrapExpression(expression))) return undefined;
  if (containsHookCall(expression)) return undefined;
  const reactive = enclosingReactive(expression);
  if (!reactive?.body) return undefined;
  // Inside a useMemo or useCallback callback the prop is already recreated only when that hook
  // reruns, so a second hook around it would add a dependency and no stability.
  if (insideMemoizedCallback(expression, reactive)) return undefined;
  // An inline prop inside a callback of the component (a useMemo body, a map) moves up to the
  // component body, which is only safe when it reads nothing declared in that callback.
  const outer = outermostFunctionBetween(expression, reactive);
  const name = freshName(reactive, attribute, outer);
  if (!name) return undefined;
  const unwrapped = unwrapExpression(expression);
  const hook: HookKind = isCallbackInitializer(unwrapped) ? "useCallback" : "useMemo";
  let target: InlineExtractTarget | undefined;
  if (!ts.isBlock(reactive.body)) {
    target = {
      reactiveFunction: reactive,
      expression,
      name,
      hook,
      callback: expression,
      implicitReturn: true,
    };
  } else {
    const statement = statementInBody(expression, reactive);
    if (!statement) return undefined;
    target = {
      reactiveFunction: reactive,
      statement,
      expression,
      name,
      hook,
      callback: expression,
    };
  }
  if (outer && capturesNestedScope(expression.getSourceFile(), target)) return undefined;
  return target;
}

function bindingsReady(
  body: ts.Block,
  anchor: ts.Statement,
  dependencies: readonly string[],
): boolean {
  const start = body.statements.indexOf(anchor);
  for (const dependency of dependencies) {
    const name = dependency.split(/[.[]/)[0];
    if (!name) continue;
    for (let index = start; index < body.statements.length; index += 1) {
      if (statementBinds(body.statements[index]!, name)) return false;
    }
  }
  return true;
}

function statementBinds(statement: ts.Statement, name: string): boolean {
  if (ts.isClassDeclaration(statement)) return statement.name?.text === name;
  if (ts.isVariableStatement(statement)) {
    return statement.declarationList.declarations.some((declaration) =>
      bindingIncludes(declaration.name, name),
    );
  }
  if (
    ts.isForStatement(statement) ||
    ts.isForOfStatement(statement) ||
    ts.isForInStatement(statement)
  ) {
    const initializer = statement.initializer;
    return (
      !!initializer &&
      ts.isVariableDeclarationList(initializer) &&
      initializer.declarations.some((declaration) => bindingIncludes(declaration.name, name))
    );
  }
  if (ts.isTryStatement(statement)) {
    const caught = statement.catchClause?.variableDeclaration?.name;
    return !!caught && bindingIncludes(caught, name);
  }
  return false;
}

function enclosingReactive(node: ts.Node): ts.FunctionLikeDeclaration | undefined {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (isFunctionLike(current) && isReactive(current)) return current;
    current = current.parent;
  }
  return undefined;
}

function insideMemoizedCallback(node: ts.Node, fn: ts.FunctionLikeDeclaration): boolean {
  for (let current = node.parent; current && current !== fn; current = current.parent) {
    if (isFunctionLike(current) && isMemoizedCallback(current)) return true;
  }
  return false;
}

function isMemoizedCallback(fn: ts.FunctionLikeDeclaration): boolean {
  const call = fn.parent;
  if (!call || !ts.isCallExpression(call) || call.arguments[0] !== fn) return false;
  const callee = call.expression;
  const name = ts.isIdentifier(callee)
    ? callee.text
    : ts.isPropertyAccessExpression(callee)
      ? callee.name.text
      : undefined;
  return name === "useMemo" || name === "useCallback";
}

/** The outermost function between a node and the component, or undefined when it sits directly in it. */
function outermostFunctionBetween(
  node: ts.Node,
  fn: ts.FunctionLikeDeclaration,
): ts.FunctionLikeDeclaration | undefined {
  let outer: ts.FunctionLikeDeclaration | undefined;
  for (let current = node.parent; current && current !== fn; current = current.parent) {
    if (isFunctionLike(current)) outer = current;
  }
  return outer;
}

function statementInBody(node: ts.Node, fn: ts.FunctionLikeDeclaration): ts.Statement | undefined {
  if (!fn.body || !ts.isBlock(fn.body)) return undefined;
  let current: ts.Node | undefined = node;
  while (current && current.parent !== fn.body) current = current.parent;
  if (!current) return undefined;
  return fn.body.statements.find((statement) => statement === current);
}

function freshName(
  fn: ts.FunctionLikeDeclaration,
  base: string,
  nested?: ts.Node,
): string | undefined {
  const candidates = [base, `${base}Value`];
  return candidates.find(
    (name) => !nameTaken(fn, name) && !(nested && declaresInside(nested, name)),
  );
}

function declaresInside(root: ts.Node, name: string): boolean {
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (
      ((ts.isVariableDeclaration(node) || ts.isParameter(node)) &&
        bindingIncludes(node.name, name)) ||
      ((ts.isFunctionDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isClassDeclaration(node)) &&
        node.name?.text === name)
    ) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
  return found;
}

function nameTaken(fn: ts.FunctionLikeDeclaration, name: string): boolean {
  if (fn.parameters.some((parameter) => bindingIncludes(parameter.name, name))) return true;
  if (!fn.body || !ts.isBlock(fn.body)) return false;
  for (const statement of fn.body.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === name) return true;
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (bindingIncludes(declaration.name, name)) return true;
    }
  }
  return false;
}

function bindingIncludes(name: ts.BindingName, text: string): boolean {
  if (ts.isIdentifier(name)) return name.text === text;
  for (const element of name.elements) {
    if (ts.isBindingElement(element) && bindingIncludes(element.name, text)) return true;
  }
  return false;
}

function finish(
  declaration: ts.VariableDeclaration | ts.FunctionDeclaration,
  statement: ts.Statement,
): DeclarationExtractTarget | undefined {
  if (isInsideClass(declaration)) return undefined;
  const reactive = nearestReactive(statement);
  if (!reactive || reactive === declaration) return undefined;
  if (!reactive.body || !ts.isBlock(reactive.body) || statement.parent !== reactive.body)
    return undefined;
  if (precedingExit(reactive.body, statement)) return undefined;

  if (ts.isFunctionDeclaration(declaration)) {
    if (declaration.asteriskToken || !declaration.body || hasOverload(reactive.body, declaration))
      return undefined;
    if (containsHookCall(declaration.body)) return undefined;
    return {
      reactiveFunction: reactive,
      statement,
      declaration,
      hook: "useCallback",
      callback: declaration,
    };
  }

  const list = declaration.parent;
  if (!ts.isVariableDeclarationList(list)) return undefined;
  const kind = list.flags & ts.NodeFlags.Const || list.flags & ts.NodeFlags.Let;
  if (!kind) return undefined;
  const initializer = declaration.initializer;
  if (!initializer) return undefined;
  const unwrapped = unwrapExpression(initializer);
  if (isGenerator(unwrapped) || containsHookCall(initializer)) return undefined;
  const hook: HookKind = isCallbackInitializer(unwrapped) ? "useCallback" : "useMemo";
  return {
    reactiveFunction: reactive,
    statement,
    declaration,
    hook,
    callback: initializer,
  };
}

function functionSpan(
  sourceFile: ts.SourceFile,
  fn: ts.FunctionDeclaration,
): { start: number; end: number } {
  const keyword = sourceFile.text.indexOf("function", fn.getStart(sourceFile));
  const start = keyword === -1 ? fn.getStart(sourceFile) : keyword;
  const end = fn.name ? fn.name.getEnd() : start + "function".length;
  return { start, end };
}

function spanOf(name: ts.BindingName): { start: number; end: number } {
  return { start: name.getStart(), end: name.getEnd() };
}

function overlaps(selection: Selection, span: { start: number; end: number }): boolean {
  if (selection.start === selection.end) {
    return span.start <= selection.start && selection.start <= span.end;
  }
  return selection.start < span.end && selection.end > span.start;
}

function statementOf(declaration: ts.VariableDeclaration): ts.Statement | undefined {
  const list = declaration.parent;
  if (!ts.isVariableDeclarationList(list)) return undefined;
  const statement = list.parent;
  return ts.isVariableStatement(statement) ? statement : undefined;
}

function isInsideClass(node: ts.Node): boolean {
  let current: ts.Node | undefined = node;
  while (current) {
    if (ts.isClassLike(current)) return true;
    current = current.parent;
  }
  return false;
}

function nearestReactive(statement: ts.Statement): ts.FunctionLikeDeclaration | undefined {
  let current: ts.Node | undefined = statement.parent;
  while (current) {
    if (isFunctionLike(current) && isReactive(current)) {
      if (current.body && ts.isBlock(current.body) && statement.parent === current.body)
        return current;
      if (isInside(statement, current)) return undefined;
    }
    current = current.parent;
  }
  return undefined;
}

function isFunctionLike(node: ts.Node): node is ts.FunctionLikeDeclaration {
  return (
    ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)
  );
}

function isReactive(fn: ts.FunctionLikeDeclaration): boolean {
  if (isInsideClass(fn)) return false;
  const names = [ownName(fn), assignedName(fn)].filter((name): name is string => !!name);
  if (names.some((name) => /^[A-Z]/.test(name) || /^use[A-Z0-9]/.test(name))) return true;
  if (
    ts.isFunctionDeclaration(fn) &&
    !fn.name &&
    hasModifier(fn, ts.SyntaxKind.ExportKeyword) &&
    hasModifier(fn, ts.SyntaxKind.DefaultKeyword)
  ) {
    return true;
  }
  return isFunctionPassedToMemo(fn);
}

function ownName(fn: ts.FunctionLikeDeclaration): string | undefined {
  if ((ts.isFunctionDeclaration(fn) || ts.isFunctionExpression(fn)) && fn.name) return fn.name.text;
  return undefined;
}

function assignedName(fn: ts.Node): string | undefined {
  const parent = fn.parent;
  if (
    ts.isVariableDeclaration(parent) &&
    ts.isIdentifier(parent.name) &&
    parent.initializer === fn
  ) {
    return parent.name.text;
  }
  return undefined;
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return (
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node)?.some((modifier) => modifier.kind === kind) ?? false)
  );
}

function isFunctionPassedToMemo(fn: ts.Node): boolean {
  const parent = fn.parent;
  if (!ts.isCallExpression(parent) || parent.arguments[0] !== fn) return false;
  return isMemoCallee(parent.expression);
}

function isMemoCallee(expr: ts.Expression): boolean {
  if (ts.isIdentifier(expr)) return expr.text === "memo" || expr.text === "forwardRef";
  if (
    ts.isPropertyAccessExpression(expr) &&
    !("questionDot" in expr && expr.questionDot) &&
    ts.isIdentifier(expr.expression) &&
    expr.expression.text === "React" &&
    ts.isIdentifier(expr.name)
  ) {
    return expr.name.text === "memo" || expr.name.text === "forwardRef";
  }
  return false;
}

function isInside(node: ts.Node, ancestor: ts.Node): boolean {
  let current: ts.Node | undefined = node;
  while (current) {
    if (current === ancestor) return true;
    current = current.parent;
  }
  return false;
}

function precedingExit(body: ts.Block, statement: ts.Statement): boolean {
  const index = body.statements.indexOf(statement);
  for (let i = 0; i < index; i++) {
    if (exitsOutsideNestedFunction(body.statements[i]!)) return true;
  }
  return false;
}

function exitsOutsideNestedFunction(root: ts.Node): boolean {
  if (ts.isReturnStatement(root) || ts.isThrowStatement(root)) return true;
  if (isFunctionLike(root)) return false;
  let found = false;
  const visit = (node: ts.Node) => {
    if (found || isFunctionLike(node)) return;
    if (ts.isReturnStatement(node) || ts.isThrowStatement(node)) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(root, visit);
  return found;
}

function hasOverload(body: ts.Block, fn: ts.FunctionDeclaration): boolean {
  if (!fn.body || !fn.name) return !fn.body;
  const index = body.statements.indexOf(fn);
  for (let i = 0; i < index; i++) {
    const sibling = body.statements[i];
    if (ts.isFunctionDeclaration(sibling) && sibling.name?.text === fn.name.text && !sibling.body)
      return true;
  }
  return false;
}

function unwrapExpression(expr: ts.Expression): ts.Expression {
  let current = expr;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function isGenerator(initializer: ts.Expression): boolean {
  return ts.isFunctionExpression(initializer) && !!initializer.asteriskToken;
}

function isCallbackInitializer(initializer: ts.Expression): boolean {
  return (
    ts.isArrowFunction(initializer) ||
    (ts.isFunctionExpression(initializer) && !initializer.asteriskToken)
  );
}

function containsHookCall(root: ts.Node): boolean {
  let found = false;
  const visit = (node: ts.Node) => {
    if (found) return;
    if (ts.isCallExpression(node) && isHookCallee(unwrapExpression(node.expression))) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  const unwrapped = ts.isExpression(root) ? unwrapExpression(root) : root;
  if (ts.isCallExpression(unwrapped) && isHookCallee(unwrapExpression(unwrapped.expression)))
    return true;
  visit(root);
  return found;
}

function isHookCallee(expr: ts.Expression): boolean {
  if (ts.isIdentifier(expr)) return /^use[A-Z]/.test(expr.text);
  if (
    ts.isPropertyAccessExpression(expr) &&
    ts.isIdentifier(expr.expression) &&
    expr.expression.text === "React" &&
    ts.isIdentifier(expr.name)
  ) {
    return /^use[A-Z]/.test(expr.name.text);
  }
  return false;
}
