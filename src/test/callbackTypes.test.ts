import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";
import {
  annotateCallback,
  parameterTypesFromSignature,
  type InferredCallback,
} from "../callbackTypes.js";
import { provideExtractAction } from "../provideExtractAction.js";

test("a signature yields parameter types and skips any", () => {
  assert.deepEqual(
    parameterTypesFromSignature("function(event: { clientX: number; }): number"),
    inferred(["{ clientX: number; }"], [false]),
  );
  assert.deepEqual(
    parameterTypesFromSignature("function({ clientX }: { clientX: number; }): number"),
    inferred(["{ clientX: number; }"], [false]),
  );
  assert.deepEqual(parameterTypesFromSignature("function(event: any): any"), {
    types: [undefined],
    optional: [false],
    typeParameters: undefined,
  });
  assert.deepEqual(
    parameterTypesFromSignature("(local function)(event?: MouseEvent): void"),
    inferred(["MouseEvent"], [true]),
  );
  assert.deepEqual(parameterTypesFromSignature("function<T>(value: T): T"), {
    types: ["T"],
    optional: [false],
    typeParameters: "<T>",
  });
  assert.deepEqual(
    parameterTypesFromSignature("function(...args: string[], meta?: string): void"),
    inferred(["string[]", "string"], [false, true]),
  );
});

test("an untyped arrow keeps the inferred parameter type", () => {
  const source = "const row = <Button onClick={(event) => event.clientX} />;\n";
  const expression = arrow(source, "(event) => event.clientX");
  const file = sourceFile(source);
  assert.equal(
    annotateCallback(file, expression, inferred(["{ clientX: number; }"], [false])),
    "(event: { clientX: number; }) => event.clientX",
  );
});

test("a bare parameter gains parentheses along with its type", () => {
  const source = "const row = <Button onClick={event => event.clientX} />;\n";
  const expression = arrow(source, "event => event.clientX");
  assert.equal(
    annotateCallback(sourceFile(source), expression, inferred(["MouseEvent"], [false])),
    "(event: MouseEvent) => event.clientX",
  );
});

test("a destructured parameter is annotated after the pattern", () => {
  const source = "const row = <Button onClick={({ clientX }) => clientX} />;\n";
  const expression = arrow(source, "({ clientX }) => clientX");
  assert.equal(
    annotateCallback(sourceFile(source), expression, inferred(["{ clientX: number; }"], [false])),
    "({ clientX }: { clientX: number; }) => clientX",
  );
});

test("an existing annotation is left untouched", () => {
  const source = "const row = <Button onClick={(event: MouseEvent) => event.x} />;\n";
  const expression = arrow(source, "(event: MouseEvent) => event.x");
  assert.equal(
    annotateCallback(sourceFile(source), expression, inferred(["{ x: number; }"], [false])),
    "(event: MouseEvent) => event.x",
  );
});

test("an optional contextual parameter keeps the question mark", () => {
  const source = "const row = <Button onClick={(event) => event} />;\n";
  const expression = arrow(source, "(event) => event");
  assert.equal(
    annotateCallback(sourceFile(source), expression, inferred(["MouseEvent"], [true])),
    "(event?: MouseEvent) => event",
  );
});

test("a generic signature is copied onto a tsx arrow with a trailing comma", () => {
  const source = "const row = <Button onClick={(value) => value} />;\n";
  const expression = arrow(source, "(value) => value");
  assert.equal(
    annotateCallback(sourceFile(source), expression, inferred(["T"], [false], "<T>")),
    "<T,>(value: T) => value",
  );
});

test("an inline callback without parameter types waits for inference", () => {
  const source = `function SaveBar({ id }: Props) {
  return <Button onClick={(event) => save(id, event)} />;
}
`;
  const needle = "(event) => save(id, event)";
  const start = source.indexOf(needle);
  const action = provideExtractAction(
    source,
    { start, end: start + needle.length },
    ts.ScriptKind.TSX,
  );
  assert.equal(action?.needsParameterTypes, true);
  assert.equal(action?.placeholder, "onClick");
});

test("extracting an inline handler writes the inferred parameter type", () => {
  const source = `function SaveBar({ id }: Props) {
  return <Button onClick={(event) => save(id, event)} />;
}
`;
  const needle = "(event) => save(id, event)";
  const start = source.indexOf(needle);
  const action = provideExtractAction(
    source,
    { start, end: start + needle.length },
    ts.ScriptKind.TSX,
    inferred(["MouseEvent"], [false]),
  );
  assert.equal(action?.placeholder, "onClick");
  assert.equal(action?.needsParameterTypes, undefined);
  assert.equal(
    action?.edits.some((edit) => edit.placeholder === "declaration"),
    true,
  );
  const ordered = [...(action?.edits ?? [])].sort((left, right) => right.start - left.start);
  const next = ordered.reduce(
    (text, edit) => text.slice(0, edit.start) + edit.newText + text.slice(edit.end),
    source,
  );
  assert.equal(
    next,
    `import { useCallback, type MouseEvent } from "react";
function SaveBar({ id }: Props) {
  const onClick = useCallback((event: MouseEvent) => save(id, event), [id]);
  return <Button onClick={onClick} />;
}
`,
  );
});

function inferred(
  types: (string | undefined)[],
  optional: boolean[],
  typeParameters?: string,
): InferredCallback {
  return { types, optional, typeParameters };
}

function sourceFile(source: string): ts.SourceFile {
  return ts.createSourceFile(
    "fixture.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
}

function arrow(source: string, text: string): ts.Expression {
  const file = sourceFile(source);
  const start = source.indexOf(text);
  let found: ts.Expression | undefined;
  const visit = (node: ts.Node) => {
    if (
      ts.isArrowFunction(node) &&
      node.getStart(file) === start &&
      node.getEnd() === start + text.length
    ) {
      found = node;
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  if (!found) throw new Error(`missing arrow ${text}`);
  return found;
}
