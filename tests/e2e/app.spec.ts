import { expect, test, type Page } from "@playwright/test";

type SampleMxl = {
  file: string;
  title: string;
};

const SAMPLE_MXLS: SampleMxl[] = [
  { file: "bach-minuet.mxl", title: "Minuet in G Major" },
  { file: "fur-elise-easy.mxl", title: "Fur Elise" },
  { file: "flight-of-the-bumblebee.mxl", title: "Hummelflug" },
  { file: "la-campanella.mxl", title: "La Campanella" },
  { file: "moonlight-sonata-3rd.mxl", title: "Sonate No. 14," },
];

async function dropSampleMxl(page: Page, sample: SampleMxl) {
  const dataTransfer = await page.evaluateHandle(async (sampleFile) => {
    const response = await fetch(`/samples/${sampleFile}`);
    const blob = await response.blob();
    const file = new File([blob], sampleFile, {
      type: "application/vnd.recordare.musicxml",
    });
    const transfer = new DataTransfer();
    transfer.items.add(file);

    return transfer;
  }, sample.file);

  await page.dispatchEvent(".app-shell", "dragover", { dataTransfer });
  await expect(page.getByText("Drop MusicXML or MIDI here")).toBeVisible();
  await page.dispatchEvent(".app-shell", "drop", { dataTransfer });
}

async function expectRollView(page: Page) {
  await expect(page.getByLabel("Falling notes")).toBeVisible();
  await expect(page.locator(".note-river canvas")).toBeVisible();
}

async function expectScoreView(page: Page) {
  await expect(page.locator(".score-view")).toBeVisible();
  await expect(page.locator(".score-canvas svg").first()).toBeVisible({ timeout: 25_000 });
  await expect(page.locator(".score-playback-line")).toBeVisible();
  await expect(page.getByText("Notation render failed", { exact: false })).toHaveCount(0);
}

test("loads the public sample and switches between roll and score views", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Clefline" })).toBeVisible();
  await expect(page.getByLabel("Playback metadata")).toBeHidden();
  await expect(page.getByLabel("Piano keyboard")).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.body.scrollHeight <= window.innerHeight + 1))
    .toBe(true);

  await page.getByRole("button", { name: "Load", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Minuet in G Major" })).toBeVisible();
  await expectRollView(page);
  await page.getByRole("button", { name: "Score info", exact: true }).click();
  await expect(page.getByText("bach-minuet.mxl")).toBeVisible();
  await expect(page.getByText("32 measures")).toBeVisible();
  await page.getByRole("button", { name: "Close options", exact: true }).click();

  await page.getByRole("button", { name: "Score", exact: true }).click();
  await expectScoreView(page);

  await page.getByRole("button", { name: "Roll", exact: true }).click();
  await expectRollView(page);
});

test.describe("drag and drop sample MXL files", () => {
  for (const sample of SAMPLE_MXLS) {
    test(`renders roll and score views for ${sample.file}`, async ({ page }) => {
      test.setTimeout(45_000);
      await page.goto("/");
      await dropSampleMxl(page, sample);

      await expect(page.getByRole("heading", { name: sample.title })).toBeVisible();
      await expect(page.getByText("Drop MusicXML or MIDI here")).toBeHidden();
      await expectRollView(page);

      await page.getByRole("button", { name: "Score", exact: true }).click();
      await expectScoreView(page);

      await page.getByRole("button", { name: "Roll", exact: true }).click();
      await expectRollView(page);
    });
  }
});
