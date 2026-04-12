export type Warn = (message: string) => void;

export function createWarnOnce(warn: Warn): Warn {
  const seen = new Set<string>();

  return (message: string) => {
    if (seen.has(message)) {
      return;
    }

    seen.add(message);
    warn(message);
  };
}
