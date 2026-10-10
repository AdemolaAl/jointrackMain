#!/bin/bash
# End-to-end tests. Each suite gets a fresh server on :3999 with an empty database, a fake Telegram/Meta/TikTok/Snapchat API on :4000
# (tests/mock.js) and, for e2e-pay.js, fake Paystack/Flutterwave on :4100 (tests/paymock.js). e2e-round6.js runs its own fake
# Anthropic API on :4200; e2e-round7.js writes its own blog files into tests/.run/blog (BLOG_DIR);
# e2e-round8.js fakes Paystack + Stripe on :4300 (PAYSTACK_API_BASE / STRIPE_API_BASE); e2e-voo.js runs a fake VooSquare
# (OIDC provider + events receiver, tests/oidcmock.js) on :4400; e2e-joe2.js fakes Anthropic (:4500) and an OpenAI-compatible
# API (:4600) and writes playbook fixtures into tests/.run/playbooks (JOE_PLAYBOOKS_DIR); e2e-round11.js fakes Gatevoo and VooSquare's own OAuth/events/support
# on :4700; e2e-vooconnect.js runs a fake VooSquare (OAuth, events, support: tests/oidcmock.js) on :4410 for the Voo Connect kit;
# e2e-round16.js fakes Cloudflare for SaaS on :4800 (CF_API_BASE) and answers DNS from tests/.run/dns.json (DOMAIN_DNS_MOCK).
# e2e-round17.js tests team seats and roles; e2e-round17b.js fakes Meta's Graph API on :4900 (META_GRAPH, META_DIALOG) and writes synthetic hourly clicks into the test database;
# e2e-round18.js tests the free Setup helper role, "access ends on" and GET /api/managed (writes synthetic hourly rows and conversions into the test database);
# e2e-round17c.js (QA regressions) also fakes Meta on :4900 and briefly writes public/media/tutorials/zz-qa-test.mp3 (removed at the end).
# e2e-round19b.js runs a webhook receiver on :4950 (WEBHOOK_TEST_ALLOW=1 lets the server post to localhost, tests only).
# Nothing touches the internet.
#
#   bash tests/runall.sh                  # every suite
#   bash tests/runall.sh e2e-round6.js    # one or more suites
#
# Output: every ok/FAIL line, then a total. Exit code 1 if anything failed. Logs: tests/.run/
T="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(dirname "$T")"; RUN="$T/.run"
mkdir -p "$RUN"; cd "$ROOT" || exit 1
SUITES=("$@"); [ ${#SUITES[@]} -eq 0 ] && SUITES=(e2e-round20i.js e2e-round20.js e2e-round19.js e2e-round19b.js e2e-round19c.js e2e-round19d.js e2e-round19e.js e2e.js e2e2.js e2e3.js e2e-bill.js e2e-ftd.js e2e-trial.js e2e-hook.js e2e-admin.js e2e-phaseA.js e2e-pay.js e2e-round6.js e2e-round7.js e2e-round8.js e2e-round9.js e2e-links.js e2e-staff.js e2e-voo.js e2e-joe2.js e2e-joe3.js e2e-round11.js e2e-vooconnect.js e2e-audit.js e2e-round15.js e2e-round16.js e2e-round16b.js e2e-round17.js e2e-round17b.js e2e-round17c.js e2e-round18.js e2e-round18b.js)

busy() { node -e "const s=require('net').connect($1,'127.0.0.1');s.on('connect',()=>{s.end();process.exit(0)});s.on('error',()=>process.exit(1))"; }
for port in 3999 4950 4960 4961 4962 4200 4300 4400 4410 4500 4600 4700 4800 4900; do if busy $port; then echo "Port $port is already in use. Stop whatever is listening there and run again."; exit 2; fi; done

MOCK=""; PAYMOCK=""
if ! curl -s localhost:4000/__state >/dev/null 2>&1; then node "$T/mock.js" > "$RUN/mock.log" 2>&1 & MOCK=$!; fi
if ! busy 4100; then node "$T/paymock.js" > "$RUN/paymock.log" 2>&1 & PAYMOCK=$!; fi
cleanup() { [ -n "$MOCK" ] && kill $MOCK 2>/dev/null; [ -n "$PAYMOCK" ] && kill $PAYMOCK 2>/dev/null; [ -n "$PID" ] && kill $PID 2>/dev/null; }
trap cleanup EXIT
sleep 0.6

OK=0; FAIL=0
for t in "${SUITES[@]}"; do
  rm -rf "$RUN/data" "$RUN/blog" "$RUN/playbooks"
  extra=()
  case "$t" in
    e2e-trial.js) extra=(FREE_JOINS=3) ;;
    e2e-bill.js) extra=(PRICE_INCLUDED=3 FREE_JOINS=0 WELCOME_CREDIT_CENTS=3000) ;;
    e2e-pay.js) extra=(WELCOME_CREDIT_CENTS=3000 PAYSTACK_SECRET=sk_test_x PAYSTACK_API=http://localhost:4100 FLW_SECRET=flw_test_x FLW_WEBHOOK_HASH=flwhash FLW_API=http://localhost:4100) ;;
    e2e-round6.js) extra=(FRAUD_BURST_MIN=15 ALERT_BOT_TOKEN=999001:alertbottokenxxxxxxxxxxxxxxxxxxxxxxx ANTHROPIC_API_BASE=http://localhost:4200) ;;
    e2e-round7.js) extra=(BLOG_DIR="$RUN/blog") ;;
    e2e-joe3.js) extra=(ANTHROPIC_API_BASE=http://localhost:4500 JOE_PLAYBOOKS_DIR="$RUN/playbooks") ;;
    e2e-joe2.js) extra=(ANTHROPIC_API_BASE=http://localhost:4500 JOE_PLAYBOOKS_DIR="$RUN/playbooks") ;;
    e2e-voo.js) extra=(VOO_ISSUER=http://localhost:4400 VOO_CLIENT_ID=joinvoo-test VOO_CLIENT_SECRET=cs_test_secret VOO_LOGIN_MODE=both VOO_SERVICE_KEY=svc_test_key_123 VOO_WEBHOOK_SECRET=whsec_voo_test_456 VOO_EVENTS_URL=http://localhost:4400/events VOO_HOME=https://voosquare.test VOO_OUTBOX_MS=250 VOO_BACKOFF_MS=300) ;;
    e2e-round11.js) extra=(VOO_ISSUER=http://localhost:4700 VOO_CLIENT_ID=joinvoo-native VOO_CLIENT_SECRET=cs_native_secret VOO_LOGIN_MODE=both VOO_API_KEY=voo_api_key_r11 VOO_SUPPORT_BRIDGE=1 VOO_OUTBOX_MS=250 VOO_BACKOFF_MS=300 LINK_INTERVAL_MS=30 POOL_SIZE=5) ;;
    e2e-vooconnect.js) extra=(VOO_BASE=http://localhost:4410 VOO_CLIENT_ID=vsc_joinvoo VOO_CLIENT_SECRET=vss_kit_secret VOO_API_KEY=vsk_kit_test_key VOO_LOGIN_MODE=both VOO_OUTBOX_MS=150 VOO_BACKOFF_MS=200 FREE_JOINS=0 WELCOME_CREDIT_CENTS=1000) ;;
    e2e-round15.js) extra=(JOINREQ_SWEEP_MS=500) ;;
    e2e-round16.js) rm -f "$RUN/dns.json"; extra=(CF_API_BASE=http://localhost:4800/client/v4 DOMAIN_DNS_MOCK="$RUN/dns.json" DOMAIN_CHECK_MS=2000 POOL_SIZE=5 LINK_INTERVAL_MS=30) ;;
    e2e-round16b.js) rm -f "$RUN/dns.json"; extra=(EDGE_SECRET=edge-secret-16b CF_API_BASE=http://localhost:4800/client/v4 DOMAIN_DNS_MOCK="$RUN/dns.json" DOMAIN_CHECK_MS=2000 DOMAIN_CLAIM_HOLD_MS=1500 POOL_SIZE=5 LINK_INTERVAL_MS=30) ;;
    e2e-round17.js) extra=(POOL_SIZE=5 LINK_INTERVAL_MS=30) ;;
    e2e-round18.js) extra=(POOL_SIZE=5 LINK_INTERVAL_MS=30) ;;
    e2e-round18b.js) extra=(POOL_SIZE=5 LINK_INTERVAL_MS=30) ;;
    e2e-round17b.js) extra=(POOL_SIZE=5 LINK_INTERVAL_MS=30 BAN_JOB_MS=300 BAN_FAIL_STREAK=3 META_APP_ID=1234567890 META_APP_SECRET=meta_test_secret META_GRAPH=http://localhost:4900/v21.0 META_DIALOG=http://localhost:4900/dialog/oauth) ;;
    e2e-round17c.js) extra=(POOL_SIZE=5 LINK_INTERVAL_MS=30 META_APP_ID=1234567890 META_APP_SECRET=meta_test_secret META_GRAPH=http://localhost:4900/v21.0 META_DIALOG=http://localhost:4900/dialog/oauth) ;;
    e2e-round19b.js) extra=(WEBHOOK_TEST_ALLOW=1) ;;
    e2e-round19d.js) extra=(ANTHROPIC_API_BASE=http://localhost:4960 PAYSTACK_SECRET=sk_test_x PAYSTACK_API=http://localhost:4100) ;;
    e2e-round19e.js) extra=(ANTHROPIC_API_BASE=http://localhost:4961) ;;
    e2e-round20.js) extra=(ANTHROPIC_API_BASE=http://localhost:4962) ;;
    e2e-round19c.js) extra=(PRICE_INCLUDED=3 FREE_JOINS=0 WELCOME_CREDIT_CENTS=0) ;;
    e2e-round8.js) extra=(PAYSTACK_API_BASE=http://localhost:4300 STRIPE_API_BASE=http://localhost:4300) ;;
  esac
  env PORT=3999 DATA_DIR="$RUN/data" TG_API=http://localhost:4000 GRAPH_API=http://localhost:4000 TIKTOK_API=http://localhost:4000 SNAP_API=http://localhost:4000 \
    USDT_TRC20_ADDRESS=TXYZtestaddressxxxxxxxxxxxxxxxxxxx ADMIN_EMAILS=admin@x.com RESEND_API_KEY= ANTHROPIC_API_KEY= "${extra[@]}" node server.js > "$RUN/srv.log" 2>&1 &
  PID=$!
  for i in $(seq 1 40); do busy 3999 && break; sleep 0.1; done
  kill -0 $PID 2>/dev/null || { echo "SERVER DID NOT START"; tail -5 "$RUN/srv.log"; }
  echo "===== $t"
  SRV_LOG="$RUN/srv.log" BLOG_DIR="$RUN/blog" JOE_PLAYBOOKS_DIR="$RUN/playbooks" timeout 120 node "$T/$t" > "$RUN/out.txt" 2>&1
  cat "$RUN/out.txt"
  OK=$((OK + $(grep -c '^ok ' "$RUN/out.txt"))); FAIL=$((FAIL + $(grep -c '^FAIL' "$RUN/out.txt")))
  if grep -qi "server error\|update error" "$RUN/srv.log"; then echo "--- server errors:"; grep -i "server error\|update error" "$RUN/srv.log" | head -5; FAIL=$((FAIL + 1)); fi
  kill $PID 2>/dev/null; wait $PID 2>/dev/null; PID=""
done
echo "===== TOTAL: $OK ok, $FAIL FAIL"
[ "$FAIL" -eq 0 ]
