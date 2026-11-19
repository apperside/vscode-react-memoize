import * as vscode from "vscode";
import {
  firstImportEdits,
  importErrorCodesIn,
  typeNameSpan,
  type ProtocolEdit,
} from "./codeFixImports.js";
import { log } from "./log.js";

export async function importMissingTypes(
  document: vscode.TextDocument,
  binding: string | undefined,
  names: readonly string[],
): Promise<void> {
  if (!binding || document.uri.scheme !== "file" || !names.length) return;
  for (const name of names) {
    try {
      await importOne(document, binding, name);
    } catch (error) {
      log.error(`Importing type "${name}" failed`, error);
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
  if (!span) {
    log.debug(`Import "${name}": type name not found in the generated code`);
    return;
  }
  const file = document.uri.fsPath;
  const diagnostics: unknown = await vscode.commands.executeCommand(
    "typescript.tsserverRequest",
    "semanticDiagnosticsSync",
    { file, includeLinePosition: true },
  );
  const codes = importErrorCodesIn(diagnostics, span, document.getText());
  if (!codes.length) {
    log.debug(`Import "${name}": no matching diagnostics, assuming already in scope`);
    return;
  }
  log.info(`Import "${name}": error codes ${codes.join(", ")}`);
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
  if (!edits.length) {
    log.warn(`Import "${name}": tsserver offered no import fix for ${file}. ${summarize(fixes)}`);
    return;
  }
  log.info(`Import "${name}": applying ${edits.length} import edit(s)`);
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

/** One line describing what tsserver answered, so a failed import can be diagnosed from the log alone. */
function summarize(fixes: unknown): string {
  if (!fixes || typeof fixes !== "object") return `Response: ${String(fixes)}`;
  const record = fixes as { success?: boolean; message?: string; body?: unknown };
  const body = "body" in record ? record.body : fixes;
  if (!Array.isArray(body)) {
    return `Response: success=${String(record.success)} message=${String(record.message)} body=${typeof body}`;
  }
  const names = body.map((fix) => {
    const entry = fix as {
      fixName?: string;
      description?: string;
      changes?: { fileName?: string }[];
    };
    const files = (entry.changes ?? []).map((change) => change.fileName).join(", ");
    return `${entry.fixName ?? "?"} "${entry.description ?? ""}" [${files}]`;
  });
  return `tsserver returned ${body.length} fix(es): ${names.join(" | ") || "none"}`;
}
