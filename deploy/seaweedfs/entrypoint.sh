#!/bin/sh
# Generates the SeaweedFS S3 identity file from environment variables, then
# hands over to the image's original entrypoint (which drops root privileges).
set -eu

: "${S3_ACCESS_KEY_ID:?S3_ACCESS_KEY_ID is required}"
: "${S3_SECRET_ACCESS_KEY:?S3_SECRET_ACCESS_KEY is required}"

# Only allow characters that are safe to embed in JSON without escaping.
case "$S3_ACCESS_KEY_ID$S3_SECRET_ACCESS_KEY" in
  *[!A-Za-z0-9_+/=.-]*)
    echo "S3 credentials may only contain A-Z a-z 0-9 _ + / = . -" >&2
    exit 1
    ;;
esac

CONFIG_DIR=/tmp/rubinny
mkdir -p "$CONFIG_DIR"
umask 077
cat > "$CONFIG_DIR/s3.json" <<JSON
{
  "identities": [
    {
      "name": "rubinny",
      "credentials": [
        { "accessKey": "$S3_ACCESS_KEY_ID", "secretKey": "$S3_SECRET_ACCESS_KEY" }
      ],
      "actions": ["Admin", "Read", "Write", "List", "Tagging"]
    }
  ]
}
JSON
chown -R seaweed:seaweed "$CONFIG_DIR"

exec /entrypoint.sh server \
  -dir=/data \
  -ip.bind=0.0.0.0 \
  -s3 \
  -s3.config="$CONFIG_DIR/s3.json" \
  -master.volumeSizeLimitMB=1024
