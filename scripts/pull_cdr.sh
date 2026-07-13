#!/bin/bash
# CDR取込 cron ラッパー（フェーズ2で登録する行）:
#   8,23,38,53 * * * * /var/www/naisen-app/scripts/pull_cdr.sh >> /var/www/naisen-app/logs/cdr-pull.log 2>&1
set -euo pipefail
cd /var/www/naisen-app
mkdir -p logs

# MF sync window（4:00-4:40 JST）と重ねない
H=$(date +%H); M=$(date +%M)
if [ "$H" = "04" ] && [ "$M" -lt 45 ]; then exit 0; fi

# 多重起動防止
LOCK=/tmp/naisen-cdr-pull.lock
exec 9>"$LOCK"
flock -n 9 || exit 0

# TS→JS（ソースが新しい時だけ再コンパイル）
OUT=/tmp/naisen-cdr-pull-dist
if [ ! -f "$OUT/scripts/pull_cdr.js" ] \
   || [ scripts/pull_cdr.ts -nt "$OUT/scripts/pull_cdr.js" ] \
   || [ src/lib/cdr-transform.ts -nt "$OUT/src/lib/cdr-transform.js" ]; then
  ./node_modules/.bin/tsc scripts/pull_cdr.ts src/lib/cdr-transform.ts \
    --outDir "$OUT" --module commonjs --target es2020 --esModuleInterop --skipLibCheck
fi

echo "[$(date '+%F %T')] pull_cdr 開始"
NODE_PATH=/var/www/naisen-app/node_modules node "$OUT/scripts/pull_cdr.js"
echo "[$(date '+%F %T')] pull_cdr 終了"
