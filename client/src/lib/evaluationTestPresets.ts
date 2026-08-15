import type { EvaluationTestType } from "@shared/schema";

export interface EvaluationTestPreset {
  key: string;
  type: EvaluationTestType;
  worstValue: number;
  bestValue: number;
}

// Sensible starting reference ranges for common basketball tests — good
// enough for a coach to click and start using immediately, not a precise
// benchmark. Editable afterward like any other test (see Evaluations.tsx's
// quick-create flow and its "you can adjust this later" toast).
export const EVALUATION_TEST_PRESETS: EvaluationTestPreset[] = [
  { key: "fullCourtSprint", type: "time", worstValue: 12, bestValue: 6 },
  { key: "suicides", type: "time", worstValue: 40, bestValue: 25 },
  { key: "freeThrows", type: "count", worstValue: 0, bestValue: 20 },
  { key: "threePointers", type: "count", worstValue: 0, bestValue: 15 },
  { key: "layups", type: "count", worstValue: 0, bestValue: 25 },
];
