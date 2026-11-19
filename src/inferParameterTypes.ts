import * as vscode from "vscode";
import type ts from "typescript";
import {
  callbackNeedsTypes,
  callbackQuickInfoOffset,
  parameterTypesFromSignature,
  type InferredCallback,
} from "./callbackTypes.js";
import { findExtractTarget, isInlineExtract, type Selection } from "./findExtractTarget.js";
import { parseSource } from "./parseSource.js";

export async function inferParameterTypes(
  document: vscode.TextDocument,
  selection: Selection,
  scriptKind: ts.ScriptKind,
  token: vscode.CancellationToken,
): Promise<InferredCallback | undefined> {
  if (document.uri.scheme !== "file" || token.isCancellationRequested) return undefined;
  const sourceFile = parseSource(document.getText(), scriptKind);
  const target = findExtractTarget(sourceFile, selection);
  if (!target || !isInlineExtract(target) || target.hook !== "useCallback") return undefined;
  if (!callbackNeedsTypes(target.expression)) return undefined;
  const offset = callbackQuickInfoOffset(sourceFile, target.expression);
  if (offset === undefined) return undefined;
  const position = document.positionAt(offset);
  const display = await quickInfo(document, position);
  if (!display || token.isCancellationRequested) return undefined;
  return parameterTypesFromSignature(display);
}

async function quickInfo(
  document: vscode.TextDocument,
  position: vscode.Position,
): Promise<string | undefined> {
  try {
    const result: unknown = await vscode.commands.executeCommand(
      "typescript.tsserverRequest",
      "quickinfo",
      {
        file: document.uri.fsPath,
        line: position.line + 1,
        offset: position.character + 1,
      },
    );
    return displayText(result);
  } catch {
    return undefined;
  }
}

function displayText(result: unknown): string | undefined {
  if (!result || typeof result !== "object") return undefined;
  const record = result as { body?: unknown; success?: boolean };
  if (record.success === false) return undefined;
  const body = "body" in record ? record.body : result;
  if (!body || typeof body !== "object") return undefined;
  const parts = (body as { displayParts?: { text?: string }[] }).displayParts;
  if (Array.isArray(parts) && parts.length > 0)
    return parts.map((part) => part.text ?? "").join("");
  const displayString = (body as { displayString?: unknown }).displayString;
  return typeof displayString === "string" ? displayString : undefined;
}
