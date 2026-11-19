import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";
import { describeSyntaxPath, excerptAround } from "../explainNoTarget.js";

test("the syntax path starts at the innermost node and climbs to the function", () => {
  const source =
    "function Row() {\n  const onClick = () => save(1);\n  return <b onClick={onClick} />;\n}\n";
  const path = describeSyntaxPath(source, ts.ScriptKind.TSX, source.indexOf("save") + 1);
  const kinds = path.split(" < ").map((entry) => entry.split(" ")[0]);
  assert.equal(kinds[0], "Identifier");
  assert.ok(kinds.includes("ArrowFunction"));
  assert.ok(kinds.includes("FunctionDeclaration"));
});

test("an offset outside any node still produces a readable line", () => {
  assert.match(describeSyntaxPath("", ts.ScriptKind.TS, 0), /SyntaxList|SourceFile|EndOfFileToken/);
});

test("the excerpt marks the cursor and flattens whitespace", () => {
  assert.equal(excerptAround("a\nb  c", 3, 10), "a b⟦cursor⟧ c");
});
