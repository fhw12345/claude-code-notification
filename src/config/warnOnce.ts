export type Warn = (message: string) => void;
export type WarnOnce = (keyPath: string, message: string) => void;

export function createWarnOnce(warn: Warn): WarnOnce {
  const seen = new Set<string>();

  return (keyPath: string, message: string) => {
    const dedupeKey = keyPath || "<root>";

    if (seen.has(dedupeKey)) {
      return;
    }

    seen.add(dedupeKey);
    warn(message);
  };
}
