import { localSuspiciousWordsDetector } from "./local-detector"
import type { SuspiciousWordsDetector } from "./types"

// Future AI detectors can be selected here without changing UI or clean lyrics code.
export function getSuspiciousWordsDetector(): SuspiciousWordsDetector {
  return localSuspiciousWordsDetector
}
