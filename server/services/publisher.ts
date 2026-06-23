import { chromium, type BrowserContext, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PlatformUpload } from "../../shared/schema.js";
import { automationInput, getPublishingAccount, listUploads, updateUploadStatus, type AutomationInputMode, type PublishingAccount } from "../storage.js";
import { postToFacebook } from "./publishers/facebook.js";
import { postToInstagram } from "./publishers/instagram.js";
import { postToLinkedIn } from "./publishers/linkedin.js";
import type { AccountLogin } from "./publishers/manual-login.js";
import { postToYouTube } from "./publishers/youtube.js";
import { postToX } from "./publishers/x.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const accountProfilesDir = path.join(rootDir, "browser-data", "accounts");

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
  "PasswordManagerOnboarding"
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

function accountProfilePath(account: PublishingAccount) {
  return path.join(accountProfilesDir, account.platform, account.id.replace(/[^a-z0-9-_]/gi, "-"));
}

function prepareChromeProfile(profileDir: string) {
  const preferencesPath = path.join(profileDir, "Default", "Preferences");
  const preferences = readJsonFile(preferencesPath);
  preferences.browser = { ...(preferences.browser ?? {}), has_seen_welcome_page: true };
  preferences.credentials_enable_service = false;
  preferences.profile = { ...(preferences.profile ?? {}), exit_type: "Normal", password_manager_enabled: false };
  preferences.signin = { ...(preferences.signin ?? {}), allowed: false, allowed_on_next_startup: false };
  preferences.sync = { ...(preferences.sync ?? {}), suppress_start: true };
  writeJsonFile(preferencesPath, preferences);
}

async function launchAccountBrowser(account: PublishingAccount): Promise<BrowserContext> {
  const profileDir = accountProfilePath(account);
  prepareChromeProfile(profileDir);
  const slowMoMs = Number(process.env.AUTOMATION_SLOW_MO_MS ?? 120);
  const commonArgs = ["--no-first-run", "--no-default-browser-check", "--disable-notifications", "--deny-permission-prompts"];
  return chromium.launchPersistentContext(profileDir, {
    headless: false,
    channel: "chrome",
    slowMo: slowMoMs,
    viewport: null,
    args: account.platform === "facebook"
      ? commonArgs
      : [...commonArgs, "--disable-blink-features=AutomationControlled", "--disable-site-isolation-trials", "--disable-sync", "--disable-signin-promo", `--disable-features=${disabledChromeFeatures}`],
    userAgent: account.platform === "facebook" ? undefined : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  });
}

function accountLogin(account: PublishingAccount): AccountLogin {
  return {
    identifier: account.loginIdentifier === "Existing browser session" ? undefined : account.loginIdentifier,
    password: account.password,
    confirmation: account.loginConfirmation
  };
}

async function publishOne(page: Page, upload: PlatformUpload, account: PublishingAccount) {
  const login = accountLogin(account);
  switch (upload.platform) {
    case "youtube": return postToYouTube(page, upload, login);
    case "linkedin": return postToLinkedIn(page, upload, login);
    case "instagram": return postToInstagram(page, upload, login);
    case "facebook": return postToFacebook(page, upload, login);
    case "x": return postToX(page, upload, login);
  }
}

function getFailureHoldMs() {
  const configured = Number(process.env.AUTOMATION_FAILURE_HOLD_MS ?? 0);
  return Number.isFinite(configured) ? Math.max(0, configured) : 0;
}

async function runAccountQueue(account: PublishingAccount, uploads: PlatformUpload[]) {
  console.log(`Publishing ${uploads.length} post(s) through ${account.platform} account ${account.handle} (${account.id}).`);
  const browser = await launchAccountBrowser(account);
  let hadFailure = false;
  try {
    const page = browser.pages()[0] ?? await browser.newPage();
    for (const upload of uploads) {
      await updateUploadStatus(upload.id, "processing");
      try {
        await publishOne(page, upload, account);
        await updateUploadStatus(upload.id, "posted");
        console.log(`Posted ${upload.id} through ${account.handle}.`);
      } catch (error) {
        hadFailure = true;
        await updateUploadStatus(upload.id, "failed");
        console.error(`Failed ${upload.id} through ${account.handle}:`, error instanceof Error ? error.message : error);
      }
    }
    const holdMs = getFailureHoldMs();
    if (hadFailure && holdMs > 0) await new Promise(resolve => setTimeout(resolve, holdMs));
  } finally {
    await browser.close();
  }
}

type RunAutomationOptions = {
  mode?: AutomationInputMode;
  trigger?: "manual" | "scheduler";
};

let activeAutomationRun: Promise<void> | null = null;

export function isAutomationRunning() {
  return activeAutomationRun !== null;
}

async function runAutomationOnce({ mode = "ready", trigger = "manual" }: RunAutomationOptions) {
  console.log(`Starting publisher automation (${trigger})...`);
  const { channels } = await automationInput(undefined, mode);
  const uploads = Object.values(channels).flat();
  if (uploads.length === 0) {
    console.log("No due uploads for enabled publishing accounts.");
    return;
  }

  const queues = new Map<string, PlatformUpload[]>();
  for (const upload of uploads) queues.set(upload.accountId, [...(queues.get(upload.accountId) ?? []), upload]);

  for (const [accountId, accountUploads] of queues) {
    const account = await getPublishingAccount(accountId);
    if (!account || !account.enabled) {
      for (const upload of accountUploads) await updateUploadStatus(upload.id, "failed");
      console.error(`Publishing account ${accountId} is missing or disabled.`);
      continue;
    }
    try {
      await runAccountQueue(account, accountUploads);
    } catch (error) {
      const currentUploads = await listUploads(account.platform, account.id);
      const queuedIds = new Set(accountUploads.map(upload => upload.id));
      for (const upload of currentUploads) if (queuedIds.has(upload.id) && upload.status !== "posted") await updateUploadStatus(upload.id, "failed");
      console.error(`Could not run account ${account.handle}:`, error);
    }
  }
}

export function runAutomation(options: RunAutomationOptions = {}) {
  if (activeAutomationRun) return activeAutomationRun;
  activeAutomationRun = runAutomationOnce(options).finally(() => { activeAutomationRun = null; });
  return activeAutomationRun;
}
