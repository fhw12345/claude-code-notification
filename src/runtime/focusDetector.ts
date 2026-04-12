export type FocusDetector = {
  isFocused(): boolean;
};

export function createFocusDetector(): FocusDetector {
  return {
    isFocused() {
      return false;
    }
  };
}
