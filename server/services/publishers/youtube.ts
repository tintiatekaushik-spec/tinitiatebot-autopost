import type { Locator, Page } from "playwright";
import type { PlatformUpload } from "../../../shared/schema.js";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../../..");

const YES_MADE_FOR_KIDS_TEXT = /Yes.*made for kids/i;
const PUBLIC_VISIBILITY_TEXT = /Public/i;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function clickIfVisible(locator: Locator, timeout = 1500) {
  try {
    await locator.first().click({ timeout });
    return true;
  } catch {
    return false;
  }
}

async function dismissChromeSignInPrompt(page: Page) {
  console.log("Checking for Chrome sign-in popup...");

  const dismissers = [
    page.getByText("Use Chrome without an account", { exact: true }),
    page.getByRole("button", { name: /Use Chrome without an account/i }),
    page.getByRole("button", { name: /Continue as/i }),
    page.getByText(/Continue as/i),
    page.getByRole("button", { name: /Not now/i }),
  ];

  for (const dismisser of dismissers) {
    if (await clickIfVisible(dismisser)) {
      await page.waitForTimeout(750);
      console.log("Closed Chrome sign-in popup.");
      return;
    }
  }

  // The Chrome "Make Chrome your own" prompt is browser UI, not normal page
  // DOM. Escape closes it when Chrome gives that bubble focus.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(250);
    } catch {
      // Ignore; this is only a best-effort cleanup.
    }
  }
}

async function fillEditable(page: Page, locator: Locator, text: string) {
  await locator.click({ force: true });
  await page.waitForTimeout(300);
  await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await page.keyboard.press("Backspace");
  await page.keyboard.insertText(text);
}

async function scrollUploadDialogDown(page: Page) {
  await page.evaluate(() => {
    const isElementVisible = (element: HTMLElement) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };

    const collectScrollableElements = (root: Document | ShadowRoot | Element): HTMLElement[] => {
      const elements: HTMLElement[] = [];
      const rootElement = root instanceof HTMLElement ? root : null;
      const candidates = [
        ...(rootElement ? [rootElement] : []),
        ...Array.from(root.querySelectorAll<HTMLElement>("*")),
      ];

      for (const element of candidates) {
        if (element.shadowRoot) {
          elements.push(...collectScrollableElements(element.shadowRoot));
        }

        const style = window.getComputedStyle(element);
        const canScroll = element.scrollHeight > element.clientHeight + 40;
        const overflowAllowsScroll = /auto|scroll|overlay/i.test(style.overflowY);

        if (canScroll && (overflowAllowsScroll || element.id === "scrollable-content") && isElementVisible(element)) {
          elements.push(element);
        }
      }

      return elements;
    };

    const dialog =
      document.querySelector("ytcp-uploads-dialog") ??
      document.querySelector("tp-yt-paper-dialog") ??
      document.body;
    const scrollable = collectScrollableElements(dialog)
      .sort((a, b) => (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight))[0];

    if (scrollable) {
      scrollable.scrollTop = Math.min(scrollable.scrollTop + 900, scrollable.scrollHeight);
      return;
    }

    window.scrollBy(0, 900);
  });

  await page.waitForTimeout(700);
}

async function scrollUploadDialogToTop(page: Page) {
  const dialog = page.locator("ytcp-uploads-dialog").first();
  const box = await dialog.boundingBox();

  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -2000);
  }

  try {
    await page.keyboard.press("Home");
  } catch {
    // The mouse wheel above is enough when the dialog does not have keyboard focus.
  }

  await page.waitForTimeout(700);
}

async function clickPublicVisibilityByMouse(page: Page) {
  const publicLabel = page.locator("ytcp-uploads-dialog").getByText(/^Public$/i).first();

  try {
    await publicLabel.scrollIntoViewIfNeeded({ timeout: 5000 });
    await publicLabel.click({ force: true, timeout: 3000 });
    await page.waitForTimeout(1000);
    return true;
  } catch {
    // Try a direct click on the radio circle next to the label.
  }

  const labelBox = await publicLabel.boundingBox();
  if (!labelBox) return false;

  await page.mouse.click(Math.max(labelBox.x - 22, 1), labelBox.y + labelBox.height / 2);
  await page.waitForTimeout(1000);
  return true;
}

async function publicVisibilityIsSelected(page: Page) {
  const selectedPublic = page.locator(
    'ytcp-uploads-dialog tp-yt-paper-radio-button[name="PUBLIC"][aria-checked="true"], ' +
      'ytcp-uploads-dialog tp-yt-paper-radio-button[name="PUBLIC"][checked], ' +
      'ytcp-uploads-dialog [role="radio"][aria-label*="Public"][aria-checked="true"]',
  );

  return (await selectedPublic.count()) > 0;
}

async function waitForPublishButton(page: Page, timeout = 7000) {
  try {
    await page.locator("ytcp-uploads-dialog ytcp-button").filter({ hasText: /^Publish$/i }).last().waitFor({
      state: "visible",
      timeout,
    });
    return true;
  } catch {
    return false;
  }
}

async function selectMadeForKids(page: Page) {
  console.log("Scrolling to the Made for Kids audience radio...");

  const radioLocators = [
    page.getByRole("radio", { name: YES_MADE_FOR_KIDS_TEXT }).first(),
    page.locator("tp-yt-paper-radio-button").filter({ hasText: YES_MADE_FOR_KIDS_TEXT }).first(),
    page.getByText(YES_MADE_FOR_KIDS_TEXT).first(),
  ];

  for (let attempt = 0; attempt < 5; attempt += 1) {
    for (const radio of radioLocators) {
      try {
        await radio.scrollIntoViewIfNeeded({ timeout: 2500 });
        await radio.click({ force: true, timeout: 2500 });
        console.log("Selected 'Yes, it's made for kids'.");
        return;
      } catch {
        // Try the next selector/scroll position.
      }
    }

    await scrollUploadDialogDown(page);
  }

  throw new Error("Could not find or click the 'Yes, it's made for kids' radio button.");
}

async function waitForVideoPreview(page: Page) {
  console.log("Waiting for uploaded video preview/link...");

  try {
    await page.getByText(/Video link/i).first().waitFor({ state: "visible", timeout: 120000 });
    console.log("Video link label is visible.");
    return;
  } catch {
    // Fall back to the actual YouTube link if the label text changes.
  }

  try {
    await page.locator('a[href*="youtu.be"], a[href*="youtube.com/watch"]').first().waitFor({
      state: "visible",
      timeout: 30000,
    });
    console.log("Video link is visible.");
    return;
  } catch {
    throw new Error("Uploaded video preview/link did not appear.");
  }
}

async function waitForUploadDialogText(page: Page, text: RegExp, screenName: string) {
  await page.locator("ytcp-uploads-dialog").getByText(text).first().waitFor({
    state: "visible",
    timeout: 60000,
  });
  console.log(`${screenName} page is visible.`);
}

async function clickDialogButtonWhenReady(page: Page, labels: string[], actionName: string) {
  const labelMatcher = new RegExp(labels.map(escapeRegExp).join("|"), "i");
  const button = page.locator("ytcp-uploads-dialog ytcp-button").filter({ hasText: labelMatcher }).last();

  await button.waitFor({ state: "visible", timeout: 60000 });
  await page.waitForFunction((buttonLabels: string[]) => {
    const normalizedLabels = buttonLabels.map((label) => label.toLowerCase());
    const buttons = Array.from(document.querySelectorAll<HTMLElement>("ytcp-uploads-dialog ytcp-button, ytcp-button"));

    return buttons.some((candidate) => {
      const label = candidate.textContent?.trim().toLowerCase();
      if (!label || !normalizedLabels.includes(label)) return false;

      const rect = candidate.getBoundingClientRect();
      const style = window.getComputedStyle(candidate);
      const ariaDisabled = candidate.getAttribute("aria-disabled") === "true";
      const disabled = candidate.hasAttribute("disabled");

      return (
        !ariaDisabled &&
        !disabled &&
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== "none" &&
        style.visibility !== "hidden"
      );
    });
  }, labels, { timeout: 60000 });

  console.log(`Clicking ${actionName}...`);
  await button.click({ timeout: 30000 });
  await page.waitForTimeout(1800);
}

async function clickNextWhenReady(page: Page) {
  await clickDialogButtonWhenReady(page, ["Next"], "Next");
}

async function selectPublicVisibility(page: Page) {
  await waitForUploadDialogText(page, /Choose when to publish/i, "Visibility");
  await scrollUploadDialogToTop(page);
  console.log("Selecting Public visibility...");

  const publicLocators = [
    page.locator('ytcp-uploads-dialog tp-yt-paper-radio-button[name="PUBLIC"]').first(),
    page.locator('tp-yt-paper-radio-button[name="PUBLIC"]').first(),
    page.locator('ytcp-uploads-dialog tp-yt-paper-radio-button[aria-label*="Public"]').first(),
    page.locator("ytcp-uploads-dialog").getByRole("radio", { name: PUBLIC_VISIBILITY_TEXT }).first(),
    page.locator("ytcp-uploads-dialog tp-yt-paper-radio-button").filter({ hasText: /^Public$/i }).first(),
    page.locator("ytcp-uploads-dialog").getByText(/^Public$/i).first(),
  ];

  for (const publicRadio of publicLocators) {
    try {
      await publicRadio.scrollIntoViewIfNeeded({ timeout: 2500 });
      await publicRadio.click({ force: true, timeout: 2500 });
      await page.waitForTimeout(750);
      if (await waitForPublishButton(page)) {
        console.log("Selected Public visibility.");
        return;
      }
    } catch {
      // Try the next selector; YouTube changes this markup regularly.
    }
  }

  if (await clickPublicVisibilityByMouse(page)) {
    if ((await publicVisibilityIsSelected(page)) || (await waitForPublishButton(page))) {
      console.log("Selected Public visibility with mouse fallback.");
      return;
    }

    throw new Error("Clicked Public visibility, but the Publish button did not appear.");
  }

  throw new Error("Could not find or click the Public visibility radio button.");
}

async function waitForPublishComplete(page: Page) {
  console.log("Waiting for YouTube publish confirmation...");

  const publishSignals = [
    page.getByText(/Video processing/i).first(),
    page.getByText(/public on YouTube/i).first(),
    page.getByText(/Video published/i).first(),
    page.getByText(/Your video has been published/i).first(),
  ];

  try {
    await Promise.any(publishSignals.map((signal) => signal.waitFor({ state: "visible", timeout: 120000 })));
  } catch {
    throw new Error("YouTube publish confirmation did not appear.");
  }

  console.log("YouTube publish confirmation is visible. Closing confirmation dialog...");

  const closeButtons = [
    page.getByRole("button", { name: /^Close$/i }).last(),
    page.locator('button:has-text("Close")').last(),
    page.locator('ytcp-button:has-text("Close")').last(),
    page.locator("ytcp-uploads-dialog").getByRole("button", { name: /Close/i }).last(),
    page.locator('ytcp-uploads-dialog ytcp-button:has-text("Close")').last(),
    page.locator("ytcp-uploads-dialog #close-button").last(),
  ];

  for (const closeButton of closeButtons) {
    if (await clickIfVisible(closeButton, 3000)) {
      await page.waitForTimeout(1500);
      console.log("Closed YouTube publish confirmation dialog.");
      console.log("Publish flow completed.");
      return;
    }
  }

  throw new Error("Publish confirmation appeared, but the Close button could not be clicked.");
}

export async function postToYouTube(page: Page, upload: PlatformUpload) {
  const email = process.env.YOUTUBE_EMAIL?.trim();
  const password = process.env.YOUTUBE_PASSWORD?.trim();

  if (!email || !password) throw new Error("Missing YouTube credentials in .env");

  const videoPath = path.join(rootDir, "uploads", upload.fileName);
  if (!fs.existsSync(videoPath)) throw new Error(`Video not found: ${videoPath}`);

  console.log("Navigating to YouTube upload page...");
  await page.goto("https://www.youtube.com/upload", { timeout: 60000 });
  await page.waitForTimeout(3000);

  if (page.url().includes("accounts.google.com") || page.url().includes("signin")) {
    console.log("Logging in automatically...");

    try {
      const useAnother = page.locator('button:has-text("Use another account")');
      if (await useAnother.count() > 0) await useAnother.click();
    } catch {
      // Ignore account chooser variations.
    }

    console.log("Entering email...");
    await page.waitForSelector("#identifierId", { timeout: 60000 });
    await page.fill("#identifierId", email);
    await page.click("#identifierNext");
    await page.waitForTimeout(2000);

    console.log("Entering password...");
    await page.waitForSelector('input[type="password"]', { timeout: 30000 });
    await page.fill('input[type="password"]', password);
    await page.click("#passwordNext");
    await page.waitForTimeout(5000);

    console.log("Login successful. Redirecting to upload...");
    await page.goto("https://www.youtube.com/upload", { timeout: 60000 });
    await page.waitForTimeout(3000);
  }

  await dismissChromeSignInPrompt(page);

  console.log("Uploading file...");
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(videoPath);

  console.log("Waiting for title field...");
  await page.waitForSelector("#title-textarea", { timeout: 60000 });
  await page.waitForTimeout(2000);

  console.log("Filling metadata...");
  const videoTitle = upload.title || upload.caption;

  await fillEditable(page, page.locator("#title-textarea"), videoTitle);
  await fillEditable(page, page.locator("#description-textarea"), upload.caption);
  await page.waitForTimeout(1000);

  await selectMadeForKids(page);
  await waitForVideoPreview(page);

  console.log("Moving to Video elements...");
  await clickNextWhenReady(page);

  await waitForUploadDialogText(page, /Use cards and an end screen/i, "Video elements");
  await clickNextWhenReady(page);

  await waitForUploadDialogText(page, /check your video for issues/i, "Checks");
  await clickNextWhenReady(page);

  await selectPublicVisibility(page);
  await clickDialogButtonWhenReady(page, ["Publish"], "Publish");
  await waitForPublishComplete(page);

  console.log("Step completed: video published.");
  return { success: true };
}
