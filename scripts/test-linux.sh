#!/usr/bin/env bash
# Quick test script for Linux notification
set -e

cd "$(dirname "$0")/.."

echo "=== Test 1: basic Stop event (dry run) ==="
echo '{"hook_event_name":"Stop","last_assistant_message":"hello"}' | \
  CC_NOTIFY_DEBUG=1 CC_NOTIFY_DRY_RUN=1 CLAUDE_PLUGIN_DATA=/tmp/cc-test1 \
  bash src/platform/linux/flash.sh
echo ""

echo "=== Test 2: Stop event with notification ==="
echo '{"hook_event_name":"Stop","last_assistant_message":"hello"}' | \
  CC_NOTIFY_DEBUG=1 CC_NOTIFY_WHEN_FOCUSED=true CLAUDE_PLUGIN_DATA=/tmp/cc-test2 \
  bash src/platform/linux/flash.sh
echo ""

echo "=== Test 3: focus detection (should skip if terminal is focused) ==="
echo '{"hook_event_name":"Stop","last_assistant_message":"hello"}' | \
  CC_NOTIFY_DEBUG=1 CLAUDE_PLUGIN_DATA=/tmp/cc-test3 \
  bash src/platform/linux/flash.sh
echo ""

echo "=== Test 4: notifyOn=important filters Stop ==="
echo '{"hook_event_name":"Stop","last_assistant_message":"hello"}' | \
  CC_NOTIFY_DEBUG=1 CC_NOTIFY_ON=important CLAUDE_PLUGIN_DATA=/tmp/cc-test4 \
  bash src/platform/linux/flash.sh
echo ""

echo "=== Test 5: enabled=false ==="
echo '{}' | \
  CC_NOTIFY_DEBUG=1 CC_NOTIFY_ENABLED=false CLAUDE_PLUGIN_DATA=/tmp/cc-test5 \
  bash src/platform/linux/flash.sh
echo ""

echo "=== All tests done ==="
