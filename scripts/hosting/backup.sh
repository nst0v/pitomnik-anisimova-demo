#!/usr/bin/env bash
set -euo pipefail
NURSERY_APP_DIRECTORY=${NURSERY_APP_ROOT:-/var/www/u3568610/data/apps/sem-ot-anis}
NURSERY_SHARED_DIRECTORY="$NURSERY_APP_DIRECTORY/shared"
umask 077
mkdir -p "$NURSERY_SHARED_DIRECTORY/backups"
chmod 700 "$NURSERY_SHARED_DIRECTORY/backups"
exec 8>"$NURSERY_SHARED_DIRECTORY/backup.lock"
flock -w 10 8
[[ -d "$NURSERY_SHARED_DIRECTORY/content" && -f "$NURSERY_SHARED_DIRECTORY/php-config.json" ]]
nursery_stamp=$(TZ=Europe/Moscow date +%Y-%m-%d_%H-%M-%S)
nursery_archive="$NURSERY_SHARED_DIRECTORY/backups/content-$nursery_stamp.tar.gz"
nursery_temporary="$nursery_archive.tmp"
trap 'rm -f "$nursery_temporary"' EXIT
nursery_inputs=(content php-config.json)
if [[ -f "$NURSERY_SHARED_DIRECTORY/production.env" ]]; then nursery_inputs+=(production.env); fi
# Every content update is an atomic rename. Sessions and temporary panel tokens
# deliberately remain outside the backup; restoring a backup requires login.
tar -C "$NURSERY_SHARED_DIRECTORY" --exclude='content/.content-*.tmp' -czf "$nursery_temporary" "${nursery_inputs[@]}"
chmod 600 "$nursery_temporary"
mv "$nursery_temporary" "$nursery_archive"
find "$NURSERY_SHARED_DIRECTORY/backups" -maxdepth 1 -type f -name 'content-*.tar.gz' -mtime +30 -delete
printf 'Backup saved: %s\n' "$nursery_archive"
