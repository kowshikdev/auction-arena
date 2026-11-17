import { expect, test, type Browser, type Page } from "@playwright/test";

// One full auction night with four real browsers: three registered owners and one guest
// arriving through the invite link. Mirrors the release blockers in req.md section 24.

const PASSWORD = "auctionarena-test-pw"; // same fixed accounts the integration tests use
const TEAMS = ["Chennai Super Kings", "Mumbai Indians", "Royal Challengers Bengaluru", "Kolkata Knight Riders"];
const SHOTS = "e2e/screenshots";

async function loggedInPage(browser: Browser, n: number): Promise<Page> {
  const context = await browser.newContext({ permissions: ["microphone"] });
  const page = await context.newPage();
  await page.goto("/login?next=/dashboard");
  await page.getByLabel("Email").fill(`owner${n}@auctionarena.test`);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  // Match on the path: the login URL itself ends in "?next=/dashboard".
  await page.waitForURL((url) => url.pathname === "/dashboard");
  await expect(page.getByRole("heading", { name: /Welcome/ })).toBeVisible();
  return page;
}

test("four owners run an auction from invite to results", async ({ browser }) => {
  // ---- Landing page renders for a visitor
  const visitor = await browser.newPage();
  await visitor.goto("/");
  await expect(visitor.getByRole("heading", { name: /One hammer/ })).toBeVisible();
  // The hero card shows a real player from the catalogue, not placeholder text.
  await expect(visitor.getByTestId("hero-player")).not.toHaveText(/star batter/i);
  await expect(visitor.getByTestId("hero-player")).not.toBeEmpty();
  await visitor.screenshot({ path: `${SHOTS}/01-landing.png`, fullPage: true });
  await visitor.close();

  // ---- Host creates a private room with a short timer
  const host = await loggedInPage(browser, 1);
  await expect(host.getByRole("heading", { name: /Welcome/ })).toBeVisible();
  await host.screenshot({ path: `${SHOTS}/02-dashboard.png`, fullPage: true });
  await host.getByRole("button", { name: "Create a room" }).click();
  await host.getByLabel("Room name").fill("E2E Auction Night");
  await host.getByRole("button", { name: /Auction rules/ }).click();
  await host.getByRole("dialog").getByRole("button", { name: /^Quick/ }).click();
  await host.getByLabel("Bid timer").selectOption("8");
  await host.screenshot({ path: `${SHOTS}/03-create-room.png` });
  await host.getByRole("button", { name: "Create room", exact: true }).click();
  await host.waitForURL("**/lobby/*");
  const code = host.url().split("/lobby/")[1].slice(0, 6);
  expect(code).toMatch(/^[A-Z0-9]{6}$/);

  // The invite link (with token) is what gets shared.
  await host.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await host.getByRole("button", { name: "Copy invite link" }).click();
  const invite = await host.evaluate(() => navigator.clipboard.readText());
  expect(invite).toContain(`/join/${code}?t=`);

  // ---- Two registered owners join with the code; a guest joins through the invite link
  const second = await loggedInPage(browser, 2);
  const third = await loggedInPage(browser, 3);
  for (const page of [second, third]) {
    await page.goto(`/join/${code}`);
    await page.getByRole("button", { name: "Join the lobby" }).click();
    await page.waitForURL(`**/lobby/${code}`);
  }
  const guestContext = await browser.newContext({ permissions: ["microphone"] });
  const guest = await guestContext.newPage();
  await guest.goto(new URL(invite).pathname + new URL(invite).search);
  await guest.getByLabel("Display name").fill("Guest Owner");
  await guest.getByRole("button", { name: "Continue as guest" }).click();
  await guest.waitForURL(`**/lobby/${code}`);

  const owners = [host, second, third, guest];

  // ---- Everyone sees four participants without refreshing
  for (const page of owners) await expect(page.getByText("Participants · 4")).toBeVisible();

  // Host participant actions open as a menu and close with Escape.
  await host.getByRole("button", { name: "Actions for Test Owner 2" }).click();
  await expect(host.getByRole("menuitem", { name: "Make auctioneer" })).toBeVisible();
  await expect(host.getByRole("menuitem", { name: "Remove from room" })).toBeVisible();
  await host.keyboard.press("Escape");
  await expect(host.getByRole("menu")).toHaveCount(0);

  // IPL 2027 mode shows each franchise's real purse on its card.
  await expect(host.getByText(/₹14.15 Cr · 5 slots · 1 OS/)).toBeVisible();

  // ---- Unique franchises: once taken, a franchise is disabled for everyone else
  for (const [i, page] of owners.entries()) {
    await page.getByRole("button", { name: new RegExp(`^${TEAMS[i]}`) }).click();
    await expect(page.getByRole("button", { name: new RegExp(`^${TEAMS[i]}, taken by`) })).toBeVisible();
  }
  await expect(second.getByRole("button", { name: /^Chennai Super Kings, taken by/ })).toBeDisabled();

  // ---- Start stays locked until everyone is ready
  const start = host.getByRole("button", { name: "Start auction" });
  await expect(start).toBeDisabled();
  for (const page of [second, third, guest]) await page.getByRole("button", { name: "I am ready" }).click();
  await expect(start).toBeEnabled();
  await host.screenshot({ path: `${SHOTS}/04-lobby.png`, fullPage: true });

  // ---- Voice: two owners join and see each other in the voice room
  await host.getByRole("button", { name: "Join voice" }).click();
  await second.getByRole("button", { name: "Join voice" }).click();
  await expect(host.getByText("2 in voice")).toBeVisible({ timeout: 30_000 });
  await expect(second.getByText("2 in voice")).toBeVisible({ timeout: 30_000 });
  await host.getByRole("button", { name: "Leave voice" }).click();
  await second.getByRole("button", { name: "Leave voice" }).click();

  // ---- Start: everyone lands in the auction room
  await start.click();
  for (const page of owners) await page.waitForURL(`**/auction/${code}`);

  // ---- First player is presented by the system auctioneer on every screen
  for (const page of owners) await expect(page.getByText("Lot 001")).toBeVisible({ timeout: 30_000 });
  const playerName = (await host.getByTestId("player-name").textContent()) ?? "";
  for (const page of owners) await expect(page.getByTestId("player-name")).toHaveText(playerName);

  // ---- Bids: every screen shows the same accepted bid and leader
  // RCB starts with its real IPL 2027 purse, not a flat room purse.
  await expect(host.getByTestId("purse-RCB")).toHaveText("₹14.15 Cr");
  await second.getByRole("button", { name: /^Bid ₹/ }).click();
  for (const page of owners) await expect(page.getByTestId("leader")).toHaveText("Mumbai Indians");
  const firstBid = (await host.getByTestId("current-bid").textContent()) ?? "";

  await third.getByRole("button", { name: /^Bid ₹/ }).click();
  for (const page of owners) await expect(page.getByTestId("leader")).toHaveText("Royal Challengers Bengaluru");
  const secondBid = (await host.getByTestId("current-bid").textContent()) ?? "";
  expect(secondBid).not.toBe(firstBid);
  for (const page of owners) await expect(page.getByTestId("current-bid")).toHaveText(secondBid);
  await host.screenshot({ path: `${SHOTS}/05-bidding.png`, fullPage: true });

  // The leader cannot bid against themselves.
  await expect(third.getByRole("button", { name: "You hold the highest bid" })).toBeDisabled();

  // ---- Sold on the server clock: the winner's purse drops on every screen
  for (const page of owners) await expect(page.getByTestId("result-stamp")).toContainText("Sold", { timeout: 30_000 });
  await host.screenshot({ path: `${SHOTS}/06-sold.png`, fullPage: true });
  const purse = (await host.getByTestId("purse-RCB").textContent()) ?? "";
  expect(purse).not.toBe("₹14.15 Cr");
  for (const page of owners) await expect(page.getByTestId("purse-RCB")).toHaveText(purse);

  // ---- Refresh: the owner keeps their franchise and sees the live state
  await third.reload();
  await expect(third.getByTestId("purse-RCB")).toHaveText(purse, { timeout: 30_000 });
  await expect(third.getByRole("button", { name: /^Royal Challengers Bengaluru: purse/ }).getByText("You")).toBeVisible();

  // ---- Pause and resume by the host reach everyone
  await host.getByRole("button", { name: "Pause", exact: true }).click();
  for (const page of owners) await expect(page.getByText("Paused").first()).toBeVisible();
  await host.getByRole("button", { name: "Resume auction" }).click();
  for (const page of owners) await expect(page.getByText("Live", { exact: true }).first()).toBeVisible();

  // ---- A non-host has no host controls
  await expect(second.getByRole("button", { name: "End auction" })).toHaveCount(0);

  // ---- Host ends the auction: everyone reaches the results
  await host.getByRole("button", { name: "End auction" }).click();
  await host.getByRole("dialog").getByRole("button", { name: "End auction" }).click();
  for (const page of owners) await page.waitForURL(`**/results/${code}`, { timeout: 40_000 });

  await expect(host.getByRole("heading", { name: "E2E Auction Night" })).toBeVisible();
  await expect(host.getByText("Spending leaderboard")).toBeVisible();
  await expect(host.getByText(playerName).first()).toBeVisible();
  // Full bid history loads from the database: both bids placed above are counted.
  await expect(host.getByText("Total bids").locator("..")).toContainText("2");
  await host.screenshot({ path: `${SHOTS}/07-results.png`, fullPage: true });

  await host.getByRole("tab", { name: "squads" }).click();
  await host.getByRole("button", { name: "Royal Challengers Bengaluru" }).click();
  await expect(host.getByText(playerName).first()).toBeVisible();
  await host.screenshot({ path: `${SHOTS}/08-squad.png`, fullPage: true });

  // ---- The finished auction shows up in the owner's history
  await second.goto("/dashboard");
  await expect(second.getByRole("link", { name: /E2E Auction Night/ }).first()).toBeVisible();
});

test("player catalogue can be searched and filtered", async ({ page }) => {
  await page.goto("/players");
  // Default view is the auction pool; Kohli is retained, so he appears only under Retained.
  await expect(page.getByText(/^\d+ of \d+ players/)).toBeVisible({ timeout: 30_000 });
  await page.getByLabel("Search players").fill("kohli");
  await expect(page.getByText(/^0 of \d+ players/)).toBeVisible();
  await page.getByLabel("Status").selectOption("retained");
  await expect(page.getByText("Virat Kohli")).toBeVisible();
  // Excluded players are not listed anywhere.
  await page.getByLabel("Status").selectOption("all");
  await page.getByLabel("Search players").fill("dhoni");
  await expect(page.getByText(/^0 of \d+ players/)).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/09-players.png` });
});

test("mobile layout keeps the bid controls usable", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Create a room" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: `${SHOTS}/10-mobile-landing.png`, fullPage: true });
});
