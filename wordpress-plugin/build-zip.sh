#!/usr/bin/env bash
#
# Builds live-order-counter.zip, ready to upload via Plugins -> Add New ->
# Upload Plugin. Run it again after editing the plugin to refresh the archive.
#
set -euo pipefail

cd "$(dirname "$0")"

PLUGIN="live-order-counter"
ZIP="$PLUGIN.zip"

if [ ! -f "$PLUGIN/$PLUGIN.php" ]; then
	echo "error: $PLUGIN/$PLUGIN.php not found" >&2
	exit 1
fi

# Refuse to ship a plugin that would fatal on activation.
if command -v php >/dev/null 2>&1; then
	while IFS= read -r file; do
		php -l "$file" >/dev/null || { echo "error: syntax error in $file" >&2; exit 1; }
	done < <(find "$PLUGIN" -name '*.php')
	echo "PHP syntax OK"
fi

rm -f "$ZIP"

# WordPress expects the plugin folder at the root of the archive.
zip -rq "$ZIP" "$PLUGIN" \
	-x '*.DS_Store' \
	-x '__MACOSX/*' \
	-x '*/.git/*'

echo "built $ZIP ($(du -h "$ZIP" | cut -f1))"
unzip -l "$ZIP" | tail -n +4 | head -n -2
