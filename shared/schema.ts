import { z } from "zod";

export const platforms = ["instagram", "x", "linkedin", "facebook", "youtube"] as const;
export const uploadStatuses = ["queued", "processing", "posted", "failed"] as const;

export const platformSchema = z.enum(platforms);
export const uploadStatusSchema = z.enum(uploadStatuses);

export type Platform = (typeof platforms)[number];
export type UploadStatus = (typeof uploadStatuses)[number];

export const platformAccountSchema = z.object({
  id: z.string(),
  platform: platformSchema,
  displayName: z.string(),
  handle: z.string(),
  loginIdentifier: z.string(),
  loginConfirmation: z.string().optional(),
  credentialConfigured: z.boolean(),
  enabled: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const upsertPlatformAccountSchema = z.object({
  displayName: z.string().trim().min(1, "Account name is required"),
  handle: z.string().trim().min(1, "Account handle is required"),
  loginIdentifier: z.string().trim().min(1, "Login email or username is required"),
  loginConfirmation: z.string().trim().optional(),
  password: z.string().min(1, "Password is required").optional(),
  enabled: z.boolean().optional()
});

export const folderConnectionSchema = z.object({
  id: z.string(),
  platform: platformSchema,
  accountId: z.string(),
  folderPath: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastScannedAt: z.string().optional(),
  lastError: z.string().optional()
});

export const folderSourceSchema = z.object({
  connectionId: z.string(),
  relativePath: z.string(),
  fingerprint: z.string(),
  present: z.boolean()
});

export const platformLabels: Record<Platform, string> = {
  instagram: "Instagram",
  x: "X",
  linkedin: "LinkedIn",
  facebook: "Facebook",
  youtube: "YouTube"
};

export const platformHandles: Record<Platform, string> = {
  instagram: "@instagram",
  x: "@x",
  linkedin: "LinkedIn Page",
  facebook: "Facebook Page",
  youtube: "YouTube Channel"
};

export const platformSurfaces: Record<Platform, string> = {
  instagram: "https://www.instagram.com/",
  x: "https://x.com/compose/post",
  linkedin: "https://www.linkedin.com/feed/",
  facebook: "https://www.facebook.com/",
  youtube: "https://www.youtube.com/"
};

export const uploadAutomationSchema = z.object({
  schemaVersion: z.literal("autopost.upload.v1"),
  n8nInputKey: z.string(),
  playwright: z.object({
    platform: platformSchema,
    accountId: z.string(),
    browserProfileName: z.string(),
    publishSurface: z.string(),
    sourceFileUrl: z.string()
  })
});

export const platformUploadSchema = z.object({
  id: z.string(),
  platform: platformSchema,
  accountId: z.string(),
  originalName: z.string(),
  fileName: z.string(),
  mimeType: z.string(),
  extension: z.string(),
  size: z.number(),
  url: z.string(),
  title: z.string().optional(), // 👈 NEW TITLE FIELD
  caption: z.string().min(1, "Caption is required"),
  status: uploadStatusSchema,
  uploadedAt: z.string(),
  updatedAt: z.string(),
  scheduledAt: z.string().optional(),
  folderSource: folderSourceSchema.optional(),
  automation: uploadAutomationSchema
});

export const updateUploadDetailsSchema = z.object({
  title: z.string().trim().optional(),
  caption: z.string().trim().min(1, "Caption is required"),
  scheduledAt: z.string().nullable().optional(),
  accountId: z.string().optional()
});

export const updateUploadStatusSchema = z.object({
  status: uploadStatusSchema,
  failureReason: z.string().optional()
});

export type PlatformUpload = z.infer<typeof platformUploadSchema>;
export type PlatformAccount = z.infer<typeof platformAccountSchema>;
export type FolderConnection = z.infer<typeof folderConnectionSchema>;
export type UploadAutomation = z.infer<typeof uploadAutomationSchema>;
export type UpdateUploadStatusInput = z.input<typeof updateUploadStatusSchema>;
export type UpdateUploadDetailsInput = z.input<typeof updateUploadDetailsSchema>;
export type UpsertPlatformAccountInput = z.input<typeof upsertPlatformAccountSchema>;

export type DashboardSummary = {
  totalUploads: number;
  readyForAutomation: number;
  processing: number;
  posted: number;
  failed: number;
  channels: Array<{
    platform: Platform;
    label: string;
    handle: string;
    total: number;
    queued: number;
    latestUploadAt: string | null;
  }>;
};

export type AutomationInput = {
  generatedAt: string;
  officialPlatformApisRequired: false;
  intakeSource: "tinitiatebot_autopost";
  channels: Record<Platform, PlatformUpload[]>;
};
