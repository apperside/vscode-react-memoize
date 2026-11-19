import * as vscode from "vscode";
import { localKind, mightExtract } from "./mightExtract.js";
import type { TextEdit } from "./buildEdits.js";
import type { ExtractAction } from "./provideExtractAction.js";
import { createLog, describe, log, preview } from "./log.js";

const languages = ["javascript", "javascriptreact", "typescript", "typescriptreact"];
const extractCommand = "reactMemoize.extract";

export function activate(context: vscode.ExtensionContext): void {
  const channel = createLog();
  log.info(
    `Activated. VS Code ${vscode.version}, extension ${String(context.extension.packageJSON.version)}`,
  );
  context.subscriptions.push(
    channel,
    vscode.commands.registerCommand("reactMemoize.showLog", () => channel.show(true)),
    vscode.languages.registerCodeActionsProvider(languages, new ExtractProvider(), {
      providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
    }),
    vscode.commands.registerCommand(
      extractCommand,
      async (uri: string, start: number, end: number, languageId: string) => {
        try {
          await runExtract(uri, start, end, languageId);
        } catch (error) {
          log.error("Extract failed with an unexpected error", error);
          void vscode.window.showErrorMessage(
            "vscode-react-memoize: extract failed. See the 'vscode-react-memoize' output channel.",
          );
        }
      },
    ),
  );
}

export function deactivate(): void {}

class ExtractProvider implements vscode.CodeActionProvider {
  async provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    _context: vscode.CodeActionContext,
    token: vscode.CancellationToken,
  ): Promise<vscode.CodeAction[] | undefined> {
    if (token.isCancellationRequested) return undefined;
    // The text rules are a cheap filter. The syntax tree has the last word, so the lightbulb never
    // offers something the extract would then refuse.
    if (!titleFor(document, range)) return undefined;
    const title = await confirmedTitle(document, range);
    if (!title || token.isCancellationRequested) return undefined;
    log.debug(
      `Offering "${title}" at ${document.fileName}:${range.start.line + 1}:${range.start.character + 1}`,
    );
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

async function confirmedTitle(
  document: vscode.TextDocument,
  range: vscode.Range,
): Promise<"Extract in useMemo" | "Extract in useCallback" | undefined> {
  try {
    const { provideExtractAction, scriptKindFor } = await import("./provideExtractAction.js");
    const scriptKind = scriptKindFor(document.languageId);
    if (!scriptKind) return undefined;
    const selection = { start: document.offsetAt(range.start), end: document.offsetAt(range.end) };
    const action = provideExtractAction(
      document.getText(),
      selection,
      scriptKind,
      undefined,
      false,
    );
    if (!action) {
      log.debug(
        `No action at ${document.fileName}:${range.start.line + 1}:${range.start.character + 1}: the syntax tree has nothing to extract here`,
      );
    }
    return action?.title;
  } catch (error) {
    log.error("Could not confirm the action against the syntax tree", error);
    return undefined;
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
  const where = `${document.fileName}:${range.start.line + 1}:${range.start.character + 1}`;
  const kind = localKind(line, range.start.character, selected, following, lookbehind);
  if (!kind) {
    log.debug(`No action at ${where}: not a memo/callback candidate. Line: "${preview(line)}"`);
    return undefined;
  }
  const title = mightExtract(
    line,
    range.start.character,
    selected,
    following,
    linesAbove(document, range.start.line),
    lookbehind,
  );
  if (!title) {
    log.debug(
      `No action at ${where}: candidate (${kind}) but not inside a function/arrow. Line: "${preview(line)}"`,
    );
  }
  return title;
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
  log.info(
    `Extract requested: ${document.fileName} [${start}-${end}] language=${languageId} ` +
      `scheme=${document.uri.scheme} selected="${preview(document.getText().slice(start, end))}"`,
  );
  if (!scriptKind) {
    log.warn(`Unsupported language "${languageId}", nothing to do`);
    return;
  }
  const selection = { start, end };
  const source = document.getText();
  const dryRun = provideExtractAction(source, selection, scriptKind, undefined, false);
  if (!dryRun) {
    log.warn("findExtractTarget found no extractable node at this position");
    try {
      const { describeSyntaxPath, excerptAround } = await import("./explainNoTarget.js");
      log.warn(`Source around the cursor: ${excerptAround(source, start)}`);
      log.warn(
        `Syntax path at the cursor, innermost first: ${describeSyntaxPath(source, scriptKind, start)}`,
      );
    } catch (error) {
      log.error("Could not describe the syntax at the cursor", error);
    }
    void vscode.window
      .showInformationMessage(
        "vscode-react-memoize: nothing can be extracted at this position.",
        "Show log",
      )
      .then((choice) => {
        if (choice === "Show log") createLog().show(true);
      });
    return;
  }
  log.info(`Target: ${dryRun.title} needsParameterTypes=${String(dryRun.needsParameterTypes)}`);
  let inferred;
  if (dryRun.needsParameterTypes) {
    const tokens = new vscode.CancellationTokenSource();
    try {
      inferred = await (
        await import("./inferParameterTypes.js")
      ).inferParameterTypes(document, selection, scriptKind, tokens.token);
      log.info(
        inferred
          ? `Inferred parameter types: ${JSON.stringify(inferred)}`
          : "Could not infer parameter types (tsserver returned nothing usable)",
      );
    } finally {
      tokens.dispose();
    }
  }
  const action = provideExtractAction(source, selection, scriptKind, inferred);
  if (!action?.edits.length) {
    log.warn("Second pass produced no edits, nothing applied");
    return;
  }
  const unresolved = action.unresolvedTypes ?? [];
  log.info(
    `Applying ${action.edits.length} edit(s); placeholder=${String(action.placeholder)} ` +
      `unresolvedTypes=[${unresolved.join(", ")}]`,
  );
  log.debug(`Edits: ${JSON.stringify(action.edits)}`);
  const applied = await vscode.workspace.applyEdit(
    unresolved.length ? toPlainEdit(document, action) : toWorkspaceEdit(document, action),
  );
  if (!applied) {
    log.error("workspace.applyEdit returned false");
    vscode.window.setStatusBarMessage("Extract could not be applied", 4000);
    return;
  }
  log.info("Edits applied");
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
  } catch (error) {
    // The extract is already in the file. Rename is only the editable name.
    log.warn(`Rename step failed: ${describe(error)}`);
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
