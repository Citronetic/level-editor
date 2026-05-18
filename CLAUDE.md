# Match-3 / BlockOut / CBJ Level Editor

A vanilla-JS canvas editor for sliding-block puzzles (BlockOut + Color
Block Jam). Loads 2670+ existing levels from `data/levels/*.json`, lets
you clone one as a custom level, edit it in-browser, play it, and
export the resulting JSON.

## Running locally

```bash
./serve.sh 8081       # python3 -m http.server 8081 under the hood
# open http://localhost:8081
```

(Port 8080 is intentionally avoided — it collides with local Java tools
on some setups.)

## Layout

| Path | What |
|---|---|
| `index.html` | Entry; pulls all of `js/` as ES modules. |
| `js/` | The editor — render, interaction, design tools, play sim. |
| `style.css` | All styling (purple/teal dark theme). |
| `data/levels/*.json` | 2670+ levels (BlockOut `t76-*` + `t64-*`, Color-Block-Jam `cbj-*`). |
| `data/LevelsConfig.json` | Difficulty + duration metadata per level. |
| `data/level-manifest.json` | Flat list of all level seedIds. |
| `DATA_FORMAT.md` | Authoritative schema reference for the level JSON. |
| `.claude/skills/` | Claude Code skills shipped with the project. |

## Claude skill: `level-designer`

Anyone cloning this repo can invoke a level-design skill from within
Claude Code:

> /level-designer please give me a hard variant of t76-level-14 with all warm colors

The skill reads `data/levels/*`, applies a mathematically-grounded
playbook (wall continuity, color throughput, exit reachability), writes
a new valid level to `data/levels/custom-<name>.json`, and reports
every mutation it made.

See [.claude/skills/level-designer/SKILL.md](.claude/skills/level-designer/SKILL.md)
for the full rule set and mutation taxonomy.

## Deployment (Cloudflare Pages)

This editor is hosted at <https://level-editor-a22.pages.dev/>. The
Pages project is on the Citronetic Cloudflare account with **no Git
provider hook**, so pushing to GitHub does NOT trigger a build. Deploys
go through `wrangler` from a local checkout:

```bash
CLOUDFLARE_ACCOUNT_ID=6fb8c5d41e24645a40a2b30a0da1e884 \
  wrangler pages deploy . --project-name=level-editor --branch=main \
  --commit-message="<short description>"
```

`.cloudflareignore` excludes node_modules, package files, .git, .DS_Store, *.md, and serve.sh from the upload.
