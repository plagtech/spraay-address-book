#!/usr/bin/env sh
#
# Lockfile guard. Two failures reach EAS silently without it, and both cost a full
# build-queue wait to discover:
#
#   1. A lockfile that is repaired locally but never committed. EAS builds from
#      COMMITTED git state, so a clean local `npm ci` proves nothing about the build.
#
#   2. A lockfile that npm 11 accepts and npm 10 rejects. The two disagree about
#      optional peer dependencies, and the EAS builder runs npm 10 (Node 22, pinned in
#      eas.json). This is what actually broke builds f200e1a1 and 81a1843a: the
#      committed lock was valid locally and missing 9 async-storage peer entries plus a
#      typescript peer as far as the builder was concerned.
#
# So: validate the COMMITTED lock, with the BUILDER's npm.
set -e

BUILDER_NPM="npm@10.9.8"

# ── 1. committed vs working tree ────────────────────────────────────────────────
if ! git diff --quiet HEAD -- package-lock.json 2>/dev/null; then
  echo "check:lock FAILED — package-lock.json differs between HEAD and the working tree."
  echo
  echo "EAS builds from committed git state, so an uncommitted lockfile fix never"
  echo "reaches the builder. Commit package-lock.json before building."
  exit 1
fi

if ! git diff --quiet HEAD -- package.json 2>/dev/null; then
  echo "check:lock FAILED — package.json differs between HEAD and the working tree."
  echo "Commit it before building, or EAS will build a different manifest."
  exit 1
fi

# ── 2. does the builder's npm accept this lock? ─────────────────────────────────
echo "Validating lockfile with $BUILDER_NPM (the EAS builder's npm)..."
if ! npx --yes "$BUILDER_NPM" ci --dry-run >/dev/null 2>&1; then
  echo "check:lock FAILED — $BUILDER_NPM rejects package-lock.json."
  echo
  echo "Your local npm may accept it; the builder's will not. Regenerate with:"
  echo "  npx --yes $BUILDER_NPM install --package-lock-only"
  echo "then commit the result. Full error:"
  npx --yes "$BUILDER_NPM" ci --dry-run 2>&1 | head -20
  exit 1
fi

echo "check:lock OK — committed lockfile is in sync and accepted by the builder's npm."
