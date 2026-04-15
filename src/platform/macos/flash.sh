#!/usr/bin/env bash
set -euo pipefail

# --- Load config from $CLAUDE_PLUGIN_DATA/config.json ---
CONFIG_JSON=""
if [ -n "${CLAUDE_PLUGIN_DATA:-}" ]; then
    config_path="$CLAUDE_PLUGIN_DATA/config.json"
    if [ -f "$config_path" ]; then
        CONFIG_JSON=$(cat "$config_path" 2>/dev/null || true)
    fi
fi

get_setting() {
    local key="$1" env_var="$2" default="$3"
    local env_val="${!env_var:-}"
    if [ -n "$env_val" ]; then echo "$env_val"; return; fi
    if [ -n "$CONFIG_JSON" ]; then
        local val
        val=$(echo "$CONFIG_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('$key',''))" 2>/dev/null) || true
        if [ -n "$val" ]; then echo "$val"; return; fi
    fi
    echo "$default"
}

enabled=$(get_setting 'enabled' 'CC_NOTIFY_ENABLED' 'true')
debug_val=$(get_setting 'debug' 'CC_NOTIFY_DEBUG' 'false')
dry_run_val=$(get_setting 'dryRun' 'CC_NOTIFY_DRY_RUN' 'false')
sound_enabled=$(get_setting 'sound' 'CC_NOTIFY_SOUND' 'on')
sound_file=$(get_setting 'soundFile' 'CC_NOTIFY_SOUND_FILE' '')
log_file_cfg=$(get_setting 'logFile' 'CC_NOTIFY_LOG_FILE' '')
debounce_ms=$(get_setting 'debounceMs' 'CC_NOTIFY_DEBOUNCE_MS' '3000')
notify_on=$(get_setting 'notifyOn' 'CC_NOTIFY_ON' 'normal')
quiet_hours=$(get_setting 'quietHours' 'CC_NOTIFY_QUIET_HOURS' '')
notify_when_focused_val=$(get_setting 'notifyWhenFocused' 'CC_NOTIFY_WHEN_FOCUSED' 'false')

# Boolean normalization
is_true() {
    local v
    v=$(echo "$1" | tr '[:upper:]' '[:lower:]')  # lowercase
    [[ "$v" == "true" || "$v" == "1" ]]
}

is_false() {
    local v
    v=$(echo "$1" | tr '[:upper:]' '[:lower:]')
    [[ "$v" == "false" || "$v" == "0" ]]
}

debug_enabled=false
is_true "$debug_val" && debug_enabled=true

dry_run=false
is_true "$dry_run_val" && dry_run=true

notify_when_focused=false
is_true "$notify_when_focused_val" && notify_when_focused=true

# enabled check (disabled if explicitly 'false')
if is_false "$enabled"; then
    enabled_flag=false
else
    enabled_flag=true
fi

# sound: off means disabled
sound_flag=true
if [[ "$(echo "$sound_enabled" | tr '[:upper:]' '[:lower:]')" == "off" ]]; then
    sound_flag=false
fi

# Resolve notifyOn level to event list
declare -A level_map
level_map[all]='stop,notification,subagentstop,subagentstart,teammateidle,sessionstart,sessionend,stopfailure'
level_map[normal]='stop,notification,subagentstop'
level_map[important]='notification'

notify_on_lower=$(echo "$notify_on" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')
if [[ -n "${level_map[$notify_on_lower]+x}" ]]; then
    notify_on_set="${level_map[$notify_on_lower]}"
else
    # Custom comma-separated list
    notify_on_set="$notify_on_lower"
fi

workspace_name="${CC_NOTIFY_WORKSPACE_NAME:-}"
if [ -z "$workspace_name" ]; then
    workspace_name=$(basename "$PWD")
fi

# --- Log setup ---
log_file="$log_file_cfg"
if [ -z "$log_file" ] && [ -n "${CLAUDE_PLUGIN_DATA:-}" ]; then
    log_file="$CLAUDE_PLUGIN_DATA/notification.log"
fi

debug_log() {
    local msg="$1"
    if $debug_enabled; then echo "$msg"; fi
    if [ -n "$log_file" ]; then
        local dir
        dir=$(dirname "$log_file")
        if [ -n "$dir" ] && [ ! -d "$dir" ]; then
            mkdir -p "$dir" 2>/dev/null || true
        fi
        echo "[$(date -u +%Y-%m-%dT%H:%M:%S%z)] $msg" >> "$log_file" 2>/dev/null || true
    fi
}

# --- Check if enabled ---
if ! $enabled_flag; then
    debug_log "notification disabled by config"
    exit 0
fi

# --- Check quiet hours (format: "HH:MM-HH:MM", local time) ---
if [ -n "$quiet_hours" ]; then
    if [[ "$quiet_hours" =~ ^([0-9]{2}):([0-9]{2})-([0-9]{2}):([0-9]{2})$ ]]; then
        qh_start=$(( 10#${BASH_REMATCH[1]} * 60 + 10#${BASH_REMATCH[2]} ))
        qh_end=$(( 10#${BASH_REMATCH[3]} * 60 + 10#${BASH_REMATCH[4]} ))
        now_hour=$(date +%H)
        now_min=$(date +%M)
        now_minutes=$(( 10#$now_hour * 60 + 10#$now_min ))

        in_quiet=false
        if (( qh_start < qh_end )); then
            if (( now_minutes >= qh_start && now_minutes < qh_end )); then
                in_quiet=true
            fi
        else
            # Overnight range (e.g., 22:00-06:00)
            if (( now_minutes >= qh_start || now_minutes < qh_end )); then
                in_quiet=true
            fi
        fi

        if $in_quiet; then
            debug_log "quiet hours active ($quiet_hours), skipping"
            exit 0
        fi
    fi
fi

# --- Read stdin payload ---
hook_event_name=""
notification_type=""
stop_reason=""
stdin_content=""

if [ ! -t 0 ]; then
    stdin_content=$(cat 2>/dev/null || true)
    if [ -n "$stdin_content" ]; then
        hook_event_name=$(echo "$stdin_content" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('hook_event_name',''))" 2>/dev/null) || true
        notification_type=$(echo "$stdin_content" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('notification_type',''))" 2>/dev/null) || true
        stop_reason=$(echo "$stdin_content" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('reason',''))" 2>/dev/null) || true
    fi
fi

# Log the full payload (always, not gated by debug)
if [ -n "$log_file" ] && [ -n "$(echo "$stdin_content" | tr -d '[:space:]')" ]; then
    local_dir=$(dirname "$log_file")
    if [ -n "$local_dir" ] && [ ! -d "$local_dir" ]; then
        mkdir -p "$local_dir" 2>/dev/null || true
    fi
    echo "[$(date -u +%Y-%m-%dT%H:%M:%S%z)] payload: $(echo "$stdin_content" | tr -d '\n')" >> "$log_file" 2>/dev/null || true
fi

# --- Check event type filter ---
if [ -n "$hook_event_name" ]; then
    event_lower=$(echo "$hook_event_name" | tr '[:upper:]' '[:lower:]')
    # Check if event is in the notify_on_set (comma-separated)
    if ! echo ",$notify_on_set," | grep -qi ",$event_lower,"; then
        debug_log "event '$hook_event_name' not in notifyOn=[$notify_on_set], skipping"
        exit 0
    fi
fi

# --- Debounce ---
if (( debounce_ms > 0 )); then
    lock_path="${CC_NOTIFY_DEBOUNCE_LOCK_FILE:-}"
    if [ -z "$lock_path" ] && [ -n "${CLAUDE_PLUGIN_DATA:-}" ]; then
        lock_path="$CLAUDE_PLUGIN_DATA/notification.lock"
    fi

    if [ -n "$lock_path" ]; then
        if [ -f "$lock_path" ]; then
            # Get file mtime in seconds since epoch
            if stat -f %m "$lock_path" &>/dev/null; then
                # macOS stat
                last_write=$(stat -f %m "$lock_path")
            else
                # GNU stat fallback
                last_write=$(stat -c %Y "$lock_path" 2>/dev/null || echo 0)
            fi
            now_epoch=$(date +%s)
            elapsed_ms=$(( (now_epoch - last_write) * 1000 ))
            if (( elapsed_ms < debounce_ms )); then
                debug_log "debounced: ${elapsed_ms}ms < ${debounce_ms}ms since last notification"
                exit 0
            fi
        fi

        # Touch the lock file
        lock_dir=$(dirname "$lock_path")
        if [ -n "$lock_dir" ] && [ ! -d "$lock_dir" ]; then
            mkdir -p "$lock_dir" 2>/dev/null || true
        fi
        touch "$lock_path"
        debug_log "debounce lock updated: $lock_path"
    fi
fi

debug_log "startPid=$$ workspace=$workspace_name hookEvent=$hook_event_name"

# --- Dry run check ---
if $dry_run; then
    debug_log "DRY_RUN: skipping notification and sound"
    exit 0
fi

# --- Focus check ---
if ! $notify_when_focused; then
    frontmost=$(osascript -e 'tell application "System Events" to get name of first process whose frontmost is true' 2>/dev/null) || true
    # Known terminal / editor app names
    terminal_apps="Terminal|iTerm2|iTerm|Alacritty|kitty|Hyper|WezTerm|Code|Visual Studio Code|Cursor"
    if echo "$frontmost" | grep -qiE "^($terminal_apps)$"; then
        debug_log "terminal '$frontmost' is focused, skipping (set notifyWhenFocused=true to override)"
        exit 0
    fi
fi

# --- Build notification message ---
message="Claude Code"
if [ -n "$hook_event_name" ]; then
    case "$hook_event_name" in
        stop)
            if [ -n "$stop_reason" ]; then
                message="Task completed: $stop_reason"
            else
                message="Task completed"
            fi
            ;;
        notification)
            if [ -n "$notification_type" ]; then
                message="Notification: $notification_type"
            else
                message="Needs your attention"
            fi
            ;;
        subagentstop)
            message="Sub-agent finished"
            ;;
        subagentstart)
            message="Sub-agent started"
            ;;
        teammateidle)
            message="Teammate is idle"
            ;;
        stopfailure)
            message="Task failed"
            ;;
        *)
            message="Event: $hook_event_name"
            ;;
    esac
fi

if [ -n "$workspace_name" ]; then
    title="Claude Code - $workspace_name"
else
    title="Claude Code"
fi

# --- Notification via osascript ---
# Escape double quotes in message and title for AppleScript
escaped_message=$(echo "$message" | sed 's/"/\\"/g')
escaped_title=$(echo "$title" | sed 's/"/\\"/g')

osascript -e "display notification \"$escaped_message\" with title \"$escaped_title\"" 2>/dev/null || true
debug_log "notification sent: title='$title' message='$message'"

# --- Sound ---
if $sound_flag; then
    if [ -n "$sound_file" ] && [ -f "$sound_file" ]; then
        afplay "$sound_file" &>/dev/null &
        debug_log "sound: custom file=$sound_file"
    else
        afplay /System/Library/Sounds/Ping.aiff &>/dev/null &
        debug_log "sound: system Ping"
    fi
fi
