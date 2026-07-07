# CLAUDE.md

Guidance for working in this repository. The goal: code that is **beautiful to read, cheap to change, and scales gracefully as the project grows.** Optimize for the next person (often future-you) who has to understand and modify this.

---

## Prime directives

1. **Clarity over cleverness.** If a reviewer needs a comment to understand *what* the code does (not *why*), rewrite it. The best code reads like prose.
2. **Make the change easy, then make the easy change.** If a task is awkward to implement, first refactor so it becomes natural, then implement.
3. **Leave it better than you found it.** Small, opportunistic cleanups on files you touch — but never mix a refactor and a behavior change in the same commit.
4. **YAGNI.** Build for the requirement in front of you. Don't add abstraction, config, or generality for hypothetical futures. Scalability comes from *clean seams*, not premature frameworks.
5. **Match the surrounding code.** Consistency with the existing codebase beats personal preference. Read neighbors before writing.

---

## Before writing code

- **Read first.** Look at how similar things are already done here. Reuse existing patterns, utilities, and conventions instead of inventing parallel ones.
- **State assumptions.** If the request is ambiguous, make the smallest reasonable assumption, state it plainly, and proceed rather than stalling.
- **Plan the seams.** For anything non-trivial, sketch the module boundaries and data flow before typing. The boundaries are the design.

---

## Architecture & scaling

The project should read the same whether it's 5 files or 5,000. Achieve that through structure, not heroics.

- **Organize by feature/domain, not by technical layer** once the project outgrows a handful of files. Colocate things that change together (`user/` containing its model, service, routes, tests) rather than scattering them across `models/`, `services/`, `controllers/`.
- **Depend inward.** Business logic must not import framework, database, or UI code. Keep I/O at the edges; keep the core pure and testable.
- **One reason to change per module.** If a file has two audiences or two reasons to be edited, split it.
- **Explicit boundaries.** Each module exposes a small, intentional public interface and hides its internals. Prefer a narrow, documented surface over exposing everything.
- **No circular dependencies.** They're the first sign the boundaries are wrong. Fix the design, don't paper over with lazy imports.
- **Composition over inheritance.** Deep class hierarchies don't scale; small composable functions and objects do.

---

## Functions & naming

- **Functions do one thing** at one level of abstraction. If you scroll to read it, it's too long.
- **Names carry the meaning.** A well-named function needs no comment. `calculateInvoiceTotal` not `calc`. Booleans read as predicates: `isActive`, `hasAccess`. Avoid abbreviations except universal ones.
- **Fewer arguments.** Three is a soft ceiling; past that, pass an options object / struct.
- **No boolean flag parameters** that switch behavior — split into two functions.
- **Guard clauses over nesting.** Return early. Keep the happy path at the lowest indentation.
- **Pure where possible.** Given the same input, return the same output and touch nothing else. Push side effects to the edges.

---

## Errors, state & data

- **Fail loudly and early.** Validate inputs at boundaries; never let bad data travel deep into the system before it explodes.
- **Errors are values, not surprises.** Handle them explicitly and give messages that say what happened and how to fix it. Never swallow an error silently.
- **Immutability by default.** Avoid mutating shared state. Prefer returning new values.
- **Make illegal states unrepresentable.** Use the type system / schemas so bad combinations can't be constructed, rather than checking for them everywhere.
- **Single source of truth** for every piece of data. Derive, don't duplicate.

---

## Comments & documentation

- Comments explain **why**, never **what**. The code shows what.
- Delete commented-out code. Version control remembers.
- A short module-level docstring stating the module's responsibility is worth more than line-by-line noise.
- Keep a `README` per significant module when the "why" of its existence isn't obvious.

---

## Testing

- **Test behavior, not implementation.** Tests should survive a refactor that preserves behavior.
- Write the test at the boundary you'd want to keep stable (the public interface), not internal helpers.
- Cover: the happy path, the edge cases, and the failure cases. Prioritize the ones that would actually break in production.
- A bug fix starts with a failing test that reproduces it.
- Tests are documentation — name them so a reader learns the intended behavior from the test names alone.

---

## Dependencies

- Add a dependency only when it clearly beats writing it yourself and is well-maintained. Every dependency is a liability you'll carry.
- Wrap third-party libraries behind a thin adapter at the boundary so swapping them later touches one file, not fifty.

---

## Frontend / UI (if applicable)

- **Design is a choice, not a default.** Derive palette, typography, and layout from what the product actually is. Avoid templated looks (cream + serif + terracotta, near-black + acid accent, hairline broadsheet) unless the brief asks for them.
- Spend boldness in one place: one signature element, everything around it quiet and disciplined.
- **Copy is design material.** Name things by what the user controls, use active voice, keep an action's name consistent through its whole flow ("Publish" button → "Published" toast). Errors say what went wrong and how to fix it.
- Meet a quality floor silently: responsive to mobile, visible keyboard focus, reduced-motion respected, semantic HTML.
- Keep components small and presentational where possible; push data-fetching and logic up and out.

---

## Git & change hygiene

- **Small, focused commits.** One logical change each. A commit message says *why*, imperative mood: "Add retry to payment webhook", not "changes".
- **Never mix** formatting, refactoring, and behavior changes in one commit.
- Don't commit secrets, generated files, or debug prints.
- Keep diffs reviewable — a reviewer should hold the whole change in their head.

---

## When in doubt

- Prefer deleting code to adding it.
- Prefer the boring, obvious solution.
- If a rule here conflicts with local convention, follow local convention and flag the tension.
- Ask: *"Will this still be clear to someone reading it in a year, in a codebase ten times this size?"* If not, revise.
