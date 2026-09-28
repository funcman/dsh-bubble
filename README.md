# dsh-bubble

A small out-of-tree chat bubble for the **DeepSeek Harness** (`dsh`) web GUI. Every time you send a new message in a session, a bubble pops up in the bottom-right corner of the page and grumbles at you — the line is freshly written by your LLM (each one different) and read from a variation of `敲！又让我干活了！`.

## What you get

- A floating bubble (fixed-positioned, dark theme, with a small tail) rendered into the frame-wide `shell.overlay` seat.
- Each message triggers one bubble, auto-dismissed after 5 seconds.
- The text comes from a live LLM call (`dsh-llm` + `deepseek-official / deepseek-v4-flash` by default, `purpose: "session-title"` to disable reasoning for speed), with four canned fallbacks if the call fails.

## How it is built

The plugin is a regular **dual-face** dsh package: a node entry that registers an HTTP route, and a browser entry that fetches the route when a new user message is observed.

| file | role |
|---|---|
| `lib/plugin.js` | Host half: registers the `/dsh-bubble/insult` route, runs the LLM call. |
| `lib/grumble.js` | (conceptual) — currently inlined in `plugin.js`; the LLM prompt + fallbacks. |
| `lib/client.js` | Browser half: tracks each session's inbox, fetches the route on a new user message, renders the bubble. |
| `lib/*.d.ts` | Type stubs so the package is well-formed. |
| `package.json` | Declares `dsh.client` (`platform: "web"`) and bare exports of `./client`. |

The client bundle is a classic-script CJS factory wrapped via `window.__ModuleLoader__.load({ id, factory })`, matching every other dsh client bundle. It registers into the `shell.overlay` list slot (declared by `ui-layout`) with an `inject` face that exposes a `bubble` host observable; the renderer binds it as the `useBubble` selector hook the bubble component reads.

## Installation (per-user, out-of-tree)

The plugin lives outside the dsh checkout so updates never touch the harness tree. Place it inside your profile's resolved node_modules so the loader and the modules node half both see it.

1. Symlink or copy this package into the profile fallback directory so the profile resolves `@dsh-extra/dsh-bubble` through it:

   ```powershell
   # replace <DSH_HOME> with your dsh home (e.g. C:\Users\<you>\.dsh)
   # and <REPO> with the path to your working copy of this repo
   New-Item -ItemType Junction -Path "<DSH_HOME>\profiles\node_modules\@dsh-extra\dsh-bubble" -Target "<REPO>"
   ```

   (The `@dsh-extra` scope keeps your package name out of the upstream `@deepseek-ai` namespace; the healed fallback honors any direct subdirectory.)

2. Append a row to your profile's `cordis.patch.yml` (anywhere after the bundle layers, before the home-level layer):

   ```yaml
   - insert:
       - id: bubble
         name: '@dsh-extra/dsh-bubble'
   ```

   The running dsh's config-file watcher hot-mounts the row — no restart needed for the host half.

3. Refresh the web page once (`Ctrl+Shift+R` for a hard refresh). The browser boot graph picks up the new client row on the next page load.

After that, send a message in any session and watch the bottom-right.

## Customizing

- **Rephrasing the grumble** — change the `SYSTEM` constant in `lib/plugin.js`. Anything you write there is the only thing the model ever sees.
- **Changing the model route** — `PROVIDER` and `MODEL` constants in `lib/plugin.js`. Whatever route your running dsh has an adapter for will work.
- **Disabling the LLM** — drop `lib/plugin.js`'s fetch body to a static `text` from `FALLBACKS`; the bubble keeps working on canned lines.
- **Bubble style, position, lifetime** — `bubbleStyle`, `HIDE_AFTER_MS` in `lib/client.js`.

Edits to `lib/client.js` and `lib/grumble.js` (once split out) are hot-applied on the next page refresh — the host entry point (`lib/plugin.js`) is loaded once and the dsh loader caches it for the lifetime of the process.

## Troubleshooting

- **`/dsh-bubble/insult` returns 404** — the package is not resolved by your profile. Check that the symlink (or real directory) under `$DSH_HOME/profiles/node_modules` points at this repo and that `name` in `package.json` matches the row in your `cordis.patch.yml`.
- **Bubble never appears** — open the browser console and look for errors. The host route should respond to `GET http://127.0.0.1:3080/dsh-bubble/insult` directly; if that works, the client watcher is the culprit. The current watcher reads `pendingSubmissions[i].requestId` for items with `placement === "transcript"`; if a future dsh version changes that field, edit the `latestTranscriptId` helper in `lib/client.js`.
- **`401 Unauthorized` from the GUI** — your dsh web profile requires the bearer token printed at startup; the bubble plugin does not need it, but the GUI itself does.

## License

MIT.