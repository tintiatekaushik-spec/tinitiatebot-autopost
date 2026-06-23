import cors from "cors";
import express from "express";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ZodError } from "zod";
import { platformSchema, updateUploadDetailsSchema, updateUploadStatusSchema, upsertPlatformAccountSchema } from "../shared/schema";
import {
  automationInput,
  createPlatformAccount,
  createUpload,
  dashboardSummary,
  deletePlatformAccount,
  deleteUpload,
  getPlatformAccount,
  listFolderConnections,
  listPlatformAccounts,
  listUploads,
  updatePlatformAccount,
  updateUploadDetails,
  updateUploadStatus
} from "./storage";
import { runAutomation } from "./services/publisher.js";
import { startScheduler } from "./services/scheduler.js";
import {
  connectPlatformFolder,
  disconnectPlatformFolder,
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

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, done) => {
      done(null, uploadDir);
    },
    filename: (_req, file, done) => {
      const extension = path.extname(file.originalname);
      const safeBase = path
        .basename(file.originalname, extension)
        .replace(/[^a-z0-9-_]+/gi, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48);

      done(null, `${Date.now()}-${safeBase || "upload"}${extension.toLowerCase()}`);
    }
  }),
  limits: {
    fileSize: 1024 * 1024 * 1024
  }
});

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

app.post("/api/platforms/:platform/accounts", async (req, res, next) => {
  try {
    const platform = platformSchema.parse(req.params.platform);
    const payload = upsertPlatformAccountSchema.parse(req.body);
    res.status(201).json(await createPlatformAccount(platform, payload));
  } catch (error) {
    next(error);
  }
});

app.patch("/api/accounts/:id", async (req, res, next) => {
  try {
    const payload = upsertPlatformAccountSchema.parse(req.body);
    const account = await updatePlatformAccount(req.params.id, payload);
    if (!account) {
      res.status(404).json({ message: "Publishing account not found" });
      return;
    }
    res.json(account);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/accounts/:id", async (req, res, next) => {
  try {
    const account = await deletePlatformAccount(req.params.id);
    if (!account) {
      res.status(404).json({ message: "Publishing account not found" });
      return;
    }
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// --- CREATE UPLOAD (with Title, Caption, ScheduledAt) ---
app.post("/api/platforms/:platform/uploads", upload.single("file"), async (req, res, next) => {
  try {
    const platform = platformSchema.parse(req.params.platform);
    const accountId = typeof req.body?.accountId === "string" ? req.body.accountId : "";
    const { title, caption, scheduledAt } = req.body; // 👈 EXTRACT TITLE

    const normalizedScheduledAt = normalizeScheduledAt(scheduledAt);

    if (!req.file) {
      res.status(400).json({ message: "Upload a file with form field name `file`." });
      return;
    }

    if (!caption || typeof caption !== 'string' || caption.trim().length === 0) {
      res.status(400).json({ message: "Caption is required." });
      return;
    }

    if (!accountId) throw new Error("Choose a publishing account.");
    const account = await getPlatformAccount(accountId);
    if (!account || account.platform !== platform) throw new Error("Publishing account does not belong to this platform.");

    const item = await createUpload(accountId, {
      originalName: req.file.originalname,
      fileName: req.file.filename,
      mimeType: req.file.mimetype,
      size: req.file.size,
      url: `/uploads/${req.file.filename}`,
      title: title?.trim() || caption.trim(), // 👈 Use title if provided, else fallback
      caption: caption.trim(),
      scheduledAt: normalizedScheduledAt
    });

    res.status(201).json(item);
  } catch (error) {
    next(error);
  }
});

// --- UPDATE STATUS ---
app.patch("/api/uploads/:id/status", async (req, res, next) => {
  try {
    const payload = updateUploadStatusSchema.parse(req.body);
    const item = await updateUploadStatus(req.params.id, payload.status);

    if (!item) {
      res.status(404).json({ message: "Upload not found" });
      return;
    }

    res.json(item);
  } catch (error) {
    next(error);
  }
});

app.patch("/api/uploads/:id", async (req, res, next) => {
  try {
    const payload = updateUploadDetailsSchema.parse(req.body);
    const scheduledAt = payload.scheduledAt ? normalizeScheduledAt(payload.scheduledAt) : payload.scheduledAt;
    const item = await updateUploadDetails(req.params.id, { ...payload, scheduledAt });

    if (!item) {
      res.status(404).json({ message: "Upload not found" });
      return;
    }

    res.json(item);
  } catch (error) {
    next(error);
  }
});

// --- DELETE UPLOAD ---
app.delete("/api/uploads/:id", async (req, res, next) => {
  try {
    const deleted = await deleteUpload(req.params.id);

    if (!deleted) {
      res.status(404).json({ message: "Upload not found" });
      return;
    }

    const storedFilePath = path.resolve(uploadDir, deleted.fileName);
    if (storedFilePath.startsWith(`${uploadDir}${path.sep}`)) {
      await fs.promises.unlink(storedFilePath).catch(() => undefined);
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// --- CONNECTED FOLDERS ---
app.get("/api/folder-connections", async (_req, res, next) => {
  try {
    res.json(await listFolderConnections());
  } catch (error) {
    next(error);
  }
});

app.post("/api/accounts/:accountId/folder-connection", async (req, res, next) => {
  try {
    const folderPath = typeof req.body?.folderPath === "string" ? req.body.folderPath : "";
    if (!folderPath.trim()) throw new Error("Folder path is required.");
    res.json(await connectPlatformFolder(req.params.accountId, folderPath));
  } catch (error) {
    next(error);
  }
});

app.delete("/api/folder-connections/:id", async (req, res, next) => {
  try {
    const connection = await disconnectPlatformFolder(req.params.id);
    if (!connection) {
      res.status(404).json({ message: "Folder connection not found" });
      return;
    }
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// --- AUTOMATION INPUT ---
app.get("/api/automation/input", async (_req, res, next) => {
  try {
    res.json(await automationInput());
  } catch (error) {
    next(error);
  }
});

app.get("/api/automation/platforms/:platform/input", async (req, res, next) => {
  try {
    const platform = platformSchema.parse(req.params.platform);
    res.json(await automationInput(platform));
  } catch (error) {
    next(error);
  }
});

// --- TRIGGER AUTOMATION ---
app.post("/api/automation/run", async (req, res, next) => {
  try {
    runAutomation({ trigger: "manual" }).catch(err => console.error("Background error:", err));
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

  if (error instanceof multer.MulterError || error instanceof Error) {
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
