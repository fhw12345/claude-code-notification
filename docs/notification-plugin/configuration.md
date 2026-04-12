# Notification Plugin Configuration

Config precedence is:

1. CLI flags
2. Plugin config file
3. settings.json
4. Built-in defaults

Supported CLI overrides:

- `--notify-enabled=true|false`
- `--notify-channel-toast=true|false`
- `--notify-event-task-failed=true|false`
- `--notify-behavior-throttle-ms=<number>`

Invalid CLI values are ignored and reported as warnings.
