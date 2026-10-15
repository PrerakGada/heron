# Heron

Claude Code transcript mod: prompts and final answers in outlined boxes, working steps folded into one live line.
Public at github.com/PrerakGada/heron (MIT); friends install it with
`claude plugin marketplace add PrerakGada/heron && claude plugin install heron@heron-mod`.

- **The real folder is `~/.claude/mods/heron`.** `~/Developer/heron` is a symlink to it. Never reverse that:
  Prerak's own install (`heron@prerak-mods`, directory marketplace `~/.claude/mods`) refuses to load a plugin whose
  files resolve outside the marketplace folder (tried 15 Oct 2026, it failed to load).
- `.claude-plugin/marketplace.json` makes this repo its own marketplace (`heron-mod`, plugin source `./`).
- Render hooks in `hooks/register.tsx`, pure text rules in `hooks/rules.ts`. Tests: `claude plugin test .`
- Edit, then `/reload-plugins`. Push to `main` and friends get it with `claude plugin marketplace update heron-mod`.
- Keep it separate from Myna Play: Myna is voice, Heron is what the transcript shows. Both use the same final-answer rule.
- Public repo: no client names, domains or machine names in code or test fixtures.
