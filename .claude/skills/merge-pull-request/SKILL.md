---
name: merge-pull-request
description: Use whenever you fix merge conflicts on a pull request or merge one in this repo. Treats each conflict as a coupling hotspot - decouple the shared code so features plug in through their own files - then resolves, rebuilds, re-measures perf against the baseline and squash-merges.
---

# Merge a pull request

A conflict means two features had to edit the same lines. Fixing only the conflict guarantees the next pair of PRs collides in the same place. So every merge does two jobs: **decouple the hotspot, then resolve and merge.**

Work on the PR's own branch. Never rebase or force-push; merge `main` in.

## 1. Claim it and look at main

- If another thread or session owns the PR, tell it you're taking the merge so you don't both push. Ask it to push anything unpushed first, then fetch again.
- Other PRs may be merging at the same time. Fetch `main` right before each step below, not once at the start.

```bash
git fetch origin main <pr-branch>
git checkout -B <pr-branch> origin/<pr-branch>
base=$(git merge-base HEAD origin/main)
```

## 2. Find the hotspots

Hotspots are files **both** sides changed since they split, conflicted or not. An auto-merged overlap is next week's conflict.

```bash
comm -12 <(git diff --name-only $base origin/main | sort) <(git diff --name-only $base HEAD | sort)
git merge --no-commit --no-ff origin/main; git diff --name-only --diff-filter=U; git merge --abort
```

Also check the other open PRs (`list_pull_requests`, then their changed files): a file that three PRs touch is a hotspot even if this merge is clean.

For each hotspot, write down in one line *why* both sides had to edit it. The reason is almost always one of these:

| Coupling | Sign in the diff | Decouple into |
| --- | --- | --- |
| Shared list | Both sides append to one array or JSON file (views, surfaces, HUD children, menu keys) | A directory of per-feature files plus a loader (`import.meta.glob`, or `readdirSync` in scripts); a feature adds a file |
| `switch` / `if` chain on a kind | Both add a `case` | A registry: `Record<Kind, Handler>` or `register(kind, handler)` in the feature's own module |
| God component or class | One file does several jobs (input, raycasts, particles, model, HUD state) and each feature edits a different job | One component or module per job, sharing state through `runtime` (per-frame) or the store (UI) |
| Feature fields inside a core class | Both add fields and lines to the same constructor / `reset` / `paint` | Hooks or layers the core calls in order; each feature owns its layer file |
| Shared mount point | Both add imports and JSX to `App.tsx` / `Level.tsx` / `Hud.tsx` | A feature list the root maps over, or the feature mounts its own children |
| Shared stylesheet or store | Both append CSS or store fields | CSS imported by its component; a store slice or small store per feature |

## 3. Decouple, then resolve

- **Refactor first, in its own commits** (`decouple: …`), on top of the branch, so the diff reviewers read is "move code" and not mixed with conflict fixes. Then `git merge origin/main` and resolve.
- Keep it **behavior-preserving**: same rendering, same numbers, same per-frame cost. No new allocation in `useFrame`, no React state for per-frame data.
- Only decouple the hotspots you found. Don't redesign the codebase on a merge.
- When resolving, keep **both** sides' intent. Read both PR descriptions; a conflict that looks like "pick one" usually means one side moved code the other edited.
- If the refactor moves a file other open PRs touch (e.g. splitting a list into a directory), plan to tell their owners in step 6.
- Add the new extension point to the **Extension points** list in `AGENTS.md`, so the next feature uses it instead of the old shared file.

## 4. Verify

```bash
pnpm build                                     # must pass
pnpm pr:capture [--scenario scripts/pr/scenarios/<feature>.mjs]
```

- Re-capture after any change to game code. Compare against `origin/main` and `perf/baseline.json` (see the create-pull-request skill). The decoupling must not move frame time, draw calls or triangles.
- Check the screenshots for **both** sides' features: views and scenarios from main and from the PR.
- Publish the new assets and update the PR body's Screenshots, Video, Metrics and Risk (create-pull-request steps 3-5), and add a **Decoupling** section: each hotspot, why it conflicted, and what it became.

## 5. Merge

Apply the create-pull-request skill's step 6:

- **Low** risk, or a small self-contained bug fix: squash-merge yourself.
- **Medium / High**: these wait for Cody, as that step says. Leave the PR open and give him the link.

Right before merging, `git fetch origin main` again. If `main` moved, merge it in, rebuild, and re-check. Squash-merge with `expectedHeadSha` set to the commit you verified, so a late push can't slip in. Then say in the PR that it was merged under this skill and why.

## 6. After the merge

- Tell the owners of other open PRs that touch the files you moved what moved where, so their next merge is a one-file move rather than a conflict.
- If a tool or permission blocks a step, leave the PR open and give Cody the link and what's left.
