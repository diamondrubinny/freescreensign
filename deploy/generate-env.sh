#!/bin/sh
# Creates deploy/.env with strong random secrets. Refuses to overwrite an existing file.
set -eu

cd "$(dirname "$0")"
if [ -e .env ]; then
  echo ".env already exists — not overwriting. Delete it first if you really want new secrets." >&2
  exit 1
fi

rand() {
  # Hex output is safe inside URLs and JSON without escaping.
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex "$1"
  else
    od -An -N"$1" -tx1 /dev/urandom | tr -d ' \n'
  fi
}

umask 077
sed \
  -e "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$(rand 32)/" \
  -e "s/^S3_ACCESS_KEY_ID=.*/S3_ACCESS_KEY_ID=rubinny$(rand 8)/" \
  -e "s/^S3_SECRET_ACCESS_KEY=.*/S3_SECRET_ACCESS_KEY=$(rand 32)/" \
  .env.example > .env

echo "Created deploy/.env (permissions 600). Review RUBINNY_DOMAIN before starting."
