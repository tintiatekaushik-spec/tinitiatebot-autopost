import {
  Clock, Loader2, Play, RefreshCw, X,
  CalendarClock, FileText, FolderSync, Pencil, Trash2, TrendingUp, Unplug
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FolderConnection, Platform, PlatformUpload } from "../shared/schema";
import { platformLabels, platforms } from "../shared/schema";
import { api } from "./lib/api";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, 
  Tooltip, ResponsiveContainer, CartesianGrid
} from "recharts";

// --- PURE CUSTOM SVG ICONS (NO EMOJIS) ---
const CustomIcon = ({ platform, size = 28 }: { platform: Platform; size?: number }) => {
  const s = size;
  const styles = { width: s, height: s, display: 'block' };

  switch(platform) {
    case 'youtube':
      return (
        <svg style={styles} viewBox="0 0 24 24" fill="none">
          <rect width="24" height="24" rx="6" fill="#FF0000" />
          <path d="M10 8.5L16 12L10 15.5V8.5Z" fill="#FFFFFF" />
        </svg>
      );
    case 'x':
      return (
        <svg style={styles} viewBox="0 0 24 24" fill="none">
          <rect width="24" height="24" rx="6" fill="#000000" />
          <path d="M17.176 5.5h1.935l-4.229 4.833 4.973 6.567h-3.892l-3.048-3.985-3.487 3.985H5.49l4.519-5.165L5.118 5.5h3.99l2.754 3.641L17.176 5.5zm-.678 10.226h1.072L7.61 6.72H6.455l9.043 9.006z" fill="#FFFFFF" />
        </svg>
      );
    case 'instagram':
      return (
        <svg style={styles} viewBox="0 0 24 24" fill="none">
          <defs>
            <linearGradient id="instaGrad" x1="2" y1="2" x2="22" y2="22">
              <stop offset="0%" stopColor="#FEDA75"/><stop offset="26%" stopColor="#FA7E1E"/>
              <stop offset="49%" stopColor="#D62976"/><stop offset="75%" stopColor="#962FBF"/>
              <stop offset="100%" stopColor="#4F5BD5"/>
            </linearGradient>
          </defs>
          <rect width="24" height="24" rx="6" fill="url(#instaGrad)" />
          <rect x="5.5" y="5.5" width="13" height="13" rx="3" fill="none" stroke="#FFFFFF" strokeWidth="2"/>
          <circle cx="17.5" cy="6.5" r="1.5" fill="#FFFFFF"/>
        </svg>
      );
    case 'linkedin':
      return (
        <svg style={styles} viewBox="0 0 24 24" fill="none">
          <rect width="24" height="24" rx="6" fill="#0A66C2" />
          <path d="M7.5 9.5H10V17H7.5V9.5Z" fill="#FFFFFF"/>
          <path d="M8.75 6.75C9.57843 6.75 10.25 7.42157 10.25 8.25C10.25 9.07843 9.57843 9.75 8.75 9.75C7.92157 9.75 7.25 9.07843 7.25 8.25C7.25 7.42157 7.92157 6.75 8.75 6.75Z" fill="#FFFFFF"/>
          <path d="M15.5 9.5C16.5 9.5 18 10.2 18 12.5V17H15.5V12.5C15.5 11.7 14.8 11.2 14 11.2C13.2 11.2 12.5 11.7 12.5 12.5V17H10V9.5H12.2V10.5C12.5 9.9 13.2 9.5 14 9.5H15.5Z" fill="#FFFFFF"/>
        </svg>
      );
    case 'facebook':
      return (
        <svg style={styles} viewBox="0 0 24 24" fill="none">
          <rect width="24" height="24" rx="6" fill="#1877F2" />
          <path d="M14.5 9.5H16V7H14.5C13.1 7 12 8.1 12 9.5V10H10V12.5H12V17H14.5V12.5H16.5L17 10H14.5V9.5Z" fill="#FFFFFF"/>
        </svg>
      );
    default: return null;
  }
};

const platformColor: Record<Platform, string> = {
  youtube: '#FF0000',
  x: '#000000',
  instagram: '#E1306C',
  linkedin: '#0A66C2',
  facebook: '#1877F2'
};

function toLocalDateTimeInputValue(date: Date) {
  const localTime = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localTime.toISOString().slice(0, 16);
}

export default function App() {
  const [uploads, setUploads] = useState<PlatformUpload[]>([]);
  const [folderConnections, setFolderConnections] = useState<FolderConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [folderPlatform, setFolderPlatform] = useState<Platform | null>(null);
  const [editingUpload, setEditingUpload] = useState<PlatformUpload | null>(null);

  const refresh = useCallback(async (showLoading = true) => {
    setError(null); if (showLoading) setLoading(true);
    try {
      const [latestUploads, latestConnections] = await Promise.all([api.uploads(), api.folderConnections()]);
      setUploads(latestUploads);
      setFolderConnections(latestConnections);
    }
    catch (e) { setError(e instanceof Error ? e.message : "Failed."); }
    finally { if (showLoading) setLoading(false); }
  }, []);

  useEffect(() => {
    void refresh();
    const refreshTimer = window.setInterval(() => void refresh(false), 5000);
    return () => window.clearInterval(refreshTimer);
  }, [refresh]);

  const stats = useMemo(() => ({
    total: uploads.length,
    queued: uploads.filter(u => u.status === "queued").length,
    posted: uploads.filter(u => u.status === "posted").length,
    failed: uploads.filter(u => u.status === "failed").length,
  }), [uploads]);

  const successRate = stats.total ? Math.round((stats.posted / stats.total) * 100) : 0;

  const distData = useMemo(() => {
    const counts: Record<string, number> = {};
    platforms.forEach(p => counts[p] = 0);
    uploads.forEach(u => counts[u.platform] = (counts[u.platform] || 0) + 1);
    return platforms.map(p => ({ name: platformLabels[p], value: counts[p] || 0, color: platformColor[p] }))
      .filter(d => d.value > 0);
  }, [uploads]);

  const activityData = useMemo(() => {
    const days: Record<string, number> = {};
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      days[key] = 0;
    }
    uploads.forEach(u => {
      const date = new Date(u.uploadedAt).toISOString().split('T')[0];
      if (days[date] !== undefined) days[date] = (days[date] || 0) + 1;
    });
    return Object.entries(days).map(([date, count]) => ({
      day: new Date(date).toLocaleDateString('en-US', { weekday: 'short' }),
      posts: count
    }));
  }, [uploads]);

  const handleRun = async () => {
    setIsRunning(true);
    try { await api.runAutomation(); alert("Automation started."); setTimeout(refresh, 5000); } 
    catch (e) { alert("Error: " + (e instanceof Error ? e.message : "Unknown")); }
    setIsRunning(false);
  };

  return (
    <div className="app-container">
      <header className="top-header">
        <div className="header-left" style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
          <div className="brand">Tinitiate<span>Autobot</span></div>
          <div className="header-stats">
            <span><span className="dot green"></span>{stats.posted}</span>
            <span><span className="dot yellow"></span>{stats.queued}</span>
            <span><span className="dot red"></span>{stats.failed}</span>
          </div>
        </div>
        <div className="header-right">
          <button className="btn-run" onClick={handleRun} disabled={isRunning}>
            {isRunning ? <Loader2 className="spin" size={16} /> : <Play size={16} />}
            {isRunning ? "Running..." : "Run Automation"}
          </button>
          <button className="btn-icon" onClick={() => void refresh()}><RefreshCw size={18} className={loading ? "spin" : ""} /></button>
        </div>
      </header>

      <div className="kpi-grid">
        <div className="kpi"><span>Total</span><strong>{stats.total}</strong></div>
        <div className="kpi"><span>Queued</span><strong>{stats.queued}</strong></div>
        <div className="kpi"><span>Posted</span><strong>{stats.posted}</strong></div>
        <div className="kpi"><span>Failed</span><strong>{stats.failed}</strong></div>
        <div className="kpi success"><span>Success Rate</span><strong>{successRate}% <TrendingUp size={18} /></strong></div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <section className="platform-hero">
        {platforms.map(p => {
          const items = uploads.filter(u => u.platform === p);
          const folderConnection = folderConnections.find(connection => connection.platform === p);
          const folderItems = items.filter(item => item.folderSource?.present);
          const q = items.filter(u => u.status === "queued").length;
          const po = items.filter(u => u.status === "posted").length;
          const f = items.filter(u => u.status === "failed").length;
          const prog = items.length ? Math.round((po / items.length) * 100) : 0;
          
          const radius = 22;
          const circumference = 2 * Math.PI * radius;
          const offset = circumference - (prog / 100) * circumference;

          return (
            <div 
              key={p} 
              className="platform-card-premium" 
              data-platform={p}
              onClick={() => setFolderPlatform(p)}
            >
              <div className="card-head">
                <div className="platform-icon-svg"><CustomIcon platform={p} size={28} /></div>
                <span className="p-name">{platformLabels[p]}</span>
                <span className="p-count">{items.length}</span>
              </div>
              
              <div className="p-progress-ring">
                <svg className="progress-ring-svg" viewBox="0 0 56 56">
                  <circle className="progress-ring-bg" cx="28" cy="28" r={radius} />
                  <circle 
                    className="progress-ring-fg" 
                    cx="28" cy="28" r={radius} 
                    stroke={platformColor[p]}
                    strokeDasharray={circumference} 
                    strokeDashoffset={offset} 
                  />
                </svg>
                <span className="ring-label">{prog}%</span>
              </div>

              <div className="p-stats">
                <span><span className="dot q"></span>{q} Queue</span>
                <span><span className="dot p"></span>{po} Posted</span>
                <span><span className="dot f"></span>{f} Failed</span>
              </div>

              <div className="p-actions">
                <button
                  type="button"
                  className={`p-folder-zone ${folderConnection ? "connected" : ""}`}
                  title={folderConnection?.folderPath ?? `Connect ${platformLabels[p]} folder`}
                  onClick={event => {
                    event.stopPropagation();
                    setFolderPlatform(p);
                  }}
                >
                  <FolderSync size={15} /> {folderConnection ? `Open folder (${folderItems.length})` : "Connect folder"}
                </button>
              </div>
            </div>
          );
        })}
      </section>

      <section className="charts-section">
        <div className="charts-grid">
          <div className="chart-box">
            <div className="chart-label">Platform Distribution</div>
            <div className="chart-wrap">
              {distData.length === 0 ? <div className="empty-state">Upload content to populate</div> : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={distData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2} dataKey="value">
                      {distData.map((d, i) => <Cell key={i} fill={d.color} stroke="#FFFFFF" strokeWidth={2} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
          <div className="chart-box">
            <div className="chart-label">7-Day Activity</div>
            <div className="chart-wrap">
              {activityData.every(d => d.posts === 0) ? <div className="empty-state">No posts in last 7 days</div> : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={activityData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                    <XAxis dataKey="day" stroke="#94A3B8" fontSize={12} />
                    <YAxis stroke="#94A3B8" fontSize={12} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px' }} />
                    <Bar dataKey="posts" fill="#4F46E5" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="feed-section">
        <div className="feed-header"><span>Recent Activity</span><span>{uploads.length} events</span></div>
        <div className="feed-list">
          {uploads.length === 0 ? <div className="empty-state" style={{ padding: '20px' }}>No activity yet</div> : 
            uploads.map(u => <FeedItem key={u.id} upload={u} onRefresh={refresh} onEdit={setEditingUpload} />)
          }
        </div>
      </section>

      {folderPlatform && (
        <FolderConnectionModal
          platform={folderPlatform}
          connection={folderConnections.find(item => item.platform === folderPlatform)}
          uploads={uploads.filter(item => item.platform === folderPlatform && item.folderSource?.present)}
          onEdit={setEditingUpload}
          onClose={() => setFolderPlatform(null)}
          onSuccess={refresh}
        />
      )}
      {editingUpload && (
        <EditPostModal upload={editingUpload} onClose={() => setEditingUpload(null)} onSuccess={refresh} />
      )}
    </div>
  );
}

function FeedItem({
  upload,
  onRefresh,
  onEdit,
}: {
  upload: PlatformUpload;
  onRefresh: () => void;
  onEdit: (upload: PlatformUpload) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const time = new Date(upload.uploadedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const scheduledTime = upload.scheduledAt
    ? new Date(upload.scheduledAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className="feed-item">
      <div className="feed-icon" style={{ background: platformColor[upload.platform] + '15', borderColor: platformColor[upload.platform] + '40' }}>
        <CustomIcon platform={upload.platform} size={18} />
      </div>
      <div className="feed-info">
        <span className="feed-name">{upload.originalName.slice(0, 30)}</span>
        <span className="feed-meta">
          {scheduledTime && <Clock size={12} />}
          {scheduledTime ? `Scheduled ${scheduledTime}` : upload.folderSource ? "Needs schedule" : time} · {upload.caption || 'No caption'}
        </span>
      </div>
      <span className={`badge badge-${upload.status}`}><span className="dot"></span>{upload.status}</span>
      {(upload.status === "queued" || upload.status === "failed") && (
        <button className="feed-action" title="Edit caption and schedule" onClick={() => onEdit(upload)}>
          <CalendarClock size={15} />
        </button>
      )}
      {!upload.folderSource && (
        <button className="feed-del" title="Delete post" onClick={async () => { if(confirm('Delete?')) { setDeleting(true); await api.deleteUpload(upload.id); onRefresh(); setDeleting(false); } }} disabled={deleting}>
          {deleting ? <Loader2 className="spin" size={14} /> : <Trash2 size={14} />}
        </button>
      )}
    </div>
  );
}

function FolderConnectionModal({
  platform,
  connection,
  uploads,
  onEdit,
  onClose,
  onSuccess,
}: {
  platform: Platform;
  connection?: FolderConnection;
  uploads: PlatformUpload[];
  onEdit: (upload: PlatformUpload) => void;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [folderPath, setFolderPath] = useState(connection?.folderPath ?? "");
  const [loading, setLoading] = useState(false);

  const connect = async () => {
    if (!folderPath.trim()) return alert("Enter the full folder path");
    setLoading(true);
    try {
      await api.connectFolder(platform, folderPath.trim());
      onSuccess();
    } catch (error) {
      alert("Error: " + (error instanceof Error ? error.message : "Could not connect folder"));
    } finally {
      setLoading(false);
    }
  };

  const disconnect = async () => {
    if (!connection || !confirm(`Disconnect the ${platformLabels[platform]} folder?`)) return;
    setLoading(true);
    try {
      await api.disconnectFolder(connection.id);
      onSuccess();
      onClose();
    } catch (error) {
      alert("Error: " + (error instanceof Error ? error.message : "Could not disconnect folder"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel compact-modal" onClick={event => event.stopPropagation()}>
        <div className="modal-head"><span>{platformLabels[platform]} Folder</span><button onClick={onClose}><X size={22} /></button></div>
        <div className="modal-body">
          <div className="folder-platform-row">
            <CustomIcon platform={platform} size={28} />
            <strong>{platformLabels[platform]}</strong>
            <span className={`connection-state ${connection?.lastError ? "error" : connection ? "active" : ""}`}>
              {connection?.lastError ? "Sync error" : connection ? "Connected" : "Not connected"}
            </span>
          </div>
          <div className="field">
            <label>Local folder path</label>
            <input
              type="text"
              value={folderPath}
              onChange={event => setFolderPath(event.target.value)}
              placeholder="C:\Users\YourName\Posts\Instagram"
            />
          </div>
          {connection?.lastScannedAt && (
            <div className="folder-scan-time">Last synced {new Date(connection.lastScannedAt).toLocaleString()}</div>
          )}
          {connection?.lastError && <div className="folder-error">{connection.lastError}</div>}
          {connection && (
            <div className="folder-posts">
              <div className="folder-posts-head"><strong>Folder posts</strong><span>{uploads.length}</span></div>
              {uploads.length === 0 ? (
                <div className="folder-posts-empty">No media files detected</div>
              ) : uploads.map(upload => (
                <button className="folder-post-row" key={upload.id} onClick={() => onEdit(upload)}>
                  <FileText size={18} />
                  <span className="folder-post-name">{upload.folderSource?.relativePath ?? upload.originalName}</span>
                  <span className="folder-post-schedule">
                    {upload.scheduledAt ? new Date(upload.scheduledAt).toLocaleString() : "Needs schedule"}
                  </span>
                  <CalendarClock size={16} />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="modal-foot folder-modal-actions">
          {connection && <button className="btn-danger" onClick={disconnect} disabled={loading}><Unplug size={15} /> Disconnect</button>}
          <button className="btn-primary" onClick={connect} disabled={loading}>
            {loading ? <Loader2 className="spin" size={17} /> : <FolderSync size={17} />}
            {connection ? "Update folder" : "Connect folder"}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditPostModal({
  upload,
  onClose,
  onSuccess,
}: {
  upload: PlatformUpload;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [title, setTitle] = useState(upload.title ?? upload.caption);
  const [caption, setCaption] = useState(upload.caption);
  const [schedule, setSchedule] = useState(
    upload.scheduledAt ? toLocalDateTimeInputValue(new Date(upload.scheduledAt)) : "",
  );
  const [minimumSchedule] = useState(() => toLocalDateTimeInputValue(new Date(Date.now() + 60_000)));
  const [loading, setLoading] = useState(false);
  const isYouTube = upload.platform === "youtube";

  const save = async () => {
    if (!caption.trim()) return alert("Caption is required");
    if (isYouTube && !title.trim()) return alert("Video title is required");

    const scheduledDate = schedule ? new Date(schedule) : null;
    if (upload.folderSource && !scheduledDate) return alert("Choose a schedule for this folder post");
    if (scheduledDate && (!Number.isFinite(scheduledDate.getTime()) || scheduledDate.getTime() <= Date.now())) {
      return alert("Choose a scheduled date and time in the future");
    }

    setLoading(true);
    try {
      await api.updateUploadDetails(upload.id, {
        title: isYouTube ? title.trim() : undefined,
        caption: caption.trim(),
        scheduledAt: scheduledDate?.toISOString() ?? null,
      });
      onSuccess();
      onClose();
    } catch (error) {
      alert("Error: " + (error instanceof Error ? error.message : "Could not save post"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel" onClick={event => event.stopPropagation()}>
        <div className="modal-head"><span>Schedule Post</span><button onClick={onClose}><X size={22} /></button></div>
        <div className="modal-body">
          <div className="edit-source-row">
            <CustomIcon platform={upload.platform} size={28} />
            <div><strong>{upload.originalName}</strong><span>{platformLabels[upload.platform]}</span></div>
          </div>
          {isYouTube && (
            <div className="field"><label>Video title</label><input type="text" value={title} onChange={event => setTitle(event.target.value)} /></div>
          )}
          <div className="field">
            <label>{isYouTube ? "Description" : "Caption"}</label>
            <textarea rows={5} value={caption} onChange={event => setCaption(event.target.value)} />
          </div>
          <div className="field">
            <label>Scheduled date and time</label>
            <input type="datetime-local" min={minimumSchedule} value={schedule} onChange={event => setSchedule(event.target.value)} />
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={loading}>
            {loading ? <Loader2 className="spin" size={17} /> : <Pencil size={17} />} Save schedule
          </button>
        </div>
      </div>
    </div>
  );
}
