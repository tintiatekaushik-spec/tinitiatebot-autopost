import cors from "cors";
import express from "express";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ZodError } from "zod";
import { platformSchema, updateUploadStatusSchema } from "../shared/schema";
import {
  automationInput,
  createUpload,
  dashboardSummary,
  deleteUpload,
  listUploads,
  updateUploadStatus
} from "./storage";
import { runAutomation } from "./services/publisher.js";
import "dotenv/config"; // 👈 IMPORTANT: Load .env file

const app = express();
const port = Number(process.env.PORT ?? 4100);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const uploadDir = resolveFromRoot(process.env.UPLOAD_DIR ?? "./uploads");

fs.mkdirSync(uploadDir, { recursive: true });

function resolveFromRoot(candidate: string) {
  return path.isAbsolute(candidate) ? candidate : path.resolve(rootDir, candidate);
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
    res.json(await listUploads(platform));
  } catch (error) {
    next(error);
  }
});

app.get("/api/platforms/:platform/uploads", async (req, res, next) => {
  try {
    const platform = platformSchema.parse(req.params.platform);
    res.json(await listUploads(platform));
  } catch (error) {
    next(error);
  }
});

// --- CREATE UPLOAD (with Title, Caption, ScheduledAt) ---
app.post("/api/platforms/:platform/uploads", upload.single("file"), async (req, res, next) => {
  try {
    const platform = platformSchema.parse(req.params.platform);
    const { title, caption, scheduledAt } = req.body; // 👈 EXTRACT TITLE

    if (!req.file) {
      res.status(400).json({ message: "Upload a file with form field name `file`." });
      return;
    }

    if (!caption || typeof caption !== 'string' || caption.trim().length === 0) {
      res.status(400).json({ message: "Caption is required." });
      return;
    }

    const item = await createUpload(platform, {
      originalName: req.file.originalname,
      fileName: req.file.filename,
      mimeType: req.file.mimetype,
      size: req.file.size,
      url: `/uploads/${req.file.filename}`,
      title: title?.trim() || caption.trim(), // 👈 Use title if provided, else fallback
      caption: caption.trim(),
      scheduledAt: scheduledAt || undefined
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
    runAutomation().catch(err => console.error("Background error:", err));
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
});
