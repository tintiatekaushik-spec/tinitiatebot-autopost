import { FileArchive, FileText, Loader2, Trash2, Upload } from "lucide-react";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Platform, PlatformUpload } from "../shared/schema";
import { platformLabels, platforms } from "../shared/schema";
import { api, assetUrl } from "./lib/api";

type PlatformTone = {
  accent: string;
  ink: string;
  soft: string;
  ring: string;
};

const platformTone: Record<Platform, PlatformTone> = {
  instagram: {
    accent: "#e1306c",
    ink: "#8a1746",
    soft: "#fff3f8",
    ring: "#f8b8d2"
  },
  x: {
    accent: "#111111",
    ink: "#111111",
    soft: "#f3f4f6",
    ring: "#cfd3d8"
  },
  linkedin: {
    accent: "#0a66c2",
    ink: "#064579",
    soft: "#eff7ff",
    ring: "#b8daf8"
  },
  facebook: {
    accent: "#1877f2",
    ink: "#0d4fa6",
    soft: "#f1f6ff",
    ring: "#bdd6ff"
  },
  youtube: {
    accent: "#ff0033",
    ink: "#a10020",
    soft: "#fff2f4",
    ring: "#ffb9c5"
  }
};

export default function App() {
  const [uploads, setUploads] = useState<PlatformUpload[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyPlatform, setBusyPlatform] = useState<Platform | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      setUploads(await api.uploads());
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Dashboard could not load.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const uploadsByPlatform = useMemo(() => {
    return Object.fromEntries(
      platforms.map((platform) => [platform, uploads.filter((upload) => upload.platform === platform)])
    ) as Record<Platform, PlatformUpload[]>;
  }, [uploads]);

  const counts = useMemo(
    () => ({
      total: uploads.length,
      ready: uploads.filter((upload) => upload.status === "queued").length,
      processing: uploads.filter((upload) => upload.status === "processing").length,
      posted: uploads.filter((upload) => upload.status === "posted").length,
      failed: uploads.filter((upload) => upload.status === "failed").length
    }),
    [uploads]
  );

  const readiness = counts.total ? Math.round((counts.ready / counts.total) * 100) : 0;
  const recentUploads = uploads.slice(0, 4);

  async function handleUpload(platform: Platform, fileList: FileList | null) {
    if (!fileList?.length) return;

    setBusyPlatform(platform);
    setError(null);

    try {
      await Promise.all(Array.from(fileList).map((file) => api.uploadToPlatform(platform, file)));
      await refresh();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed.");
    } finally {
      setBusyPlatform(null);
    }
  }

  async function deleteUpload(id: string) {
    setError(null);
    const previousUploads = uploads;
    setUploads((current) => current.filter((upload) => upload.id !== id));

    try {
      await api.deleteUpload(id);
      await refresh();
    } catch (deleteError) {
      setUploads(previousUploads);
      setError(deleteError instanceof Error ? deleteError.message : "Could not remove file.");
    }
  }

  return (
    <main className="workspace">
      <section className="monitor-shell">
        <header className="monitor-header">
          <div>
            <span className="brand-name">Tinitiate Autobot</span>
            <h1>Automation Monitor</h1>
          </div>
          <span className={`system-pill ${loading ? "syncing" : ""}`}>{loading ? "Syncing" : "Intake Online"}</span>
        </header>

        <section className="monitor-grid" aria-label="Queue monitoring">
          <article className="monitor-card readiness-card">
            <div className="readiness-ring" style={{ "--progress": `${readiness * 3.6}deg` } as CSSProperties}>
              <div>
                <strong>{readiness}%</strong>
                <span>Ready</span>
              </div>
            </div>
            <div className="readiness-copy">
              <span>Queue Readiness</span>
              <strong>
                {counts.ready} of {counts.total}
              </strong>
              <p>{counts.total === 0 ? "Waiting for uploads" : "Files prepared for the automation handoff"}</p>
            </div>
          </article>

          <article className="monitor-card status-card">
            <div className="card-title">
              <span>Status Distribution</span>
              <strong>{counts.total} files</strong>
            </div>
            <StatusRow label="Ready" tone="ready" total={counts.total} value={counts.ready} />
            <StatusRow label="Working" tone="working" total={counts.total} value={counts.processing} />
            <StatusRow label="Posted" tone="posted" total={counts.total} value={counts.posted} />
            <StatusRow label="Failed" tone="failed" total={counts.total} value={counts.failed} />
          </article>

          <article className="monitor-card handoff-card">
            <div className="card-title">
              <span>Automation Handoff</span>
              <strong>n8n ready</strong>
            </div>
            <code>/api/automation/input</code>
            <div className="handoff-meta">
              <div>
                <span>Store</span>
                <strong>data/store.json</strong>
              </div>
              <div>
                <span>Files</span>
                <strong>uploads/</strong>
              </div>
            </div>
          </article>

          <article className="monitor-card activity-card">
            <div className="card-title">
              <span>Recent Intake</span>
              <strong>{recentUploads.length || "None"}</strong>
            </div>
            {recentUploads.length === 0 ? (
              <div className="empty-activity">No files in the queue yet.</div>
            ) : (
              <div className="activity-list">
                {recentUploads.map((upload) => (
                  <div className="activity-item" key={upload.id}>
                    <span className={`activity-dot activity-${upload.status}`} />
                    <div>
                      <strong>{upload.originalName}</strong>
                      <span>
                        {platformLabels[upload.platform]} - {upload.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </article>
        </section>
      </section>

      {error && <div className="notice error">{error}</div>}

      <section className="upload-board" aria-busy={loading}>
        {platforms.map((platform) => (
          <PlatformCard
            busy={busyPlatform === platform}
            key={platform}
            onDelete={deleteUpload}
            onUpload={handleUpload}
            platform={platform}
            uploads={uploadsByPlatform[platform]}
          />
        ))}
      </section>
    </main>
  );
}

function StatusRow({ label, tone, total, value }: { label: string; tone: string; total: number; value: number }) {
  const width = `${total ? Math.max((value / total) * 100, value ? 6 : 0) : 0}%`;

  return (
    <div className="status-row">
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <div className="status-track">
        <div className={`status-fill status-${tone}`} style={{ width }} />
      </div>
    </div>
  );
}

type PlatformCardProps = {
  platform: Platform;
  uploads: PlatformUpload[];
  busy: boolean;
  onUpload: (platform: Platform, files: FileList | null) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

function PlatformCard({ platform, uploads, busy, onUpload, onDelete }: PlatformCardProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const tone = platformTone[platform];
  const queued = uploads.filter((upload) => upload.status === "queued").length;
  const latest = uploads[0] ? formatDate(uploads[0].uploadedAt) : "Empty queue";

  function openPicker() {
    inputRef.current?.click();
  }

  return (
    <article
      className={`platform-card ${dragging ? "dragging" : ""}`}
      onDragEnter={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setDragging(false);
        }
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        void onUpload(platform, event.dataTransfer.files);
      }}
      style={
        {
          "--platform-accent": tone.accent,
          "--platform-ink": tone.ink,
          "--platform-soft": tone.soft,
          "--platform-ring": tone.ring
        } as CSSProperties
      }
    >
      <input
        hidden
        multiple
        onChange={(event) => {
          const files = event.currentTarget.files;
          void onUpload(platform, files).finally(() => {
            event.currentTarget.value = "";
          });
        }}
        ref={inputRef}
        type="file"
      />

      <header className="platform-head">
        <BrandLogo platform={platform} />
        <div>
          <h2>{platformLabels[platform]}</h2>
          <span>{latest}</span>
        </div>
        <div className="queued-number">
          <strong>{queued}</strong>
          <span>ready</span>
        </div>
      </header>

      <button className={`upload-zone ${uploads.length > 0 ? "compact" : ""}`} disabled={busy} onClick={openPicker} type="button">
        <span className="upload-symbol">
          {busy ? <Loader2 className="spin" size={22} aria-hidden="true" /> : <Upload size={22} aria-hidden="true" />}
        </span>
        <span>
          <strong>{busy ? "Uploading" : "Add file"}</strong>
          <small>{uploads.length === 0 ? "Queue is empty" : `${uploads.length} file${uploads.length === 1 ? "" : "s"} loaded`}</small>
        </span>
      </button>

      {uploads.length > 0 && (
        <div className="upload-list">
          {uploads.map((upload) => (
            <UploadRow key={upload.id} onDelete={onDelete} upload={upload} />
          ))}
        </div>
      )}

      {dragging && (
        <div className="drop-overlay">
          <Upload size={28} aria-hidden="true" />
          <strong>Release to upload</strong>
        </div>
      )}
    </article>
  );
}

function UploadRow({ upload, onDelete }: { upload: PlatformUpload; onDelete: (id: string) => Promise<void> }) {
  return (
    <div className="upload-row">
      <FileThumb upload={upload} />
      <div className="upload-copy">
        <strong title={upload.originalName}>{upload.originalName}</strong>
        <span>
          {upload.extension.toUpperCase()} - {formatBytes(upload.size)} - {formatDate(upload.uploadedAt)}
        </span>
      </div>
      <span className={`queue-state state-${upload.status}`}>{upload.status}</span>
      <button className="delete-button" onClick={() => void onDelete(upload.id)} title="Remove file" type="button">
        <Trash2 size={15} aria-hidden="true" />
      </button>
    </div>
  );
}

function FileThumb({ upload }: { upload: PlatformUpload }) {
  if (upload.mimeType.startsWith("image/")) {
    return <img className="file-thumb" src={assetUrl(upload.url)} alt="" />;
  }

  if (upload.mimeType.startsWith("video/")) {
    return (
      <video className="file-thumb" muted preload="metadata">
        <source src={assetUrl(upload.url)} type={upload.mimeType} />
      </video>
    );
  }

  const Icon = upload.extension === "zip" || upload.extension === "rar" ? FileArchive : FileText;
  return (
    <div className="file-thumb file-thumb-generic">
      <Icon size={22} aria-hidden="true" />
    </div>
  );
}

function BrandLogo({ platform }: { platform: Platform }) {
  if (platform === "instagram") {
    return (
      <svg className="brand-logo" viewBox="0 0 48 48" aria-hidden="true">
        <defs>
          <linearGradient id="instagramGradient" x1="6" x2="42" y1="42" y2="6">
            <stop offset="0" stopColor="#feda75" />
            <stop offset="0.28" stopColor="#fa7e1e" />
            <stop offset="0.52" stopColor="#d62976" />
            <stop offset="0.74" stopColor="#962fbf" />
            <stop offset="1" stopColor="#4f5bd5" />
          </linearGradient>
        </defs>
        <rect width="48" height="48" rx="13" fill="url(#instagramGradient)" />
        <rect x="13" y="13" width="22" height="22" rx="7" fill="none" stroke="#fff" strokeWidth="3" />
        <circle cx="24" cy="24" r="5.5" fill="none" stroke="#fff" strokeWidth="3" />
        <circle cx="31.8" cy="16.6" r="2.1" fill="#fff" />
      </svg>
    );
  }

  if (platform === "x") {
    return (
      <svg className="brand-logo brand-logo-x" viewBox="0 0 48 48" aria-hidden="true">
        <rect width="48" height="48" rx="12" fill="#111111" />
        <path
          d="M29.1 21.6 40.2 8.8h-5.3L26.7 18.2 20.1 8.8H8.5l11.8 16.9L8.5 39.2h5.3l8.9-10.2 7.1 10.2h11.6L29.1 21.6Zm-3.2 3.7-2-2.8-8.6-12.1h2.4l6.9 9.7 2 2.8 9.1 12.8h-2.4l-7.4-10.4Z"
          fill="#ffffff"
        />
      </svg>
    );
  }

  if (platform === "linkedin") {
    return (
      <svg className="brand-logo" viewBox="0 0 48 48" aria-hidden="true">
        <rect width="48" height="48" rx="8" fill="#0a66c2" />
        <circle cx="15" cy="15" r="4" fill="#ffffff" />
        <rect x="11.5" y="21" width="7" height="17" fill="#ffffff" />
        <path d="M23 21h6.7v2.5c1-1.7 2.9-3 5.9-3 5 0 7.4 3.1 7.4 8.7V38h-7v-8c0-2.5-.9-3.8-2.9-3.8-2.2 0-3.1 1.5-3.1 3.8v8h-7V21Z" fill="#ffffff" />
      </svg>
    );
  }

  if (platform === "facebook") {
    return (
      <svg className="brand-logo" viewBox="0 0 48 48" aria-hidden="true">
        <rect width="48" height="48" rx="13" fill="#1877f2" />
        <path
          d="M29.8 15.9h4.1V9.3c-.7-.1-3.1-.3-5.9-.3-5.8 0-9.8 3.5-9.8 10v5.7h-6.5v7.4h6.5V48h7.8V32.1h6.4l1-7.4H26v-4.9c0-2.1.6-3.9 3.8-3.9Z"
          fill="#ffffff"
        />
      </svg>
    );
  }

  return (
    <svg className="brand-logo" viewBox="0 0 48 48" aria-hidden="true">
      <rect width="48" height="48" rx="11" fill="#ff0033" />
      <path d="M20 15.5 34 24 20 32.5v-17Z" fill="#ffffff" />
    </svg>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}
