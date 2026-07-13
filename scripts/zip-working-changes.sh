#!/usr/bin/env bash
set -euo pipefail

zip_path="$(pwd)/codex-changes.zip"
stage_path="${TMPDIR:-/tmp}/codex-changes-$(cat /proc/sys/kernel/random/uuid)"

if [[ -f "$zip_path" ]]; then
  rm -f -- "$zip_path"
fi

# Collect tracked changes since HEAD plus untracked files.
mapfile -d '' files < <(
  {
    git diff --name-only --diff-filter=ACMRTUXB -z HEAD
    git ls-files --others --exclude-standard -z
  } |
    sort -zu
)

existing_files=()
for file in "${files[@]}"; do
  if [[ -f "$file" ]]; then
    existing_files+=("$file")
  fi
done

if [[ ${#existing_files[@]} -eq 0 ]]; then
  echo "No added or modified files since HEAD."
  exit 0
fi

mkdir -p "$stage_path"

cleanup() {
  rm -rf "$stage_path"
}
trap cleanup EXIT

for file in "${existing_files[@]}"; do
  destination="$stage_path/$file"
  destination_dir="$(dirname "$destination")"

  mkdir -p "$destination_dir"
  cp -- "$file" "$destination"
done

(
  cd "$stage_path"
  zip -rq "$zip_path" .
)

echo "Created: $zip_path"
echo "Included ${#existing_files[@]} files."
