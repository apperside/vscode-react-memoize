# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Static HTML/CSS, no framework and no build step (user's choice). The page lives in `docs/` and is published to GitHub Pages. The Pages workflow currently copies only `docs/index.html`, so it must be updated to publish the whole `docs/` folder before the page can use more than one file.

## Users

React developers who write function components and custom hooks in VS Code, in JavaScript, JSX, TypeScript or TSX. They arrive with a concrete problem: wrapping a value in `useMemo` or a function in `useCallback` and writing the dependency array by hand. They come from a search, a shared link or a post, and need to understand in seconds what the extension does and then install it.

## Product Purpose

A VS Code refactor named "vscode-react-memoize" (repository `vscode-react-memoize`). With the cursor on a variable or function inside a component, the lightbulb offers "Extract in useMemo" or "Extract in useCallback". It wraps the code and fills the dependency array the way `react-hooks/exhaustive-deps` would. Success for the page: a visitor understands this within the first screen, then installs.

## Positioning

The array is the annoying part. The extension computes the dependencies like the hooks lint rule does, including the narrow ones (a prop read as `user.name`, not `user`), and leaves out what does not belong: setters, refs, imports, `ref.current`, constants.

## Operating Context

Used inside the editor, through the lightbulb (`Cmd+.` on macOS, `Ctrl+.` elsewhere) or the Refactor command. It works on a binding declared directly in the body of a component or custom hook. It adds `useMemo`/`useCallback` to the existing `react` import, or writes `React.useMemo` when React is imported as a namespace. For callbacks it can infer parameter types and add the missing type imports through the TypeScript language service.

## Capabilities and Constraints

- Hook choice follows the declaration: a function becomes `useCallback`, anything else `useMemo`.
- Cases supported: `const`/`let` bindings, destructuring, function declarations, split of multi-binding statements, inline props and arrow bodies without a block (committed in `e3f17a9`).
- Not offered inside conditionals, after an early return, in nested helpers, for `var`, generators, overloads, classes, or code that already calls a hook.
- Requires Visual Studio Code 1.86 or newer (package.json `engines`; the README still says 1.85).
- Name: displayName "vscode-react-memoize", package `vscode-react-memoize`, publisher `apperside`, MIT license.
- Open decision: the exact Marketplace URL is not confirmed. The identifier would be `apperside.vscode-react-memoize`; do not invent a listing URL or install counts.

## Brand Commitments

Source: https://github.com/apperside/vscode-react-memoize. Landing page URL: https://apperside.github.io/vscode-react-memoize/. The user explicitly said they do not like the current page; no existing visual identity is a commitment.

## Evidence on Hand

- `docs/demo.gif`: the lightbulb wrapping an inline handler in `useCallback`.
- The animated before/after demo in the current `docs/index.html` (Profile.tsx: `label` to `useMemo`, `handleSelect` to `useCallback`).
- README tables of what is extracted and what stays out of the array.
- No testimonials, install counts, ratings, benchmarks or customer names exist. Do not fabricate them.

## Product Principles

- Show the transformation, not a description of it: the value is the diff.
- The dependency array is the point; it gets the visual weight.
- Be exact about what it does and what it refuses to do; credibility with developers comes from stating the limits.
- One clear next step after understanding: install.

## Accessibility & Inclusion

No product-specific requirement stated. Standard web accessibility applies; the demo must remain readable and non-moving for users who prefer reduced motion.
