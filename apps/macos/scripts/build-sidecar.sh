#!/usr/bin/env bash
# Build the Swift posture sidecar and place it where Tauri expects an externalBin:
#   src-tauri/binaries/posture-sidecar-<target-triple>
# Run this before `tauri dev` / `tauri build` (see the `build:sidecar` pnpm script).
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
macos_dir="$(dirname "$script_dir")"
sidecar_dir="$macos_dir/posture-sidecar"
dest_dir="$macos_dir/src-tauri/binaries"

target_triple="$(rustc -Vv | grep '^host:' | cut -d' ' -f2)"

echo "Building posture sidecar (release)…"
swift build -c release --package-path "$sidecar_dir"

mkdir -p "$dest_dir"
cp "$sidecar_dir/.build/release/PostureSidecar" "$dest_dir/posture-sidecar-$target_triple"
echo "Placed: $dest_dir/posture-sidecar-$target_triple"
