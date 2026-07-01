import type { Locator, Page } from "playwright";
import type { PlatformUpload } from "../../../shared/schema.js";
import { waitForLoginWithManualFallback, type AccountLogin } from "./manual-login.js";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../../..");

const YES_MADE_FOR_KIDS_TEXT = /Yes.*made for kids/i;
const PUBLIC_VISIBILITY_TEXT = /Public/i;
const YOUTUBE_UPLOAD_URL = "https://www.youtube.com/upload";

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

async function firstVisible(locators: Locator[]) {
  for (const locator of locators) {
    const count = await locator.count().catch(() => 0);

    for (let index = 0; index < Math.min(count, 8); index += 1) {
      const candidate = locator.nth(index);

      try {
        if (await candidate.isVisible()) return candidate;
      } catch {
        // Try the next matching element.
      }
    }
  }

  return null;
}

async function waitForVisible(locators: Locator[], timeout = 30000) {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const locator = await firstVisible(locators);
    if (locator) return locator;
    await new Promise(resolve => setTimeout(resolve, 250));
  }

  return null;
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

function isGoogleSignInUrl(url: string) {
  return /accounts\.google\.com|signin/i.test(url);
}

async function isYouTubeLoggedIn(page: Page) {
  if (isGoogleSignInUrl(page.url())) return false;

  const loggedInSignals = [
    page.locator('input[type="file"]'),
    page.locator("ytcp-uploads-dialog"),
    page.getByText(/Upload videos/i),
    page.locator("button#avatar-btn"),
    page.locator("ytd-topbar-menu-button-renderer button#avatar-btn"),
    page.locator('a[href*="/feed/you"]'),
    page.locator("ytcp-button#create-icon"),
    page.getByRole("button", { name: /Create/i }),
  ];

  return Boolean(await firstVisible(loggedInSignals));
}

async function googleLoginFormIsVisible(page: Page) {
  return Boolean(await firstVisible([
    page.locator("#identifierId"),
    page.locator('input[type="email"]'),
    page.locator('input[type="password"]'),
  ]));
}

async function isGoogleManualVerificationVisible(page: Page, url: string) {
  if (/challenge|captcha|verification|two.?step|2fa|signin\/v2\/challenge/i.test(url)) return true;

  const signal = await firstVisible([
    page.getByText(/verify it's you/i),
    page.getByText(/2-Step Verification/i),
    page.getByText(/Enter a verification code/i),
    page.getByText(/Check your phone/i),
    page.getByText(/Confirm it's you/i),
    page.locator('iframe[title*="captcha" i]'),
    page.locator('iframe[src*="captcha" i]'),
  ]);

  return Boolean(signal);
}

async function getGoogleLoginError(page: Page) {
  if (!isGoogleSignInUrl(page.url())) return null;

  const errorPattern =
    /wrong password|couldn['’]t sign you in|couldn['’]t find your google account|enter a valid email|that password is incorrect|try again later|too many failed attempts|suspicious activity|account has been disabled/i;
  const locators = [
    page.locator('[aria-live="assertive"]'),
    page.locator('[role="alert"]'),
    page.getByText(errorPattern),
  ];

  for (const locator of locators) {
    const count = await locator.count().catch(() => 0);

    for (let index = 0; index < Math.min(count, 8); index += 1) {
      const candidate = locator.nth(index);

      try {
        if (!await candidate.isVisible()) continue;
        const text = (await candidate.textContent())?.replace(/\s+/g, " ").trim();
        if (text && errorPattern.test(text)) return text;
      } catch {
        // Try the next matching element.
      }
    }
  }

  return null;
}

async function waitForYouTubeLoginResult(page: Page, allowManualLoginFromStart = false, ignoreLoginErrors = false) {
  await waitForLoginWithManualFallback({
    page,
    platform: "YouTube",
    normalTimeoutMs: 120000,
    pollMs: 500,
    isLoggedIn: () => isYouTubeLoggedIn(page),
    isManualVerificationVisible: (url) => isGoogleManualVerificationVisible(page, url),
    isLoginFormVisible: () => googleLoginFormIsVisible(page),
    getLoginError: () => getGoogleLoginError(page),
    beforeCheck: () => dismissChromeSignInPrompt(page),
    allowManualLoginFromStart,
    ignoreLoginErrors,
  });
}

async function fillGoogleLoginForm(page: Page, email: string, password: string) {
  try {
    const useAnother = page.locator('button:has-text("Use another account")');
    if (await useAnother.count() > 0) await useAnother.click();
  } catch {
    // Ignore account chooser variations.
  }

  const emailField = await waitForVisible([
    page.locator("#identifierId"),
    page.locator('input[type="email"]'),
  ], 60000);

  if (emailField) {
    console.log("Entering YouTube email...");
    await emailField.fill(email);
    await page.locator("#identifierNext").click({ timeout: 15000 });
    await page.waitForTimeout(2000);
  }

  const passwordField = await waitForVisible([
    page.locator('input[type="password"]'),
  ], 60000);

  if (!passwordField) {
    console.log("YouTube needs manual verification before the password step.");
    return;
  }

  console.log("Entering YouTube password...");
  await passwordField.fill(password);
  await page.locator("#passwordNext").click({ timeout: 15000 });
}

export async function loginToYouTube(page: Page, accountLogin?: AccountLogin) {
  const savedSessionOnly = Boolean(accountLogin?.useSavedSessionOnly);
  const manualLoginOnly = !savedSessionOnly;

  console.log("Navigating to YouTube upload page...");
  await page.goto(YOUTUBE_UPLOAD_URL, { timeout: 60000 });
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(3000);
  await dismissChromeSignInPrompt(page);

  if (await isYouTubeLoggedIn(page)) {
    console.log("YouTube session already active.");
  } else if (savedSessionOnly) {
    throw new Error("YouTube saved browser session is not active. Open this account's Login action and complete login before the scheduled publish time.");
  } else {
    console.log("Complete the full YouTube login manually in Chrome; bot will save the session after the account opens.");
    await waitForYouTubeLoginResult(page, true, Boolean(accountLogin?.ignoreLoginErrors));
  }

  if (!await isYouTubeLoggedIn(page)) {
    await page.goto(YOUTUBE_UPLOAD_URL, { timeout: 60000 });
    await waitForYouTubeLoginResult(page, true, manualLoginOnly && Boolean(accountLogin?.ignoreLoginErrors));
  }

  await dismissChromeSignInPrompt(page);
  console.log("YouTube ready.");
  return { success: true };
}

export async function postToYouTube(page: Page, upload: PlatformUpload, accountLogin?: AccountLogin) {
  const videoPath = path.join(rootDir, "uploads", upload.fileName);
  if (!fs.existsSync(videoPath)) throw new Error(`Video not found: ${videoPath}`);

  await loginToYouTube(page, accountLogin);

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
