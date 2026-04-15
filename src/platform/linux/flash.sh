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
        local val=""
        val=$(echo "$CONFIG_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('$key',''))" 2>/dev/null) || true
        if [ -z "$val" ]; then
            val=$(echo "$CONFIG_JSON" | jq -r ".$key // empty" 2>/dev/null) || true
        fi
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

# Normalize booleans
is_true() { [[ "${1,,}" == "true" || "$1" == "1" ]]; }
is_false() { [[ "${1,,}" == "false" || "$1" == "0" ]]; }

debug_enabled=false
is_true "$debug_val" && debug_enabled=true

dry_run=false
is_true "$dry_run_val" && dry_run=true

notify_when_focused=false
is_true "$notify_when_focused_val" && notify_when_focused=true

# sound_enabled: 'off' means disabled
if [[ "${sound_enabled,,}" == "off" ]]; then
    sound_enabled="false"
else
    sound_enabled="true"
fi

# Resolve notifyOn level to event list
declare -A level_map
level_map[all]="stop notification subagentstop subagentstart teammateidle sessionstart sessionend stopfailure"
level_map[normal]="stop notification subagentstop"
level_map[important]="notification"

notify_on_lower=$(echo "$notify_on" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')
if [[ -n "${level_map[$notify_on_lower]+x}" ]]; then
    IFS=' ' read -ra notify_on_set <<< "${level_map[$notify_on_lower]}"
else
    # Custom comma-separated list
    IFS=',' read -ra raw_set <<< "$notify_on"
    notify_on_set=()
    for item in "${raw_set[@]}"; do
        trimmed=$(echo "$item" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')
        [ -n "$trimmed" ] && notify_on_set+=("$trimmed")
    done
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
        [ -n "$dir" ] && mkdir -p "$dir" 2>/dev/null || true
        echo "[$(date -Iseconds)] $msg" >> "$log_file" 2>/dev/null || true
    fi
}

log_payload() {
    local payload="$1"
    if [ -n "$log_file" ] && [ -n "$payload" ]; then
        local dir
        dir=$(dirname "$log_file")
        [ -n "$dir" ] && mkdir -p "$dir" 2>/dev/null || true
        echo "[$(date -Iseconds)] payload: $payload" >> "$log_file" 2>/dev/null || true
    fi
}

# --- Check if enabled ---
if is_false "$enabled"; then
    debug_log "notification disabled by config"
    exit 0
fi

# --- Check quiet hours (format: "HH:MM-HH:MM", local time) ---
if [ -n "$quiet_hours" ]; then
    if [[ "$quiet_hours" =~ ^([0-9]{2}):([0-9]{2})-([0-9]{2}):([0-9]{2})$ ]]; then
        qh_start=$(( 10#${BASH_REMATCH[1]} * 60 + 10#${BASH_REMATCH[2]} ))
        qh_end=$(( 10#${BASH_REMATCH[3]} * 60 + 10#${BASH_REMATCH[4]} ))
        now_h=$(date +%H)
        now_m=$(date +%M)
        now_minutes=$(( 10#$now_h * 60 + 10#$now_m ))

        in_quiet=false
        if (( qh_start < qh_end )); then
            (( now_minutes >= qh_start && now_minutes < qh_end )) && in_quiet=true
        else
            # Overnight range (e.g., 23:00-07:00)
            (( now_minutes >= qh_start || now_minutes < qh_end )) && in_quiet=true
        fi

        if $in_quiet; then
            debug_log "quiet hours active ($quiet_hours), skipping"
            exit 0
        fi
    fi
fi

# --- Read stdin payload and check event type filter ---
hook_event_name=""
notification_type=""
stop_reason=""
stdin_content=""

if [ ! -t 0 ]; then
    stdin_content=$(cat)
fi

if [ -n "$stdin_content" ]; then
    log_payload "$stdin_content"

    # Extract fields using python3 first, fallback to jq
    extract_json_field() {
        local json="$1" field="$2"
        local val=""
        val=$(echo "$json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('$field',''))" 2>/dev/null) || true
        if [ -z "$val" ]; then
            val=$(echo "$json" | jq -r ".$field // empty" 2>/dev/null) || true
        fi
        echo "$val"
    }

    hook_event_name=$(extract_json_field "$stdin_content" "hook_event_name")
    notification_type=$(extract_json_field "$stdin_content" "notification_type")
    stop_reason=$(extract_json_field "$stdin_content" "reason")
fi

if [ -n "$hook_event_name" ]; then
    hook_event_lower=$(echo "$hook_event_name" | tr '[:upper:]' '[:lower:]')
    found=false
    for evt in "${notify_on_set[@]}"; do
        if [[ "$evt" == "$hook_event_lower" ]]; then
            found=true
            break
        fi
    done
    if ! $found; then
        debug_log "event '$hook_event_name' not in notifyOn=[$(IFS=','; echo "${notify_on_set[*]}")], skipping"
        exit 0
    fi
fi

# --- Debounce ---
if (( debounce_ms > 0 )); then
    lock_path=""
    if [ -n "${CC_NOTIFY_DEBOUNCE_LOCK_FILE:-}" ]; then
        lock_path="$CC_NOTIFY_DEBOUNCE_LOCK_FILE"
    elif [ -n "${CLAUDE_PLUGIN_DATA:-}" ]; then
        lock_path="$CLAUDE_PLUGIN_DATA/notification.lock"
    fi

    if [ -n "$lock_path" ]; then
        if [ -f "$lock_path" ]; then
            # Get mtime in seconds since epoch
            if stat --version &>/dev/null; then
                # GNU stat
                last_write=$(stat -c %Y "$lock_path" 2>/dev/null || echo 0)
            else
                # BSD stat (unlikely on Linux, but safe)
                last_write=$(stat -f %m "$lock_path" 2>/dev/null || echo 0)
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
        [ -n "$lock_dir" ] && mkdir -p "$lock_dir" 2>/dev/null || true
        touch "$lock_path"
        debug_log "debounce lock updated: $lock_path"
    fi
fi

debug_log "startPid=$$ workspace=$workspace_name hookEvent=$hook_event_name"

# --- Focus check ---
if ! $notify_when_focused; then
    focused=false

    # Try xdotool
    if command -v xdotool &>/dev/null; then
        active_window=$(xdotool getactivewindow getwindowname 2>/dev/null || true)
        if [ -n "$active_window" ] && [ -n "$workspace_name" ]; then
            if echo "$active_window" | grep -qi "$workspace_name"; then
                focused=true
            fi
        fi
    # Try xprop
    elif command -v xprop &>/dev/null; then
        active_hex=$(xprop -root _NET_ACTIVE_WINDOW 2>/dev/null | grep -oP '0x\w+' || true)
        if [ -n "$active_hex" ]; then
            active_title=$(xprop -id "$active_hex" WM_NAME 2>/dev/null | sed 's/.*= "//;s/"$//' || true)
            if [ -n "$active_title" ] && [ -n "$workspace_name" ]; then
                if echo "$active_title" | grep -qi "$workspace_name"; then
                    focused=true
                fi
            fi
        fi
    else
        debug_log "no focus detection tools available (xdotool, xprop), proceeding with notification"
    fi

    if $focused; then
        debug_log "window is focused, skipping (set notifyWhenFocused=true to override)"
        exit 0
    fi
fi

# --- Dry run check ---
if $dry_run; then
    debug_log "DRY_RUN: skipping notification and sound"
    exit 0
fi

# --- Build notification message ---
message="Claude Code"
if [ -n "$hook_event_name" ]; then
    case "$hook_event_name" in
        stop)
            if [ -n "$stop_reason" ]; then
                message="Claude Code: stopped ($stop_reason)"
            else
                message="Claude Code: task completed"
            fi
            ;;
        notification)
            if [ -n "$notification_type" ]; then
                message="Claude Code: $notification_type"
            else
                message="Claude Code: notification"
            fi
            ;;
        *)
            message="Claude Code: $hook_event_name"
            ;;
    esac
fi
[ -n "$workspace_name" ] && message="[$workspace_name] $message"

# --- Notification ---
notification_sent=false

# Try notify-send (libnotify, most common)
if command -v notify-send &>/dev/null; then
    notify-send "Claude Code" "$message" 2>/dev/null && notification_sent=true
# Try zenity (GNOME fallback)
elif command -v zenity &>/dev/null; then
    zenity --notification --text="$message" 2>/dev/null && notification_sent=true
# Try dbus-send (last resort)
elif command -v dbus-send &>/dev/null; then
    dbus-send --session \
        --dest=org.freedesktop.Notifications \
        --type=method_call \
        /org/freedesktop/Notifications \
        org.freedesktop.Notifications.Notify \
        string:"Claude Code" \
        uint32:0 \
        string:"" \
        string:"Claude Code" \
        string:"$message" \
        array:string:"" \
        dict:string:variant:"" \
        int32:-1 \
        2>/dev/null && notification_sent=true
fi

if $notification_sent; then
    debug_log "notification sent: $message"
else
    debug_log "no notification tool available (notify-send, zenity, dbus-send), sound only"
fi

# --- Sound ---
if [[ "$sound_enabled" == "true" ]]; then
    sound_played=false

    # Custom sound file
    if [ -n "$sound_file" ] && [ -f "$sound_file" ]; then
        if command -v paplay &>/dev/null; then
            paplay "$sound_file" &>/dev/null &
            sound_played=true
            debug_log "sound: custom file via paplay=$sound_file"
        elif command -v aplay &>/dev/null; then
            aplay "$sound_file" &>/dev/null &
            sound_played=true
            debug_log "sound: custom file via aplay=$sound_file"
        fi
    fi

    # Default freedesktop sound theme
    if ! $sound_played; then
        if command -v canberra-gtk-play &>/dev/null; then
            canberra-gtk-play -i message-new-instant &>/dev/null &
            sound_played=true
            debug_log "sound: canberra-gtk-play message-new-instant"
        elif command -v paplay &>/dev/null && [ -f "/usr/share/sounds/freedesktop/stereo/message-new-instant.oga" ]; then
            paplay /usr/share/sounds/freedesktop/stereo/message-new-instant.oga &>/dev/null &
            sound_played=true
            debug_log "sound: paplay freedesktop fallback"
        fi
    fi

    # Last resort: terminal bell
    if ! $sound_played; then
        printf '\a'
        debug_log "sound: terminal bell (fallback)"
    fi
fi

echo "notified"
