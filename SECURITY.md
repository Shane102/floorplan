# Security policy

## Reporting a vulnerability

Please use the fork's private vulnerability reporting form for security issues. [Report a vulnerability](https://github.com/Shane102/floorplan/security/advisories/new)

Helpful details:
- what the problem is, and what someone could do with it;
- the steps to reproduce it;
- which version of Floorplan you're on (see `.claude-plugin/plugin.json`).

## What the plugin can do

The installation guide describes what Floorplan runs locally, when Claude Code or Codex sends data, and how to compare an installed copy with the fork using `CHECKSUMS.txt`. [Is it safe to install?](docs/is-it-safe.md)

## Scope

In scope:
- the map's local server (`serve.mjs`);
- anything that could leak secrets or source code;
- anything that writes outside the project's `floorplan/` folder and `CLAUDE.local.md`.

Out of scope: issues in Claude Code itself, which go to [Anthropic](https://www.anthropic.com/responsible-disclosure-policy), and in Codex itself, which go to [OpenAI](https://help.openai.com/en/articles/6653653-how-to-report-security-vulnerabilities-to-openai).

## Supported versions

Security fixes are made on the fork's `main` branch.
