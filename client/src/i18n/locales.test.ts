import { describe, it, expect } from "vitest";
import en from "./locales/en.json";
import es from "./locales/es.json";

// Flattens a nested translation object into dotted leaf-key paths (arrays
// count as leaves — their contents are compared by JSON shape, not walked
// key-by-key, since list items aren't addressed by name).
function collectKeys(obj: unknown, prefix = ""): string[] {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
    return prefix ? [prefix] : [];
  }
  return Object.entries(obj as Record<string, unknown>).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return collectKeys(value, path);
  });
}

describe("i18n locale files", () => {
  it("en.json and es.json define exactly the same set of keys", () => {
    const enKeys = new Set(collectKeys(en));
    const esKeys = new Set(collectKeys(es));

    const onlyInEn = [...enKeys].filter((k) => !esKeys.has(k)).sort();
    const onlyInEs = [...esKeys].filter((k) => !enKeys.has(k)).sort();

    expect(onlyInEn, "keys present in en.json but missing from es.json").toEqual([]);
    expect(onlyInEs, "keys present in es.json but missing from en.json").toEqual([]);
  });

  it("every value is either a non-empty string or a well-formed array", () => {
    for (const [name, locale] of [["en", en], ["es", es]] as const) {
      const walk = (obj: unknown, path: string) => {
        if (typeof obj === "string") {
          expect(obj.length, `${name}:${path} is an empty string`).toBeGreaterThan(0);
          return;
        }
        if (Array.isArray(obj)) {
          expect(obj.length, `${name}:${path} is an empty array`).toBeGreaterThan(0);
          return;
        }
        if (obj !== null && typeof obj === "object") {
          for (const [key, value] of Object.entries(obj)) {
            walk(value, path ? `${path}.${key}` : key);
          }
          return;
        }
        throw new Error(`${name}:${path} has an unexpected value type: ${typeof obj}`);
      };
      walk(locale, "");
    }
  });
});
