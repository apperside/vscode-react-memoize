import * as vscode from "vscode";
import { localKind, mightExtract } from "./mightExtract.js";
import type { TextEdit } from "./buildEdits.js";
import type { ExtractAction } from "./provideExtractAction.js";

const languages = ["javascript", "javascriptreact", "typescript", "typescriptreact"];
const extractCommand = "reactMemoize.extract";

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(languages, new ExtractProvider(), {
      providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
    }),
    vscode.commands.registerCommand(
      extractCommand,
      async (uri: string, start: number, end: number, languageId: string) => {
        await runExtract(uri, start, end, languageId);
      },
    ),
  );
}

export function deactivate(): void {}

class ExtractProvider implements vscode.CodeActionProvider {
  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    _context: vscode.CodeActionContext,
    token: vscode.CancellationToken,
  ): vscode.CodeAction[] | undefined {
    if (token.isCancellationRequested) return undefined;
    const title = titleFor(document, range);
    if (!title) return undefined;
    const action = new vscode.CodeAction(title, vscode.CodeActionKind.QuickFix);
    action.command = {
      command: extractCommand,
      title,
      arguments: [
        document.uri.toString(),
        document.offsetAt(range.start),
        document.offsetAt(range.end),
        document.languageId,
      ],
    };
    return [action];
  }
}

function titleFor(
  document: vscode.TextDocument,
  range: vscode.Range,
): "Extract in useMemo" | "Extract in useCallback" | undefined {
  const line = document.lineAt(range.start.line).text;
  const selected = range.isEmpty ? "" : document.getText(selectionSample(document, range));
  const following =
    range.start.line + 1 < document.lineCount ? document.lineAt(range.start.line + 1).text : "";
  const lookbehind = textAbove(document, range.start.line, 8);
  if (!localKind(line, range.start.character, selected, following, lookbehind)) return undefined;
  return mightExtract(
    line,
    range.start.character,
    selected,
    following,
    linesAbove(document, range.start.line),
    lookbehind,
  );
}

function textAbove(document: vscode.TextDocument, line: number, count: number): string {
  const start = Math.max(0, line - count);
  let text = "";
  for (let index = start; index < line; index += 1) text += `${document.lineAt(index).text}\n`;
  return text;
}

function linesAbove(document: vscode.TextDocument, line: number): string[] {
  const lines: string[] = [];
  const start = Math.max(0, line - 2000);
  for (let index = line - 1; index >= start; index -= 1) {
    const text = document.lineAt(index).text;
    lines.push(text);
    if (/\bfunction\b|=>/.test(text)) break;
  }
  lines.reverse();
  return lines;
}

function selectionSample(document: vscode.TextDocument, range: vscode.Range): vscode.Range {
  const start = document.offsetAt(range.start);
  const end = document.offsetAt(range.end);
  if (end - start <= 4000) return range;
  return new vscode.Range(range.start, document.positionAt(start + 4000));
}

async function runExtract(
  uri: string,
  start: number,
  end: number,
  languageId: string,
): Promise<void> {
  const { provideExtractAction, scriptKindFor } = await import("./provideExtractAction.js");
  const scriptKind = scriptKindFor(languageId);
  const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(uri));
  if (!scriptKind) return;
  const selection = { start, end };
  const source = document.getText();
  const preview = provideExtractAction(source, selection, scriptKind, undefined, false);
  if (!preview) {
    vscode.window.setStatusBarMessage("Nothing in this selection can be extracted", 4000);
    return;
  }
  let inferred;
  if (preview.needsParameterTypes) {
    const tokens = new vscode.CancellationTokenSource();
    try {
      inferred = await (
        await import("./inferParameterTypes.js")
      ).inferParameterTypes(document, selection, scriptKind, tokens.token);
    } finally {
      tokens.dispose();
    }
  }
  const action = provideExtractAction(source, selection, scriptKind, inferred);
  if (!action?.edits.length) return;
  const unresolved = action.unresolvedTypes ?? [];
  const applied = await vscode.workspace.applyEdit(
    unresolved.length ? toPlainEdit(document, action) : toWorkspaceEdit(document, action),
  );
  if (!applied) {
    vscode.window.setStatusBarMessage("Extract could not be applied", 4000);
    return;
  }
  if (!unresolved.length || !action.placeholder) return;
  const { importMissingTypes } = await import("./importMissingTypes.js");
  await importMissingTypes(document, action.placeholder, unresolved);
  await renameBinding(document, action.placeholder);
}

function toPlainEdit(document: vscode.TextDocument, action: ExtractAction): vscode.WorkspaceEdit {
  const edit = new vscode.WorkspaceEdit();
  edit.set(
    document.uri,
    action.edits.map((change) =>
      vscode.TextEdit.replace(
        new vscode.Range(document.positionAt(change.start), document.positionAt(change.end)),
        change.newText,
      ),
    ),
  );
  return edit;
}

async function renameBinding(document: vscode.TextDocument, name: string): Promise<void> {
  const marker = `const ${name} =`;
  const at = document.getText().indexOf(marker);
  if (at < 0) return;
  const position = document.positionAt(at + "const ".length);
  await vscode.window.showTextDocument(document, {
    selection: new vscode.Selection(position, position),
    preview: false,
  });
  try {
    await vscode.commands.executeCommand("editor.action.rename");
  } catch {
    // The extract is already in the file. Rename is only the editable name.
  }
}

function toWorkspaceEdit(
  document: vscode.TextDocument,
  action: ExtractAction,
): vscode.WorkspaceEdit {
  const edits: (vscode.TextEdit | vscode.SnippetTextEdit)[] = action.edits.map((change) =>
    toEdit(document, change, action.placeholder),
  );
  const edit = new vscode.WorkspaceEdit();
  edit.set(document.uri, edits);
  return edit;
}

function toEdit(
  document: vscode.TextDocument,
  change: TextEdit,
  placeholder: string | undefined,
): vscode.TextEdit | vscode.SnippetTextEdit {
  const range = new vscode.Range(
    document.positionAt(change.start),
    document.positionAt(change.end),
  );
  if (!change.placeholder || !placeholder) return vscode.TextEdit.replace(range, change.newText);
  const snippet = new vscode.SnippetString();
  if (change.placeholder === "usage") {
    snippet.appendPlaceholder(placeholder, 1);
    return vscode.SnippetTextEdit.replace(range, snippet);
  }
  const marker = `const ${placeholder}`;
  const markerAt = change.newText.indexOf(marker);
  if (markerAt < 0) return vscode.TextEdit.replace(range, change.newText);
  const nameAt = markerAt + "const ".length;
  snippet.appendText(change.newText.slice(0, nameAt));
  snippet.appendPlaceholder(placeholder, 1);
  snippet.appendText(change.newText.slice(nameAt + placeholder.length));
  return change.start === change.end
    ? vscode.SnippetTextEdit.insert(range.start, snippet)
    : vscode.SnippetTextEdit.replace(range, snippet);
}
