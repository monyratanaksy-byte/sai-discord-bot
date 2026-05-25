#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_PARENT="$(dirname "$PROJECT_DIR")"
DESKTOP_DIR="$(dirname "$PROJECT_PARENT")"
UPLOAD_DIR="$PROJECT_PARENT/sai-discord-bot-katabump-upload"
ZIP_PATH="$PROJECT_PARENT/sai-discord-bot-katabump-update.zip"
EASY_UPLOAD_DIR="$DESKTOP_DIR/KATABUMP BOT UPLOAD - USE THIS"
EASY_ZIP_PATH="$EASY_UPLOAD_DIR/sai-discord-bot-katabump-update.zip"

mkdir -p "$UPLOAD_DIR"
mkdir -p "$EASY_UPLOAD_DIR"

if [ -f "$UPLOAD_DIR/.env" ]; then
  TMP_ENV="$(mktemp)"
  cp "$UPLOAD_DIR/.env" "$TMP_ENV"
else
  TMP_ENV=""
fi

rsync -a --delete \
  --exclude '.git/' \
  --exclude '.env' \
  --exclude 'node_modules/' \
  --exclude 'coverage/' \
  --exclude 'dist/' \
  --exclude 'data/*.json' \
  "$PROJECT_DIR/" "$UPLOAD_DIR/"

if [ -n "$TMP_ENV" ]; then
  mv "$TMP_ENV" "$UPLOAD_DIR/.env"
elif [ -f "$PROJECT_DIR/.env" ]; then
  cp "$PROJECT_DIR/.env" "$UPLOAD_DIR/.env"
fi

rm -f "$ZIP_PATH"
(cd "$UPLOAD_DIR" && zip -qr "$ZIP_PATH" .)
cp "$ZIP_PATH" "$EASY_ZIP_PATH"

echo "Updated $UPLOAD_DIR"
echo "Created $ZIP_PATH"
echo "Copied easy upload zip to $EASY_ZIP_PATH"
