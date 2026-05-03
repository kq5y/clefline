import { expect, test } from "@playwright/test";

test("loads the public sample and switches between river and score views", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Piano River" })).toBeVisible();
  await expect(page.getByLabel("Piano keyboard")).toBeVisible();

  await page.getByRole("button", { name: /Science sample/ }).click();
  await expect(page.getByText("sample_science.musicxml")).toBeVisible();
  await expect(page.getByText("89 measures")).toBeVisible();
  await expect(page.getByLabel("Falling notes")).toBeVisible();

  await page.getByRole("button", { name: "Score" }).click();
  await expect(page.locator(".score-view")).toBeVisible();
  await expect(page.locator(".score-canvas svg").first()).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "River" }).click();
  await expect(page.getByLabel("Falling notes")).toBeVisible();
});
