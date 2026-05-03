import { expect, test } from "@playwright/test";

test("loads the public sample and switches between river and score views", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Clefline" })).toBeVisible();
  await expect(page.getByLabel("Playback metadata")).toBeHidden();
  await expect(page.getByLabel("Piano keyboard")).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.body.scrollHeight <= window.innerHeight + 1))
    .toBe(true);

  await page.getByRole("button", { name: /Sample score/ }).click();
  await expect(page.getByRole("heading", { name: "Minuet in G Major" })).toBeVisible();
  await expect(page.getByLabel("Falling notes")).toBeVisible();
  await expect(page.locator(".measure-label").first()).toBeVisible();
  await page.getByRole("button", { name: /Info/ }).click();
  await expect(page.getByText("bach-minuet.musicxml")).toBeVisible();
  await expect(page.getByText("32 measures")).toBeVisible();
  await page.getByRole("button", { name: "Close options", exact: true }).click();

  await page.getByRole("button", { name: "Score", exact: true }).click();
  await expect(page.locator(".score-view")).toBeVisible();
  await expect(page.locator(".score-canvas svg").first()).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".score-playback-line")).toBeVisible();

  await page.getByRole("button", { name: "River", exact: true }).click();
  await expect(page.getByLabel("Falling notes")).toBeVisible();
});

test("accepts MusicXML by drag and drop", async ({ page }) => {
  await page.goto("/");
  const dataTransfer = await page.evaluateHandle(async () => {
    const response = await fetch("/samples/bach-minuet.musicxml");
    const blob = await response.blob();
    const file = new File([blob], "dropped_bach_minuet.musicxml", {
      type: "application/vnd.recordare.musicxml+xml",
    });
    const transfer = new DataTransfer();
    transfer.items.add(file);

    return transfer;
  });

  await page.dispatchEvent(".app-shell", "dragover", { dataTransfer });
  await expect(page.getByText("Drop MusicXML here")).toBeVisible();
  await page.dispatchEvent(".app-shell", "drop", { dataTransfer });
  await expect(page.getByLabel("Falling notes")).toBeVisible();
});
