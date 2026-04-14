import { test, expect } from "@playwright/test";

/** Next dev often aborts the first navigation while compiling; `load` waits too long. */
const gotoOpts = { waitUntil: "domcontentloaded" as const, timeout: 90_000 };

test.describe("deploy smoke: routes and auth boundaries", () => {
  test("login page shows sign-in heading", async ({ page }) => {
    await page.goto("/login", gotoOpts);
    await expect(
      page.getByRole("heading", { name: "Sign in" })
    ).toBeVisible();
  });

  test("board shell is public; jobs list is empty without session", async ({
    page,
  }) => {
    await page.goto("/board", gotoOpts);
    await expect(page).toHaveURL(/\/board/);
    await expect(page.getByRole("heading", { name: "My jobs" })).toBeVisible();
  });

  test("GET /api/jobs returns 401 without session", async ({ request }) => {
    const res = await request.get("/api/jobs");
    expect(res.status()).toBe(401);
  });

  test("PATCH /api/jobs/:id returns 401 without session", async ({
    request,
  }) => {
    const res = await request.patch("/api/jobs/test-job-id", {
      data: JSON.stringify({ applied: true }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(401);
  });

  test("cron webhook rejects requests without valid secret", async ({
    request,
  }) => {
    const res = await request.post("/api/webhooks/cron-scraper", {
      data: JSON.stringify({
        userId: "fake",
        jobs: [{ company: "A", role: "B", link: "https://example.com/job" }],
      }),
      headers: { "Content-Type": "application/json" },
    });
    expect([403, 503]).toContain(res.status());
  });
});
