import ts from "typescript";
import { parseSource } from "./parseSource.js";

/**
 * One line describing the syntax around an offset, innermost node first, so a failed extract can be
 * diagnosed from the log without the source file.
 */
export function describeSyntaxPath(
  source: string,
  scriptKind: ts.ScriptKind,
  offset: number,
): string {
  const sourceFile = parseSource(source, scriptKind);
  let node: ts.Node = sourceFile;
  for (;;) {
    const child = node
      .getChildren(sourceFile)
      .find(
        (candidate) => candidate.getStart(sourceFile) <= offset && offset <= candidate.getEnd(),
      );
    if (!child) break;
    node = child;
  }
  const path: string[] = [];
  for (
    let current: ts.Node | undefined = node;
    current && current.kind !== ts.SyntaxKind.SourceFile && path.length < 14;
    current = current.parent
  ) {
    const text = current.getText(sourceFile).replace(/\s+/g, " ");
    path.push(
      `${ts.SyntaxKind[current.kind]} "${text.length > 50 ? `${text.slice(0, 50)}…` : text}"`,
    );
  }
  return path.length ? path.join(" < ") : "SourceFile (no node at this offset)";
}

/** A short excerpt of the source around an offset, for the log. */
export function excerptAround(source: string, offset: number, radius = 60): string {
  const from = Math.max(0, offset - radius);
  const to = Math.min(source.length, offset + radius);
  return `${source.slice(from, offset)}⟦cursor⟧${source.slice(offset, to)}`.replace(/\s+/g, " ");
}
