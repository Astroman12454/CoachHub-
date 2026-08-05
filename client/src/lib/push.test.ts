import { describe, it, expect } from "vitest";
import { urlBase64ToUint8Array } from "./push";

describe("urlBase64ToUint8Array", () => {
  it("round-trips a URL-safe base64 string back to its original bytes", () => {
    const original = Array.from("Hello, push notifications!").map((c) => c.charCodeAt(0));
    const urlSafe = btoa(String.fromCharCode(...original))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    expect(Array.from(urlBase64ToUint8Array(urlSafe))).toEqual(original);
  });

  it("handles input that needs padding restored", () => {
    // A 1-byte payload base64-encodes to 2 chars + "==" padding, which gets
    // stripped for URL-safety — this is the case most likely to break a
    // padding-unaware implementation.
    const original = [65]; // "A"
    const urlSafe = btoa("A").replace(/=+$/, "");
    expect(urlSafe.endsWith("=")).toBe(false);
    expect(Array.from(urlBase64ToUint8Array(urlSafe))).toEqual(original);
  });
});
