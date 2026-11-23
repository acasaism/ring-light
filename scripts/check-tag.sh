#!/bin/sh
# Fails unless the release tag (e.g. v1.2.0) matches manifest.json's version,
# so a mistyped tag never submits the wrong build to the stores.
set -eu
cd "$(dirname "$0")/.."
tag="${1:?usage: check-tag.sh <tag>}"
version=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' manifest.json)
if [ "$tag" != "v$version" ]; then
  echo "Tag $tag does not match manifest version $version (expected v$version)" >&2
  exit 1
fi
echo "Tag $tag matches manifest version $version"
