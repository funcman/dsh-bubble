# AGENTS.md

Standing orders for anyone (human or agent) working on this repo. Read once
per session; the rules are short on purpose.

## Commit messages

- Follow [Conventional Commits](https://www.conventionalcommits.org/).
- Write the description in **Chinese** (English is fine for scope lists when a
  term has no clean Chinese equivalent).
- Common prefixes used here: `feat:` for new behavior, `fix:` for
  bug fixes, `chore:` for repo/meta changes (gitignore, docs, tooling),
  `refactor:` for no-behavior-change edits, `docs:` for documentation-only.

## Git commit timing (important)

- **Do not run `git commit` on your own initiative.** The default is to leave
  the working tree dirty after a task and wait.
- Only create a commit when the user explicitly asks for one ("提交",
  "commit", "提交一下", etc.).
- "Looks like you have uncommitted changes — want me to commit?" is the
  wrong question. Uncommitted changes after a finished task are normal; do
  not treat them as something that needs to be wrapped up.

## Line endings

- The repo enforces line endings via `.gitattributes`. Unspecified files
  default to **LF**; do not let CRLF creep in.
- If a tool rewrites a file with CRLF, convert it (e.g. `git config
  core.autocrlf false`, then re-check out the file).

## Indentation

- **Use tabs, not spaces.** This matches the harness community style.
- Keep the leading tab/space character consistent within a single file —
  do not mix.