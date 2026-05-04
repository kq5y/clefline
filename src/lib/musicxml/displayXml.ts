const MUSIC_SYMBOLS: Record<string, string> = {
  coda: "Coda",
  segno: "Segno",
};

const REHEARSAL_DEFAULT_Y = 42;
const REHEARSAL_RELATIVE_Y = 36;

function musicSymbol(name: string): string {
  return MUSIC_SYMBOLS[name.trim().toLowerCase()] ?? name;
}

function replaceMuseScoreSymbols(xml: string): string {
  return xml
    .replace(/&lt;sym&gt;\s*(coda|segno)\s*&lt;\/?sym&gt;/gi, (_, name: string) =>
      musicSymbol(name),
    )
    .replace(/<sym>\s*(coda|segno)\s*<\/?sym>/gi, (_, name: string) => musicSymbol(name));
}

function parseDisplayXml(xml: string): XMLDocument | undefined {
  if (typeof DOMParser === "undefined") {
    return undefined;
  }

  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.querySelector("parsererror")) {
    return undefined;
  }

  return document;
}

function childElements(parent: Element, tagName?: string): Element[] {
  return Array.from(parent.children).filter(
    (child) => !tagName || child.localName === tagName || child.tagName === tagName,
  );
}

function firstChild(parent: Element, tagName: string): Element | undefined {
  return childElements(parent, tagName)[0];
}

function childText(parent: Element, tagName: string): string | undefined {
  return firstChild(parent, tagName)?.textContent?.trim();
}

function numberAttr(element: Element, name: string): number | undefined {
  const value = Number(element.getAttribute(name));

  return Number.isFinite(value) ? value : undefined;
}

function clefNumber(clef: Element): string {
  return clef.getAttribute("number") ?? "1";
}

function isTrebleClef(clef: Element): boolean {
  return childText(clef, "sign") === "G" && childText(clef, "line") === "2";
}

function noteStaff(note: Element): string {
  return childText(note, "staff") ?? "1";
}

function cloneClefForMeasureStart(document: XMLDocument, clef: Element): Element {
  const clone = document.createElement("clef");
  for (const attribute of Array.from(clef.attributes)) {
    if (attribute.name !== "after-barline") {
      clone.setAttribute(attribute.name, attribute.value);
    }
  }

  for (const child of childElements(clef)) {
    clone.appendChild(child.cloneNode(true));
  }

  return clone;
}

function upsertMeasureStartClef(attributes: Element, clef: Element): void {
  const number = clefNumber(clef);
  const existing = childElements(attributes, "clef").find(
    (candidate) => clefNumber(candidate) === number,
  );
  if (existing) {
    existing.replaceWith(clef);
    return;
  }

  attributes.appendChild(clef);
}

function promoteInitialStaffClefs(document: XMLDocument): void {
  for (const measure of Array.from(document.getElementsByTagName("measure"))) {
    const firstAttributes = firstChild(measure, "attributes");
    if (!firstAttributes) {
      continue;
    }

    const seenStaffNotes = new Set<string>();
    for (const child of childElements(measure)) {
      if (child.localName === "note" || child.tagName === "note") {
        seenStaffNotes.add(noteStaff(child));
        continue;
      }

      if (child.localName !== "attributes" && child.tagName !== "attributes") {
        continue;
      }

      for (const clef of childElements(child, "clef")) {
        const number = clefNumber(clef);
        if (
          clef.getAttribute("after-barline") !== "yes" ||
          seenStaffNotes.has(number) ||
          !isTrebleClef(clef)
        ) {
          continue;
        }

        upsertMeasureStartClef(firstAttributes, cloneClefForMeasureStart(document, clef));
        clef.remove();
      }

      if (child !== firstAttributes && childElements(child).length === 0) {
        child.remove();
      }
    }
  }
}

function replaceSymbolElements(document: XMLDocument): void {
  for (const tagName of Object.keys(MUSIC_SYMBOLS)) {
    for (const element of Array.from(document.getElementsByTagName(tagName))) {
      const words = document.createElement("words");
      words.textContent = musicSymbol(tagName);
      element.replaceWith(words);
    }
  }
}

function convertGlissandoForOsmd(document: XMLDocument): void {
  for (const glissando of Array.from(document.getElementsByTagName("glissando"))) {
    const slide = document.createElement("slide");
    for (const attribute of Array.from(glissando.attributes)) {
      slide.setAttribute(attribute.name, attribute.value);
    }
    while (glissando.firstChild) {
      slide.appendChild(glissando.firstChild);
    }
    glissando.replaceWith(slide);
  }
}

function liftRehearsalLabels(document: XMLDocument): void {
  for (const rehearsal of Array.from(document.getElementsByTagName("rehearsal"))) {
    const defaultY = numberAttr(rehearsal, "default-y");
    const relativeY = numberAttr(rehearsal, "relative-y");
    if (defaultY === undefined || defaultY < REHEARSAL_DEFAULT_Y) {
      rehearsal.setAttribute("default-y", `${REHEARSAL_DEFAULT_Y}`);
    }
    if (relativeY === undefined || relativeY < REHEARSAL_RELATIVE_Y) {
      rehearsal.setAttribute("relative-y", `${REHEARSAL_RELATIVE_Y}`);
    }
    rehearsal.setAttribute("justify", rehearsal.getAttribute("justify") ?? "center");
  }
}

export function sanitizeScoreDisplayXml(xml: string): string {
  const symbolSafeXml = replaceMuseScoreSymbols(xml);
  const document = parseDisplayXml(symbolSafeXml);
  if (!document) {
    return symbolSafeXml
      .replace(/<coda\b[^>]*\/>/gi, "<words>Coda</words>")
      .replace(/<segno\b[^>]*\/>/gi, "<words>Segno</words>");
  }

  replaceSymbolElements(document);
  convertGlissandoForOsmd(document);
  liftRehearsalLabels(document);
  promoteInitialStaffClefs(document);

  return new XMLSerializer().serializeToString(document);
}
