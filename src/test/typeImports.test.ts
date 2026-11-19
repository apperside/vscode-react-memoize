import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";
import { missingTypeNames, prepareTypeImports } from "../typeImports.js";
import { provideExtractAction } from "../provideExtractAction.js";

test("an import() type becomes a named type import", () => {
  const source = `import { Button } from "react";
function Save() {
  return <Button onClick={(event) => event.clientX} />;
}
`;
  const needle = "(event) => event.clientX";
  const start = source.indexOf(needle);
  const action = provideExtractAction(
    source,
    { start, end: start + needle.length },
    ts.ScriptKind.TSX,
    {
      types: ['import("react").MouseEvent<HTMLButtonElement, import("react").NativeEvent>'],
      optional: [false],
    },
  );
  assert.deepEqual(action?.unresolvedTypes, []);
  const next = apply(source, action?.edits ?? []);
  assert.equal(
    next,
    `import { Button, useCallback, type MouseEvent, type NativeEvent } from "react";
function Save() {
  const onClick = useCallback((event: MouseEvent<HTMLButtonElement, NativeEvent>) => event.clientX, []);
  return <Button onClick={onClick} />;
}
`,
  );
});

test("a react event type argument that repeats the name stays the global default", () => {
  const source = `import { Button } from "react";
function Save() {
  return <Button onClick={(event) => event.clientX} />;
}
`;
  const needle = "(event) => event.clientX";
  const start = source.indexOf(needle);
  const action = provideExtractAction(
    source,
    { start, end: start + needle.length },
    ts.ScriptKind.TSX,
    {
      types: ["MouseEvent<HTMLButtonElement, MouseEvent>"],
      optional: [false],
    },
  );
  assert.deepEqual(action?.unresolvedTypes, []);
  const next = apply(source, action?.edits ?? []);
  assert.equal(
    next,
    `import { Button, useCallback, type MouseEvent } from "react";
function Save() {
  const onClick = useCallback((event: MouseEvent<HTMLButtonElement>) => event.clientX, []);
  return <Button onClick={onClick} />;
}
`,
  );
});

test("a type from another module becomes its own type import", () => {
  const source = `function Save() {
  return <Row onSelect={(row) => row.id} />;
}
`;
  const needle = "(row) => row.id";
  const start = source.indexOf(needle);
  const action = provideExtractAction(
    source,
    { start, end: start + needle.length },
    ts.ScriptKind.TSX,
    { types: ['import("./row").Row'], optional: [false] },
  );
  const next = apply(source, action?.edits ?? []);
  assert.equal(
    next,
    `import { useCallback } from "react";
import type { Row } from "./row";
function Save() {
  const onSelect = useCallback((row: Row) => row.id, []);
  return <Row onSelect={onSelect} />;
}
`,
  );
});

test("a type that is already imported is left alone", () => {
  const sourceFile = ts.createSourceFile(
    "fixture.tsx",
    'import type { MouseEvent } from "react";\n',
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const prepared = prepareTypeImports(sourceFile, {
    types: ['import("react").MouseEvent<HTMLButtonElement>'],
    optional: [false],
  });
  assert.deepEqual(prepared.edits, []);
  assert.equal(prepared.inferred.types[0], "MouseEvent<HTMLButtonElement>");
});

test("a bare type name that is not in scope is reported", () => {
  const sourceFile = ts.createSourceFile(
    "fixture.tsx",
    'import { Button } from "react";\nfunction Save<T>(id: T) { return id; }\n',
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  assert.deepEqual(
    missingTypeNames(sourceFile, {
      types: ["MouseEvent<HTMLButtonElement, T>"],
      optional: [false],
      typeParameters: "<T>",
    }),
    ["MouseEvent"],
  );
});

function apply(source: string, edits: { start: number; end: number; newText: string }[]): string {
  return [...edits]
    .sort((left, right) => right.start - left.start)
    .reduce(
      (text, edit) => text.slice(0, edit.start) + edit.newText + text.slice(edit.end),
      source,
    );
}
