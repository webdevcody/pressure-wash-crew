#!/usr/bin/env bash
# Make .pr-capture/{before,after} viewable from a PR body without merging
# binaries into main:
#   1. commit them under .github/pr-assets/<slug>/
#   2. immediately commit their removal
# The PR links to them by the first commit's SHA, which GitHub keeps reachable
# (refs/pull/N/head) after the PR merges, so the links keep working and the
# PR's "Files changed" never shows the binaries.
#
#   scripts/pr/publish-assets.sh [slug]      # default slug: current branch
#
# Prints the --assets-url to pass to report.mjs. Push the branch afterwards.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

src=.pr-capture
slug="${1:-$(git branch --show-current | tr '/' '-')}"
dest=".github/pr-assets/$slug"

repo="${GITHUB_REPOSITORY:-$(git remote get-url origin | sed -E 's#(\.git)?$##; s#.*github\.com[:/]##; s#.*/git/##')}"

[ -f "$src/after/metrics.json" ] || { echo "no $src/after/metrics.json: run pnpm pr:capture first" >&2; exit 1; }
if ! git diff --cached --quiet; then echo "staged changes present; commit them first" >&2; exit 1; fi

for side in before after; do
  [ -d "$src/$side" ] || continue
  mkdir -p "$dest/$side"
  find "$src/$side" -maxdepth 1 -type f \( -name '*.png' -o -name '*.gif' -o -name '*.mp4' -o -name 'metrics.json' \) -exec cp {} "$dest/$side/" \;
  # Only ship the .webm when ffmpeg couldn't make an .mp4.
  if [ -f "$src/$side/walkthrough.webm" ] && [ ! -f "$src/$side/walkthrough.mp4" ]; then cp "$src/$side/walkthrough.webm" "$dest/$side/"; fi
done

# A README with relative links, so GitHub renders the screenshots, GIF and
# metrics on the asset folder's page even if a PR body's image links get
# stripped by whatever posted it.
node scripts/pr/report.mjs --before "$src/before" --after "$src/after" --assets-url . > "$dest/README.md" 2>/dev/null || true

git add -f "$dest"
git commit -q -m "PR assets for $slug (screenshots, video, metrics)

Removed again in the next commit; the PR body links here by SHA."
sha="$(git rev-parse HEAD)"
git rm -r -q "$dest"
git commit -q -m "Remove PR assets from the tree (linked from the PR by ${sha:0:7})"

echo "https://github.com/$repo/blob/$sha/$dest"
echo "rendered page (screenshots, GIF, metrics): https://github.com/$repo/tree/$sha/$dest" >&2
