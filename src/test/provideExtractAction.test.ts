import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";
import { provideExtractAction, type ExtractAction } from "../provideExtractAction.js";

function apply(source: string, action: ExtractAction | undefined): string {
  const ordered = [...(action?.edits ?? [])].sort((left, right) => right.start - left.start);
  return ordered.reduce(
    (text, edit) => text.slice(0, edit.start) + edit.newText + text.slice(edit.end),
    source,
  );
}

test("Profile label becomes one useMemo action", () => {
  const source =
    "function Profile({ user, onSelect }: Props) {\n  const label = user.name.toUpperCase();\n  const handleSelect = () => onSelect(user.id);\n}\n";
  const start = source.indexOf("label");
  const action = provideExtractAction(
    source,
    { start, end: start + "label".length },
    ts.ScriptKind.TSX,
  );
  assert.equal(action?.title, "Extract in useMemo");
  assert.equal(
    apply(source, action),
    `import { useMemo } from "react";
function Profile({ user, onSelect }: Props) {
  const label = useMemo(() => user.name.toUpperCase(), [user.name]);
  const handleSelect = () => onSelect(user.id);
}
`,
  );
});

test("an inline object prop becomes useMemo", () => {
  const source = `function Board() {
  return (
    <UCViewportBlotter
      defaultSort={{ field: "SubmittedTime", sortType: "desc" }}
    />
  );
}
`;
  const needle = '{ field: "SubmittedTime", sortType: "desc" }';
  const start = source.indexOf(needle);
  const action = provideExtractAction(
    source,
    { start, end: start + needle.length },
    ts.ScriptKind.TSX,
  );
  assert.equal(action?.title, "Extract in useMemo");
  assert.equal(
    apply(source, action),
    `import { useMemo } from "react";
function Board() {
  const defaultSort = useMemo(() => ({ field: "SubmittedTime", sortType: "desc" }), []);
  return (
    <UCViewportBlotter
      defaultSort={defaultSort}
    />
  );
}
`,
  );
});

test("an inline handler becomes useCallback", () => {
  const source = `function SaveBar({ id, save }: Props) {
  return <Button onClick={() => save(id)} />;
}
`;
  const needle = "() => save(id)";
  const start = source.indexOf(needle);
  const action = provideExtractAction(
    source,
    { start, end: start + needle.length },
    ts.ScriptKind.TSX,
  );
  assert.equal(action?.title, "Extract in useCallback");
  assert.equal(action?.placeholder, "onClick");
  assert.equal(
    apply(source, action),
    `import { useCallback } from "react";
function SaveBar({ id, save }: Props) {
  const onClick = useCallback(() => save(id), [save, id]);
  return <Button onClick={onClick} />;
}
`,
  );
});

test("an inline prop after an early return is hoisted above it", () => {
  const source = `function Board({ id }: Props) {
  if (!id) return null;
  return <Bar defaultSort={{ field: id }} />;
}
`;
  const needle = "{ field: id }";
  const start = source.indexOf(needle);
  const action = provideExtractAction(
    source,
    { start, end: start + needle.length },
    ts.ScriptKind.TSX,
  );
  assert.equal(
    apply(source, action),
    `import { useMemo } from "react";
function Board({ id }: Props) {
  const defaultSort = useMemo(() => ({ field: id }), [id]);
  if (!id) return null;
  return <Bar defaultSort={defaultSort} />;
}
`,
  );
});

test("an inline prop in an arrow without a block becomes a return", () => {
  const source = `const Board = () => (
  <UCViewportBlotter
    defaultSort={{ field: "SubmittedTime", sortType: "desc" }}
  />
);
`;
  const needle = '{ field: "SubmittedTime", sortType: "desc" }';
  const start = source.indexOf(needle);
  const action = provideExtractAction(
    source,
    { start, end: start + needle.length },
    ts.ScriptKind.TSX,
  );
  assert.equal(
    apply(source, action),
    `import { useMemo } from "react";
const Board = () => {
  const defaultSort = useMemo(() => ({ field: "SubmittedTime", sortType: "desc" }), []);
  return (
  <UCViewportBlotter
    defaultSort={defaultSort}
  />
);
};
`,
  );
});

test("a selection that starts on the tag still extracts the prop", () => {
  const source = `function Board() {
  return (
    <UCViewportBlotter
      defaultSort={{ field: "SubmittedTime", sortType: "desc" }}
    />
  );
}
`;
  const start = source.indexOf("<UCViewportBlotter");
  const end = source.indexOf("/>");
  const action = provideExtractAction(source, { start, end }, ts.ScriptKind.TSX);
  assert.equal(action?.title, "Extract in useMemo");
  assert.equal(action?.placeholder, "defaultSort");
});

test("an inline prop whose value is declared after an early return is refused", () => {
  const source = `function Board({ id }: Props) {
  if (!id) return null;
  const extra = id;
  return <Bar defaultSort={{ field: extra }} />;
}
`;
  const needle = "{ field: extra }";
  const start = source.indexOf(needle);
  assert.equal(
    provideExtractAction(source, { start, end: start + needle.length }, ts.ScriptKind.TSX),
    undefined,
  );
});

test("a cursor in a plain function returns nothing", () => {
  const source = "function profile() {\n  const label = 1;\n}\n";
  const start = source.indexOf("label");
  assert.equal(
    provideExtractAction(source, { start, end: start + "label".length }, ts.ScriptKind.TS),
    undefined,
  );
});

test("an inline handler inside a useMemo callback is not extracted, it is already memoized", () => {
  const source = `function Table({ save, table }: Props) {
  const dialog = useMemo(() => <Dialog onSave={(map) => save(map, table)} />, [save, table]);
  return dialog;
}
`;
  const needle = "(map) => save(map, table)";
  const start = source.indexOf(needle);
  assert.equal(
    provideExtractAction(source, { start, end: start + needle.length }, ts.ScriptKind.TSX),
    undefined,
  );
});

test("the same holds for React.useMemo and useCallback callbacks", () => {
  for (const hook of ["React.useMemo", "useCallback"]) {
    const source = `function Table({ save }: Props) {
  const dialog = ${hook}(() => <Dialog onSave={() => save()} />, [save]);
  return dialog;
}
`;
    const needle = "() => save()";
    const start = source.indexOf(needle);
    assert.equal(
      provideExtractAction(source, { start, end: start + needle.length }, ts.ScriptKind.TSX),
      undefined,
      hook,
    );
  }
});

test("an inline handler in a plain callback that reads nothing from it is hoisted above the statement", () => {
  const source = `function List({ rows, save }: Props) {
  const items = rows.map(() => <Row onPick={() => save()} />);
  return items;
}
`;
  const needle = "() => save()";
  const start = source.indexOf(needle);
  const action = provideExtractAction(
    source,
    { start, end: start + needle.length },
    ts.ScriptKind.TSX,
  );
  assert.equal(action?.title, "Extract in useCallback");
  assert.equal(
    apply(source, action),
    `import { useCallback } from "react";
function List({ rows, save }: Props) {
  const onPick = useCallback(() => save(), [save]);
  const items = rows.map(() => <Row onPick={onPick} />);
  return items;
}
`,
  );
});

test("an inline handler that reads a parameter of the nested callback is refused", () => {
  const source = `function List({ rows, save }: Props) {
  const items = useMemo(() => rows.map((row) => <Row onPick={() => save(row.id)} />), [rows]);
  return items;
}
`;
  const needle = "() => save(row.id)";
  const start = source.indexOf(needle);
  assert.equal(
    provideExtractAction(source, { start, end: start + needle.length }, ts.ScriptKind.TSX),
    undefined,
  );
});

test("an inline handler that reads a local of the nested callback is refused", () => {
  const source = `function Table({ save }: Props) {
  const dialog = useMemo(() => {
    const color = pick();
    return <Dialog onSave={() => save(color)} />;
  }, []);
  return dialog;
}
`;
  const needle = "() => save(color)";
  const start = source.indexOf(needle);
  assert.equal(
    provideExtractAction(source, { start, end: start + needle.length }, ts.ScriptKind.TSX),
    undefined,
  );
});

test("the handler shape from a real table component, inside its useMemo, is not extracted", () => {
  const source = `const UCCurveDataTable = ({ table, setDialog }: Props) => {
  const colorDialog = useMemo(
    () => (
      <ChangeColorDialog
        onClose={() => setDialog(undefined)}
        onSave={(map) => {
          map.forEach((value, key) => {
            table.apply(key, value);
          });
        }}
      />
    ),
    [table],
  );
  return colorDialog;
};
`;
  const needle = "(map) => {";
  const start = source.indexOf(needle);
  assert.equal(provideExtractAction(source, { start, end: start }, ts.ScriptKind.TSX), undefined);
});
