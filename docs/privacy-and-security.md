# Privacy and security

For the programs Floorplan runs and how to verify your copy, see [Is it safe to install?](is-it-safe.md).

## What runs where

| Part | Where it runs | What it sends |
|---|---|---|
| Scan, build, updates | your computer (Node.js) | nothing |
| Writing names and descriptions | Claude or Codex, through your session | the files it reads, the same as any other task you give it |
| The map | your browser | requests to its local server for Ask, live updates and changes. The viewer's layout engine and fonts are bundled, so it works offline |
| The map's server (`serve.mjs`) | your computer, listening on `127.0.0.1` only | nothing on its own |
| Asking questions (Claude Code CLI) | a `claude -p` session on your computer, with your account | your question, selected map context and the files Claude chooses to read |
| Asking questions (Codex) | an ephemeral `codex exec` run on your computer, with your ChatGPT sign-in | your question, selected map context and the files Codex chooses to read |
| Changing a blueprint from the map | the same as asking questions, with Claude Code or Codex; the map's server then writes only the plan's files in `floorplan/` | your request, and the files the AI chooses to read |
| Asking questions (Claude app) | your claude.ai account | the generated map, including its names, descriptions and structure, after you approve publishing |
| Exporting a copy | your computer: the local server generates a single HTML file | nothing. You decide who gets the file. It holds the map, plus Health or recent work only if you tick them, and omits the dedicated folder path and git remote fields. Review descriptions and notes before sharing |
| Reporting a Health false positive | the viewer copies the preview to your clipboard when you request it, and links to the fork's issues | the report reaches GitHub only if you paste and submit it there |

Floorplan's viewer and local server make no background requests to external services. The Claude Code and Codex clients use their own accounts and settings for AI features.

Scans and builds omit Git remote URLs from their map data. Opened copies of older maps also omit that metadata when served by this fork.

The layout engine ([elkjs](https://github.com/kieler/elkjs) 0.11.1, EPL-2.0) and fonts (Inter and JetBrains Mono, SIL Open Font License) are bundled in `skills/floorplan/assets/vendor/` with their licenses, and every build copies them into the map.

## The local server

Run and rebuild maps using the Floorplan installation you trust. On a shared computer, other local processes can connect to the same loopback address.

- It listens on `127.0.0.1` only, so other machines on your network can't reach it.
- Each server start creates a random token. Local API requests, including Ask, saving flows and stopping the server, require it. The server rejects API requests with a different browser origin.
- It answers only to `127.0.0.1` and `localhost` at its own port, so a website that points its own domain at your computer (DNS rebinding) can't load the map or its token.
- Questions run Claude with read-only tools for reading and searching files. Floorplan passes settings that disable hooks and restrict loading to user settings, and supplies an empty MCP configuration.
- With Codex, questions run in Codex's **read-only** sandbox. Codex can load integrations from its own configuration.
- On a blueprint (a map planned from a PRD), **Change** requests run the same read-only way. The agent replies with the updated plan, and the server validates it before updating the blueprint and rebuilding the map. It keeps the old versions for Undo.
- It stops by itself two hours after the last tab closes. To stop it manually, run `node floorplan/serve.mjs --stop`.

When a shared export is embedded with `#ask=host`, choosing **Ask about this** sends the selected card names and IDs to the page that embeds it.

## Secrets

The Health check looks for passwords, API keys and private keys in your code, and for `.env` files that would be committed. When it finds one, it records only the file, the line, the kind of secret, and a masked hint like "starts AKIA…, 20 characters". Claude Code and Codex can still read files directly when you use AI features.

Text written about your code is checked too. If a description, label, summary, note or recent-work entry (in `architecture.json`, `descriptions/`, `recent-work.json` and the other files in `floorplan/`), or a comment the scan picked up, holds something that looks like a secret, the build puts it in the map as «hidden» and warns, naming the file and the field but never the value, so you can take it out. Your files are left as they are. It looks for well-known key formats, passwords in database addresses, quoted values given a secret-sounding name, `NAME=value` settings, and long generated-looking strings; ordinary words, file paths, commit hashes and IDs are left alone.

It catches common formats and patterns. Review any map before sharing it.

## Maps of code you didn't write

A map shows text Floorplan didn't write: file names, endpoint paths and comments from the code, and descriptions written by an AI or a person. All of it is treated as text, never as part of the page: it's escaped wherever it's shown, it goes into the page's data in a form the browser can't mistake for markup, and characters that are invisible or reverse the text around them (which can make one file name read as another) are shown as a visible marker such as `[U+202E]`. The local viewer and standalone exports use a Content Security Policy to limit scripts and background requests. [Network behavior](is-it-safe.md#the-network) A pattern in `architecture.json` that isn't valid is reported as a build error, and the scan skips config files over 1 MB and reads large files without slowing down.

## Git

Nothing Floorplan creates is committed. See [What's in your project](project-files.md#staying-out-of-git).

## Reporting a vulnerability

Please report security problems privately, as described in [SECURITY.md](../SECURITY.md), rather than in a public issue.
