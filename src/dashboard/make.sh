#!/bin/sh
# Builds public/app.html (the dashboard) from the parts in this folder, checks the script parses, then rebuilds the site.
#   sh src/dashboard/make.sh
set -e
D="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$D/../.." && pwd)"; OUT="$ROOT/public/app.html"; TMP="${TMPDIR:-/tmp}/joinvoo-app.next.html"
cat "$D/p1.css.html" "$D/p2.css.html" "$D/p2b.css.html" "$D/p2c.css.html" "$D/p3.core.html" "$D/p4.shell.html" "$D/p5.overview.html" "$D/p6.compare.html" \
    "$D/p7.data.html" "$D/p8.pages.html" "$D/p8b.phaseA.html" "$D/p8c.round6.html" "$D/p9.demo.html" > "$TMP"
python3 - "$TMP" <<'PY'
import sys
s = open(sys.argv[1]).read()
a = s.index('<script>\n(function(){')
open(sys.argv[1] + '.js', 'w').write(s[a + 8:s.index('</script>', a)])
PY
node --check "$TMP.js" && echo SYNTAX_OK
cp "$TMP" "$OUT"
cd "$ROOT" && python3 build/build.py >/dev/null && echo BUILT
