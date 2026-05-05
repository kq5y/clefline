import { XMLParser } from "fast-xml-parser";
import { midiToPitchName, pitchToMidi } from "./pitch";
import type {
  DirectionEvent,
  DirectionKind,
  Hand,
  MeasureModel,
  Notation,
  NoteEvent,
  PedalEvent,
  ScoreMetadata,
  ScoreModel,
  ScoreWarning,
} from "./types";

const NAVIGATION_SOUND_ATTRIBUTES = ["dacapo", "dalsegno", "tocoda", "coda", "fine"] as const;

type OrderedNode = Record<string, unknown>;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  preserveOrder: true,
  trimValues: true,
});

function findChild(nodes: OrderedNode[], tagName: string): OrderedNode | undefined {
  for (const node of nodes) {
    if (tagName in node) return node;
  }
  return undefined;
}

function findChildren(nodes: OrderedNode[], tagName: string): OrderedNode[] {
  return nodes.filter((node) => tagName in node);
}

function getChildContent(nodes: OrderedNode[], tagName: string): OrderedNode[] | undefined {
  const child = findChild(nodes, tagName);
  return child ? (child[tagName] as OrderedNode[]) : undefined;
}

function getText(nodes: OrderedNode[], tagName: string): string | undefined {
  const content = getChildContent(nodes, tagName);
  if (!content) return undefined;
  const textNode = findChild(content, "#text");
  if (!textNode) return undefined;
  const text = textNode["#text"] as string | number | unknown[];
  if (Array.isArray(text)) {
    const first = text[0];
    if (typeof first === "string") return first.trim() || undefined;
    if (typeof first === "number") return String(first);
    return undefined;
  }
  if (typeof text === "string") return text.trim() || undefined;
  if (typeof text === "number") return String(text);
  return undefined;
}

function getNumber(nodes: OrderedNode[], tagName: string, fallback = 0): number {
  const value = getText(nodes, tagName);
  const parsed = value === undefined ? Number.NaN : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getAttr(node: OrderedNode | undefined, name: string): string | undefined {
  if (!node) return undefined;
  const attrs = node[":@"] as Record<string, unknown> | undefined;
  if (!attrs) return undefined;
  const value = attrs[name];
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return undefined;
}

function hasChild(nodes: OrderedNode[], tagName: string): boolean {
  return findChild(nodes, tagName) !== undefined;
}

function getTextContent(node: OrderedNode): string | undefined {
  for (const [key, value] of Object.entries(node)) {
    if (key === ":@") continue;
    const content = value as OrderedNode[];
    const textNode = findChild(content, "#text");
    if (textNode) {
      const text = textNode["#text"] as string | number | unknown[];
      if (Array.isArray(text)) {
        const first = text[0];
        if (typeof first === "string") return first.trim() || undefined;
        if (typeof first === "number") return String(first);
        continue;
      }
      if (typeof text === "string") return text.trim() || undefined;
      if (typeof text === "number") return String(text);
    }
  }
  return undefined;
}

function getTagName(node: OrderedNode): string | undefined {
  for (const key of Object.keys(node)) {
    if (key !== ":@") return key;
  }
  return undefined;
}

function handForStaff(staff: number): Hand {
  if (staff === 1) return "right";
  if (staff === 2) return "left";
  return "unknown";
}

function parseDocument(xml: string): { content: OrderedNode[]; version?: string } {
  const result = parser.parse(xml) as OrderedNode[];
  const scoreNode = findChild(result, "score-partwise");
  if (!scoreNode) {
    if (findChild(result, "score-timewise")) {
      throw new Error("Unsupported MusicXML root: score-timewise");
    }
    throw new Error("Invalid MusicXML: missing score-partwise root element");
  }
  return {
    content: scoreNode["score-partwise"] as OrderedNode[],
    version: getAttr(scoreNode, "version"),
  };
}

function creditText(root: OrderedNode[], creditType: string): string | undefined {
  for (const creditNode of findChildren(root, "credit")) {
    const credit = creditNode["credit"] as OrderedNode[];
    if (getText(credit, "credit-type") !== creditType) continue;
    const words = findChildren(credit, "credit-words")
      .map((w) => getTextContent(w))
      .filter(Boolean)
      .join(" ");
    if (words) return words;
  }
  return undefined;
}

function firstCreditWords(root: OrderedNode[]): string | undefined {
  for (const creditNode of findChildren(root, "credit")) {
    const credit = creditNode["credit"] as OrderedNode[];
    const words = findChildren(credit, "credit-words")
      .map((w) => getTextContent(w))
      .filter(Boolean)
      .join(" ");
    if (words) return words;
  }
  return undefined;
}

function parseMetadata(root: OrderedNode[], version?: string): ScoreMetadata {
  const identificationContent = getChildContent(root, "identification");
  const encodingContent = identificationContent ? getChildContent(identificationContent, "encoding") : undefined;
  const partListContent = getChildContent(root, "part-list");
  const scorePartContent = partListContent ? getChildContent(partListContent, "score-part") : undefined;
  const workContent = getChildContent(root, "work");

  let composer: string | undefined;
  if (identificationContent) {
    for (const creatorNode of findChildren(identificationContent, "creator")) {
      if (getAttr(creatorNode, "type") === "composer") {
        composer = getTextContent(creatorNode);
        break;
      }
    }
  }

  return {
    title:
      (workContent ? getText(workContent, "work-title") : undefined) ||
      getText(root, "movement-title") ||
      creditText(root, "title") ||
      firstCreditWords(root) ||
      "Untitled Score",
    composer,
    software: encodingContent ? getText(encodingContent, "software") : undefined,
    source: identificationContent ? getText(identificationContent, "source") : undefined,
    version,
    partName: scorePartContent ? getText(scorePartContent, "part-name") : undefined,
  };
}

function parseNotations(noteContent: OrderedNode[]): {
  notations: Notation[];
  tieStart: boolean;
  tieStop: boolean;
} {
  const notations: Notation[] = [];
  let tieStart = false;
  let tieStop = false;

  for (const tieNode of findChildren(noteContent, "tie")) {
    const type = getAttr(tieNode, "type");
    if (type === "start") tieStart = true;
    if (type === "stop") tieStop = true;
  }

  const graceNode = findChild(noteContent, "grace");
  if (graceNode) {
    notations.push({
      type: "grace",
      value: getAttr(graceNode, "slash") === "yes" ? "slash" : "long",
    });
  }

  for (const notationsNode of findChildren(noteContent, "notations")) {
    const notationsContent = notationsNode["notations"] as OrderedNode[];
    for (const item of notationsContent) {
      const tagName = getTagName(item);
      if (!tagName || tagName === "#text") continue;

      const itemContent = item[tagName] as OrderedNode[];

      if (tagName === "tied") {
        const type = getAttr(item, "type");
        tieStart ||= type === "start";
        tieStop ||= type === "stop";
        notations.push({ type: "tied", value: type });
        continue;
      }

      if (tagName === "articulations" || tagName === "ornaments") {
        for (const child of itemContent) {
          const childTag = getTagName(child);
          if (!childTag || childTag === "#text") continue;
          notations.push({
            type: childTag,
            placement: getAttr(child, "placement"),
            value: getAttr(child, "type"),
          });
        }
        continue;
      }

      if (tagName === "technical") {
        for (const child of itemContent) {
          const childTag = getTagName(child);
          if (!childTag || childTag === "#text") continue;
          if (!["arpeggiate", "non-arpeggiate", "glissando", "slide"].includes(childTag)) continue;
          notations.push({
            type: childTag,
            placement: getAttr(child, "placement"),
            value: getAttr(child, "direction") ?? getAttr(child, "type"),
            number: getAttr(child, "number"),
          });
        }
        continue;
      }

      if (tagName === "slur" || tagName === "glissando" || tagName === "slide") {
        notations.push({
          type: tagName,
          value: getAttr(item, "type"),
          number: getAttr(item, "number"),
          text: getTextContent(item),
        });
        continue;
      }

      if (tagName === "arpeggiate" || tagName === "fermata") {
        notations.push({
          type: tagName,
          value: getAttr(item, "direction") ?? getAttr(item, "type") ?? getTextContent(item),
          number: getAttr(item, "number"),
        });
      }
    }
  }

  return { notations, tieStart, tieStop };
}

function directionKind(tagName: string, textContent: string | undefined): DirectionKind {
  switch (tagName) {
    case "dynamics":
      return "dynamic";
    case "wedge":
      return "wedge";
    case "words":
      return /d\.s\.|d\.c\.|coda|fine/i.test(textContent ?? "") ? "repeat-navigation" : "words";
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

function addDirectionEvents(
  directionContent: OrderedNode[],
  directionNode: OrderedNode,
  beat: number,
  measureIndex: number,
  measureNumber: string,
  directions: DirectionEvent[],
  warnings: ScoreWarning[],
): void {
  const staffValue = getText(directionContent, "staff");
  const staff = staffValue ? Number(staffValue) : Number.NaN;
  const base = {
    beat,
    measureIndex,
    measureNumber,
    staff: Number.isFinite(staff) ? staff : undefined,
    placement: getAttr(directionNode, "placement"),
  };

  const soundNode = findChild(directionContent, "sound");
  const tempo = getAttr(soundNode, "tempo");
  if (tempo) {
    directions.push({
      ...base,
      id: `direction-${directions.length}`,
      kind: "tempo",
      value: Number(tempo),
    });
  }

  const dynamicSound = getAttr(soundNode, "dynamics");
  if (dynamicSound) {
    directions.push({
      ...base,
      id: `direction-${directions.length}`,
      kind: "dynamic",
      value: Number(dynamicSound),
    });
  }

  for (const name of NAVIGATION_SOUND_ATTRIBUTES) {
    const value = getAttr(soundNode, name);
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

  for (const dirTypeNode of findChildren(directionContent, "direction-type")) {
    const dirTypeContent = dirTypeNode["direction-type"] as OrderedNode[];
    for (const child of dirTypeContent) {
      const tagName = getTagName(child);
      if (!tagName || tagName === "#text") continue;
      const childContent = child[tagName] as OrderedNode[];
      const kind = directionKind(tagName, getTextContent(child));
      const childText = getTextContent(child);

      if (tagName === "dynamics") {
        let dynamic: string | undefined;
        for (const dyn of childContent) {
          const dynTag = getTagName(dyn);
          if (dynTag && dynTag !== "#text") {
            dynamic = dynTag;
            break;
          }
        }
        directions.push({
          ...base,
          id: `direction-${directions.length}`,
          kind,
          text: dynamic,
          value: dynamic,
        });
        continue;
      }

      if (tagName === "metronome") {
        const perMinute = getText(childContent, "per-minute");
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
        value: getAttr(child, "type") ?? getAttr(child, "number") ?? childText,
      });
    }
  }
}

function addPedalEvents(
  directionContent: OrderedNode[],
  beat: number,
  measureIndex: number,
  measureNumber: string,
  pedals: PedalEvent[],
): void {
  for (const dirTypeNode of findChildren(directionContent, "direction-type")) {
    const dirTypeContent = dirTypeNode["direction-type"] as OrderedNode[];
    const pedalNode = findChild(dirTypeContent, "pedal");
    if (!pedalNode) continue;

    const type = getAttr(pedalNode, "type");
    if (type === "start" || type === "resume") {
      pedals.push({ id: `pedal-${pedals.length}`, type: "start", beat, measureIndex, measureNumber });
    } else if (type === "stop") {
      pedals.push({ id: `pedal-${pedals.length}`, type: "stop", beat, measureIndex, measureNumber });
    } else if (type === "change") {
      pedals.push({ id: `pedal-${pedals.length}`, type: "change", beat, measureIndex, measureNumber });
    }
  }
}

function parseBarline(barlineContent: OrderedNode[], measure: MeasureModel): void {
  const repeatNode = findChild(barlineContent, "repeat");
  const direction = getAttr(repeatNode, "direction");
  if (direction === "forward") measure.repeatStart = true;
  if (direction === "backward") measure.repeatEnd = true;

  for (const endingNode of findChildren(barlineContent, "ending")) {
    const number = getAttr(endingNode, "number");
    if (number) measure.endings.push(number);
  }

  const barStyle = getText(barlineContent, "bar-style");
  if (barStyle) measure.barStyle = barStyle;
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
  const { content: root, version } = parseDocument(xml);
  const metadata = parseMetadata(root, version);
  const partNodes = findChildren(root, "part");
  const partNode = partNodes[0];
  if (!partNode) {
    throw new Error("MusicXML does not contain a playable part.");
  }
  const partContent = partNode["part"] as OrderedNode[];

  const measures: MeasureModel[] = [];
  const notes: NoteEvent[] = [];
  const directions: DirectionEvent[] = [];
  const pedals: PedalEvent[] = [];
  const warnings: ScoreWarning[] = [];
  let divisions = 1;
  let currentBeat = 0;
  let currentTimeSignature = { beats: 4, beatType: 4 };

  if (partNodes.length > 1) {
    warnings.push({
      code: "multiple-parts",
      message: "Only the first part is used for the v1 piano practice timeline.",
    });
  }

  const measureNodes = findChildren(partContent, "measure");
  for (let measureIndex = 0; measureIndex < measureNodes.length; measureIndex++) {
    const measureNode = measureNodes[measureIndex];
    const measureContent = measureNode["measure"] as OrderedNode[];
    const measureNumber = getAttr(measureNode, "number") ?? `${measureIndex + 1}`;
    const measure: MeasureModel = {
      index: measureIndex,
      number: measureNumber,
      startBeat: currentBeat,
      durationBeats: 0,
      timeSignature: currentTimeSignature,
      repeatStart: false,
      repeatEnd: false,
      endings: [],
    };
    let position = 0;
    let maxPosition = 0;
    let lastNoteStart = 0;

    for (const child of measureContent) {
      const tagName = getTagName(child);
      if (!tagName || tagName === "#text") continue;

      const childContent = child[tagName] as OrderedNode[];

      if (tagName === "attributes") {
        const newDivisions = getText(childContent, "divisions");
        if (newDivisions) divisions = Number(newDivisions) || divisions;
        const timeContent = getChildContent(childContent, "time");
        if (timeContent) {
          currentTimeSignature = {
            beats: getNumber(timeContent, "beats", currentTimeSignature.beats),
            beatType: getNumber(timeContent, "beat-type", currentTimeSignature.beatType),
          };
          measure.timeSignature = currentTimeSignature;
        }
        continue;
      }

      if (tagName === "direction") {
        const directionBeat = currentBeat + position / divisions;
        addDirectionEvents(childContent, child, directionBeat, measureIndex, measureNumber, directions, warnings);
        addPedalEvents(childContent, directionBeat, measureIndex, measureNumber, pedals);
        continue;
      }

      if (tagName === "backup") {
        position = Math.max(0, position - getNumber(childContent, "duration", 0));
        continue;
      }

      if (tagName === "forward") {
        position += getNumber(childContent, "duration", 0);
        maxPosition = Math.max(maxPosition, position);
        continue;
      }

      if (tagName === "barline") {
        parseBarline(childContent, measure);
        continue;
      }

      if (tagName !== "note") continue;

      const durationDivisions = getNumber(childContent, "duration", 0);
      const isChordTone = hasChild(childContent, "chord");
      const isGrace = hasChild(childContent, "grace");
      const noteStart = isChordTone ? lastNoteStart : position;
      const pitchContent = getChildContent(childContent, "pitch");
      const staff = getNumber(childContent, "staff", 1);
      const voice = getText(childContent, "voice") ?? "1";

      if (pitchContent) {
        const step = getText(pitchContent, "step") ?? "C";
        const alter = getNumber(pitchContent, "alter", 0);
        const octave = getNumber(pitchContent, "octave", 4);
        const midi = pitchToMidi(step, alter, octave);
        const tieData = parseNotations(childContent);
        const durationBeats = durationDivisions > 0 ? durationDivisions / divisions : isGrace ? 0.25 : 0;

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
    pedals,
    warnings,
    totalBeats: currentBeat,
    rawXml: xml,
  };
}
