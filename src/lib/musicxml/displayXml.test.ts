import { describe, expect, it } from "vitest";
import { sanitizeScoreDisplayXml } from "./displayXml";

describe("sanitizeScoreDisplayXml", () => {
  it("converts MuseScore sym text into music symbols before OSMD rendering", () => {
    const xml = `<direction><direction-type><words>To &lt;sym&gt;Coda&lt;/sym&gt;</words></direction-type></direction>`;

    expect(sanitizeScoreDisplayXml(xml)).toContain("To Coda");
    expect(sanitizeScoreDisplayXml(xml)).not.toContain("&lt;sym&gt;");
    expect(sanitizeScoreDisplayXml("<words>To <sym>Coda<sym></words>")).toContain("To Coda");
    expect(sanitizeScoreDisplayXml("<direction-type><coda/></direction-type>")).toContain(
      "<words>Coda</words>",
    );
  });
});
