#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_PARENT="$(dirname "$PROJECT_DIR")"
UPLOAD_DIR="$PROJECT_PARENT/sai-discord-bot-wisebyte"
ZIP_PATH="$PROJECT_PARENT/sai-discord-bot-wisebyte.zip"

mkdir -p "$UPLOAD_DIR"

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
  "$PROJECT_DIR/" "$UPLOAD_DIR/"

if [ -n "$TMP_ENV" ]; then
  mv "$TMP_ENV" "$UPLOAD_DIR/.env"
elif [ -f "$PROJECT_DIR/.env" ]; then
  cp "$PROJECT_DIR/.env" "$UPLOAD_DIR/.env"
fi

cat > "$UPLOAD_DIR/START_HERE.txt" <<'EOF'
Wispbyte upload notes for S.A.I

After extracting the ZIP, package.json must be directly inside /home/container/.
Do not leave the files inside an extra nested folder.

Working Wispbyte startup command:
if [ -f /home/container/package.json ]; then /usr/local/bin/npm install; fi; /usr/local/bin/npm start

Recommended settings:
- Docker image: Node.js 24
- JS file: src/index.js
- Main files: directly under /home/container/

Required .env values on Wispbyte:
DISCORD_TOKEN=your_real_token
CLIENT_ID=1505710039820927067
GUILD_ID=1481641949651013765
JOIN_TO_CREATE_CHANNEL_ID=1505717293823561870
PREFIX=s!

Do not upload this ZIP to public GitHub if it contains .env.
EOF

rm -f "$ZIP_PATH"
(cd "$PROJECT_PARENT" && zip -qr "$ZIP_PATH" "$(basename "$UPLOAD_DIR")")

echo "Updated $UPLOAD_DIR"
echo "Created $ZIP_PATH"
