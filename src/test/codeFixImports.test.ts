import assert from "node:assert/strict";
import test from "node:test";
import { firstImportEdits, importErrorCodesIn, typeNameSpan } from "../codeFixImports.js";

test("the missing type is found inside the extracted callback", () => {
  const text = `import { useCallback } from "react";
function Save() {
  const onSelect = useCallback((row: Row) => row.id, []);
  return <Row onSelect={onSelect} />;
}
`;
  assert.deepEqual(typeNameSpan(text, "onSelect", "Row"), {
    start: text.indexOf("Row"),
    end: text.indexOf("Row") + 3,
  });
});

test("an import code fix becomes a text edit", () => {
  const text = "const onSelect = useCallback((row: Row) => row.id, []);\n";
  const span = typeNameSpan(text, "onSelect", "Row");
  assert.ok(span);
  const codes = importErrorCodesIn(
    {
      body: [
        {
          code: 2304,
          startLocation: { line: 1, offset: text.indexOf("Row") + 1 },
          endLocation: { line: 1, offset: text.indexOf("Row") + 4 },
        },
        { code: 1000, startLocation: { line: 1, offset: 1 }, endLocation: { line: 1, offset: 2 } },
      ],
    },
    span,
    text,
  );
  assert.deepEqual(codes, [2304]);
  assert.deepEqual(
    firstImportEdits("/app/Save.tsx", {
      body: [
        {
          fixName: "import",
          changes: [
            {
              fileName: "/app/Save.tsx",
              textChanges: [
                {
                  start: { line: 1, offset: 1 },
                  end: { line: 1, offset: 1 },
                  newText: 'import type { Row } from "./row";\n',
                },
              ],
            },
          ],
        },
      ],
    }),
    [
      {
        startLine: 1,
        startOffset: 1,
        endLine: 1,
        endOffset: 1,
        newText: 'import type { Row } from "./row";\n',
      },
    ],
  );
});

test("a Windows drive letter in a different case still matches the document", () => {
  const edits = firstImportEdits("c:\\Users\\dev\\Save.tsx", {
    body: [
      {
        fixName: "import",
        changes: [
          {
            fileName: "C:/Users/dev/Save.tsx",
            textChanges: [
              {
                start: { line: 1, offset: 1 },
                end: { line: 1, offset: 1 },
                newText: 'import { Row } from "./types";\n',
              },
            ],
          },
        ],
      },
    ],
  });
  assert.equal(edits.length, 1);
});
