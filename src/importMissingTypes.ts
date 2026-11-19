import * as vscode from "vscode";
import {
  firstImportEdits,
  importErrorCodesIn,
  typeNameSpan,
  type ProtocolEdit,
} from "./codeFixImports.js";

export async function importMissingTypes(
  document: vscode.TextDocument,
  binding: string | undefined,
  names: readonly string[],
): Promise<void> {
  if (!binding || document.uri.scheme !== "file" || !names.length) return;
  for (const name of names) {
    try {
      await importOne(document, binding, name);
    } catch {
      return;
    }
  }
}

async function importOne(
  document: vscode.TextDocument,
  binding: string,
  name: string,
): Promise<void> {
  const span = typeNameSpan(document.getText(), binding, name);
  if (!span) return;
  const file = document.uri.fsPath;
  const diagnostics: unknown = await vscode.commands.executeCommand(
    "typescript.tsserverRequest",
    "semanticDiagnosticsSync",
    { file, includeLinePosition: true },
  );
  const codes = importErrorCodesIn(diagnostics, span, document.getText());
  if (!codes.length) return;
  const start = document.positionAt(span.start);
  const end = document.positionAt(span.end);
  const fixes: unknown = await vscode.commands.executeCommand(
    "typescript.tsserverRequest",
    "getCodeFixes",
    {
      file,
      startLine: start.line + 1,
      startOffset: start.character + 1,
      endLine: end.line + 1,
      endOffset: end.character + 1,
      errorCodes: codes,
    },
  );
  const edits = firstImportEdits(file, fixes);
  if (!edits.length) return;
  await vscode.workspace.applyEdit(workspaceEdit(document, edits));
}

function workspaceEdit(document: vscode.TextDocument, edits: ProtocolEdit[]): vscode.WorkspaceEdit {
  const edit = new vscode.WorkspaceEdit();
  edit.set(
    document.uri,
    edits.map((change) =>
      vscode.TextEdit.replace(
        new vscode.Range(
          change.startLine - 1,
          change.startOffset - 1,
          change.endLine - 1,
          change.endOffset - 1,
        ),
        change.newText,
      ),
    ),
  );
  return edit;
}
