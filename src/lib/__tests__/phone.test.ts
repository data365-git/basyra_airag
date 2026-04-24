import { describe, it, expect } from "vitest";
import { normalizePhone, tryNormalizePhone } from "../phone";

describe("normalizePhone", () => {
  it("handles Uzbek 12-digit without +", () => {
    expect(normalizePhone("998901234567")).toBe("+998901234567");
  });

  it("handles Uzbek with + prefix", () => {
    expect(normalizePhone("+998901234567")).toBe("+998901234567");
  });

  it("strips spaces and dashes", () => {
    expect(normalizePhone("+998 90 123-45-67")).toBe("+998901234567");
  });

  it("converts 00 international prefix", () => {
    expect(normalizePhone("00998901234567")).toBe("+998901234567");
  });

  it("handles Russian 11-digit", () => {
    expect(normalizePhone("79161234567")).toBe("+79161234567");
  });

  it("throws on empty string", () => {
    expect(() => normalizePhone("")).toThrow("Phone is empty");
  });

  it("throws on clearly invalid number", () => {
    expect(() => normalizePhone("123")).toThrow("Invalid phone");
  });
});

describe("tryNormalizePhone", () => {
  it("returns null for null input", () => {
    expect(tryNormalizePhone(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(tryNormalizePhone(undefined)).toBeNull();
  });

  it("returns null for invalid input", () => {
    expect(tryNormalizePhone("abc")).toBeNull();
  });

  it("returns normalized string for valid input", () => {
    expect(tryNormalizePhone("998901234567")).toBe("+998901234567");
  });
});
