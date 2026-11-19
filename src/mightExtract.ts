export type ExtractTitle = "Extract in useMemo" | "Extract in useCallback";

export function mightExtract(
  cursorLine: string,
  cursorCharacter: number,
  selected: string,
  following: string,
  linesAbove: readonly string[],
  lookbehind = "",
): ExtractTitle | undefined {
  const kind = localKind(cursorLine, cursorCharacter, selected, following, lookbehind);
  if (!kind) return undefined;
  if (!inReactive(cursorLine, linesAbove)) return undefined;
  return kind === "callback" ? "Extract in useCallback" : "Extract in useMemo";
}

export function localKind(
  cursorLine: string,
  cursorCharacter: number,
  selected: string,
  following: string,
  lookbehind = "",
): "memo" | "callback" | undefined {
  if (selected.includes("=>") || /\bfunction\b/.test(selected)) return "callback";
  if (selected.includes("{") || selected.includes("[")) return "memo";
  const before = cursorLine.slice(0, cursorCharacter);
  const after = cursorLine.slice(cursorCharacter) + "\n" + following;
  return openLiteral(lookbehind + before, after) ?? declarationKind(before, after);
}

function openLiteral(before: string, after: string): "memo" | "callback" | undefined {
  let braces = 0;
  let brackets = 0;
  let openAt = -1;
  let open: "{" | "[" | undefined;
  for (let index = 0; index < before.length; index += 1) {
    const character = before[index];
    if (character === "{") {
      braces += 1;
      openAt = index;
      open = "{";
    } else if (character === "[") {
      brackets += 1;
      openAt = index;
      open = "[";
    } else if (character === "}" && braces > 0) braces -= 1;
    else if (character === "]" && brackets > 0) brackets -= 1;
  }
  if ((open === "{" && braces === 0) || (open === "[" && brackets === 0) || openAt < 0)
    return undefined;
  const inside = before.slice(openAt + 1) + after;
  if (inside.includes("=>") || /\bfunction\b/.test(inside)) return "callback";
  if (open === "[") return "memo";
  if (inside.includes(":") || inside.includes("{")) return "memo";
  return undefined;
}

function declarationKind(before: string, after: string): "memo" | "callback" | undefined {
  if (!/^[A-Za-z_$]/.test(after)) return undefined;
  if (/\bfunction\s*$/.test(before) || /\basync\s+function\s*$/.test(before)) return "callback";
  const tail = before.split(",").pop() ?? before;
  if (!/\b(?:const|let)\b/.test(before) || tail.includes("=")) return undefined;
  const rest = after.replace(/^[A-Za-z0-9_$]+\s*/, "");
  const eq = rest.indexOf("=");
  if (eq < 0) return "memo";
  const init = rest.slice(eq + 1);
  if (/^\s*(?:async\s+)?(?:function\b|<[^>\n]*>\s*)?(?:\([^)\n]*\)\s*)?=>/.test(init))
    return "callback";
  if (/^\s*(?:async\s+)?function\b/.test(init)) return "callback";
  if (/^\s*[A-Za-z_$][A-Za-z0-9_$]*\s*=>/.test(init)) return "callback";
  return "memo";
}

function inReactive(cursorLine: string, linesAbove: readonly string[]): boolean {
  if (/\bfunction\b|=>/.test(cursorLine)) return true;
  for (let index = linesAbove.length - 1; index >= 0; index -= 1) {
    if (/\bfunction\b|=>/.test(linesAbove[index] ?? "")) return true;
  }
  return false;
}
