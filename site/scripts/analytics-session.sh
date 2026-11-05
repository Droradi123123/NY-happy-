#!/bin/sh
# Read the encrypted analytics report from a Claude session without any stored private key.
#   sh site/scripts/analytics-session.sh key    one-time RSA key pair in $DIR (private key never leaves the session,
#                                               never commit it); prints the base64 public key to pass to the
#                                               "Analytics pull (encrypted)" workflow as the input reader_pub
#   sh site/scripts/analytics-session.sh read   after that run's commit is pulled: decrypts analytics/session/ into
#                                               $DIR/report.json (raw data: keep it out of the repository)
set -e
DIR=${ANALYTICS_DIR:-${TMPDIR:-/tmp}/yay-analytics}
R=$(cd "$(dirname "$0")/../.." && pwd)/analytics/session
mkdir -p "$DIR"; chmod 700 "$DIR"
case "$1" in
  key)
    openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out "$DIR/an.key" 2>/dev/null
    chmod 600 "$DIR/an.key"
    openssl pkey -in "$DIR/an.key" -pubout | base64 | tr -d '\n'; echo ;;
  read)
    openssl pkeyutl -decrypt -inkey "$DIR/an.key" -pkeyopt rsa_padding_mode:oaep -in "$R/report.key" -out "$DIR/k.bin"
    openssl enc -d -aes-256-cbc -pbkdf2 -in "$R/report.enc" -pass file:"$DIR/k.bin" | gunzip > "$DIR/report.json"
    rm -f "$DIR/k.bin"; echo "$DIR/report.json" ;;
  *) echo "usage: $0 key|read"; exit 1 ;;
esac
