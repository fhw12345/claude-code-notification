#!/usr/bin/env bash
# Platform dispatcher — routes to the correct notification script
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"

case "$(uname -s)" in
  CYGWIN*|MINGW*|MSYS*)
    powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGIN_ROOT/src/platform/windows/flash.ps1"
    ;;
  Darwin*)
    bash "$PLUGIN_ROOT/src/platform/macos/flash.sh"
    ;;
  *)
    bash "$PLUGIN_ROOT/src/platform/linux/flash.sh"
    ;;
esac
