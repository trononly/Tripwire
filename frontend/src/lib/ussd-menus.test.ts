import { describe, expect, it } from "vitest";
import {
  buildPaybillScript,
  buildSendScript,
  buildTillScript,
  normalizePhone,
  parseMenuOption,
} from "./ussd-menus";

describe("ussd-menus", () => {
  it("builds a send script ending in PIN-stop + confirm", () => {
    const s = buildSendScript("send", "0722123456", "500");
    expect(s?.kind).toBe("send");
    expect(s?.version).toBe(1);
    expect(s?.steps.map((st) => st.input)).toEqual([
      "1",
      "1",
      "0722123456",
      "500",
      "1",
    ]);
  });

  it("builds a pochi script selecting option 3", () => {
    const s = buildSendScript("pochi", "0722123456", "500");
    expect(s?.kind).toBe("pochi");
    expect(s?.steps[1]).toMatchObject({ input: "3" });
  });

  it("normalizes 254-prefixed numbers", () => {
    expect(normalizePhone("254722123456")).toBe("0722123456");
    expect(normalizePhone("+254722123456")).toBe("0722123456");
    expect(normalizePhone("12345")).toBe("");
  });

  it("rejects invalid send input", () => {
    expect(buildSendScript("send", "12345", "500")).toBeNull();
    expect(buildSendScript("send", "0722123456", "0")).toBeNull();
    expect(buildSendScript("send", "0722123456", "5000001")).toBeNull();
  });

  it("builds paybill and till scripts", () => {
    const p = buildPaybillScript("123456", "rent", "1000");
    expect(p?.steps.map((st) => st.input)).toEqual([
      "6",
      "1",
      "123456",
      "rent",
      "1000",
      "1",
    ]);
    const t = buildTillScript("543210", "250");
    expect(t?.steps.map((st) => st.input)).toEqual([
      "6",
      "2",
      "543210",
      "250",
      "1",
    ]);
    expect(buildPaybillScript("12", "rent", "1000")).toBeNull();
    expect(buildTillScript("12", "250")).toBeNull();
  });

  it("rejects USSD control chars in account names", () => {
    expect(buildPaybillScript("123456", "a*b#c", "100")).toBeNull();
  });

  it("parses the option number before matched text", () => {
    const prompt = "1. Send money\n3. Pochi La Biashara\n6. Lipa na M-PESA";
    expect(parseMenuOption(prompt, ["pochi"])).toBe("3");
    expect(parseMenuOption(prompt, ["lipa"])).toBe("6");
    expect(parseMenuOption(prompt, ["nope"])).toBeNull();
  });
});
