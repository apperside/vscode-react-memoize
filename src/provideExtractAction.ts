import ts from "typescript";
import { buildEdits, type TextEdit } from "./buildEdits.js";
import { callbackNeedsTypes, type InferredCallback } from "./callbackTypes.js";
import { collectDependencies } from "./collectDependencies.js";
import {
  findExtractTarget,
  inlineInsertStatement,
  isInlineExtract,
  type ExtractTarget,
  type Selection,
} from "./findExtractTarget.js";
import { parseSource } from "./parseSource.js";
import { missingTypeNames, prepareTypeImports } from "./typeImports.js";

export { scriptKindFor } from "./parseSource.js";

export interface ExtractAction {
  title: "Extract in useMemo" | "Extract in useCallback";
  edits: TextEdit[];
  /** Inline extract: the binding name is a linked snippet, prefilled with this text. */
  placeholder?: string;
  /** Parameter types are filled in when the action is resolved. */
  needsParameterTypes?: boolean;
  /** Type names written on the callback that are not in scope yet. */
  unresolvedTypes?: string[];
}

export function provideExtractAction(
  source: string,
  selection: Selection,
  scriptKind: ts.ScriptKind,
  inferred?: InferredCallback,
  withEdits = true,
): ExtractAction | undefined {
  const sourceFile = parseSource(source, scriptKind);
  const found = findExtractTarget(sourceFile, selection);
  if (!found) return undefined;
  const target = placeInline(sourceFile, found);
  if (!target) return undefined;
  const inline = isInlineExtract(target);
  const prepared = inline && inferred ? prepareTypeImports(sourceFile, inferred) : undefined;
  const action: ExtractAction = {
    title: target.hook === "useMemo" ? "Extract in useMemo" : "Extract in useCallback",
    edits: withEdits
      ? mergeInserts([
          ...buildEdits(
            sourceFile,
            target,
            collectDependencies(sourceFile, target),
            prepared?.inferred ?? (inline ? inferred : undefined),
            prepared?.reactTypes ?? [],
          ),
          ...(prepared?.edits ?? []),
        ])
      : [],
    placeholder: inline ? target.name : undefined,
  };
  if (prepared) {
    const known = prepared.imported;
    action.unresolvedTypes = missingTypeNames(sourceFile, prepared.inferred).filter(
      (name) => !known.has(name),
    );
  }
  if (
    inline &&
    target.hook === "useCallback" &&
    callbackNeedsTypes(target.expression) &&
    !inferred
  ) {
    action.needsParameterTypes = true;
  }
  return action;
}

function placeInline(sourceFile: ts.SourceFile, target: ExtractTarget): ExtractTarget | undefined {
  if (!isInlineExtract(target) || target.implicitReturn) return target;
  const anchor = inlineInsertStatement(target, collectDependencies(sourceFile, target));
  if (!anchor) return undefined;
  return { ...target, statement: anchor };
}

function mergeInserts(edits: TextEdit[]): TextEdit[] {
  const merged: TextEdit[] = [];
  for (const edit of edits) {
    const previous = merged[merged.length - 1];
    if (
      previous &&
      !previous.placeholder &&
      !edit.placeholder &&
      previous.start === edit.start &&
      previous.end === edit.end
    ) {
      previous.newText += edit.newText;
      continue;
    }
    merged.push({ ...edit });
  }
  return merged;
}
