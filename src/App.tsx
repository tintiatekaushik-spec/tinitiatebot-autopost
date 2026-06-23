import {
  Clock, Loader2, Play, RefreshCw, X,
  CalendarClock, FileText, FolderSync, Pencil, Trash2, TrendingUp, Unplug,
  ArrowRight, BriefcaseBusiness, KeyRound, LockKeyhole, LogOut, ShieldCheck, UsersRound,
  Activity, CalendarDays, ChevronLeft, ChevronRight, CircleAlert, CircleCheckBig,
  CircleDashed, FolderOpen, LayoutDashboard, ListFilter, Send, TimerReset,
  Bookmark, Eye, Heart, MessageCircle, MoreHorizontal, Repeat2, Share2, ThumbsUp
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FaFacebook, FaInstagram, FaLinkedin, FaXTwitter, FaYoutube } from "react-icons/fa6";
import type { FolderConnection, Platform, PlatformAccount, PlatformUpload } from "../shared/schema";
import { platformLabels, platforms } from "../shared/schema";
import { api } from "./lib/api";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, 
  Tooltip, ResponsiveContainer, CartesianGrid
} from "recharts";

// --- PLATFORM BRAND ICONS ---
const CustomIcon = ({ platform, size = 28 }: { platform: Platform; size?: number }) => {
  const iconProps = { size, style: { display: 'block' } };
  switch(platform) {
    case 'youtube': return <FaYoutube {...iconProps} color="#FF0000" />;
    case 'x': return <FaXTwitter {...iconProps} color="#000000" />;
    case 'instagram': return <FaInstagram {...iconProps} color="#E4405F" />;
    case 'linkedin': return <FaLinkedin {...iconProps} color="#0A66C2" />;
    case 'facebook': return <FaFacebook {...iconProps} color="#1877F2" />;
    default: return null;
  }
};

function StatusStateIcon({ state, size = 18 }: { state: string; size?: number }) {
  if (state === 'scheduled') return <CalendarClock size={size} />;
  if (state === 'queued') return <TimerReset size={size} />;
  if (state === 'processing') return <Send size={size} />;
  if (state === 'posted') return <CircleCheckBig size={size} />;
  return <CircleAlert size={size} />;
}

const platformColor: Record<Platform, string> = {
  youtube: '#FF0000',
  x: '#000000',
  instagram: '#E1306C',
  linkedin: '#0A66C2',
  facebook: '#1877F2'
};

const DONUT_CIRCUMFERENCE = 263.89;

function toLocalDateTimeInputValue(date: Date) {
  const localTime = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localTime.toISOString().slice(0, 16);
}

type UserRole = 'manager' | 'customer';

type AuthSession = {
  role: UserRole;
};

const AUTH_SESSION_KEY = 'tinitiate-autobot-session';

const loginCredentials: Record<UserRole, { username: string; password: string; label: string }> = {
  manager: {
    username: 'operations.manager',
    password: 'Tinitiate@2026',
    label: 'Operations Manager',
  },
  customer: {
    username: 'customer',
    password: 'Customer@2026',
    label: 'Customer',
  },
};

function readSavedSession(): AuthSession | null {
  try {
    const saved = window.sessionStorage.getItem(AUTH_SESSION_KEY);
    if (!saved) return null;
    const session = JSON.parse(saved) as AuthSession;
    return session.role === 'manager' || session.role === 'customer' ? session : null;
  } catch {
    return null;
  }
}

export default function App() {
  const [session, setSession] = useState<AuthSession | null>(readSavedSession);

  const signIn = (role: UserRole) => {
    const nextSession = { role };
    window.sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(nextSession));
    setSession(nextSession);
  };

  const signOut = () => {
    window.sessionStorage.removeItem(AUTH_SESSION_KEY);
    setSession(null);
  };

  return session
    ? <Dashboard role={session.role} onSignOut={signOut} />
    : <LandingPage onSignIn={signIn} />;
}

function LandingPage({ onSignIn }: { onSignIn: (role: UserRole) => void }) {
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const chooseRole = (role: UserRole) => {
    const credentials = loginCredentials[role];
    setSelectedRole(role);
    setUsername(credentials.username);
    setPassword(credentials.password);
    setError('');
  };

  const submit = () => {
    if (!selectedRole) {
      setError('Choose a login type first.');
      return;
    }

    const credentials = loginCredentials[selectedRole];
    if (username !== credentials.username || password !== credentials.password) {
      setError('The username or password does not match this login type.');
      return;
    }

    onSignIn(selectedRole);
  };

  return (
    <main className='auth-page'>
      <section className='auth-visual' aria-label='Social publishing workspace'>
        <div className='auth-visual-content'>
          <div className='auth-brand'>Tinitiate<span>Autobot</span></div>
          <div className='auth-message'>
            <p className='auth-kicker'>Social publishing operations</p>
            <h1>Plan the work. Publish at the right moment.</h1>
            <p>One workspace for your folders, schedules, and connected publishing channels.</p>
          </div>
          <div className='auth-channel-row' aria-label='Supported platforms'>
            <span>YouTube</span><span>Instagram</span><span>LinkedIn</span><span>Facebook</span><span>X</span>
          </div>
        </div>
      </section>

      <section className='auth-access' aria-labelledby='access-title'>
        <div className='auth-access-inner'>
          <div className='auth-heading'>
            <p className='auth-kicker'>Secure workspace</p>
            <h2 id='access-title'>Sign in</h2>
            <p>Select your workspace access, then continue with the temporary credentials.</p>
          </div>

          <div className='role-options' aria-label='Choose login type'>
            <button
              type='button'
              className={`role-option ${selectedRole === 'manager' ? 'selected' : ''}`}
              aria-pressed={selectedRole === 'manager'}
              onClick={() => chooseRole('manager')}
            >
              <BriefcaseBusiness size={21} />
              <span><strong>Operations Manager</strong><small>Manage content and publishing</small></span>
              <ArrowRight size={18} />
            </button>
            <button
              type='button'
              className={`role-option ${selectedRole === 'customer' ? 'selected' : ''}`}
              aria-pressed={selectedRole === 'customer'}
              onClick={() => chooseRole('customer')}
            >
              <UsersRound size={21} />
              <span><strong>Customer</strong><small>Access your publishing workspace</small></span>
              <ArrowRight size={18} />
            </button>
          </div>

          <form className='auth-form' onSubmit={event => { event.preventDefault(); submit(); }}>
            <label>
              <span>Username</span>
              <div className='auth-input'><KeyRound size={17} /><input value={username} onChange={event => setUsername(event.target.value)} autoComplete='username' placeholder='Select a login type' /></div>
            </label>
            <label>
              <span>Password</span>
              <div className='auth-input'><LockKeyhole size={17} /><input type='password' value={password} onChange={event => setPassword(event.target.value)} autoComplete='current-password' placeholder='Select a login type' /></div>
            </label>

            {selectedRole && (
              <div className='temporary-access'>
                <ShieldCheck size={17} />
                <span>Temporary access: <code>{loginCredentials[selectedRole].username}</code> / <code>{loginCredentials[selectedRole].password}</code></span>
              </div>
            )}
            {error && <p className='auth-error' role='alert'>{error}</p>}
            <button type='submit' className='auth-submit' disabled={!selectedRole}>
              Sign in as {selectedRole ? loginCredentials[selectedRole].label : '...'}<ArrowRight size={18} />
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}

function Dashboard({ role, onSignOut }: { role: UserRole; onSignOut: () => void }) {
  const [uploads, setUploads] = useState<PlatformUpload[]>([]);
  const [accounts, setAccounts] = useState<PlatformAccount[]>([]);
  const [folderConnections, setFolderConnections] = useState<FolderConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [folderPlatform, setFolderPlatform] = useState<Platform | null>(null);
  const [editingUpload, setEditingUpload] = useState<PlatformUpload | null>(null);

  const refresh = useCallback(async (showLoading = true) => {
    setError(null); if (showLoading) setLoading(true);
    try {
      const [latestUploads, latestAccounts, latestConnections] = await Promise.all([api.uploads(), api.accounts(), api.folderConnections()]);
      setUploads(latestUploads);
      setAccounts(latestAccounts);
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
    <MonitoringConsole
      role={role}
      uploads={uploads}
      accounts={accounts}
      folderConnections={folderConnections}
      loading={loading}
      error={error}
      isRunning={isRunning}
      onRun={handleRun}
      onRefresh={() => void refresh()}
      onSignOut={onSignOut}
      onOpenFolder={setFolderPlatform}
      onEdit={setEditingUpload}
      activeFolder={folderPlatform}
      editingUpload={editingUpload}
      onCloseFolder={() => setFolderPlatform(null)}
      onCloseEdit={() => setEditingUpload(null)}
    />
  );

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
        <div className='header-right'>
          <span className='session-role'>{loginCredentials[role].label}</span>
          <button className='btn-run' onClick={handleRun} disabled={isRunning}>
            {isRunning ? <Loader2 className='spin' size={16} /> : <Play size={16} />}
            {isRunning ? 'Running...' : 'Run Automation'}
          </button>
          <button className='btn-icon' title='Refresh dashboard' onClick={() => void refresh()}><RefreshCw size={18} className={loading ? 'spin' : ''} /></button>
          <button className='btn-icon logout-button' title='Sign out' onClick={onSignOut}><LogOut size={18} /></button>
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
          platform={folderPlatform!}
          accounts={accounts.filter(item => item.platform === folderPlatform!)}
          connections={folderConnections.filter(item => item.platform === folderPlatform!)}
          uploads={uploads.filter(item => item.platform === folderPlatform!)}
          onEdit={setEditingUpload}
          onClose={() => setFolderPlatform(null)}
          onSuccess={refresh}
        />
      )}
      {editingUpload && (
        <EditPostModal upload={editingUpload!} accounts={accounts.filter(item => item.platform === editingUpload!.platform)} onClose={() => setEditingUpload(null)} onSuccess={refresh} />
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

function toLocalDayKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function getAuditTimestamp(upload: PlatformUpload) {
  if (upload.status === 'posted') return upload.updatedAt;
  return upload.scheduledAt ?? upload.updatedAt ?? upload.uploadedAt;
}

function getAuditAction(upload: PlatformUpload) {
  if (upload.status === 'posted') return 'Published';
  if (upload.status === 'failed') return 'Needs attention';
  if (upload.status === 'processing') return 'Publishing now';
  if (upload.scheduledAt) return 'Scheduled';
  return 'Queued';
}

function formatEventTime(value: string) {
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatCalendarHeading(dayKey: string) {
  const date = new Date(`${dayKey}T12:00:00`);
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function MonitoringConsole({
  role,
  uploads,
  accounts,
  folderConnections,
  loading,
  error,
  isRunning,
  onRun,
  onRefresh,
  onSignOut,
  onOpenFolder,
  onEdit,
  activeFolder,
  editingUpload,
  onCloseFolder,
  onCloseEdit,
}: {
  role: UserRole;
  uploads: PlatformUpload[];
  accounts: PlatformAccount[];
  folderConnections: FolderConnection[];
  loading: boolean;
  error: string | null;
  isRunning: boolean;
  onRun: () => void;
  onRefresh: () => void;
  onSignOut: () => void;
  onOpenFolder: (platform: Platform) => void;
  onEdit: (upload: PlatformUpload) => void;
  activeFolder: Platform | null;
  editingUpload: PlatformUpload | null;
  onCloseFolder: () => void;
  onCloseEdit: () => void;
}) {
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState(() => toLocalDayKey(new Date()));
  const [platformFilter, setPlatformFilter] = useState<Platform | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<PlatformUpload['status'] | 'all'>('all');

  const stats = useMemo(() => {
    const posted = uploads.filter(upload => upload.status === 'posted').length;
    const queued = uploads.filter(upload => upload.status === 'queued').length;
    const scheduled = uploads.filter(upload => upload.status === 'queued' && upload.scheduledAt).length;
    const failed = uploads.filter(upload => upload.status === 'failed').length;
    const completed = posted + failed;
    return {
      total: uploads.length,
      posted,
      queued,
      scheduled,
      failed,
      successRate: completed ? Math.round((posted / completed) * 100) : 0,
    };
  }, [uploads]);

  const eventByDay = useMemo(() => {
    const events: Record<string, PlatformUpload[]> = {};
    uploads.forEach(upload => {
      const day = toLocalDayKey(getAuditTimestamp(upload));
      if (!day) return;
      events[day] ??= [];
      events[day].push(upload);
    });
    Object.values(events).forEach(dayEvents => dayEvents.sort((a, b) => Date.parse(getAuditTimestamp(b)) - Date.parse(getAuditTimestamp(a))));
    return events;
  }, [uploads]);

  const calendarDays = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const offset = new Date(year, month, 1).getDay();
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(year, month, index - offset + 1);
      const key = toLocalDayKey(date);
      return { date, key, currentMonth: date.getMonth() === month, events: eventByDay[key] ?? [] };
    });
  }, [calendarMonth, eventByDay]);

  const weeklyActivity = useMemo(() => {
    const counts: Record<string, number> = {};
    const dates: Date[] = [];
    for (let offset = 6; offset >= 0; offset -= 1) {
      const date = new Date();
      date.setHours(12, 0, 0, 0);
      date.setDate(date.getDate() - offset);
      dates.push(date);
      counts[toLocalDayKey(date)] = 0;
    }
    uploads.forEach(upload => {
      const key = toLocalDayKey(getAuditTimestamp(upload));
      if (key in counts) counts[key] += 1;
    });
    return dates.map(date => ({
      label: date.toLocaleDateString('en-US', { weekday: 'short' }),
      date: toLocalDayKey(date),
      count: counts[toLocalDayKey(date)]
    }));
  }, [uploads]);

  const upcoming = useMemo(() => uploads
    .filter(upload => upload.scheduledAt && upload.status !== 'posted')
    .sort((a, b) => Date.parse(a.scheduledAt ?? '') - Date.parse(b.scheduledAt ?? ''))
    .slice(0, 5), [uploads]);

  const auditItems = useMemo(() => uploads
    .filter(upload => platformFilter === 'all' || upload.platform === platformFilter)
    .filter(upload => statusFilter === 'all' || upload.status === statusFilter)
    .sort((a, b) => Date.parse(getAuditTimestamp(b)) - Date.parse(getAuditTimestamp(a)))
    .slice(0, 12), [uploads, platformFilter, statusFilter]);

  const selectedEvents = eventByDay[selectedDay] ?? [];
  const maxWeeklyActivity = Math.max(1, ...weeklyActivity.map(day => day.count));
  const monthLabel = calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const shiftCalendarMonth = (amount: number) => {
    const next = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + amount, 1);
    setCalendarMonth(next);
    setSelectedDay(toLocalDayKey(next));
  };

  const jumpTo = (sectionId: string) => {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <Workboard
      role={role}
      uploads={uploads}
      accounts={accounts}
      folderConnections={folderConnections}
      loading={loading}
      error={error}
      isRunning={isRunning}
      onRun={onRun}
      onRefresh={onRefresh}
      onSignOut={onSignOut}
      onOpenFolder={onOpenFolder}
      onEdit={onEdit}
      activeFolder={activeFolder}
      editingUpload={editingUpload}
      onCloseFolder={onCloseFolder}
      onCloseEdit={onCloseEdit}
    />
  );

  return (
    <main className='studio-shell'>
      <aside className='studio-rail'>
        <div className='studio-rail-top'>
          <div className='studio-wordmark'>
            <span>Tinitiate</span>
            <strong>Autobot</strong>
          </div>
          <span className='studio-rail-role'>{loginCredentials[role].label}</span>
        </div>
        <nav className='studio-navigation' aria-label='Workspace navigation'>
          <button type='button' className='studio-nav-item active' onClick={() => jumpTo('overview')}><LayoutDashboard size={18} /><span>Overview</span></button>
          <button type='button' className='studio-nav-item' onClick={() => jumpTo('analytics')}><Activity size={18} /><span>Analytics</span></button>
          <button type='button' className='studio-nav-item' onClick={() => jumpTo('calendar')}><CalendarDays size={18} /><span>Calendar</span></button>
          <button type='button' className='studio-nav-item' onClick={() => jumpTo('audit')}><ListFilter size={18} /><span>Audit reports</span></button>
          <button type='button' className='studio-nav-item' onClick={() => jumpTo('folders')}><FolderOpen size={18} /><span>Media folders</span></button>
        </nav>
        <div className='studio-channel-list'>
          <span>Channels</span>
          {platforms.map(platform => {
            const count = uploads.filter(upload => upload.platform === platform).length;
            return <button type='button' key={platform} title={`Open ${platformLabels[platform]} folder`} onClick={() => onOpenFolder(platform)}><CustomIcon platform={platform} size={17} /><span>{platformLabels[platform]}</span><small>{count}</small></button>;
          })}
        </div>
        <div className='studio-rail-footer'><CircleDashed size={14} />Monitor online</div>
      </aside>

      <section className='monitoring-shell'>
      <header className='monitoring-header'>
        <div className='monitoring-brand-wrap'>
          <div className='monitoring-brand'><span>Workspace</span><strong>Publishing command center</strong></div>
          <span className='live-indicator'><CircleDashed size={14} className={loading ? 'spin' : ''} />Live</span>
        </div>
        <div className='monitoring-actions'>
          <span className='session-role'>{loginCredentials[role].label}</span>
          <button className='run-automation-button' onClick={onRun} disabled={isRunning}>
            {isRunning ? <Loader2 className='spin' size={16} /> : <Send size={16} />}
            {isRunning ? 'Publishing' : 'Run automation'}
          </button>
          <button className='tool-icon-button' title='Refresh monitoring data' onClick={onRefresh}><RefreshCw size={18} className={loading ? 'spin' : ''} /></button>
          <button className='tool-icon-button signout-tool' title='Sign out' onClick={onSignOut}><LogOut size={18} /></button>
        </div>
      </header>

      {error && <div className='error-banner'>{error}</div>}

      <section className='control-room-heading' id='overview' aria-labelledby='control-room-title'>
        <div>
          <p className='section-kicker'>Publishing operations</p>
          <h1 id='control-room-title'>Control room</h1>
        </div>
        <div className='control-room-state'>
          <Activity size={17} />
          <span>{stats.scheduled} scheduled</span>
          <span>{stats.queued} in queue</span>
          <span>{stats.failed} need review</span>
        </div>
      </section>

      <section className='metric-grid' aria-label='Post metrics'>
        <article className='metric-tile'><span className='metric-icon neutral'><LayoutDashboard size={19} /></span><div><span>All posts</span><strong>{stats.total}</strong></div></article>
        <article className='metric-tile'><span className='metric-icon success'><CircleCheckBig size={19} /></span><div><span>Published</span><strong>{stats.posted}</strong></div></article>
        <article className='metric-tile'><span className='metric-icon schedule'><CalendarClock size={19} /></span><div><span>Scheduled</span><strong>{stats.scheduled}</strong></div></article>
        <article className='metric-tile'><span className='metric-icon warning'><TimerReset size={19} /></span><div><span>Unscheduled queue</span><strong>{Math.max(0, stats.queued - stats.scheduled)}</strong></div></article>
        <article className='metric-tile'><span className='metric-icon alert'><CircleAlert size={19} /></span><div><span>Delivery rate</span><strong>{stats.successRate}%</strong></div></article>
      </section>

      <section className='insight-grid' id='analytics' aria-label='Post analytics and schedule watch'>
        <article className='report-panel analytics-panel'>
          <header className='panel-header'>
            <div><p className='section-kicker'>Post analytics</p><h2>Seven-day activity</h2></div>
            <span className='panel-value'>{weeklyActivity.reduce((sum, day) => sum + day.count, 0)} events</span>
          </header>
          <div className='analytics-bars' role='img' aria-label='Post activity for the last seven days'>
            {weeklyActivity.map(day => (
              <div className='analytics-bar-column' key={day.date}>
                <span className='analytics-count'>{day.count || ''}</span>
                <div className='analytics-track'><div className='analytics-bar' style={{ height: `${Math.max(8, Math.round((day.count / maxWeeklyActivity) * 100))}%` }} /></div>
                <span>{day.label}</span>
              </div>
            ))}
          </div>
          <div className='analytics-footer'>
            <span><CircleCheckBig size={15} />{stats.posted} delivered</span>
            <span><CalendarClock size={15} />{stats.scheduled} scheduled</span>
            <span><CircleAlert size={15} />{stats.failed} exceptions</span>
          </div>
        </article>

        <article className='report-panel schedule-watch-panel'>
          <header className='panel-header'>
            <div><p className='section-kicker'>Schedule watch</p><h2>Next actions</h2></div>
            <CalendarDays size={20} />
          </header>
          <div className='schedule-watch-list'>
            {upcoming.length === 0 ? <div className='panel-empty'>No scheduled posts</div> : upcoming.map(upload => (
              <button key={upload.id} className='schedule-watch-row' onClick={() => onEdit(upload)}>
                <CustomIcon platform={upload.platform} size={18} />
                <span><strong>{upload.title || upload.originalName}</strong><small>{formatEventTime(upload.scheduledAt ?? upload.updatedAt)}</small></span>
                <ChevronRight size={17} />
              </button>
            ))}
          </div>
        </article>
      </section>

      <section className='report-workspace'>
        <article className='report-panel calendar-panel' id='calendar'>
          <header className='panel-header calendar-panel-header'>
            <div><p className='section-kicker'>Post calendar</p><h2>{monthLabel}</h2></div>
            <div className='calendar-navigation'>
              <button className='tool-icon-button' title='Previous month' onClick={() => shiftCalendarMonth(-1)}><ChevronLeft size={18} /></button>
              <button className='tool-icon-button' title='Next month' onClick={() => shiftCalendarMonth(1)}><ChevronRight size={18} /></button>
            </div>
          </header>
          <div className='calendar-workspace'>
            <div className='calendar-grid' role='grid' aria-label={`Post calendar for ${monthLabel}`}>
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => <span className='calendar-weekday' key={day}>{day}</span>)}
              {calendarDays.map(day => (
                <button
                  key={day.key}
                  type='button'
                  className={`calendar-day ${day.currentMonth ? '' : 'outside-month'} ${day.key === selectedDay ? 'selected-day' : ''} ${day.events.length ? 'has-events' : ''}`}
                  onClick={() => setSelectedDay(day.key)}
                  aria-label={`${formatCalendarHeading(day.key)}, ${day.events.length} events`}
                >
                  <span className='calendar-day-number'>{day.date.getDate()}</span>
                  <span className='calendar-event-icons'>
                    {day.events.slice(0, 3).map(upload => <CustomIcon key={upload.id} platform={upload.platform} size={14} />)}
                    {day.events.length > 3 && <span className='calendar-more-events'>+{day.events.length - 3}</span>}
                  </span>
                </button>
              ))}
            </div>
            <aside className='calendar-detail' aria-live='polite'>
              <div className='calendar-detail-title'><span>{formatCalendarHeading(selectedDay)}</span><strong>{selectedEvents.length}</strong></div>
              <div className='calendar-detail-list'>
                {selectedEvents.length === 0 ? <div className='panel-empty'>No posting activity</div> : selectedEvents.map(upload => (
                  <div className='calendar-detail-row' key={upload.id}>
                    <CustomIcon platform={upload.platform} size={18} />
                    <div><strong>{upload.title || upload.originalName}</strong><small>{platformLabels[upload.platform]} · {getAuditAction(upload)}</small></div>
                    <time>{new Date(getAuditTimestamp(upload)).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</time>
                  </div>
                ))}
              </div>
            </aside>
          </div>
        </article>

        <article className='report-panel audit-panel' id='audit'>
          <header className='panel-header audit-header'>
            <div><p className='section-kicker'>Auditing and reports</p><h2>Post audit trail</h2></div>
            <ListFilter size={20} />
          </header>
          <div className='audit-filters'>
            <label><span>Platform</span><select value={platformFilter} onChange={event => setPlatformFilter(event.target.value as Platform | 'all')}><option value='all'>All platforms</option>{platforms.map(platform => <option key={platform} value={platform}>{platformLabels[platform]}</option>)}</select></label>
            <label><span>Status</span><select value={statusFilter} onChange={event => setStatusFilter(event.target.value as PlatformUpload['status'] | 'all')}><option value='all'>All statuses</option><option value='posted'>Published</option><option value='queued'>Queued</option><option value='processing'>Processing</option><option value='failed'>Needs attention</option></select></label>
          </div>
          <div className='audit-list'>
            {auditItems.length === 0 ? <div className='panel-empty'>No matching post events</div> : auditItems.map(upload => (
              <div className='audit-row' key={upload.id}>
                <div className={`audit-status audit-status-${upload.status}`}><CustomIcon platform={upload.platform} size={17} /></div>
                <div className='audit-row-main'><strong>{upload.title || upload.originalName}</strong><span>{platformLabels[upload.platform]} · {getAuditAction(upload)}</span></div>
                <div className='audit-row-time'><time>{formatEventTime(getAuditTimestamp(upload))}</time>{(upload.status === 'queued' || upload.status === 'failed') && <button title='Edit post details' onClick={() => onEdit(upload)}><Pencil size={14} /></button>}</div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className='channel-metrics-section' id='folders' aria-labelledby='channel-metrics-title'>
        <header className='section-header'><div><p className='section-kicker'>Post metrics</p><h2 id='channel-metrics-title'>Channel delivery health</h2></div><span>{folderConnections.length} folders connected</span></header>
        <div className='channel-metrics-table'>
          {platforms.map(platform => {
            const channelPosts = uploads.filter(upload => upload.platform === platform);
            const published = channelPosts.filter(upload => upload.status === 'posted').length;
            const failed = channelPosts.filter(upload => upload.status === 'failed').length;
            const completed = published + failed;
            const delivery = completed ? Math.round((published / completed) * 100) : 0;
            const connection = folderConnections.find(item => item.platform === platform);
            return (
              <button key={platform} className='channel-metric-row' onClick={() => onOpenFolder(platform)} title={`${connection ? 'Manage' : 'Connect'} ${platformLabels[platform]} folder`}>
                <CustomIcon platform={platform} size={22} />
                <span className='channel-metric-name'><strong>{platformLabels[platform]}</strong><small>{connection ? 'Folder connected' : 'Folder not connected'}</small></span>
                <span><strong>{channelPosts.length}</strong><small>posts</small></span>
                <span><strong>{published}</strong><small>published</small></span>
                <span className={failed ? 'channel-attention' : ''}><strong>{failed}</strong><small>exceptions</small></span>
                <span className='channel-delivery'><strong>{delivery}%</strong><small>delivery</small></span>
                <FolderOpen size={18} />
              </button>
            );
          })}
        </div>
      </section>

      {activeFolder && (
        <FolderConnectionModal
          platform={activeFolder!}
          accounts={accounts.filter(item => item.platform === activeFolder!)}
          connections={folderConnections.filter(item => item.platform === activeFolder!)}
          uploads={uploads.filter(item => item.platform === activeFolder!)}
          onEdit={onEdit}
          onClose={onCloseFolder}
          onSuccess={onRefresh}
        />
      )}
      {editingUpload && <EditPostModal upload={editingUpload!} accounts={accounts.filter(item => item.platform === editingUpload!.platform)} onClose={onCloseEdit} onSuccess={onRefresh} />}
      </section>
    </main>
  );
}

function Workboard({
  role,
  uploads,
  accounts,
  folderConnections,
  loading,
  error,
  isRunning,
  onRun,
  onRefresh,
  onSignOut,
  onOpenFolder,
  onEdit,
  activeFolder,
  editingUpload,
  onCloseFolder,
  onCloseEdit,
}: {
  role: UserRole;
  uploads: PlatformUpload[];
  accounts: PlatformAccount[];
  folderConnections: FolderConnection[];
  loading: boolean;
  error: string | null;
  isRunning: boolean;
  onRun: () => void;
  onRefresh: () => void;
  onSignOut: () => void;
  onOpenFolder: (platform: Platform) => void;
  onEdit: (upload: PlatformUpload) => void;
  activeFolder: Platform | null;
  editingUpload: PlatformUpload | null;
  onCloseFolder: () => void;
  onCloseEdit: () => void;
}) {
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState(() => toLocalDayKey(new Date()));
  const [activeView, setActiveView] = useState('overview');
  const accountById = useMemo(() => new Map(accounts.map(account => [account.id, account])), [accounts]);
  const metrics = useMemo(() => {
    const posted = uploads.filter(upload => upload.status === 'posted').length;
    const failed = uploads.filter(upload => upload.status === 'failed').length;
    const queued = uploads.filter(upload => upload.status === 'queued').length;
    const scheduled = uploads.filter(upload => upload.status === 'queued' && upload.scheduledAt).length;
    return { posted, failed, queued, scheduled, total: uploads.length };
  }, [uploads]);

  const eventByDay = useMemo(() => {
    const events: Record<string, PlatformUpload[]> = {};
    uploads.forEach(upload => {
      const dayKey = toLocalDayKey(getAuditTimestamp(upload));
      if (!dayKey) return;
      events[dayKey] ??= [];
      events[dayKey].push(upload);
    });
    Object.values(events).forEach(dayEvents => dayEvents.sort((a, b) => Date.parse(getAuditTimestamp(b)) - Date.parse(getAuditTimestamp(a))));
    return events;
  }, [uploads]);

  const calendarDays = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const offset = new Date(year, month, 1).getDay();
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(year, month, index - offset + 1);
      const dayKey = toLocalDayKey(date);
      return { date, dayKey, currentMonth: date.getMonth() === month, events: eventByDay[dayKey] ?? [] };
    });
  }, [calendarMonth, eventByDay]);

  const upcoming = useMemo(() => uploads
    .filter(upload => upload.scheduledAt && upload.status !== 'posted')
    .sort((a, b) => Date.parse(a.scheduledAt ?? '') - Date.parse(b.scheduledAt ?? ''))
    .slice(0, 1), [uploads]);

  const statusMix = useMemo(() => [
    { id: 'scheduled', label: 'Scheduled', detail: 'Timed', value: uploads.filter(upload => upload.status === 'queued' && upload.scheduledAt).length, color: '#318EC2' },
    { id: 'queued', label: 'In queue', detail: 'Needs a time', value: uploads.filter(upload => upload.status === 'queued' && !upload.scheduledAt).length, color: '#B17A08' },
    { id: 'processing', label: 'Publishing', detail: 'In progress', value: uploads.filter(upload => upload.status === 'processing').length, color: '#7367D8' },
    { id: 'posted', label: 'Delivered', detail: 'Complete', value: uploads.filter(upload => upload.status === 'posted').length, color: '#14895E' },
    { id: 'failed', label: 'Review', detail: 'Needs input', value: uploads.filter(upload => upload.status === 'failed').length, color: '#C65448' },
  ], [uploads]);

  const broadcastMix = useMemo(() => platforms.map(platform => ({
    platform,
    label: platformLabels[platform],
    value: uploads.filter(upload => upload.platform === platform && upload.status === 'posted').length,
  })), [uploads]);

  const selectedEvents = eventByDay[selectedDay] ?? [];
  const monthLabel = calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const nextAction = upcoming[0];
  const statusTotal = statusMix.reduce((total, status) => total + status.value, 0);
  const reviewQueue = useMemo(() => {
    const priority: Record<PlatformUpload['status'], number> = { failed: 0, queued: 1, processing: 2, posted: 3 };
    return uploads
      .filter(upload => upload.status !== 'posted')
      .sort((a, b) => {
        const statusDiff = priority[a.status] - priority[b.status];
        if (statusDiff) return statusDiff;
        const aTime = a.scheduledAt ? Date.parse(a.scheduledAt) : Number.MAX_SAFE_INTEGER;
        const bTime = b.scheduledAt ? Date.parse(b.scheduledAt) : Number.MAX_SAFE_INTEGER;
        return aTime - bTime || Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
      });
  }, [uploads]);
  const deliveredTotal = broadcastMix.reduce((total, channel) => total + channel.value, 0);
  const broadcastSegments = useMemo(() => {
    if (!deliveredTotal) return [];
    let offset = 0;
    return broadcastMix.filter(channel => channel.value > 0).map(channel => {
      const length = (channel.value / deliveredTotal) * DONUT_CIRCUMFERENCE;
      const segment = { ...channel, length, offset };
      offset += length;
      return segment;
    });
  }, [broadcastMix, deliveredTotal]);
  const trackingSummary = `${metrics.total} tracked ${metrics.total === 1 ? 'post' : 'posts'} across ${accounts.length} publishing ${accounts.length === 1 ? 'account' : 'accounts'}`;

  const shiftCalendarMonth = (amount: number) => {
    const next = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + amount, 1);
    setCalendarMonth(next);
    setSelectedDay(toLocalDayKey(next));
  };

  const navigateWorkboard = (sectionId: string) => {
    setActiveView(sectionId);
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <main className='workboard-app'>
      <section className='workboard-shell'>
      <header className='workboard-topbar'>
        <div className='workboard-brand'><span>TA</span><div><strong>Tinitiate</strong><small>Autobot</small></div></div>
        <nav className='workboard-nav' aria-label='Publishing workspace'>
          <button className={activeView === 'overview' ? 'active' : ''} onClick={() => navigateWorkboard('overview')}><LayoutDashboard size={16} />Overview</button>
          <button className={activeView === 'channels' ? 'active' : ''} onClick={() => navigateWorkboard('channels')}><FolderOpen size={16} />Channels</button>
          <button className={activeView === 'operations' ? 'active' : ''} onClick={() => navigateWorkboard('operations')}><ListFilter size={16} />Review <small>{reviewQueue.length}</small></button>
          <button className={activeView === 'schedule' ? 'active' : ''} onClick={() => navigateWorkboard('schedule')}><CalendarDays size={16} />Schedule</button>
        </nav>
        <div className='workboard-actions'>
          <span className='workboard-status'><CircleDashed size={14} className={loading ? 'spin' : ''} />Live</span>
          <button className='workboard-run' onClick={onRun} disabled={isRunning}>{isRunning ? <Loader2 className='spin' size={16} /> : <Send size={16} />}{isRunning ? 'Publishing' : 'Run automation'}</button>
          <button className='workboard-tool' title='Refresh workspace' onClick={onRefresh}><RefreshCw size={18} className={loading ? 'spin' : ''} /></button>
          <span className='workboard-user' title={loginCredentials[role].label}>{role === 'manager' ? 'OM' : 'CU'}</span>
          <button className='workboard-tool signout-tool' title='Sign out' onClick={onSignOut}><LogOut size={18} /></button>
        </div>
      </header>

      {error && <div className='error-banner'>{error}</div>}

      <section className='workboard-intro' id='overview'>
        <div className='operations-hero-copy'><p className='section-kicker'>Publishing command center</p><h1>Control every post.<br />Across every channel.</h1><span>Review content, manage delivery status, and coordinate your publishing calendar from one operational workspace.</span></div>
        <div className='operations-hero-stats'>
          <article><span>Tracked content</span><strong>{metrics.total}</strong><small>Across the workspace</small></article>
          <article><span>Publishing accounts</span><strong>{accounts.length}</strong><small>{folderConnections.length} media folders online</small></article>
          <article><span>Open reviews</span><strong>{reviewQueue.length}</strong><small>Require attention</small></article>
          <article><span>Automation</span><strong className='automation-state'>{isRunning ? 'Running' : 'Ready'}</strong><small>{isRunning ? 'Publishing now' : 'Standing by'}</small></article>
        </div>
      </section>

      <section className='platform-metrics' id='channels' aria-labelledby='post-metrics-heading'>
        <header className='workboard-section-head'><div><p className='section-kicker'>Channel control</p><h2 id='post-metrics-heading'>Publishing channels</h2></div><span>Open a channel to manage its media</span></header>
        <div className='platform-metric-grid'>
          {platforms.map(platform => {
            const platformPosts = uploads.filter(upload => upload.platform === platform);
            const platformAccounts = accounts.filter(account => account.platform === platform);
            return (
              <button key={platform} className={`platform-metric-card platform-${platform}`} onClick={() => onOpenFolder(platform)} title={`Manage ${platformLabels[platform]} folder`}>
                <div className='platform-metric-card-top'><CustomIcon platform={platform} size={34} /><span>{platformLabels[platform]}</span><ChevronRight size={16} /></div>
                <div className='platform-metric-number'><strong>{platformPosts.length}</strong><span>posts</span></div>
                <div className='platform-account-summary'><UsersRound size={13} /><span>{platformAccounts.length} {platformAccounts.length === 1 ? 'account' : 'accounts'}</span></div>
              </button>
            );
          })}
        </div>
      </section>

      <section className='workboard-focus-grid' id='operations'>
        <section className='operations-summary-grid'>
          <article className='status-board'>
            <header className='workboard-section-head'><div><p className='section-kicker'>Live workload</p><h2>Post status</h2></div><span>{statusTotal} tracked</span></header>
            <div className='status-pod-list' role='img' aria-label={`${statusMix.map(status => `${status.value} ${status.label}`).join(', ')}`}>
              {statusMix.map(status => <div className='status-pod' key={status.id}><span className='status-pod-icon' style={{ color: status.color, backgroundColor: `${status.color}18` }}><StatusStateIcon state={status.id} size={19} /></span><div><strong>{status.value}</strong><span>{status.label}</span><small>{status.detail}</small></div></div>)}
            </div>
          </article>
          <article className='review-queue-board'>
            <header className='workboard-section-head'><div><p className='section-kicker'>Pre-publish review</p><h2>Review queue</h2></div><span>{reviewQueue.length} open</span></header>
            <div className='review-queue-list'>{reviewQueue.length === 0 ? <div className='review-queue-empty'><CircleCheckBig size={24} /><strong>Nothing waiting for review.</strong><span>Every tracked post has been delivered.</span></div> : reviewQueue.map(upload => (
              <button className='review-queue-row' key={upload.id} onClick={() => onEdit(upload)}>
                <div className={`review-queue-media review-${upload.status}`}><PostMediaPreview upload={upload} compact /><i><CustomIcon platform={upload.platform} size={17} /></i></div>
                <span><strong>{upload.title || upload.originalName}</strong><small>{accountById.get(upload.accountId)?.handle ?? platformLabels[upload.platform]} · {upload.status === 'failed' ? 'Needs review' : upload.scheduledAt ? formatEventTime(upload.scheduledAt) : upload.status === 'processing' ? 'Publishing now' : 'Needs a publish time'}</small></span>
                <Pencil size={14} />
              </button>
            ))}</div>
            {reviewQueue.length > 0 && <footer className='review-queue-footer'>Select any post to inspect its platform preview and edit details.</footer>}
          </article>
        </section>

        <article className='broadcast-mix-board'>
          <header className='workboard-section-head'><div><p className='section-kicker'>Publishing performance</p><h2>Delivery mix</h2></div><CircleCheckBig size={20} /></header>
          <div className='broadcast-mix-content'>
            <div className='broadcast-donut' role='img' aria-label={`${deliveredTotal} successful deliveries distributed across channels`}>
              <svg viewBox='0 0 120 120' aria-hidden='true'>
                <circle className='broadcast-donut-track' cx='60' cy='60' r='42' />
                {broadcastSegments.map(channel => <circle key={channel.platform} className='broadcast-donut-segment' cx='60' cy='60' r='42' stroke={platformColor[channel.platform]} strokeDasharray={`${Math.max(0, channel.length - 3)} ${DONUT_CIRCUMFERENCE}`} strokeDashoffset={-channel.offset} />)}
              </svg>
              <div className='broadcast-donut-center'><strong>{deliveredTotal}</strong><span>delivered</span></div>
            </div>
            <div className='broadcast-legend' aria-label='Delivered posts by channel'>
              {broadcastMix.map(channel => {
                const share = deliveredTotal ? Math.round((channel.value / deliveredTotal) * 100) : 0;
                return <div className={channel.value ? '' : 'inactive-channel'} key={channel.platform}><span style={{ backgroundColor: platformColor[channel.platform] }} /><strong>{channel.label}</strong><small>{channel.value} · {share}%</small></div>;
              })}
            </div>
          </div>
          <footer className='broadcast-mix-footer'>{deliveredTotal ? 'Share of successful deliveries across every channel.' : 'Delivery results will appear here as channels publish posts.'}</footer>
        </article>

        <article className='legacy-next-action-board'>
          <header className='workboard-section-head'><div><p className='section-kicker'>Next action</p><h2>{nextAction ? 'Ready for its moment' : 'Nothing scheduled yet'}</h2></div><CalendarClock size={20} /></header>
          {nextAction ? (
            <button className='next-action-content' onClick={() => onEdit(nextAction)}>
              <CustomIcon platform={nextAction.platform} size={29} />
              <span><strong>{nextAction.title || nextAction.originalName}</strong><small>{accountById.get(nextAction.accountId)?.handle ?? platformLabels[nextAction.platform]} · {formatEventTime(nextAction.scheduledAt ?? nextAction.updatedAt)}</small></span>
              <Pencil size={16} />
            </button>
          ) : <div className='next-action-empty'><CalendarDays size={24} /><span>Choose a post and set its date from the channel portfolio.</span></div>}
        </article>
      </section>

      <section className='workboard-calendar-section' id='schedule'>
        <article className='calendar-board'>
          <header className='workboard-section-head'><div><p className='section-kicker'>Schedule map</p><h2>{monthLabel}</h2></div><div className='calendar-navigation'><button className='workboard-tool' title='Previous month' onClick={() => shiftCalendarMonth(-1)}><ChevronLeft size={18} /></button><button className='workboard-tool' title='Next month' onClick={() => shiftCalendarMonth(1)}><ChevronRight size={18} /></button></div></header>
          <div className='workboard-calendar'>
            <div className='calendar-grid' role='grid' aria-label={`Post calendar for ${monthLabel}`}>
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => <span className='calendar-weekday' key={day}>{day}</span>)}
              {calendarDays.map(day => <button type='button' key={day.dayKey} className={`calendar-day ${day.currentMonth ? '' : 'outside-month'} ${day.dayKey === selectedDay ? 'selected-day' : ''} ${day.events.length ? 'has-events' : ''}`} onClick={() => setSelectedDay(day.dayKey)} aria-label={`${formatCalendarHeading(day.dayKey)}, ${day.events.length} events`}><span className='calendar-day-number'>{day.date.getDate()}</span><span className='calendar-event-icons'>{day.events.slice(0, 3).map(upload => <CustomIcon key={upload.id} platform={upload.platform} size={14} />)}{day.events.length > 3 && <span className='calendar-more-events'>+{day.events.length - 3}</span>}</span></button>)}
            </div>
            <aside className='workboard-day-inspector'><div><span>{formatCalendarHeading(selectedDay)}</span><strong>{selectedEvents.length}</strong></div>{selectedEvents.length === 0 ? <p>No publishing activity on this day.</p> : selectedEvents.map(upload => <button key={upload.id} onClick={() => onEdit(upload)}><CustomIcon platform={upload.platform} size={17} /><span><strong>{upload.title || upload.originalName}</strong><small>{accountById.get(upload.accountId)?.handle ?? platformLabels[upload.platform]} · {getAuditAction(upload)}</small></span><time>{new Date(getAuditTimestamp(upload)).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</time></button>)}</aside>
          </div>
        </article>

        <article className='legacy-broadcast-mix-board'>
          <header className='workboard-section-head'><div><p className='section-kicker'>Broadcast output</p><h2>Channel distribution</h2></div><CircleCheckBig size={20} /></header>
          <div className='broadcast-mix-content'>
            <div className='broadcast-donut' role='img' aria-label={`${deliveredTotal} successful deliveries distributed across channels`}>
              <svg viewBox='0 0 120 120' aria-hidden='true'>
                <circle className='broadcast-donut-track' cx='60' cy='60' r='42' />
                {broadcastSegments.map(channel => <circle key={channel.platform} className='broadcast-donut-segment' cx='60' cy='60' r='42' stroke={platformColor[channel.platform]} strokeDasharray={`${Math.max(0, channel.length - 3)} ${DONUT_CIRCUMFERENCE}`} strokeDashoffset={-channel.offset} />)}
              </svg>
              <div className='broadcast-donut-center'><strong>{deliveredTotal}</strong><span>delivered</span></div>
            </div>
            <div className='broadcast-legend' aria-label='Delivered posts by channel'>
              {broadcastMix.map(channel => {
                const share = deliveredTotal ? Math.round((channel.value / deliveredTotal) * 100) : 0;
                return <div className={channel.value ? '' : 'inactive-channel'} key={channel.platform}><span style={{ backgroundColor: platformColor[channel.platform] }} /><strong>{channel.label}</strong><small>{channel.value} · {share}%</small></div>;
              })}
            </div>
          </div>
          <footer className='broadcast-mix-footer'>{deliveredTotal ? 'Share of successful deliveries across every channel.' : 'Your broadcast mix will appear as channels complete deliveries.'}</footer>
        </article>
      </section>

      {activeFolder && <FolderConnectionModal platform={activeFolder} accounts={accounts.filter(item => item.platform === activeFolder)} connections={folderConnections.filter(item => item.platform === activeFolder)} uploads={uploads.filter(item => item.platform === activeFolder)} onEdit={onEdit} onClose={onCloseFolder} onSuccess={onRefresh} />}
      {editingUpload && <EditPostModal upload={editingUpload} accounts={accounts.filter(item => item.platform === editingUpload.platform)} onClose={onCloseEdit} onSuccess={onRefresh} />}
      </section>
    </main>
  );
}

function FolderConnectionModal({ platform, accounts, connections, uploads, onEdit, onClose, onSuccess }: {
  platform: Platform;
  accounts: PlatformAccount[];
  connections: FolderConnection[];
  uploads: PlatformUpload[];
  onEdit: (upload: PlatformUpload) => void;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formAccount, setFormAccount] = useState<PlatformAccount | 'new' | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [handle, setHandle] = useState('');
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginConfirmation, setLoginConfirmation] = useState('');
  const [password, setPassword] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [folderPath, setFolderPath] = useState('');
  const [loading, setLoading] = useState(false);

  const selectedAccount = accounts.find(account => account.id === selectedId);
  const connection = connections.find(item => item.accountId === selectedId);
  const accountUploads = uploads.filter(upload => upload.accountId === selectedId);

  useEffect(() => {
    setFolderPath(connection?.folderPath ?? '');
  }, [connection?.id, connection?.folderPath]);

  const openAccountForm = (account?: PlatformAccount) => {
    setFormAccount(account ?? 'new');
    setDisplayName(account?.displayName ?? '');
    setHandle(account?.handle ?? '');
    setLoginIdentifier(account?.loginIdentifier === 'Existing browser session' ? '' : account?.loginIdentifier ?? '');
    setLoginConfirmation(account?.loginConfirmation ?? '');
    setPassword('');
    setEnabled(account?.enabled ?? true);
  };

  const saveAccount = async () => {
    if (!displayName.trim() || !handle.trim() || !loginIdentifier.trim()) return alert('Complete the account name, handle, and login identifier.');
    if (formAccount === 'new' && !password) return alert('Password is required for a new account.');
    setLoading(true);
    try {
      const payload = { displayName: displayName.trim(), handle: handle.trim(), loginIdentifier: loginIdentifier.trim(), loginConfirmation: loginConfirmation.trim() || undefined, password: password || undefined, enabled };
      const saved = formAccount === 'new' ? await api.createAccount(platform, payload) : await api.updateAccount(formAccount!.id, payload);
      setSelectedId(saved.id);
      setFormAccount(null);
      onSuccess();
    } catch (error) {
      alert('Error: ' + (error instanceof Error ? error.message : 'Could not save account'));
    } finally {
      setLoading(false);
    }
  };

  const connect = async () => {
    if (!selectedAccount || !folderPath.trim()) return alert('Enter the full folder path.');
    setLoading(true);
    try {
      await api.connectFolder(selectedAccount.id, folderPath.trim());
      onSuccess();
    } catch (error) {
      alert('Error: ' + (error instanceof Error ? error.message : 'Could not connect folder'));
    } finally {
      setLoading(false);
    }
  };

  const disconnect = async () => {
    if (!connection || !confirm(`Disconnect the folder for ${selectedAccount?.handle}?`)) return;
    setLoading(true);
    try {
      await api.disconnectFolder(connection.id);
      setFolderPath('');
      onSuccess();
    } catch (error) {
      alert('Error: ' + (error instanceof Error ? error.message : 'Could not disconnect folder'));
    } finally {
      setLoading(false);
    }
  };

  const removeAccount = async () => {
    if (!selectedAccount || !confirm(`Delete ${selectedAccount.handle}?`)) return;
    setLoading(true);
    try {
      await api.deleteAccount(selectedAccount.id);
      setSelectedId(null);
      onSuccess();
    } catch (error) {
      alert('Error: ' + (error instanceof Error ? error.message : 'Could not delete account'));
    } finally {
      setLoading(false);
    }
  };

  return <div className='modal-overlay' onClick={onClose}>
    <div className='modal-panel account-manager-modal' onClick={event => event.stopPropagation()}>
      <div className='modal-head'><span>{platformLabels[platform]} publishing accounts</span><button onClick={onClose}><X size={22} /></button></div>
      <div className='modal-body'>
        {formAccount ? <div className='account-form'>
          <div className='account-form-heading'><CustomIcon platform={platform} size={34} /><div><strong>{formAccount === 'new' ? `Add ${platformLabels[platform]} account` : 'Edit publishing account'}</strong><span>Posts, folders, credentials, and browser sessions remain isolated per account.</span></div></div>
          <div className='account-form-grid'>
            <div className='field'><label>Account name</label><input value={displayName} onChange={event => setDisplayName(event.target.value)} placeholder='Main brand account' /></div>
            <div className='field'><label>Public handle</label><input value={handle} onChange={event => setHandle(event.target.value)} placeholder='@yourbrand' /></div>
            <div className='field account-form-wide'><label>Login email or username</label><input value={loginIdentifier} onChange={event => setLoginIdentifier(event.target.value)} autoComplete='username' /></div>
            <div className='field account-form-wide'><label>{formAccount === 'new' ? 'Password' : 'New password (leave blank to keep current)'}</label><input type='password' value={password} onChange={event => setPassword(event.target.value)} autoComplete='new-password' /></div>
            {platform === 'x' && <div className='field account-form-wide'><label>Login confirmation (optional username or phone)</label><input value={loginConfirmation} onChange={event => setLoginConfirmation(event.target.value)} /></div>}
          </div>
          <label className='account-enabled-toggle'><input type='checkbox' checked={enabled} onChange={event => setEnabled(event.target.checked)} /><span><strong>Automation enabled</strong><small>Allow scheduled posts to run through this account</small></span></label>
          <div className='account-form-actions'><button className='btn-outline' onClick={() => setFormAccount(null)}>Cancel</button><button className='btn-primary' onClick={saveAccount} disabled={loading}>{loading ? <Loader2 className='spin' size={17} /> : <ShieldCheck size={17} />}Save account</button></div>
        </div> : selectedAccount ? <div className='account-detail'>
          <button className='account-back' onClick={() => setSelectedId(null)}><ChevronLeft size={16} />All {platformLabels[platform]} accounts</button>
          <div className='account-detail-head'><CustomIcon platform={platform} size={38} /><div><strong>{selectedAccount.displayName}</strong><span>{selectedAccount.handle} · {selectedAccount.enabled ? 'Automation enabled' : 'Automation paused'}</span></div><button className='btn-outline' onClick={() => openAccountForm(selectedAccount)}><Pencil size={14} />Edit</button></div>
          <div className='account-status-strip'>
            <span><strong>{accountUploads.length}</strong><small>All posts</small></span>
            <span><strong>{accountUploads.filter(item => item.status === 'queued').length}</strong><small>Queued</small></span>
            <span><strong>{accountUploads.filter(item => item.status === 'posted').length}</strong><small>Published</small></span>
            <span><strong>{accountUploads.filter(item => item.status === 'failed').length}</strong><small>Failed</small></span>
          </div>
          <section className='account-folder-panel'>
            <div className='account-subhead'><div><strong>Account media folder</strong><span>Files detected here are assigned only to {selectedAccount.handle}.</span></div><span className={`connection-state ${connection?.lastError ? 'error' : connection ? 'active' : ''}`}>{connection?.lastError ? 'Sync error' : connection ? 'Connected' : 'Not connected'}</span></div>
            <div className='account-folder-control'><input value={folderPath} onChange={event => setFolderPath(event.target.value)} placeholder={`C:\\Posts\\${platformLabels[platform]}\\${selectedAccount.handle.replace('@', '')}`} /><button className='btn-primary' onClick={connect} disabled={loading}>{loading ? <Loader2 className='spin' size={16} /> : <FolderSync size={16} />}{connection ? 'Update' : 'Connect'}</button></div>
            {connection?.lastScannedAt && <small className='folder-scan-time'>Last synced {new Date(connection.lastScannedAt).toLocaleString()}</small>}
            {connection?.lastError && <div className='folder-error'>{connection.lastError}</div>}
          </section>
          <section className='folder-posts'>
            <div className='folder-posts-head'><strong>Posts assigned to this account</strong><span>{accountUploads.length}</span></div>
            {accountUploads.length === 0 ? <div className='folder-posts-empty'>No posts assigned yet</div> : accountUploads.map(upload => <button className='folder-post-row' key={upload.id} onClick={() => onEdit(upload)}><FileText size={18} /><span className='folder-post-name'>{upload.folderSource?.relativePath ?? upload.originalName}</span><span className='folder-post-schedule'>{upload.status === 'posted' ? 'Published' : upload.scheduledAt ? new Date(upload.scheduledAt).toLocaleString() : 'Needs schedule'}</span><CalendarClock size={16} /></button>)}
          </section>
          <div className='account-danger-actions'>{connection && <button className='btn-danger' onClick={disconnect} disabled={loading}><Unplug size={15} />Disconnect folder</button>}<button className='btn-danger ghost-danger' onClick={removeAccount} disabled={loading || Boolean(connection) || accountUploads.length > 0}><Trash2 size={15} />Delete account</button></div>
        </div> : <div className='account-list-view'>
          <div className='account-list-intro'><div><strong>{accounts.length} connected {accounts.length === 1 ? 'account' : 'accounts'}</strong><span>Choose exactly where each post is published.</span></div><button className='btn-primary' onClick={() => openAccountForm()}><UsersRound size={16} />Add account</button></div>
          <div className='publishing-account-list'>{accounts.length === 0 ? <div className='account-list-empty'><UsersRound size={27} /><strong>No {platformLabels[platform]} accounts yet</strong><span>Add the first account to connect its folder and begin routing posts.</span><button className='btn-primary' onClick={() => openAccountForm()}>Add first account</button></div> : accounts.map(account => {
            const items = uploads.filter(upload => upload.accountId === account.id);
            const accountConnection = connections.find(item => item.accountId === account.id);
            return <button className='publishing-account-row' key={account.id} onClick={() => setSelectedId(account.id)}><span className='publishing-account-icon'><CustomIcon platform={platform} size={28} /><i className={account.enabled ? 'online' : ''} /></span><span className='publishing-account-identity'><strong>{account.displayName}</strong><small>{account.handle}</small></span><span className='publishing-account-metric'><strong>{items.length}</strong><small>posts</small></span><span className='publishing-account-metric published'><strong>{items.filter(item => item.status === 'posted').length}</strong><small>published</small></span><span className={`publishing-account-source ${accountConnection ? 'connected' : ''}`}><FolderOpen size={15} />{accountConnection ? 'Folder connected' : 'Connect folder'}</span><ChevronRight size={18} /></button>;
          })}</div>
        </div>}
      </div>
    </div>
  </div>;
}

function PostMediaPreview({ upload, compact = false, networkPreview = false }: { upload: PlatformUpload; compact?: boolean; networkPreview?: boolean }) {
  if (upload.mimeType.startsWith('image/')) return <img src={upload.url} alt='' />;
  if (upload.mimeType.startsWith('video/')) return <video src={upload.url} controls={!compact && !networkPreview} muted playsInline autoPlay={compact} loop={compact} />;
  return <div className='post-preview-file'><FileText size={28} /><span>{upload.originalName}</span></div>;
}

function PlatformPostPreview({
  upload,
  title,
  caption,
}: {
  upload: PlatformUpload;
  title: string;
  caption: string;
}) {
  const displayTitle = title.trim() || upload.originalName;
  const handle = upload.platform === 'x' ? '@tinitiate' : upload.platform === 'youtube' ? 'Tinitiate Autobot' : 'tinitiate.autobot';
  const networkLabel = upload.platform === 'x' ? 'Post' : upload.platform === 'youtube' ? 'Video preview' : 'Post preview';

  return (
    <section className={`platform-post-preview preview-${upload.platform}`} aria-label={`${platformLabels[upload.platform]} post preview`}>
      <header><span>Platform preview</span><CustomIcon platform={upload.platform} size={19} /></header>
      <article className='preview-post-card'>
        <div className='preview-post-account'><CustomIcon platform={upload.platform} size={28} /><div><strong>{handle}</strong><small>{networkLabel}</small></div><span>•••</span></div>
        {upload.platform !== 'youtube' && <p className='preview-post-caption'>{caption || 'Write a caption to see it here.'}</p>}
        <div className='preview-post-media'><PostMediaPreview upload={upload} /></div>
        {upload.platform === 'youtube' && <div className='preview-youtube-copy'><strong>{displayTitle}</strong><span>{caption || 'Write a description to see it here.'}</span></div>}
        {upload.platform !== 'youtube' && <div className='preview-post-actions'><span>{upload.platform === 'x' ? 'Reply  Repost  Like' : upload.platform === 'linkedin' ? 'Like  Comment  Repost' : 'Like  Comment  Share'}</span><small>Preview only</small></div>}
      </article>
      <p className='preview-note'>This is a layout preview. Final platform formatting may vary slightly after publishing.</p>
    </section>
  );
}

function NetworkPostPreview({
  upload,
  account,
  title,
  caption,
}: {
  upload: PlatformUpload;
  account?: PlatformAccount;
  title: string;
  caption: string;
}) {
  const displayTitle = title.trim() || upload.originalName;
  const postText = caption.trim() || (upload.platform === 'youtube' ? 'Write a description to see it here.' : 'Write a caption to see it here.');
  const accountName = account?.displayName ?? 'Publishing account';
  const accountHandle = account?.handle ?? '@account';
  const profile = (name: string, detail: string) => <div className='network-profile'><CustomIcon platform={upload.platform} size={30} /><span><strong>{name}</strong><small>{detail}</small></span><MoreHorizontal size={18} /></div>;
  const media = <div className={`network-media ${upload.mimeType.startsWith('video/') ? 'network-video' : ''}`}><PostMediaPreview upload={upload} networkPreview /></div>;

  return (
    <section className={`platform-post-preview network-preview preview-${upload.platform}`} aria-label={`${platformLabels[upload.platform]} post preview`}>
      <header><span>Live {platformLabels[upload.platform]} preview</span><small>Updates as you edit</small></header>

      {upload.platform === 'instagram' && <article className='network-post instagram-post'>
        {profile(accountHandle, accountName)}
        {media}
        <div className='instagram-actions'><span><Heart size={19} /><MessageCircle size={19} /><Send size={18} /></span><Bookmark size={18} /></div>
        <span className='network-meta'>Preview engagement</span>
        <p className='instagram-caption'><strong>{accountHandle}</strong> {postText}</p>
      </article>}

      {upload.platform === 'x' && <article className='network-post x-post'>
        <div className='x-account'><CustomIcon platform='x' size={32} /><div><strong>{accountName}</strong><span>{accountHandle} · now</span></div><MoreHorizontal size={18} /></div>
        <p className='x-copy'>{postText}</p>
        {media}
        <div className='x-actions'><MessageCircle size={15} /><Repeat2 size={16} /><Heart size={16} /><Eye size={16} /><Share2 size={15} /></div>
      </article>}

      {upload.platform === 'linkedin' && <article className='network-post linkedin-post'>
        {profile(accountName, `${accountHandle} · now`)}
        <p className='linkedin-copy'>{postText}</p>
        {media}
        <div className='linkedin-summary'><span><ThumbsUp size={13} /> <i /> <i /></span><small>Preview · Comment</small></div>
        <div className='linkedin-actions'><span><ThumbsUp size={16} /> Like</span><span><MessageCircle size={16} /> Comment</span><span><Repeat2 size={16} /> Repost</span><span><Send size={16} /> Send</span></div>
      </article>}

      {upload.platform === 'facebook' && <article className='network-post facebook-post'>
        {profile(accountName, `${accountHandle} · Public`)}
        <p className='facebook-copy'>{postText}</p>
        {media}
        <div className='facebook-summary'><span><ThumbsUp size={13} /> <Heart size={13} /></span><small>Preview reactions</small></div>
        <div className='facebook-actions'><span><ThumbsUp size={16} /> Like</span><span><MessageCircle size={16} /> Comment</span><span><Share2 size={16} /> Share</span></div>
      </article>}

      {upload.platform === 'youtube' && <article className='network-post youtube-post'>
        <div className='youtube-media'>{media}<span>0:00</span></div>
        <div className='youtube-copy'><strong>{displayTitle}</strong><span>{accountName} · {accountHandle}</span><p>{postText}</p></div>
      </article>}

      <p className='preview-note'>Content placement and media crop match the target network. The platform applies final fonts and metadata at publish time.</p>
    </section>
  );
}

function EditPostModal({
  upload,
  accounts,
  onClose,
  onSuccess,
}: {
  upload: PlatformUpload;
  accounts: PlatformAccount[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [title, setTitle] = useState(upload.title ?? upload.caption);
  const [caption, setCaption] = useState(upload.caption);
  const [accountId, setAccountId] = useState(upload.accountId);
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
        accountId,
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
      <div className="modal-panel preview-modal" onClick={event => event.stopPropagation()}>
        <div className="modal-head"><span>Schedule Post</span><button onClick={onClose}><X size={22} /></button></div>
        <div className="modal-body">
          <div className="post-editor-workspace">
            <div className="post-editor-form">
              <div className="edit-source-row">
                <CustomIcon platform={upload.platform} size={28} />
                <div><strong>{upload.originalName}</strong><span>{platformLabels[upload.platform]}</span></div>
              </div>
              <div className='field'><label>Publish through account</label><select value={accountId} onChange={event => setAccountId(event.target.value)} disabled={Boolean(upload.folderSource)}>{accounts.map(account => <option key={account.id} value={account.id}>{account.displayName} ({account.handle}){account.enabled ? '' : ' — paused'}</option>)}</select>{upload.folderSource && <small className='field-help'>This post is locked to the account that owns its source folder.</small>}</div>
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
            <NetworkPostPreview upload={upload} account={accounts.find(account => account.id === accountId)} title={title} caption={caption} />
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
