---
name: vscode-react-memoize
description: A customs declaration form on a saturated green ground, where the dependency array is the box the tool fills in for you.
colors:
  customs-green: "#0b6e4f"
  customs-green-deep: "#084a36"
  on-green: "#d4efe2"
  sheet-white: "#ffffff"
  form-tint: "#eaf4ee"
  ink: "#101820"
  ink-soft: "#335246"
  install-red: "#d62d20"
  rubber-violet: "#3a2f8f"
  offer-blush: "#fdebe8"
  token-yellow: "#dcdcaa"
typography:
  display:
    fontFamily: "Big Shoulders Display, Arial Narrow, sans-serif"
    fontSize: "clamp(2.3rem, 4.2vw, 3.7rem)"
    fontWeight: 900
    lineHeight: 1
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Big Shoulders Display, Arial Narrow, sans-serif"
    fontSize: "clamp(2.1rem, 4.4vw, 3.25rem)"
    fontWeight: 900
    lineHeight: 0.95
    letterSpacing: "0em"
  stamp:
    fontFamily: "Big Shoulders Stencil, Big Shoulders Display, sans-serif"
    fontSize: "clamp(2rem, 4.4vw, 3.4rem)"
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: "0.06em"
  action:
    fontFamily: "Big Shoulders Display, Arial Narrow, sans-serif"
    fontSize: "2.1rem"
    fontWeight: 900
    lineHeight: 1
    letterSpacing: "0.03em"
  body:
    fontFamily: "Archivo Narrow, Arial Narrow, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Archivo Narrow, Arial Narrow, sans-serif"
    fontSize: "0.78rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.1em"
  code:
    fontFamily: "Spline Sans Mono, ui-monospace, Menlo, monospace"
    fontSize: "0.8125rem"
    fontWeight: 600
    lineHeight: 1.75
rounded:
  none: "0px"
spacing:
  hairline: "2px"
  xs: "0.5rem"
  sm: "0.8rem"
  md: "1.25rem"
  lg: "1.5rem"
  section: "4.5rem"
components:
  stamp-button:
    backgroundColor: "{colors.install-red}"
    textColor: "{colors.sheet-white}"
    typography: "{typography.action}"
    rounded: "{rounded.none}"
    padding: "0.7rem 1rem 0.6rem"
  stamp-button-hover:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.sheet-white}"
  form-cell:
    backgroundColor: "{colors.sheet-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "1.5rem 1.25rem 1rem"
  form-cell-tint:
    backgroundColor: "{colors.form-tint}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
  utility-button:
    backgroundColor: "{colors.sheet-white}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "0.4rem 0.6rem"
  utility-button-hover:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.sheet-white}"
  item-chip:
    backgroundColor: "{colors.rubber-violet}"
    textColor: "{colors.sheet-white}"
    typography: "{typography.code}"
    rounded: "{rounded.none}"
    padding: "0.2rem 0.5rem"
  rubber-stamp:
    textColor: "{colors.rubber-violet}"
    typography: "{typography.stamp}"
    rounded: "{rounded.none}"
    padding: "0.15rem 0.9rem 0.05rem"
---

# Design System: vscode-react-memoize

## Overview

**Creative North Star: "The Customs Declaration"**

The page is one form filled in at a border. A callback declares what it carries, and the dependency array is the declaration the tool completes for you. The ground is a saturated customs green. On it sits a white sheet, ruled into numbered boxes by 2px ink gaps, with typed entries in a mono and two rubber stamps. Near-black ink does the ruling and the text. Red and violet are the only accents and they are never interchangeable.

Density is that of a real form: tight cells, small uppercase field labels, hard rules between everything. Nothing floats and nothing is soft. Depth comes from the green ground showing around a white sheet, and from the ink grid itself. Motion is limited to the demo filling the form in line by line, leader lines drawing back to the code, and a stamp landing.

The system refuses the dark editor mockup with a neon accent, and refuses cream paper with a serif. Both are named in the direction contract as the default answers this world replaces.

**Key Characteristics:**

- One hard 12-column grid, drawn as 2px ink gaps over an ink background; every box is a white or tinted cell.
- Square everything: no radii, no soft shadows, no gradients except the hatched check-box marks.
- Condensed stencil display for titles and stamps, a narrow grotesque for text and labels, a mono for code only.
- Red means install. Violet means ink: carried items, leader lines, refusals, stamps.
- Rubber stamps are roughened with an SVG turbulence filter and multiplied into the sheet.

## Colors

A green ground, a white sheet, black-green ink, and two accents with fixed jobs.

### Primary

- **Customs Green** (#0b6e4f): the page ground behind the sheet, the favicon field, and string literals inside code.
- **Customs Green Deep** (#084a36): scrollbar track and the footer rule on the green ground.
- **Install Red** (#d62d20): the INSTALL stamp button background, hook names inside the code demo, the demo caret and lightbulb.

### Secondary

- **Rubber Violet** (#3a2f8f): rubber-stamp ink (CLEARED, NOT OFFERED), carried-item chips in box 2, leader lines, the dependency outline in the code, code keywords, refused-item cross marks, text selection, focus outlines.

### Neutral

- **Sheet White** (#ffffff): every ordinary cell of the form and the field behind secondary buttons.
- **Form Tint** (#eaf4ee): the deck cell, the editor strip, section heading cells, inline command field. A pale green that marks "reading matter" cells against the white entry cells.
- **Ink** (#101820): text, all rules, all borders, hover fill for buttons.
- **Ink Soft** (#335246): field labels, secondary text, JSX tag names in the code.
- **On Green** (#d4efe2): footer text on the green ground.
- **Offer Blush** (#fdebe8): the code line highlight while the lightbulb offers an action.

### Named Rules

**The Red Means Install Rule.** Red is the INSTALL action, and inside the code demo it marks the inserted hook names, the caret and the lightbulb. It never marks refusal, emphasis, or decoration elsewhere.

**The Violet Is Ink Rule.** Violet is what a stamp or a pen leaves on the form: carried items, leader lines, stamps, refusals. It never appears on a button.

**The Ground Rule.** Green is ground and string colour only. Text on the green ground is white or On Green; body copy never sits on green directly, it sits in a white cell.

## Typography

**Display Font:** Big Shoulders Display (with Arial Narrow, sans-serif), self-hosted, weights 700-900
**Stamp Font:** Big Shoulders Stencil (with Big Shoulders Display), weights 700-900
**Body Font:** Archivo Narrow (with Arial Narrow, sans-serif), weights 400-700
**Code Font:** Spline Sans Mono (with ui-monospace, Menlo), weights 400-700

**Character:** A condensed industrial display set against a narrow, plain text face, like stencilled crate lettering over a typed form. The mono appears only where code or a command is shown, as the "typed entry" on the form.

### Hierarchy

- **Display** (hero, three voices on the green ground, not in the sheet): `useMemo` and `useCallback` as typed entries (Spline Sans Mono 700, clamp(1.7rem, 4.4vw, 3.5rem), token-yellow on Ink, 3px Ink box); "and" as a small uppercase connector (Archivo Narrow 700, 0.8-1rem, 0.14em tracking); "In one click" in Big Shoulders Display 900 (clamp(2.4rem, 6.2vw, 4.8rem), uppercase, white); and the payoff line "with the dependency array already filled in" in Archivo Narrow 600 (clamp(1.35rem, 2.6vw, 2rem), white) underlined 3px in token-yellow and closed by a 👈 emoji (decorative, `aria-hidden`).
- **Headline** (900, clamp(2.1rem, 4.4vw, 3.25rem), 0.95): section titles inside the lower form parts, uppercase.
- **Stamp** (Stencil 800, clamp(2rem, 4.4vw, 3.4rem), letter-spacing 0.06em): CLEARED and NOT OFFERED, uppercase, always filtered with the ink texture.
- **Action** (900, 2.1rem, letter-spacing 0.03em): the INSTALL stamp button label, uppercase; 1.8rem on the compact deck button and on phones.
- **Body** (400, 1.125rem, 1.5): prose, capped at 62ch inside the form parts and 44ch for the deck.
- **Label** (700, 0.78rem, letter-spacing 0.1em, uppercase, Ink Soft): numbered field labels ("1. Code to declare"), table headers, definition terms.
- **Code** (600, 0.8125rem, 1.75): code blocks, inline code, carried-item chips, the install command.

### Named Rules

**The Typed Entry Rule.** The mono is for what a machine or a typist entered: code, items, commands. Prose and labels never use it.

**The Stencil Is Stamped Rule.** Stencil is reserved for rubber stamps. Titles and the INSTALL button use the plain display face.

## Layout

A single `min(76rem, 100% - 2.5rem)` column centred on the green ground (`100% - 1.4rem` at 560px and below). The form sheet and every lower "part" are 12-column grids with a 2px gap and 2px padding over an ink background, so the gaps read as ruled lines.

The hero sits directly on the green ground above the sheet: the three-voice headline, one line of guidance, and the install stamp beside its command. The first sheet then holds box 1 code (7 columns, spanning two rows) beside box 2 items carried (5) and box 3 exempt (5), then a full-width declaration row holding the declaration line, signature rule, CLEARED stamp and the install stamp with its command. Lower parts pair a tinted heading cell (5) with a body cell (7), and the "flip" variant reverses them from 861px up. Parts are separated by 4.5rem of green.

Breakpoints: 1280px and up is the full composition including leader lines. 861 to 1279px puts the code cell full width and splits items and exempt 6 and 6. 860px and below stacks every cell in one column. 560px and below collapses tables into labelled blocks, wraps code lines with a hanging indent, and removes the editor action text.

Spacing rhythm: cells pad about 1.25rem to 1.5rem; list rows pad 0.38 to 0.65rem and are divided by 1.5px ink rules.

### Named Rules

**The Gap Is the Rule Rule.** Rules between boxes are the 2px grid gap showing ink, never a border on each cell. Rules inside a cell are 1.5px ink lines.

**The Leader Lines Are Wide-Only Rule.** The violet leader lines tying box 2 items to the code tokens render only at 1280px and up, where the two boxes sit side by side. Below that they are hidden and the items stand without them.

## Elevation & Depth

Flat. There are no soft shadows and no offset shadows. Depth is the white sheet on the green ground, ink rules, and the stamps multiplied onto the sheet. The only box-shadow in the build is the keyboard focus halo: a 3px violet outline with 3px offset and a 6px white ring.

### Named Rules

**The No Shadow Rule.** Surfaces are never lifted. State changes by fill inversion (to ink) or a 0.98 press scale, not by a shadow.

## Shapes

Right angles only. All cells, buttons, chips, fields and stamps have 0 radius. Boxes are bordered 2px ink (utility buttons, command field) or 3px ink (the INSTALL stamp). Rubber stamps use a 4px violet border plus a 2px violet outline offset 3px, rotated (-7deg for CLEARED, 5deg for NOT OFFERED), multiplied into the sheet and roughened by the ink filter. Check boxes for exempt and refused lists are 0.95rem squares with a crossed hatch drawn in ink (exempt) or violet (refused).

### Named Rules

**The Ink Filter Rule.** Only rubber stamps get the `#ink` filter: fractal-noise displacement for rough edges plus a grain mask for worn patches. Text, buttons and cells stay crisp.

## Components

### Stamp Button (primary action)

Install Red fill, white Action type, 3px ink border, square. Hover inverts the fill to Ink over 0.15s; active scales to 0.98. The one primary action, repeated at the deck, the declaration row and the closing section.

### Form Cell

White (or Form Tint) rectangle on the ink grid, with an optional absolute label in the top-left corner: numbered, uppercase, Label type. The code cell uses a flat variant of the label, a white strip with a 2px ink bottom rule.

### Editor Strip and Code Box

Form Tint bar with a 2px ink bottom rule, mono filename, an action readout (empty until the lightbulb offers "Extract in useMemo" or "Extract in useCallback") and a utility button. Code lines sit on a 2.1rem gutter and 1.75 line height. Keywords are Violet, strings Green, inserted hook names Red, JSX tags Ink Soft. Inserted text grows in with a 0.5s ease-out width transition.

### Utility Button

White with 2px ink border, small uppercase Label type; hover inverts to Ink. Used for "Play again" and "Copy".

### Item Chip (box 2 entry)

Violet fill, white mono 0.8125rem text, square, 0.2rem 0.5rem padding. Starts hidden and rises 0.4rem into place when its extraction step runs. Each sits in a ruled row with a "for name" binding.

### Rubber Stamps

CLEARED lands in the declaration row once the demo finishes (starts at 1.5x scale, settles to 1 in 0.22s). NOT OFFERED is static in the refusal section heading cell. Both Violet, Stencil type, ink-filtered, multiplied.

### Check List (exempt and refused)

Rows divided by 1.5px ink rules, each with a crossed-square mark at the left. Exempt marks are Ink, refused marks are Violet.

### Tables and Definition Lists

Label-type headers, 1.5px ink row rules, mono for code cells. Two-column definition grid with a 1.75rem column gap.

### Command Field

2px ink border, Form Tint mono command on the left, a white utility Copy button divided by a 2px ink rule.

### Demo Choreography

Caret in the name, lightbulb on the gutter, hook wraps in, a violet outline appears on each dependency token, items appear in box 2 and violet leader lines draw back to the tokens (wide screens only), then CLEARED lands. Reduced motion and no-JS show the finished state with no transitions.

## Do's and Don'ts

### Do:

- **Do** build every surface from 2px-ruled ink grid cells on white or Form Tint, over the Customs Green ground.
- **Do** number the field labels of a form box and keep them uppercase Label type.
- **Do** reserve Install Red for the install action and for hook names, caret and lightbulb inside code demos.
- **Do** use Rubber Violet for carried items, leader lines, refusals and stamps.
- **Do** run rubber stamps through the `#ink` filter with `mix-blend-mode: multiply`.
- **Do** show the finished state when `prefers-reduced-motion` is set.
- **Do** keep the 3px violet outline plus 6px white halo on focus; on the green ground the outline turns white.

### Don't:

- **Don't** use soft or offset shadows, rounded corners, or gradients as decoration.
- **Don't** set prose or labels in the mono, or titles in the Stencil face.
- **Don't** use red for refusal or warning, or violet for a button.
- **Don't** place body copy directly on the green ground.
- **Don't** fall back to a dark editor panel with a neon accent, or to cream paper with a serif.
- **Don't** invent proof: no counts, ratings, testimonials or install numbers exist.
