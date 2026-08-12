import { describe, it, expect, beforeEach } from "vitest";
import { saveTrainingProgress, loadTrainingProgress, clearTrainingProgress } from "./trainingProgress";

describe("training progress checkpoint", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns null when nothing has been saved for a session", () => {
    expect(loadTrainingProgress(1)).toBeNull();
  });

  it("round-trips a saved checkpoint", () => {
    saveTrainingProgress(42, { stepIndex: 2, secondsLeft: 137 });
    expect(loadTrainingProgress(42)).toEqual({ stepIndex: 2, secondsLeft: 137 });
  });

  it("scopes checkpoints per session id", () => {
    saveTrainingProgress(1, { stepIndex: 0, secondsLeft: 60 });
    saveTrainingProgress(2, { stepIndex: 3, secondsLeft: 10 });
    expect(loadTrainingProgress(1)).toEqual({ stepIndex: 0, secondsLeft: 60 });
    expect(loadTrainingProgress(2)).toEqual({ stepIndex: 3, secondsLeft: 10 });
  });

  it("clears a saved checkpoint", () => {
    saveTrainingProgress(5, { stepIndex: 1, secondsLeft: 5 });
    clearTrainingProgress(5);
    expect(loadTrainingProgress(5)).toBeNull();
  });

  it("ignores corrupt or hand-edited localStorage values instead of throwing", () => {
    window.localStorage.setItem("coachhub.trainingProgress.9", "not json");
    expect(loadTrainingProgress(9)).toBeNull();
  });

  it("rejects a checkpoint shaped with negative or non-integer fields", () => {
    window.localStorage.setItem("coachhub.trainingProgress.9", JSON.stringify({ stepIndex: -1, secondsLeft: 10 }));
    expect(loadTrainingProgress(9)).toBeNull();

    window.localStorage.setItem("coachhub.trainingProgress.9", JSON.stringify({ stepIndex: 1.5, secondsLeft: 10 }));
    expect(loadTrainingProgress(9)).toBeNull();
  });
});
