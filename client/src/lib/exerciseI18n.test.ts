import { describe, it, expect } from "vitest";
import { localizedExerciseText } from "./exerciseI18n";

function oneExercise(overrides: Partial<Parameters<typeof localizedExerciseText>[0]> = {}) {
  return {
    name: "Mikan Drill",
    description: "Classic under-the-basket drill",
    instructions: "Start under the basket",
    nameEs: "Ejercicio Mikan",
    descriptionEs: "Ejercicio clásico bajo el aro",
    instructionsEs: "Comienza bajo el aro",
    ...overrides,
  };
}

describe("localizedExerciseText", () => {
  it("returns the Spanish fields when the language is Spanish and they're set", () => {
    const result = localizedExerciseText(oneExercise(), "es");
    expect(result).toEqual({
      name: "Ejercicio Mikan",
      description: "Ejercicio clásico bajo el aro",
      instructions: "Comienza bajo el aro",
    });
  });

  it("returns the English fields when the language is English, even if Spanish is set", () => {
    const result = localizedExerciseText(oneExercise(), "en");
    expect(result).toEqual({
      name: "Mikan Drill",
      description: "Classic under-the-basket drill",
      instructions: "Start under the basket",
    });
  });

  it("falls back to English when a coach's own exercise has no Spanish translation", () => {
    const result = localizedExerciseText(
      oneExercise({ nameEs: null, descriptionEs: null, instructionsEs: null }),
      "es"
    );
    expect(result).toEqual({
      name: "Mikan Drill",
      description: "Classic under-the-basket drill",
      instructions: "Start under the basket",
    });
  });

  it("falls back to English field by field when only some Spanish fields are set", () => {
    const result = localizedExerciseText(oneExercise({ instructionsEs: null }), "es");
    expect(result).toEqual({
      name: "Ejercicio Mikan",
      description: "Ejercicio clásico bajo el aro",
      instructions: "Start under the basket",
    });
  });

  it("treats regional variants like es-MX as Spanish", () => {
    const result = localizedExerciseText(oneExercise(), "es-MX");
    expect(result.name).toBe("Ejercicio Mikan");
  });

  it("passes through a null instructions field untranslated", () => {
    const result = localizedExerciseText(
      oneExercise({ instructions: null, instructionsEs: null }),
      "en"
    );
    expect(result.instructions).toBeNull();
  });
});
