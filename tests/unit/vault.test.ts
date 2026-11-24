import { describe, expect, it } from "vitest";
import { seal, open, sealJson, openJson, fingerprintOf } from "@/server/vault";

describe("credential vault", () => {
  it("round-trips a secret with authenticated encryption", () => {
    const sealed = seal("sk-test-123", "integration:abc");
    expect(sealed.ciphertext.equals(Buffer.from("sk-test-123"))).toBe(false);
    expect(open(sealed, "integration:abc")).toBe("sk-test-123");
  });

  it("rejects tampered ciphertext and wrong AAD", () => {
    const sealed = seal("secret", "aad");
    const tampered = { ...sealed, ciphertext: Buffer.from(sealed.ciphertext.map((b, i) => (i === 0 ? b ^ 1 : b))) };
    expect(() => open(tampered, "aad")).toThrow();
    expect(() => open(sealed, "other")).toThrow();
  });

  it("seals JSON and produces unique IVs", () => {
    const a = sealJson({ apiKey: "x" });
    const b = sealJson({ apiKey: "x" });
    expect(a.iv.equals(b.iv)).toBe(false);
    expect(openJson<{ apiKey: string }>(a).apiKey).toBe("x");
  });

  it("fingerprints only the tail", () => {
    expect(fingerprintOf("sk-abcdefgh1234")).toBe("…1234");
    expect(fingerprintOf("ab")).toBe("••••");
  });
});
