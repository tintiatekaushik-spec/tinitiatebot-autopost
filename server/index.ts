import cors from "cors";
import express from "express";
import { createHmac, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ZodError, z } from "zod";
import {
  createUserProfileSchema,
  createGoogleDriveStorageConnectionSchema,
  createLocalDriveStorageConnectionSchema,
  loginInputSchema,
  platformSchema,
  scheduleIdSchema,
  updateUploadDetailsSchema,
  updateUploadStatusSchema,
  updateUserProfileSchema,
  upsertPlatformAccountSchema,
  upsertPublishingScheduleSchema,
  type PlatformUpload,
  type UserProfile,
  type UserRole
} from "../shared/schema";
import {
  automationInput,
  createGoogleDriveStorageConnection,
  createPlatformAccount,
  createPublishingSchedule,
  createUserProfile,
  deactivateUserProfile,
  dashboardSummary,
  deletePlatformAccount,
  deletePublishingSchedule,
  deleteUpload,
  getStorageConnection,
  getUserProfile,
  listPlatformAccounts,
  listPublishingSchedules,
  listSocialMediaSchedules,
  listActivityLogs,
  listStorageConnections,
  listUploads,
  listUserProfiles,
  logActivity,
  loginUser,
  deleteStorageConnection,
  updatePublishingSchedule,
  updatePlatformAccount,
  updateStorageConnectionSyncState,
  updateUploadDetails,
  updateUploadStatus,
  updateUserProfile,
  upsertLocalDriveStorageConnection
} from "./storage";
import { runAutomation, startManualAccountSession } from "./services/publisher.js";
import { startScheduler } from "./services/scheduler.js";
import {
  connectPlatformFolder,
  disconnectPlatformFolder,
  syncFolderConnection,
  startFolderSync
} from "./services/folder-sync.js";
import "dotenv/config"; // 👈 IMPORTANT: Load .env file

const app = express();
const port = Number(process.env.PORT ?? 4100);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const uploadDir = resolveFromRoot(process.env.UPLOAD_DIR ?? "./uploads");

fs.mkdirSync(uploadDir, { recursive: true });

function resolveFromRoot(candidate: string) {
  return path.isAbsolute(candidate) ? candidate : path.resolve(rootDir, candidate);
}

function normalizeScheduledAt(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new Error("Scheduled date and time must be a string.");

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error("Scheduled date and time is invalid.");
  if (timestamp <= Date.now()) throw new Error("Scheduled date and time must be in the future.");

  return new Date(timestamp).toISOString();
}

type RequestWithUser = express.Request & { user?: UserProfile };

const tokenPayloadSchema = z.object({
  sub: z.string(),
  exp: z.number().int().positive()
});

const scheduleOnlyUpdateSchema = z.object({
  scheduledAt: z.string().nullable().optional(),
  scheduleId: scheduleIdSchema.nullable().optional()
});

function authSecret() {
  return process.env.AUTH_TOKEN_SECRET?.trim()
    || process.env.LOCAL_ACCOUNT_SECRET_KEY?.trim()
    || "local-development-auth-token-secret";
}

function encodeBase64Url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function signPart(value: string) {
  return createHmac("sha256", authSecret()).update(value).digest("base64url");
}

function signAuthToken(user: UserProfile) {
  const lifetimeSeconds = Number(process.env.AUTH_TOKEN_TTL_SECONDS ?? 60 * 60 * 12);
  const payload = encodeBase64Url(JSON.stringify({
    sub: user.id,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + lifetimeSeconds
  }));
  return `${payload}.${signPart(payload)}`;
}

async function userFromAuthToken(token: string) {
  const [payloadPart, signaturePart] = token.split(".");
  if (!payloadPart || !signaturePart) return null;

  const expectedSignature = Buffer.from(signPart(payloadPart), "base64url");
  const providedSignature = Buffer.from(signaturePart, "base64url");
  if (expectedSignature.length !== providedSignature.length || !timingSafeEqual(expectedSignature, providedSignature)) {
    return null;
  }

  const payload = tokenPayloadSchema.parse(JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8")));
  if (payload.exp <= Math.floor(Date.now() / 1000)) return null;

  const user = await getUserProfile(payload.sub);
  return user?.isActive ? user : null;
}

async function authenticateApi(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    const request = req as RequestWithUser;
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
    if (!token) {
      res.status(401).json({ message: "Sign in to continue." });
      return;
    }

    const user = await userFromAuthToken(token);
    if (!user) {
      res.status(401).json({ message: "Session expired. Sign in again." });
      return;
    }

    request.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

function requireRoles(...roles: UserRole[]): express.RequestHandler {
  return (req, res, next) => {
    const user = (req as RequestWithUser).user;
    if (!user) {
      res.status(401).json({ message: "Sign in to continue." });
      return;
    }
    if (!roles.includes(user.role)) {
      res.status(403).json({ message: "Your role cannot perform this action." });
      return;
    }
    next();
  };
}

function currentUser(req: RequestWithUser) {
  if (!req.user) throw new Error("Sign in to continue.");
  return req.user;
}

function pathParam(value: string | string[] | undefined, name: string) {
  if (typeof value === "string" && value.trim()) return value;
  if (Array.isArray(value) && typeof value[0] === "string" && value[0].trim()) return value[0];
  throw new Error(`${name} path parameter is required.`);
}

function canEditContent(role: UserRole) {
  return role === "operations_manager" || role === "post_uploader";
}

function canEditSchedule(role: UserRole) {
  return role === "operations_manager" || role === "scheduler";
}

async function findUploadOrThrow(uploadId: string): Promise<PlatformUpload> {
  const uploads = await listUploads();
  const upload = uploads.find(item => item.id === uploadId);
  if (!upload) throw new Error("Upload not found");
  return upload;
}

app.use(
  cors({
    origin: process.env.WEB_ORIGIN?.split(",") ?? true
  })
);
app.use(express.json({ limit: "2mb" }));
app.use("/uploads", express.static(uploadDir));

// --- HEALTH ---
app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "tinitiatebot-autopost",
    productShape: "web-app",
    automationReady: true
  });
});

app.post("/api/auth/login", async (req, res, next) => {
  try {
    const payload = loginInputSchema.parse(req.body);
    const user = await loginUser(payload.username, payload.password);
    if (!user) {
      res.status(401).json({ message: "Invalid username or password." });
      return;
    }

    res.json({ user, token: signAuthToken(user) });
  } catch (error) {
    next(error);
  }
});

app.use("/api", authenticateApi);

app.get("/api/auth/me", (req: RequestWithUser, res) => {
  res.json(currentUser(req));
});

app.get("/api/users", requireRoles("operations_manager"), async (_req, res, next) => {
  try {
    res.json(await listUserProfiles());
  } catch (error) {
    next(error);
  }
});

app.post("/api/users", requireRoles("operations_manager"), async (req: RequestWithUser, res, next) => {
  try {
    const payload = createUserProfileSchema.parse(req.body);
    res.status(201).json(await createUserProfile(payload, currentUser(req).id));
  } catch (error) {
    next(error);
  }
});

app.patch("/api/users/:id", requireRoles("operations_manager"), async (req: RequestWithUser, res, next) => {
  try {
    const payload = updateUserProfileSchema.parse(req.body);
    const user = await updateUserProfile(pathParam(req.params.id, "id"), payload, currentUser(req).id);
    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }
    res.json(user);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/users/:id", requireRoles("operations_manager"), async (req: RequestWithUser, res, next) => {
  try {
    const user = await deactivateUserProfile(pathParam(req.params.id, "id"), currentUser(req).id);
    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

app.get("/api/activity-logs", requireRoles("operations_manager"), async (req, res, next) => {
  try {
    const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : 100;
    res.json(await listActivityLogs(limit));
  } catch (error) {
    next(error);
  }
});

// --- DASHBOARD ---
app.get("/api/dashboard", async (_req, res, next) => {
  try {
    res.json(await dashboardSummary());
  } catch (error) {
    next(error);
  }
});

// --- LIST UPLOADS ---
app.get("/api/uploads", async (req, res, next) => {
  try {
    const platform = req.query.platform ? platformSchema.parse(req.query.platform) : undefined;
    const accountId = typeof req.query.accountId === "string" ? req.query.accountId : undefined;
    res.json(await listUploads(platform, accountId));
  } catch (error) {
    next(error);
  }
});

app.get("/api/platforms/:platform/uploads", async (req, res, next) => {
  try {
    const platform = platformSchema.parse(req.params.platform);
    const accountId = typeof req.query.accountId === "string" ? req.query.accountId : undefined;
    res.json(await listUploads(platform, accountId));
  } catch (error) {
    next(error);
  }
});

// --- PUBLISHING ACCOUNTS ---
app.get("/api/accounts", async (req, res, next) => {
  try {
    const platform = req.query.platform ? platformSchema.parse(req.query.platform) : undefined;
    res.json(await listPlatformAccounts(platform));
  } catch (error) {
    next(error);
  }
});

app.post("/api/platforms/:platform/accounts", requireRoles("operations_manager"), async (req: RequestWithUser, res, next) => {
  try {
    const platform = platformSchema.parse(req.params.platform);
    const payload = upsertPlatformAccountSchema.parse(req.body);
    const account = await createPlatformAccount(platform, payload);
    await logActivity(currentUser(req).id, "account.created", "publishing_account", account.id, `${account.displayName} account was added for ${platform}.`, { platform, handle: account.handle });
    res.status(201).json(account);
  } catch (error) {
    next(error);
  }
});

app.patch("/api/accounts/:id", requireRoles("operations_manager"), async (req: RequestWithUser, res, next) => {
  try {
    const payload = upsertPlatformAccountSchema.parse(req.body);
    const account = await updatePlatformAccount(pathParam(req.params.id, "id"), payload);
    if (!account) {
      res.status(404).json({ message: "Publishing account not found" });
      return;
    }
    await logActivity(currentUser(req).id, "account.updated", "publishing_account", account.id, `${account.displayName} account was updated.`, { platform: account.platform, handle: account.handle });
    res.json(account);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/accounts/:id", requireRoles("operations_manager"), async (req: RequestWithUser, res, next) => {
  try {
    const account = await deletePlatformAccount(pathParam(req.params.id, "id"));
    if (!account) {
      res.status(404).json({ message: "Publishing account not found" });
      return;
    }
    await logActivity(currentUser(req).id, "account.deleted", "publishing_account", account.id, `${account.displayName} account was deleted.`, { platform: account.platform, handle: account.handle });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

app.post("/api/accounts/:id/manual-login", requireRoles("operations_manager", "post_uploader"), async (req: RequestWithUser, res, next) => {
  try {
    const user = currentUser(req);
    const { account, started } = await startManualAccountSession(pathParam(req.params.id, "id"));
    await logActivity(
      user.id,
      started ? "account.manual_login_started" : "account.manual_login_already_running",
      "publishing_account",
      account.id,
      started
        ? `${account.displayName} manual login session was opened.`
        : `${account.displayName} manual login session is already open.`,
      { platform: account.platform, handle: account.handle },
    );
    res.status(202).json({
      message: started
        ? "Manual login window opened. Complete login in Chrome; the session will be saved and the window will close."
        : "Manual login is already running for this account.",
      started,
    });
  } catch (error) {
    next(error);
  }
});

// --- STORAGE ACCESS ---
app.get("/api/storage-connections", requireRoles("operations_manager", "post_uploader"), async (_req, res, next) => {
  try {
    res.json(await listStorageConnections());
  } catch (error) {
    next(error);
  }
});

app.post("/api/storage-connections/local-drive", requireRoles("operations_manager", "post_uploader"), async (req: RequestWithUser, res, next) => {
  try {
    const user = currentUser(req);
    const payload = createLocalDriveStorageConnectionSchema.parse(req.body);
    const result = await connectPlatformFolder(payload.accountId, payload.folderPath);
    if (!result.connection) throw new Error("Local drive connection could not be created.");
    const storageConnection = await upsertLocalDriveStorageConnection(result.connection, payload, user.id);
    await logActivity(user.id, "storage.local_drive_connected", "storage_connection", storageConnection.id, `${storageConnection.displayName} was connected.`, {
      accountId: storageConnection.accountId,
      platform: storageConnection.platform,
      folderPath: storageConnection.localFolderPath,
      sync: result.sync
    });
    res.status(201).json({ connection: storageConnection, sync: result.sync });
  } catch (error) {
    next(error);
  }
});

app.post("/api/storage-connections/google-drive", requireRoles("operations_manager", "post_uploader"), async (req: RequestWithUser, res, next) => {
  try {
    const user = currentUser(req);
    const payload = createGoogleDriveStorageConnectionSchema.parse(req.body);
    const storageConnection = await createGoogleDriveStorageConnection(payload, user.id);
    await logActivity(user.id, "storage.google_drive_connected", "storage_connection", storageConnection.id, `${storageConnection.displayName} Google Drive connection was added.`, {
      accountId: storageConnection.accountId,
      platform: storageConnection.platform,
      folderId: storageConnection.googleDriveFolderId
    });
    res.status(201).json(storageConnection);
  } catch (error) {
    next(error);
  }
});

app.post("/api/storage-connections/:id/sync", requireRoles("operations_manager", "post_uploader"), async (req: RequestWithUser, res, next) => {
  try {
    const user = currentUser(req);
    const storageConnection = await getStorageConnection(pathParam(req.params.id, "id"));
    if (!storageConnection) {
      res.status(404).json({ message: "Storage connection not found" });
      return;
    }
    if (storageConnection.storageType === "google_drive") {
      await updateStorageConnectionSyncState(storageConnection.id, "pending_auth", "Google Drive sync needs OAuth/API credentials before imports can run.");
      res.status(400).json({ message: "Google Drive sync needs OAuth/API credentials before imports can run." });
      return;
    }
    if (!storageConnection.legacyConnectedFolderId) throw new Error("Local Drive sync record was not found.");

    await updateStorageConnectionSyncState(storageConnection.id, "syncing");
    try {
      const sync = await syncFolderConnection(storageConnection.legacyConnectedFolderId);
      const updated = await updateStorageConnectionSyncState(storageConnection.id, "connected");
      await logActivity(user.id, "storage.synced", "storage_connection", storageConnection.id, `${storageConnection.displayName} was synced.`, { sync });
      res.json({ connection: updated, sync });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Storage sync failed.";
      await updateStorageConnectionSyncState(storageConnection.id, "error", message);
      throw error;
    }
  } catch (error) {
    next(error);
  }
});

app.delete("/api/storage-connections/:id", requireRoles("operations_manager", "post_uploader"), async (req: RequestWithUser, res, next) => {
  try {
    const user = currentUser(req);
    const storageConnection = await getStorageConnection(pathParam(req.params.id, "id"));
    if (!storageConnection) {
      res.status(404).json({ message: "Storage connection not found" });
      return;
    }
    if (storageConnection.storageType === "local_drive" && storageConnection.legacyConnectedFolderId) {
      await disconnectPlatformFolder(storageConnection.legacyConnectedFolderId);
    }
    await deleteStorageConnection(storageConnection.id);
    await logActivity(user.id, "storage.deleted", "storage_connection", storageConnection.id, `${storageConnection.displayName} storage access was removed.`, {
      storageType: storageConnection.storageType,
      accountId: storageConnection.accountId
    });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// --- REUSABLE SCHEDULES ---
app.get("/api/schedules", async (_req, res, next) => {
  try {
    res.json(await listPublishingSchedules());
  } catch (error) {
    next(error);
  }
});

app.post("/api/schedules", requireRoles("operations_manager", "scheduler"), async (req: RequestWithUser, res, next) => {
  try {
    const payload = upsertPublishingScheduleSchema.parse(req.body);
    const schedule = await createPublishingSchedule(payload);
    await logActivity(currentUser(req).id, "schedule.created", "schedule_template", schedule.id, `${schedule.name} schedule was created.`, { frequency: schedule.frequency, time: schedule.time });
    res.status(201).json(schedule);
  } catch (error) {
    next(error);
  }
});

app.patch("/api/schedules/:id", requireRoles("operations_manager", "scheduler"), async (req: RequestWithUser, res, next) => {
  try {
    const scheduleId = scheduleIdSchema.parse(req.params.id);
    const payload = upsertPublishingScheduleSchema.parse(req.body);
    const schedule = await updatePublishingSchedule(scheduleId, payload);
    if (!schedule) {
      res.status(404).json({ message: "Schedule not found" });
      return;
    }
    await logActivity(currentUser(req).id, "schedule.updated", "schedule_template", schedule.id, `${schedule.name} schedule was updated.`, { frequency: schedule.frequency, time: schedule.time, status: schedule.status });
    res.json(schedule);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/schedules/:id", requireRoles("operations_manager", "scheduler"), async (req: RequestWithUser, res, next) => {
  try {
    const scheduleId = scheduleIdSchema.parse(req.params.id);
    const schedule = await deletePublishingSchedule(scheduleId);
    if (!schedule) {
      res.status(404).json({ message: "Schedule not found" });
      return;
    }
    await logActivity(currentUser(req).id, "schedule.deleted", "schedule_template", schedule.id, `${schedule.name} schedule was deleted.`, { frequency: schedule.frequency, time: schedule.time });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

app.get("/api/social-media-schedules", async (_req, res, next) => {
  try {
    res.json(await listSocialMediaSchedules());
  } catch (error) {
    next(error);
  }
});

// --- OLD DIRECT UPLOAD FLOW REMOVED ---
app.post("/api/platforms/:platform/uploads", requireRoles("operations_manager", "post_uploader"), (_req, res) => {
  res.status(410).json({ message: "Direct uploads were replaced by Storage Access. Add a Local Drive or Google Drive source instead." });
});

// --- UPDATE STATUS ---
app.patch("/api/uploads/:id/status", requireRoles("operations_manager"), async (req: RequestWithUser, res, next) => {
  try {
    const user = currentUser(req);
    const payload = updateUploadStatusSchema.parse(req.body);
    const uploadId = pathParam(req.params.id, "id");
    const item = await updateUploadStatus(uploadId, payload.status, payload.failureReason ?? "Post status updated", user.id);

    if (!item) {
      res.status(404).json({ message: "Upload not found" });
      return;
    }

    await logActivity(user.id, "post.status_updated", "post", item.id, `${item.title || item.originalName} status changed to ${item.status}.`, { status: item.status });
    res.json(item);
  } catch (error) {
    next(error);
  }
});

app.patch("/api/uploads/:id", requireRoles("operations_manager", "post_uploader", "scheduler"), async (req: RequestWithUser, res, next) => {
  try {
    const user = currentUser(req);
    const uploadId = pathParam(req.params.id, "id");
    const existing = await findUploadOrThrow(uploadId);
    let payload;
    let action = "post.updated";
    let summaryDetail = "details";

    if (user.role === "scheduler") {
      const schedulePayload = scheduleOnlyUpdateSchema.parse(req.body);
      const scheduledAt = schedulePayload.scheduledAt ? normalizeScheduledAt(schedulePayload.scheduledAt) : schedulePayload.scheduledAt;
      payload = {
        title: existing.title,
        caption: existing.caption,
        accountId: existing.accountId,
        scheduledAt,
        scheduleId: schedulePayload.scheduleId
      };
      action = "post.scheduled";
      summaryDetail = "schedule";
    } else {
      const contentPayload = updateUploadDetailsSchema.parse(req.body);
      if (user.role === "post_uploader" && ("scheduledAt" in req.body || "scheduleId" in req.body)) {
        res.status(403).json({ message: "Post uploaders can edit content but cannot schedule posts." });
        return;
      }
      const scheduledAt = contentPayload.scheduledAt ? normalizeScheduledAt(contentPayload.scheduledAt) : contentPayload.scheduledAt;
      payload = {
        ...contentPayload,
        scheduledAt,
        scheduleId: user.role === "operations_manager" ? contentPayload.scheduleId : undefined
      };
      action = scheduledAt || contentPayload.scheduleId ? "post.scheduled" : "post.updated";
      summaryDetail = scheduledAt || contentPayload.scheduleId ? "schedule" : "content";
    }

    if (!canEditContent(user.role) && !canEditSchedule(user.role)) {
      res.status(403).json({ message: "Your role cannot edit posts." });
      return;
    }

    const item = await updateUploadDetails(uploadId, payload, user.id);

    if (!item) {
      res.status(404).json({ message: "Upload not found" });
      return;
    }

    await logActivity(user.id, action, "post", item.id, `${item.title || item.originalName} ${summaryDetail} was updated.`, { platform: item.platform, accountId: item.accountId, scheduledAt: item.scheduledAt, scheduleId: item.scheduleId });
    res.json(item);
  } catch (error) {
    next(error);
  }
});

// --- DELETE UPLOAD ---
app.delete("/api/uploads/:id", requireRoles("operations_manager", "post_uploader"), async (req: RequestWithUser, res, next) => {
  try {
    const user = currentUser(req);
    const deleted = await deleteUpload(pathParam(req.params.id, "id"));

    if (!deleted) {
      res.status(404).json({ message: "Upload not found" });
      return;
    }

    const storedFilePath = path.resolve(uploadDir, deleted.fileName);
    if (storedFilePath.startsWith(`${uploadDir}${path.sep}`)) {
      await fs.promises.unlink(storedFilePath).catch(() => undefined);
    }

    await logActivity(user.id, "post.deleted", "post", deleted.id, `${deleted.title || deleted.originalName} was deleted.`, { platform: deleted.platform, accountId: deleted.accountId });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// --- OLD FOLDER API REMOVED ---
app.get("/api/folder-connections", requireRoles("operations_manager", "post_uploader"), (_req, res) => {
  res.status(410).json({ message: "Folder connections were replaced by Storage Access. Use /api/storage-connections." });
});

app.post("/api/accounts/:accountId/folder-connection", requireRoles("operations_manager", "post_uploader"), (_req, res) => {
  res.status(410).json({ message: "Folder connections were replaced by Storage Access. Add a Local Drive source instead." });
});

app.delete("/api/folder-connections/:id", requireRoles("operations_manager", "post_uploader"), (_req, res) => {
  res.status(410).json({ message: "Folder connections were replaced by Storage Access. Remove the Storage Access connection instead." });
});

// --- AUTOMATION INPUT ---
app.get("/api/automation/input", requireRoles("operations_manager"), async (_req, res, next) => {
  try {
    res.json(await automationInput());
  } catch (error) {
    next(error);
  }
});

app.get("/api/automation/platforms/:platform/input", requireRoles("operations_manager"), async (req, res, next) => {
  try {
    const platform = platformSchema.parse(req.params.platform);
    res.json(await automationInput(platform));
  } catch (error) {
    next(error);
  }
});

// --- TRIGGER AUTOMATION ---
app.post("/api/automation/run", requireRoles("operations_manager"), async (req: RequestWithUser, res, next) => {
  try {
    const user = currentUser(req);
    await logActivity(user.id, "automation.started", "automation_run", null, "Manual publisher automation was started.", {});
    runAutomation({ trigger: "manual", startedByUserId: user.id }).catch(err => console.error("Background error:", err));
    res.json({ message: "Publisher automation started. Check server logs." });
  } catch (error) {
    next(error);
  }
});

// --- ERROR HANDLER ---
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof ZodError) {
    res.status(400).json({
      message: "Validation failed",
      issues: error.issues
    });
    return;
  }

  if (error instanceof Error) {
    res.status(400).json({ message: error.message });
    return;
  }

  res.status(500).json({ message: "Unexpected server error" });
});

app.listen(port, () => {
  console.log(`Tinitiate Autopost API listening on http://localhost:${port}`);
  startScheduler();
  void startFolderSync().catch((error) => console.error("Folder sync startup failed:", error));
});
