import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseMusicXml } from "./parse";
import { buildPlaybackEvents } from "./timeline";

const samplePath = resolve(process.cwd(), "public/samples/sample_science.musicxml");

describe("parseMusicXml", () => {
  it("extracts the public science sample into a practice score model", async () => {
    const xml = await readFile(samplePath, "utf8");
    const score = parseMusicXml(xml);
    const playback = buildPlaybackEvents(score);

    expect(score.metadata.title).toBe("Science");
    expect(score.metadata.software).toContain("MuseScore");
    expect(score.measures).toHaveLength(89);
    expect(score.notes.length).toBeGreaterThan(1000);
    expect(playback.length).toBeGreaterThan(500);
    expect(score.directions.some((direction) => direction.kind === "dynamic")).toBe(true);
    expect(score.directions.filter((direction) => direction.kind === "wedge")).toHaveLength(6);
    expect(score.notes.filter((note) => note.tieStart)).toHaveLength(54);
    expect(score.notes.filter((note) => note.tieStop)).toHaveLength(54);
    expect(score.notes.some((note) => note.notations.some((n) => n.type === "arpeggiate"))).toBe(
      true,
    );
    expect(score.notes.some((note) => note.notations.some((n) => n.type === "staccato"))).toBe(
      true,
    );
  });
});
