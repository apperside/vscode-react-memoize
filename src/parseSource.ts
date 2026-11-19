import ts from "typescript";

const scriptKinds: Record<string, ts.ScriptKind> = {
  javascript: ts.ScriptKind.JS,
  javascriptreact: ts.ScriptKind.JSX,
  typescript: ts.ScriptKind.TS,
  typescriptreact: ts.ScriptKind.TSX,
};

export function scriptKindFor(languageId: string): ts.ScriptKind | undefined {
  return scriptKinds[languageId];
}

let cached: { source: string; scriptKind: ts.ScriptKind; file: ts.SourceFile } | undefined;

export function parseSource(source: string, scriptKind: ts.ScriptKind): ts.SourceFile {
  if (cached && cached.scriptKind === scriptKind && cached.source === source) return cached.file;
  const fileName =
    scriptKind === ts.ScriptKind.TSX || scriptKind === ts.ScriptKind.JSX ? "open.tsx" : "open.ts";
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, scriptKind);
  cached = { source, scriptKind, file };
  return file;
}
