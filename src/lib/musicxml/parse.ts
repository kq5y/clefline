import { XMLValidator } from "fast-xml-parser";
import { midiToPitchName, pitchToMidi } from "./pitch";
import type {
  DirectionEvent,
  DirectionKind,
  Hand,
  MeasureModel,
  Notation,
  NoteEvent,
  ScoreMetadata,
  ScoreModel,
  ScoreWarning,
} from "./types";

const NAVIGATION_SOUND_ATTRIBUTES = ["dacapo", "dalsegno", "tocoda", "coda", "fine"] as const;

function elements(parent: ParentNode, tagName?: string): Element[] {
  const children = Array.from(parent.childNodes).filter(
    (node): node is Element => node.nodeType === Node.ELEMENT_NODE,
  );

  return tagName ? children.filter((child) => child.tagName === tagName) : children;
}

function first(parent: ParentNode, tagName: string): Element | undefined {
  return elements(parent, tagName)[0];
}

function text(parent: ParentNode, tagName: string): string | undefined {
  return first(parent, tagName)?.textContent?.trim() || undefined;
}

function queryText(parent: ParentNode, selector: string): string | undefined {
  return parent.querySelector(selector)?.textContent?.trim() || undefined;
}

function creditText(root: Element, creditType: string): string | undefined {
  for (const credit of elements(root, "credit")) {
    if (text(credit, "credit-type") !== creditType) {
      continue;
    }

    const words = elements(credit, "credit-words")
      .map((word) => word.textContent?.trim())
      .filter(Boolean)
      .join(" ");
    if (words) {
      return words;
    }
  }

  return undefined;
}

function firstCreditWords(root: Element): string | undefined {
  for (const credit of elements(root, "credit")) {
    const words = elements(credit, "credit-words")
      .map((word) => word.textContent?.trim())
      .filter(Boolean)
      .join(" ");
    if (words) {
      return words;
    }
  }

  return undefined;
}

function numberText(parent: ParentNode, tagName: string, fallback = 0): number {
  const value = text(parent, tagName);
  const parsed = value === undefined ? Number.NaN : Number(value);

  return Number.isFinite(parsed) ? parsed : fallback;
}

function attr(element: Element | undefined, name: string): string | undefined {
  return element?.getAttribute(name) ?? undefined;
}

function has(parent: ParentNode, tagName: string): boolean {
  return first(parent, tagName) !== undefined;
}

function handForStaff(staff: number): Hand {
  if (staff === 1) {
    return "right";
  }

  if (staff === 2) {
    return "left";
  }

  return "unknown";
}

function parseDocument(xml: string): Document {
  const validation = XMLValidator.validate(xml);
  if (validation !== true) {
    throw new Error(`Invalid MusicXML: ${validation.err.msg}`);
  }

  const document = new DOMParser().parseFromString(xml, "application/xml");
  const parserError = first(document, "parsererror");
  if (parserError) {
    throw new Error(parserError.textContent?.trim() || "Invalid MusicXML document");
  }

  return document;
}

function parseMetadata(root: Element): ScoreMetadata {
  const identification = first(root, "identification");
  const encoding = identification ? first(identification, "encoding") : undefined;
  const scorePart = first(first(root, "part-list") ?? root, "score-part");

  return {
    title:
      queryText(root, "work > work-title") ||
      text(root, "movement-title") ||
      creditText(root, "title") ||
      firstCreditWords(root) ||
      "Untitled Score",
    composer: elements(identification ?? root, "creator")
      .find((creator) => attr(creator, "type") === "composer")
      ?.textContent?.trim(),
    software: encoding ? text(encoding, "software") : undefined,
    source: identification ? text(identification, "source") : undefined,
    version: attr(root, "version"),
    partName: scorePart ? text(scorePart, "part-name") : undefined,
  };
}

function parseNotations(note: Element): {
  notations: Notation[];
  tieStart: boolean;
  tieStop: boolean;
} {
  const notations: Notation[] = [];
  let tieStart = false;
  let tieStop = false;

  for (const tie of elements(note, "tie")) {
    const type = attr(tie, "type");
    if (type === "start") {
      tieStart = true;
    }
    if (type === "stop") {
      tieStop = true;
    }
  }

  const grace = first(note, "grace");
  if (grace) {
    notations.push({
      type: "grace",
      value: attr(grace, "slash") === "yes" ? "slash" : "long",
    });
  }

  for (const notationRoot of elements(note, "notations")) {
    for (const notation of elements(notationRoot)) {
      if (notation.tagName === "tied") {
        const type = attr(notation, "type");
        tieStart ||= type === "start";
        tieStop ||= type === "stop";
        notations.push({ type: "tied", value: type });
        continue;
      }

      if (notation.tagName === "articulations" || notation.tagName === "ornaments") {
        for (const child of elements(notation)) {
          notations.push({
            type: child.tagName,
            placement: attr(child, "placement"),
            value: attr(child, "type"),
          });
        }
        continue;
      }

      if (notation.tagName === "technical") {
        for (const child of elements(notation)) {
          if (
            child.tagName !== "arpeggiate" &&
            child.tagName !== "non-arpeggiate" &&
            child.tagName !== "glissando" &&
            child.tagName !== "slide"
          ) {
            continue;
          }

          notations.push({
            type: child.tagName,
            placement: attr(child, "placement"),
            value: attr(child, "direction") ?? attr(child, "type"),
            number: attr(child, "number"),
          });
        }
        continue;
      }

      if (
        notation.tagName === "slur" ||
        notation.tagName === "glissando" ||
        notation.tagName === "slide"
      ) {
        notations.push({
          type: notation.tagName,
          value: attr(notation, "type"),
          number: attr(notation, "number"),
          text: notation.textContent?.trim() || undefined,
        });
        continue;
      }

      if (notation.tagName === "arpeggiate" || notation.tagName === "fermata") {
        notations.push({
          type: notation.tagName,
          value:
            attr(notation, "direction") ??
            attr(notation, "type") ??
            notation.textContent?.trim() ??
            undefined,
          number: attr(notation, "number"),
        });
      }
    }
  }

  return { notations, tieStart, tieStop };
}

function addDirectionEvents(
  direction: Element,
  beat: number,
  measureIndex: number,
  measureNumber: string,
  directions: DirectionEvent[],
  warnings: ScoreWarning[],
): void {
  const staff = numberText(direction, "staff", Number.NaN);
  const base = {
    beat,
    measureIndex,
    measureNumber,
    staff: Number.isFinite(staff) ? staff : undefined,
    placement: attr(direction, "placement"),
  };

  const sound = first(direction, "sound");
  const tempo = attr(sound, "tempo");
  if (tempo) {
    directions.push({
      ...base,
      id: `direction-${directions.length}`,
      kind: "tempo",
      value: Number(tempo),
    });
  }

  const dynamicSound = attr(sound, "dynamics");
  if (dynamicSound) {
    directions.push({
      ...base,
      id: `direction-${directions.length}`,
      kind: "dynamic",
      value: Number(dynamicSound),
    });
  }

  for (const name of NAVIGATION_SOUND_ATTRIBUTES) {
    const value = attr(sound, name);
    if (value !== undefined) {
      directions.push({
        ...base,
        id: `direction-${directions.length}`,
        kind: "repeat-navigation",
        text: name,
        value,
      });
      warnings.push({
        code: "repeat-navigation",
        message: `Navigation sound "${name}" is detected and will be expanded best-effort.`,
        measureNumber,
      });
    }
  }

  for (const directionType of elements(direction, "direction-type")) {
    for (const child of elements(directionType)) {
      const kind = directionKind(child);
      const childText = child.textContent?.trim() || undefined;

      if (child.tagName === "dynamics") {
        const dynamic = elements(child)[0]?.tagName;
        directions.push({
          ...base,
          id: `direction-${directions.length}`,
          kind,
          text: dynamic,
          value: dynamic,
        });
        continue;
      }

      if (child.tagName === "metronome") {
        const perMinute = text(child, "per-minute");
        directions.push({
          ...base,
          id: `direction-${directions.length}`,
          kind: "tempo",
          value: perMinute ? Number(perMinute) : undefined,
        });
        continue;
      }

      directions.push({
        ...base,
        id: `direction-${directions.length}`,
        kind,
        text: childText,
        value: attr(child, "type") ?? attr(child, "number") ?? childText,
      });
    }
  }
}

function directionKind(element: Element): DirectionKind {
  switch (element.tagName) {
    case "dynamics":
      return "dynamic";
    case "wedge":
      return "wedge";
    case "words":
      return /d\.s\.|d\.c\.|coda|fine/i.test(element.textContent ?? "")
        ? "repeat-navigation"
        : "words";
    case "rehearsal":
      return "rehearsal";
    case "octave-shift":
      return "octave-shift";
    case "segno":
      return "segno";
    case "coda":
      return "coda";
    default:
      return "other";
  }
}

function parseBarline(barline: Element, measure: MeasureModel): void {
  const repeat = first(barline, "repeat");
  const direction = attr(repeat, "direction");
  if (direction === "forward") {
    measure.repeatStart = true;
  }
  if (direction === "backward") {
    measure.repeatEnd = true;
  }

  for (const ending of elements(barline, "ending")) {
    const number = attr(ending, "number");
    if (number) {
      measure.endings.push(number);
    }
  }

  measure.barStyle = text(barline, "bar-style") ?? measure.barStyle;
}

function assignTieGroups(notes: NoteEvent[]): void {
  const activeGroups = new Map<string, string>();
  let nextTieGroup = 1;

  for (const note of notes) {
    const key = `${note.midi}:${note.staff}:${note.voice}`;
    const active = activeGroups.get(key);

    if (note.tieStop && active) {
      note.tieGroupId = active;
    }

    if (note.tieStart) {
      const tieGroupId = note.tieGroupId ?? active ?? `tie-${nextTieGroup++}`;
      note.tieGroupId = tieGroupId;
      activeGroups.set(key, tieGroupId);
    }

    if (note.tieStop && !note.tieStart) {
      activeGroups.delete(key);
    }
  }
}

export function parseMusicXml(xml: string): ScoreModel {
  const document = parseDocument(xml);
  const root = document.documentElement;
  if (root.tagName !== "score-partwise") {
    throw new Error(`Unsupported MusicXML root: ${root.tagName}`);
  }

  const metadata = parseMetadata(root);
  const part = first(root, "part");
  if (!part) {
    throw new Error("MusicXML does not contain a playable part.");
  }

  const measures: MeasureModel[] = [];
  const notes: NoteEvent[] = [];
  const directions: DirectionEvent[] = [];
  const warnings: ScoreWarning[] = [];
  let divisions = 1;
  let currentBeat = 0;

  const partCount = elements(root, "part").length;
  if (partCount > 1) {
    warnings.push({
      code: "multiple-parts",
      message: "Only the first part is used for the v1 piano practice timeline.",
    });
  }

  for (const [measureIndex, measureElement] of elements(part, "measure").entries()) {
    const measureNumber = attr(measureElement, "number") ?? `${measureIndex + 1}`;
    const measure: MeasureModel = {
      index: measureIndex,
      number: measureNumber,
      startBeat: currentBeat,
      durationBeats: 0,
      repeatStart: false,
      repeatEnd: false,
      endings: [],
    };
    let position = 0;
    let maxPosition = 0;
    let lastNoteStart = 0;

    for (const child of elements(measureElement)) {
      if (child.tagName === "attributes") {
        divisions = numberText(child, "divisions", divisions);
        continue;
      }

      if (child.tagName === "direction") {
        addDirectionEvents(
          child,
          currentBeat + position / divisions,
          measureIndex,
          measureNumber,
          directions,
          warnings,
        );
        continue;
      }

      if (child.tagName === "backup") {
        position = Math.max(0, position - numberText(child, "duration", 0));
        continue;
      }

      if (child.tagName === "forward") {
        position += numberText(child, "duration", 0);
        maxPosition = Math.max(maxPosition, position);
        continue;
      }

      if (child.tagName === "barline") {
        parseBarline(child, measure);
        continue;
      }

      if (child.tagName !== "note") {
        continue;
      }

      const durationDivisions = numberText(child, "duration", 0);
      const isChordTone = has(child, "chord");
      const isGrace = has(child, "grace");
      const noteStart = isChordTone ? lastNoteStart : position;
      const pitch = first(child, "pitch");
      const staff = numberText(child, "staff", 1);
      const voice = text(child, "voice") ?? "1";

      if (pitch) {
        const step = text(pitch, "step") ?? "C";
        const alter = numberText(pitch, "alter", 0);
        const octave = numberText(pitch, "octave", 4);
        const midi = pitchToMidi(step, alter, octave);
        const tieData = parseNotations(child);
        const durationBeats =
          durationDivisions > 0 ? durationDivisions / divisions : isGrace ? 0.25 : 0;

        notes.push({
          id: `note-${notes.length}`,
          midi,
          pitchName: midiToPitchName(midi),
          step,
          alter,
          octave,
          staff,
          hand: handForStaff(staff),
          voice,
          startBeat: currentBeat + noteStart / divisions,
          durationBeats,
          measureIndex,
          measureNumber,
          isGrace,
          isChordTone,
          tieStart: tieData.tieStart,
          tieStop: tieData.tieStop,
          notations: tieData.notations,
        });
      }

      if (!isChordTone && !isGrace) {
        lastNoteStart = position;
        position += durationDivisions;
        maxPosition = Math.max(maxPosition, position);
      } else if (!isChordTone) {
        lastNoteStart = position;
      }
    }

    measure.durationBeats = maxPosition / divisions;
    measures.push(measure);
    currentBeat += measure.durationBeats;
  }

  assignTieGroups(notes);

  return {
    metadata,
    measures,
    notes,
    directions,
    warnings,
    totalBeats: currentBeat,
    rawXml: xml,
  };
}
