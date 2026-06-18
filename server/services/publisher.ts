import { chromium } from "playwright";
import { automationInput, updateUploadStatus } from "../storage.js";
import { postToInstagram } from "./publishers/instagram.js";
import { postToLinkedIn } from "./publishers/linkedin.js";
import { postToYouTube } from "./publishers/youtube.js";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const userDataDir = path.resolve(__dirname, "../../browser-data");

const disabledChromeFeatures = [
  "IsolateOrigins",
  "site-per-process",
  "ChromeWhatsNewUI",
  "ChromeSignin",
  "SigninInterception",
  "DiceWebSigninInterception",
  "SignInProfileCreation",
  "IdentityDiscAccountMenu",
  "AccountConsistency",
  "PasswordManagerOnboarding",
].join(",");

function readJsonFile(filePath: string) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<string, any>;
  } catch {
    return {};
  }
}

function writeJsonFile(filePath: string, data: Record<string, any>) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data));
}

function prepareChromeProfile() {
  const preferencesPath = path.join(userDataDir, "Default", "Preferences");
  const preferences = readJsonFile(preferencesPath);

  preferences.browser = {
    ...(preferences.browser ?? {}),
    has_seen_welcome_page: true,
  };
  preferences.credentials_enable_service = false;
  preferences.profile = {
    ...(preferences.profile ?? {}),
    exit_type: "Normal",
    password_manager_enabled: false,
  };
  preferences.signin = {
    ...(preferences.signin ?? {}),
    allowed: false,
    allowed_on_next_startup: false,
  };
  preferences.sync = {
    ...(preferences.sync ?? {}),
    suppress_start: true,
  };

  writeJsonFile(preferencesPath, preferences);
}

export async function runAutomation() {
  console.log("Starting publisher automation...");
  const { channels } = await automationInput();

  const youtubeUploads = channels.youtube || [];
  const linkedinUploads = channels.linkedin || [];
  const instagramUploads = channels.instagram || [];

  if (youtubeUploads.length === 0 && linkedinUploads.length === 0 && instagramUploads.length === 0) {
    console.log("No queued uploads for YouTube, LinkedIn, or Instagram.");
    return;
  }

  prepareChromeProfile();
  const slowMoMs = Number(process.env.AUTOMATION_SLOW_MO_MS ?? 120);

  const browser = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    channel: "chrome",
    slowMo: slowMoMs,
    viewport: null,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--disable-site-isolation-trials",
      "--disable-sync",
      "--disable-signin-promo",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-default-apps",
      `--disable-features=${disabledChromeFeatures}`,
    ],
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });

  let hadFailure = false;

  try {
    const page = await browser.newPage();

    for (const upload of youtubeUploads) {
      await updateUploadStatus(upload.id, "processing");

      try {
        await postToYouTube(page, upload);
        await updateUploadStatus(upload.id, "posted");
        console.log(`Posted ${upload.id} to YouTube.`);
      } catch (error: any) {
        hadFailure = true;
        await updateUploadStatus(upload.id, "failed");
        console.error(`Failed ${upload.id}: ${error.message}`);
      }
    }

    if (linkedinUploads.length > 0) {
      for (const upload of linkedinUploads) {
        await updateUploadStatus(upload.id, "processing");
        try {
          await postToLinkedIn(page, upload);
          await updateUploadStatus(upload.id, "posted");
          console.log(`Posted ${upload.id} to LinkedIn.`);
        } catch (error: any) {
          hadFailure = true;
          await updateUploadStatus(upload.id, "failed");
          console.error(`Failed ${upload.id} on LinkedIn: ${error.message}`);
        }
      }
    }

    if (instagramUploads.length > 0) {
      for (const upload of instagramUploads) {
        await updateUploadStatus(upload.id, "processing");

        try {
          await postToInstagram(page, upload);
          await updateUploadStatus(upload.id, "posted");
          console.log(`Posted ${upload.id} to Instagram.`);
        } catch (error: any) {
          hadFailure = true;
          await updateUploadStatus(upload.id, "failed");
          console.error(`Failed ${upload.id} on Instagram: ${error.message}`);
        }
      }
    }
  } finally {
    if (hadFailure) {
      console.log("Automation failed. Keeping Chrome open for 20 seconds so you can inspect the screen...");
      await new Promise((resolve) => setTimeout(resolve, 20000));
    }

    await browser.close();
  }
}
