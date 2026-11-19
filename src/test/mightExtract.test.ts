import assert from "node:assert/strict";
import test from "node:test";
import { mightExtract } from "../mightExtract.js";

const above = ["function Board() {"];

test("a selected object prop is useMemo", () => {
  const line = "      defaultSort={{ field: 'SubmittedTime', sortType: 'desc' }}";
  const selected = "{ field: 'SubmittedTime', sortType: 'desc' }";
  const start = line.indexOf(selected);
  assert.equal(mightExtract(line, start, selected, "", above), "Extract in useMemo");
});

test("a selected handler is useCallback", () => {
  const line = "  return <Button onClick={() => save(id)} />;";
  const selected = "() => save(id)";
  const start = line.indexOf(selected);
  assert.equal(mightExtract(line, start, selected, "", above), "Extract in useCallback");
});

test("the cursor on a binding name guesses from the initializer", () => {
  const memo = "  const label = user.name;";
  const callback = "  const handle = () => save(id);";
  assert.equal(mightExtract(memo, memo.indexOf("label"), "", "", above), "Extract in useMemo");
  assert.equal(
    mightExtract(callback, callback.indexOf("handle"), "", "", above),
    "Extract in useCallback",
  );
});

test("the cursor inside a multiline object prop is useMemo", () => {
  assert.equal(
    mightExtract("      field: 'SubmittedTime',", 6, "", "", above, "    defaultSort={{\n"),
    "Extract in useMemo",
  );
});

test("the cursor on an initializer or a plain line offers nothing", () => {
  const line = "  const label = user.name;";
  assert.equal(mightExtract(line, line.indexOf("user"), "", "", above), undefined);
  assert.equal(mightExtract("  return null;", 2, "", "", above), undefined);
  assert.equal(mightExtract("  const label = user.name;", 9, "", "", []), undefined);
});
