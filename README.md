# Heron

**Signal, not noise, for Claude Code.** A heron stands still and moves only for the fish that matters.

Heron is a Claude Code mod that redraws the transcript so you read what counts:

- **Your prompts** sit in an outlined box.
- **Claude's final answer** for each turn sits in its own outlined box.
- **Everything in between** (the narration between tool calls, tool rows, tool results and diffs) is hidden.
  While a turn runs, one dim `⋯` line shows the newest step or the running tool.
- Plan approvals and questions Claude asks you are never hidden.
- If a reply ends with a line starting `**In one line:**`, that recap is drawn in its own green cell at the
  foot of the answer.

`/heron off` draws everything exactly as Claude Code does. `/heron on` brings Heron back, and a bare `/heron` toggles.

## Install

Paste this into a terminal, or into a Claude Code session after a `!`:

```sh
claude plugin marketplace add PrerakGada/heron && claude plugin install heron@heron-mod
```

Then restart Claude Code, or run `/reload-plugins` in an open session.

**In the Claude desktop app** (the Code tab), there is no terminal needed: open a Code session, paste
*"Run this in the shell: "* followed by the command above, and approve it. Then start a new session.
Heron draws in the Code tab like it does in the terminal; the desktop's plain chat does not run Claude Code, so
Heron has nothing to draw there.

Heron needs a recent Claude Code with mod support (`claude update`).

## Update and remove

```sh
claude plugin marketplace update heron-mod
claude plugin uninstall heron@heron-mod && claude plugin marketplace remove heron-mod
```

## Develop

The render hooks are in `hooks/register.tsx`. The plain-text rules (what counts as a final answer, the recap
split, tool-row lines) are in `hooks/rules.ts`. Run the tests with:

```sh
claude plugin test .
```

## License

[MIT](LICENSE). Made by [Prerak Gada](https://github.com/PrerakGada).
