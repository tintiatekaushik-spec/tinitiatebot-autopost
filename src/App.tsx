import {
  Loader2, RefreshCw, X,
  CalendarClock, FileText, FolderSync, Pencil, Trash2,
  ArrowRight, BriefcaseBusiness, KeyRound, LockKeyhole, LogOut, ShieldCheck, UsersRound,
  CalendarDays, ChevronLeft, ChevronRight, CircleAlert, CircleCheckBig,
  CircleDashed, FolderOpen, LayoutDashboard, ListFilter, Send, TimerReset,
  Bookmark, Eye, Heart, MessageCircle, MoreHorizontal, Repeat2, Share2, ThumbsUp
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FaFacebook, FaInstagram, FaLinkedin, FaXTwitter, FaYoutube } from "react-icons/fa6";
import type { ActivityLog, Platform, PlatformAccount, PlatformUpload, PublishingSchedule, ScheduleFrequency, ScheduleStatus, StorageConnection, StorageSourceType, UserProfile, UserRole } from "../shared/schema";
import { platformLabels, platforms, scheduleFrequencies, scheduleFrequencyLabels, storageSourceTypeLabels, userRoleLabels, userRoles } from "../shared/schema";
import { api, setAuthToken, type AuthResponse } from "./lib/api";

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

type AuthSession = {
  token: string;
  user: UserProfile;
};

type RolePermissions = {
  canManageUsers: boolean;
  canViewActivity: boolean;
  canManageAccounts: boolean;
  canManageStorageAccess: boolean;
  canEditContent: boolean;
  canSchedulePosts: boolean;
  canRunAutomation: boolean;
};

type AutomationNotice = {
  variant: 'success' | 'error';
  title: string;
  message: string;
};

const AUTH_SESSION_KEY = 'tinitiate-autobot-session';

const loginRoleOptions: Array<{ role: UserRole; username: string; description: string }> = [
  { role: 'operations_manager', username: 'operations.manager', description: 'Full workspace, users, audit, and automation access' },
  { role: 'post_uploader', username: 'content.uploader', description: 'Review imported posts and edit captions or titles' },
  { role: 'scheduler', username: 'post.scheduler', description: 'Create schedules and assign publish times' },
  { role: 'viewer', username: 'workspace.viewer', description: 'Read-only workspace overview' },
];

const roleInitials: Record<UserRole, string> = {
  operations_manager: 'OM',
  post_uploader: 'UP',
  scheduler: 'SC',
  viewer: 'VW',
};

function permissionsForRole(role: UserRole): RolePermissions {
  return {
    canManageUsers: role === 'operations_manager',
    canViewActivity: role === 'operations_manager',
    canManageAccounts: role === 'operations_manager',
    canManageStorageAccess: role === 'operations_manager' || role === 'post_uploader',
    canEditContent: role === 'operations_manager' || role === 'post_uploader',
    canSchedulePosts: role === 'operations_manager' || role === 'scheduler',
    canRunAutomation: role === 'operations_manager',
  };
}

function readSavedSession(): AuthSession | null {
  try {
    const saved = window.sessionStorage.getItem(AUTH_SESSION_KEY);
    if (!saved) return null;
    const session = JSON.parse(saved) as AuthSession;
    if (!session.token || !session.user || !userRoles.includes(session.user.role)) return null;
    setAuthToken(session.token);
    return session;
  } catch {
    return null;
  }
}

export default function App() {
  const [session, setSession] = useState<AuthSession | null>(readSavedSession);

  const signIn = (response: AuthResponse) => {
    const nextSession = { token: response.token, user: response.user };
    setAuthToken(response.token);
    window.sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(nextSession));
    setSession(nextSession);
  };

  const signOut = () => {
    setAuthToken(null);
    window.sessionStorage.removeItem(AUTH_SESSION_KEY);
    setSession(null);
  };

  return session
    ? <Dashboard session={session} onSignOut={signOut} />
    : <LandingPage onSignIn={signIn} />;
}

function LandingPage({ onSignIn }: { onSignIn: (response: AuthResponse) => void }) {
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const chooseRole = (role: UserRole) => {
    const credentials = loginRoleOptions.find(option => option.role === role);
    setSelectedRole(role);
    setUsername(credentials?.username ?? '');
    setError('');
  };

  const submit = async () => {
    setError('');
    if (!username.trim() || !password) {
      setError('Enter your username and password.');
      return;
    }

    setLoading(true);
    try {
      onSignIn(await api.login({ username: username.trim(), password }));
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Sign in failed.');
    } finally {
      setLoading(false);
    }
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
            <p>Use your assigned workspace credentials. Your role controls which sections are available after sign in.</p>
          </div>

          <div className='role-options' aria-label='Choose login type'>
            {loginRoleOptions.map(option => (
              <button
                type='button'
                key={option.role}
                className={`role-option ${selectedRole === option.role ? 'selected' : ''}`}
                aria-pressed={selectedRole === option.role}
                onClick={() => chooseRole(option.role)}
              >
                {option.role === 'operations_manager' ? <BriefcaseBusiness size={21} /> : <UsersRound size={21} />}
                <span><strong>{userRoleLabels[option.role]}</strong><small>{option.description}</small></span>
                <ArrowRight size={18} />
              </button>
            ))}
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
                <span>Role selected: <code>{userRoleLabels[selectedRole]}</code></span>
              </div>
            )}
            {error && <p className='auth-error' role='alert'>{error}</p>}
            <button type='submit' className='auth-submit' disabled={loading}>
              {loading ? <Loader2 className='spin' size={18} /> : <ArrowRight size={18} />}
              Sign in
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}

function Dashboard({ session, onSignOut }: { session: AuthSession; onSignOut: () => void }) {
  const user = session.user;
  const permissions = useMemo(() => permissionsForRole(user.role), [user.role]);
  const [uploads, setUploads] = useState<PlatformUpload[]>([]);
  const [accounts, setAccounts] = useState<PlatformAccount[]>([]);
  const [schedules, setSchedules] = useState<PublishingSchedule[]>([]);
  const [storageConnections, setStorageConnections] = useState<StorageConnection[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [accountManagerPlatform, setAccountManagerPlatform] = useState<Platform | null>(null);
  const [scheduleManagerOpen, setScheduleManagerOpen] = useState(false);
  const [storageAccessPlatform, setStorageAccessPlatform] = useState<Platform | null>(null);
  const [userManagerOpen, setUserManagerOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [editingUpload, setEditingUpload] = useState<PlatformUpload | null>(null);
  const [automationNotice, setAutomationNotice] = useState<AutomationNotice | null>(null);

  const refresh = useCallback(async (showLoading = true) => {
    setError(null);
    if (showLoading) setLoading(true);
    try {
      const baseRequests = [
        api.uploads(),
        api.accounts(),
        api.schedules(),
      ] as const;
      const [latestUploads, latestAccounts, latestSchedules] = await Promise.all(baseRequests);
      setUploads(latestUploads);
      setAccounts(latestAccounts);
      setSchedules(latestSchedules);
      if (permissions.canManageStorageAccess) {
        setStorageConnections(await api.storageConnections());
      }
      if (permissions.canManageUsers) {
        const [latestUsers, latestActivity] = await Promise.all([
          api.users(),
          api.activityLogs(100),
        ]);
        setUsers(latestUsers);
        setActivityLogs(latestActivity);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed.');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [permissions.canManageUsers]);

  useEffect(() => {
    void refresh();
    const refreshTimer = window.setInterval(() => void refresh(false), 5000);
    return () => window.clearInterval(refreshTimer);
  }, [refresh]);

  const handleRun = async () => {
    if (!permissions.canRunAutomation) return;
    setIsRunning(true);
    try {
      await api.runAutomation();
      setAutomationNotice({
        variant: 'success',
        title: 'Automation started',
        message: 'Publishing will use saved manual sessions only. Accounts without an active saved session will fail for review.',
      });
      window.setTimeout(() => void refresh(false), 5000);
    } catch (e) {
      setAutomationNotice({
        variant: 'error',
        title: 'Automation could not start',
        message: e instanceof Error ? e.message : 'Unknown error',
      });
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <>
      <Workboard
        user={user}
        permissions={permissions}
        uploads={uploads}
        accounts={accounts}
        schedules={schedules}
        storageConnections={storageConnections}
        users={users}
        activityLogs={activityLogs}
        loading={loading}
        error={error}
        isRunning={isRunning}
        onRun={handleRun}
        onRefresh={() => void refresh()}
        onSignOut={onSignOut}
        onOpenAccounts={setAccountManagerPlatform}
        onOpenSchedules={() => permissions.canSchedulePosts && setScheduleManagerOpen(true)}
        onOpenStorageAccess={setStorageAccessPlatform}
        onOpenUsers={() => setUserManagerOpen(true)}
        onOpenActivity={() => setActivityOpen(true)}
        onEdit={setEditingUpload}
        editingUpload={editingUpload}
        onCloseEdit={() => setEditingUpload(null)}
      />
      {accountManagerPlatform && permissions.canManageAccounts && (
        <AccountManagerModal
          key={accountManagerPlatform}
          platform={accountManagerPlatform}
          accounts={accounts.filter(account => account.platform === accountManagerPlatform)}
          onClose={() => setAccountManagerPlatform(null)}
          onSuccess={() => void refresh(false)}
        />
      )}
      {storageAccessPlatform && (
        <StorageAccessModal
          key={storageAccessPlatform}
          platform={storageAccessPlatform}
          accounts={accounts.filter(account => account.platform === storageAccessPlatform)}
          storageConnections={storageConnections.filter(connection => connection.platform === storageAccessPlatform)}
          permissions={permissions}
          onClose={() => setStorageAccessPlatform(null)}
          onSuccess={() => void refresh()}
        />
      )}
      {scheduleManagerOpen && (
        <ScheduleManagerModal
          schedules={schedules}
          uploads={uploads}
          onClose={() => setScheduleManagerOpen(false)}
          onSuccess={() => void refresh()}
        />
      )}
      {userManagerOpen && permissions.canManageUsers && (
        <UserManagementModal
          currentUser={user}
          users={users}
          onClose={() => setUserManagerOpen(false)}
          onSuccess={() => void refresh(false)}
        />
      )}
      {activityOpen && permissions.canViewActivity && (
        <ActivityLogModal
          activityLogs={activityLogs}
          onClose={() => setActivityOpen(false)}
        />
      )}
      {automationNotice && (
        <AutomationNoticeModal
          notice={automationNotice}
          onClose={() => setAutomationNotice(null)}
        />
      )}
    </>
  );
}

function AutomationNoticeModal({ notice, onClose }: { notice: AutomationNotice; onClose: () => void }) {
  const isSuccess = notice.variant === 'success';

  return (
    <div className='modal-overlay automation-notice-overlay' onClick={onClose}>
      <div
        className={`automation-notice-panel ${notice.variant}`}
        role='dialog'
        aria-modal='true'
        aria-labelledby='automation-notice-title'
        onClick={event => event.stopPropagation()}
      >
        <div className='automation-notice-icon'>
          {isSuccess ? <CircleCheckBig size={28} /> : <CircleAlert size={28} />}
        </div>
        <div className='automation-notice-copy'>
          <h2 id='automation-notice-title'>{notice.title}</h2>
          <p>{notice.message}</p>
        </div>
        <button type='button' className='automation-notice-action' onClick={onClose}>
          OK
        </button>
      </div>
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

function Workboard({
  user,
  permissions,
  uploads,
  accounts,
  schedules,
  storageConnections,
  users,
  activityLogs,
  loading,
  error,
  isRunning,
  onRun,
  onRefresh,
  onSignOut,
  onOpenAccounts,
  onOpenSchedules,
  onOpenStorageAccess,
  onOpenUsers,
  onOpenActivity,
  onEdit,
  editingUpload,
  onCloseEdit,
}: {
  user: UserProfile;
  permissions: RolePermissions;
  uploads: PlatformUpload[];
  accounts: PlatformAccount[];
  schedules: PublishingSchedule[];
  storageConnections: StorageConnection[];
  users: UserProfile[];
  activityLogs: ActivityLog[];
  loading: boolean;
  error: string | null;
  isRunning: boolean;
  onRun: () => void;
  onRefresh: () => void;
  onSignOut: () => void;
  onOpenAccounts: (platform: Platform) => void;
  onOpenSchedules: () => void;
  onOpenStorageAccess: (platform: Platform) => void;
  onOpenUsers: () => void;
  onOpenActivity: () => void;
  onEdit: (upload: PlatformUpload) => void;
  editingUpload: PlatformUpload | null;
  onCloseEdit: () => void;
}) {
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState(() => toLocalDayKey(new Date()));
  const [activeView, setActiveView] = useState('overview');
  const [schedulePlatform, setSchedulePlatform] = useState<Platform | null>(null);
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
  const canEditPosts = permissions.canEditContent || permissions.canSchedulePosts;

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
          {permissions.canViewActivity && <button className='workboard-tool' title='Activity log' onClick={onOpenActivity}><ListFilter size={18} /></button>}
          {permissions.canRunAutomation && <button className='workboard-run' onClick={onRun} disabled={isRunning}>{isRunning ? <Loader2 className='spin' size={16} /> : <Send size={16} />}{isRunning ? 'Publishing' : 'Run automation'}</button>}
          <button className='workboard-tool' title='Refresh workspace' onClick={onRefresh}><RefreshCw size={18} className={loading ? 'spin' : ''} /></button>
          <span className='workboard-user' title={`${user.fullName} - ${userRoleLabels[user.role]}`}>{roleInitials[user.role]}</span>
          <button className='workboard-tool signout-tool' title='Sign out' onClick={onSignOut}><LogOut size={18} /></button>
        </div>
      </header>

      {error && <div className='error-banner'>{error}</div>}

      <section className='workboard-intro' id='overview'>
        <div className='operations-hero-copy'><p className='section-kicker'>Publishing command center</p><h1>Control every post.<br />Across every channel.</h1><span>Review content, manage delivery status, and coordinate your publishing calendar from one operational workspace.</span></div>
        <div className='operations-hero-stats'>
          <article><span>Tracked content</span><strong>{metrics.total}</strong><small>Across the workspace</small></article>
          <article><span>Publishing accounts</span><strong>{accounts.length}</strong><small>{schedules.length} reusable schedules</small></article>
          <article><span>Open reviews</span><strong>{reviewQueue.length}</strong><small>Require attention</small></article>
          <article><span>Automation</span><strong className='automation-state'>{isRunning ? 'Running' : 'Ready'}</strong><small>{isRunning ? 'Publishing now' : 'Standing by'}</small></article>
        </div>
      </section>

      <section className='platform-metrics' id='channels' aria-labelledby='post-metrics-heading'>
        <header className='workboard-section-head'><div><p className='section-kicker'>Channel control</p><h2 id='post-metrics-heading'>Publishing channels</h2></div><span>{trackingSummary}</span></header>
        <div className='platform-metric-grid'>
          {platforms.map(platform => {
            const platformPosts = uploads.filter(upload => upload.platform === platform);
            const platformAccounts = accounts.filter(account => account.platform === platform);
            const platformStorage = storageConnections.filter(connection => connection.platform === platform);
            return (
              <article key={platform} className={`platform-metric-card platform-${platform}`}>
                <div className='platform-metric-card-top'><CustomIcon platform={platform} size={34} /><span>{platformLabels[platform]}</span><ChevronRight size={16} /></div>
                <div className='platform-metric-number'><strong>{platformPosts.length}</strong><span>posts</span></div>
                <div className='platform-account-summary'><UsersRound size={13} /><span>{platformAccounts.length} {platformAccounts.length === 1 ? 'account' : 'accounts'} · {platformStorage.length} storage</span></div>
                <div className='platform-card-actions'>
                  {permissions.canSchedulePosts && <button type='button' onClick={() => setSchedulePlatform(platform)}><CalendarClock size={14} />Schedule</button>}
                  {permissions.canManageAccounts && <button type='button' onClick={() => onOpenAccounts(platform)}><KeyRound size={14} />Accounts</button>}
                  {permissions.canManageStorageAccess && <button type='button' onClick={() => onOpenStorageAccess(platform)}><FolderSync size={14} />Storage</button>}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {permissions.canManageUsers && (
        <section className='workboard-user-manager' aria-labelledby='user-manager-heading'>
          <header className='workboard-section-head'>
            <div><p className='section-kicker'>Workspace access</p><h2 id='user-manager-heading'>User management</h2></div>
            <button className='btn-primary' onClick={onOpenUsers}><UsersRound size={16} />Manage users</button>
          </header>
          <div className='user-access-strip'>
            {users.length === 0 ? <div className='user-access-empty'><UsersRound size={23} /><span>No users loaded</span></div> : users.slice(0, 4).map(item => (
              <button key={item.id} type='button' className='user-access-chip' onClick={onOpenUsers}>
                <span className='workboard-user'>{roleInitials[item.role]}</span>
                <span><strong>{item.fullName}</strong><small>{userRoleLabels[item.role]}</small></span>
              </button>
            ))}
            {users.length > 4 && <button type='button' className='user-access-more' onClick={onOpenUsers}>+{users.length - 4}</button>}
          </div>
        </section>
      )}

      <section className='workboard-schedule-manager' aria-labelledby='schedule-manager-heading'>
        <header className='workboard-section-head'>
          <div><p className='section-kicker'>Reusable timing</p><h2 id='schedule-manager-heading'>Schedule manager</h2></div>
          {permissions.canSchedulePosts && <button className='btn-primary' onClick={onOpenSchedules}><CalendarClock size={16} />Add or manage</button>}
        </header>
        <div className='schedule-card-grid'>
          {schedules.length === 0 ? <button className='schedule-empty-card' onClick={onOpenSchedules} disabled={!permissions.canSchedulePosts}><CalendarClock size={24} /><span><strong>No schedules yet</strong><small>Create schedules like Daily, Weekly, Monthly, One time, or Custom.</small></span><ChevronRight size={18} /></button> : schedules.map(schedule => {
            const assignedPosts = uploads.filter(upload => upload.scheduleId === schedule.id).length;
            return <button className='schedule-summary-card' key={schedule.id} onClick={onOpenSchedules} disabled={!permissions.canSchedulePosts}>
              <span className='schedule-card-id'>#{schedule.id}</span>
              <span className='schedule-card-main'><strong>{schedule.name}</strong><small>{schedule.frequency === 'custom' ? schedule.customCronExpression : `${scheduleFrequencyLabels[schedule.frequency]} at ${schedule.time}`}{schedule.endDate ? ` until ${schedule.endDate}` : ''}</small></span>
              <span className={`schedule-card-state ${schedule.status}`}>{schedule.status}</span>
              <span className='schedule-card-accounts'><FileText size={14} />{assignedPosts}</span>
              <ChevronRight size={17} />
            </button>;
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
              <button className='review-queue-row' key={upload.id} onClick={() => canEditPosts && onEdit(upload)} disabled={!canEditPosts}>
                <div className={`review-queue-media review-${upload.status}`}><PostMediaPreview upload={upload} compact /><i><CustomIcon platform={upload.platform} size={17} /></i></div>
                <span><strong>{upload.title || upload.originalName}</strong><small>{accountById.get(upload.accountId)?.handle ?? platformLabels[upload.platform]} · {upload.status === 'failed' ? 'Needs review' : upload.scheduledAt ? formatEventTime(upload.scheduledAt) : upload.status === 'processing' ? 'Publishing now' : 'Needs a publish time'}</small></span>
                <Pencil size={14} />
              </button>
            ))}</div>
            {reviewQueue.length > 0 && <footer className='review-queue-footer'>{canEditPosts ? 'Select any post to inspect its platform preview and edit details.' : 'Your role can view this queue but cannot edit posts.'}</footer>}
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
            <button className='next-action-content' onClick={() => canEditPosts && onEdit(nextAction)} disabled={!canEditPosts}>
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
            <aside className='workboard-day-inspector'><div><span>{formatCalendarHeading(selectedDay)}</span><strong>{selectedEvents.length}</strong></div>{selectedEvents.length === 0 ? <p>No publishing activity on this day.</p> : selectedEvents.map(upload => <button key={upload.id} onClick={() => canEditPosts && onEdit(upload)} disabled={!canEditPosts}><CustomIcon platform={upload.platform} size={17} /><span><strong>{upload.title || upload.originalName}</strong><small>{accountById.get(upload.accountId)?.handle ?? platformLabels[upload.platform]} · {getAuditAction(upload)}</small></span><time>{new Date(getAuditTimestamp(upload)).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</time></button>)}</aside>
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

      {schedulePlatform && permissions.canSchedulePosts && (
        <PlatformScheduleModal
          platform={schedulePlatform}
          uploads={uploads.filter(upload => upload.platform === schedulePlatform)}
          accounts={accounts.filter(account => account.platform === schedulePlatform)}
          onClose={() => setSchedulePlatform(null)}
          onEdit={upload => {
            setSchedulePlatform(null);
            onEdit(upload);
          }}
        />
      )}
      {editingUpload && canEditPosts && <EditPostModal upload={editingUpload} accounts={accounts.filter(item => item.platform === editingUpload.platform)} schedules={schedules} permissions={permissions} onClose={onCloseEdit} onSuccess={onRefresh} />}
      </section>
    </main>
  );
}

function PlatformScheduleModal({
  platform,
  uploads,
  accounts,
  onClose,
  onEdit,
}: {
  platform: Platform;
  uploads: PlatformUpload[];
  accounts: PlatformAccount[];
  onClose: () => void;
  onEdit: (upload: PlatformUpload) => void;
}) {
  const [accountFilter, setAccountFilter] = useState<string>('all');
  const accountById = useMemo(() => new Map(accounts.map(account => [account.id, account])), [accounts]);
  const schedulableUploads = useMemo(() => uploads
    .filter(upload => upload.status !== 'posted')
    .sort((a, b) => {
      const aUnscheduled = !a.scheduledAt && !a.scheduleId ? 0 : 1;
      const bUnscheduled = !b.scheduledAt && !b.scheduleId ? 0 : 1;
      if (aUnscheduled !== bUnscheduled) return aUnscheduled - bUnscheduled;
      const aTime = a.scheduledAt ? Date.parse(a.scheduledAt) : Number.MAX_SAFE_INTEGER;
      const bTime = b.scheduledAt ? Date.parse(b.scheduledAt) : Number.MAX_SAFE_INTEGER;
      return aTime - bTime || Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
    }), [uploads]);
  const visibleUploads = accountFilter === 'all'
    ? schedulableUploads
    : schedulableUploads.filter(upload => upload.accountId === accountFilter);
  const waitingCount = schedulableUploads.filter(upload => upload.status === 'queued' && !upload.scheduledAt && !upload.scheduleId).length;
  const scheduledCount = schedulableUploads.filter(upload => upload.scheduledAt || upload.scheduleId).length;
  const failedCount = schedulableUploads.filter(upload => upload.status === 'failed').length;

  const scheduleLabel = (upload: PlatformUpload) => {
    if (upload.status === 'failed') return 'Needs review';
    if (upload.status === 'processing') return 'Publishing now';
    if (upload.scheduledAt) return formatEventTime(upload.scheduledAt);
    if (upload.scheduleId) return `Template #${upload.scheduleId}`;
    return 'Needs a publish time';
  };

  return (
    <div className='modal-overlay' onClick={onClose}>
      <div className='modal-panel platform-schedule-modal' role='dialog' aria-modal='true' aria-labelledby='platform-schedule-heading' onClick={event => event.stopPropagation()}>
        <div className='modal-head'>
          <span id='platform-schedule-heading'>{platformLabels[platform]} post scheduling</span>
          <button onClick={onClose}><X size={22} /></button>
        </div>
        <div className='platform-schedule-layout'>
          <aside className='platform-schedule-sidebar'>
            <div className='platform-schedule-title'>
              <CustomIcon platform={platform} size={36} />
              <span><strong>{platformLabels[platform]}</strong><small>{schedulableUploads.length} open posts</small></span>
            </div>
            <div className='platform-schedule-stat-grid'>
              <span><strong>{waitingCount}</strong><small>Need time</small></span>
              <span><strong>{scheduledCount}</strong><small>Scheduled</small></span>
              <span><strong>{failedCount}</strong><small>Review</small></span>
            </div>
            <div className='platform-schedule-account-list' aria-label={`${platformLabels[platform]} accounts`}>
              <button type='button' className={accountFilter === 'all' ? 'active' : ''} onClick={() => setAccountFilter('all')}>
                <UsersRound size={17} />
                <span><strong>All accounts</strong><small>{schedulableUploads.length} posts</small></span>
              </button>
              {accounts.map(account => {
                const count = schedulableUploads.filter(upload => upload.accountId === account.id).length;
                return (
                  <button type='button' key={account.id} className={accountFilter === account.id ? 'active' : ''} onClick={() => setAccountFilter(account.id)}>
                    <CustomIcon platform={platform} size={17} />
                    <span><strong>{account.displayName}</strong><small>{account.handle} - {count} posts</small></span>
                  </button>
                );
              })}
            </div>
          </aside>
          <section className='platform-schedule-main'>
            <header>
              <div><p className='section-kicker'>Individual timing</p><h3>{accountFilter === 'all' ? 'Choose a post' : accountById.get(accountFilter)?.displayName ?? 'Choose a post'}</h3></div>
              <span>{visibleUploads.length} shown</span>
            </header>
            <div className='platform-schedule-post-list'>
              {visibleUploads.length === 0 ? (
                <div className='platform-schedule-empty'>
                  <CalendarDays size={26} />
                  <strong>No posts waiting here.</strong>
                  <span>Connect storage or choose another account to schedule imported posts.</span>
                </div>
              ) : visibleUploads.map(upload => (
                <button type='button' className='platform-schedule-post-row' key={upload.id} onClick={() => onEdit(upload)}>
                  <div className={`review-queue-media review-${upload.status}`}><PostMediaPreview upload={upload} compact /></div>
                  <span className='platform-schedule-post-copy'>
                    <strong>{upload.title || upload.originalName}</strong>
                    <small>{accountById.get(upload.accountId)?.handle ?? platformLabels[platform]} - {scheduleLabel(upload)}</small>
                  </span>
                  <span className={`platform-schedule-state ${upload.scheduledAt || upload.scheduleId ? 'scheduled' : upload.status}`}>{upload.scheduledAt || upload.scheduleId ? 'scheduled' : upload.status}</span>
                  <Pencil size={16} />
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function ScheduleManagerModal({ schedules, uploads, onClose, onSuccess }: {
  schedules: PublishingSchedule[];
  uploads: PlatformUpload[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [editing, setEditing] = useState<PublishingSchedule | 'new' | null>(schedules.length === 0 ? 'new' : null);
  const [name, setName] = useState('');
  const [time, setTime] = useState('09:00');
  const [frequency, setFrequency] = useState<ScheduleFrequency>('daily');
  const [endDate, setEndDate] = useState('');
  const [status, setStatus] = useState<ScheduleStatus>('active');
  const [customCronExpression, setCustomCronExpression] = useState('');
  const [loading, setLoading] = useState(false);

  const openForm = (schedule?: PublishingSchedule) => {
    setEditing(schedule ?? 'new');
    setName(schedule?.name ?? '');
    setTime(schedule?.time ?? '09:00');
    setFrequency(schedule?.frequency ?? 'daily');
    setEndDate(schedule?.endDate ?? '');
    setStatus(schedule?.status ?? 'active');
    setCustomCronExpression(schedule?.customCronExpression ?? '');
  };

  const closeForm = () => {
    setEditing(null);
    setName('');
    setTime('09:00');
    setFrequency('daily');
    setEndDate('');
    setStatus('active');
    setCustomCronExpression('');
  };

  const saveSchedule = async () => {
    if (!name.trim()) return alert('Schedule name is required.');
    if (!time) return alert('Schedule time is required.');
    if (frequency === 'onetime' && !endDate) return alert('One-time schedules need a date.');
    if (frequency === 'custom' && !customCronExpression.trim()) return alert('Custom schedules need a cron expression.');
    setLoading(true);
    try {
      const payload = {
        name: name.trim(),
        time,
        frequency,
        endDate: endDate || undefined,
        status,
        customCronExpression: frequency === 'custom' ? customCronExpression.trim() : undefined
      };
      if (editing === 'new') await api.createSchedule(payload);
      else await api.updateSchedule(editing!.id, payload);
      closeForm();
      onSuccess();
    } catch (error) {
      alert('Error: ' + (error instanceof Error ? error.message : 'Could not save schedule'));
    } finally {
      setLoading(false);
    }
  };

  const removeSchedule = async (schedule: PublishingSchedule) => {
    const postCount = uploads.filter(upload => upload.scheduleId === schedule.id).length;
    if (postCount > 0) return alert('Remove this schedule from posts before deleting it.');
    if (!confirm(`Delete schedule ${schedule.name}?`)) return;
    setLoading(true);
    try {
      await api.deleteSchedule(schedule.id);
      onSuccess();
    } catch (error) {
      alert('Error: ' + (error instanceof Error ? error.message : 'Could not delete schedule'));
    } finally {
      setLoading(false);
    }
  };

  return <div className='modal-overlay' onClick={onClose}>
    <div className='modal-panel schedule-manager-modal' onClick={event => event.stopPropagation()}>
      <div className='modal-head'><span>Schedule manager</span><button onClick={onClose}><X size={22} /></button></div>
      <div className='modal-body'>
        {editing ? <div className='schedule-form'>
          <div className='account-form-heading'><CalendarClock size={34} /><div><strong>{editing === 'new' ? 'Add schedule' : 'Edit schedule'}</strong><span>Create one reusable schedule and assign it to posts.</span></div></div>
          <div className='account-form-grid'>
            <div className='field'><label>Schedule name</label><input value={name} onChange={event => setName(event.target.value)} placeholder='Morning daily' /></div>
            <div className='field'><label>Time 24HH-MI</label><input type='time' value={time} onChange={event => setTime(event.target.value)} /></div>
            <div className='field'><label>Frequency</label><select value={frequency} onChange={event => setFrequency(event.target.value as ScheduleFrequency)}>{scheduleFrequencies.map(item => <option key={item} value={item}>{scheduleFrequencyLabels[item]}</option>)}</select></div>
            <div className='field'><label>{frequency === 'onetime' ? 'Schedule date' : 'Schedule end date'}</label><input type='date' value={endDate} onChange={event => setEndDate(event.target.value)} /></div>
            <div className='field'><label>Status</label><select value={status} onChange={event => setStatus(event.target.value as ScheduleStatus)}><option value='active'>Active</option><option value='inactive'>Inactive</option></select></div>
            {frequency === 'custom' && <div className='field'><label>Custom cron</label><input value={customCronExpression} onChange={event => setCustomCronExpression(event.target.value)} placeholder='30 9 * * 1-5' /></div>}
          </div>
          <div className='account-form-actions'><button className='btn-outline' onClick={closeForm}>Cancel</button><button className='btn-primary' onClick={saveSchedule} disabled={loading}>{loading ? <Loader2 className='spin' size={17} /> : <ShieldCheck size={17} />}Save schedule</button></div>
        </div> : <div className='schedule-list-view'>
          <div className='account-list-intro'><div><strong>{schedules.length} reusable {schedules.length === 1 ? 'schedule' : 'schedules'}</strong><span>Assign schedules from each post edit form.</span></div><button className='btn-primary' onClick={() => openForm()}><CalendarClock size={16} />Add schedule</button></div>
          <div className='schedule-list'>
            {schedules.length === 0 ? <div className='account-list-empty'><CalendarClock size={27} /><strong>No schedules yet</strong><span>Add a schedule, then select it from any post.</span><button className='btn-primary' onClick={() => openForm()}>Add first schedule</button></div> : schedules.map(schedule => {
              const postCount = uploads.filter(upload => upload.scheduleId === schedule.id).length;
              return <article className='schedule-row' key={schedule.id}>
                <div className='schedule-row-id'>#{schedule.id}</div>
                <div className='schedule-row-main'><strong>{schedule.name}</strong><small>{schedule.frequency === 'custom' ? schedule.customCronExpression : `${scheduleFrequencyLabels[schedule.frequency]} at ${schedule.time}`}{schedule.endDate ? ` - ends ${schedule.endDate}` : ''}</small></div>
                <span className={`schedule-status ${schedule.status}`}>{schedule.status}</span>
                <span className='schedule-account-count'><FileText size={14} />{postCount}</span>
                <button className='btn-outline' onClick={() => openForm(schedule)}><Pencil size={14} />Edit</button>
                <button className='btn-danger ghost-danger' onClick={() => removeSchedule(schedule)} disabled={loading || postCount > 0}><Trash2 size={14} /></button>
              </article>;
            })}
          </div>
        </div>}
      </div>
    </div>
  </div>;
}

function AccountManagerModal({ platform, accounts, onClose, onSuccess }: {
  platform: Platform;
  accounts: PlatformAccount[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [editing, setEditing] = useState<PlatformAccount | 'new' | null>(accounts.length === 0 ? 'new' : null);
  const [displayName, setDisplayName] = useState('');
  const [handle, setHandle] = useState('');
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginConfirmation, setLoginConfirmation] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loginAccountId, setLoginAccountId] = useState<string | null>(null);

  const openForm = (account?: PlatformAccount) => {
    setEditing(account ?? 'new');
    setDisplayName(account?.displayName ?? '');
    setHandle(account?.handle ?? '');
    setLoginIdentifier(account?.loginIdentifier ?? '');
    setLoginConfirmation(account?.loginConfirmation ?? '');
    setEnabled(account?.enabled ?? true);
  };

  const closeForm = () => {
    setEditing(null);
    setDisplayName('');
    setHandle('');
    setLoginIdentifier('');
    setLoginConfirmation('');
    setEnabled(true);
  };

  const openManualLogin = async (account: PlatformAccount) => {
    setLoginAccountId(account.id);
    try {
      const result = await api.startManualLogin(account.id);
      alert(result.message);
      onSuccess();
    } catch (error) {
      alert('Error: ' + (error instanceof Error ? error.message : 'Could not open manual login'));
    } finally {
      setLoginAccountId(null);
    }
  };

  const saveAccount = async (loginAfterSave = false) => {
    if (!displayName.trim()) return alert('Account name is required.');
    if (!handle.trim()) return alert('Account handle is required.');
    if (!loginIdentifier.trim()) return alert('Login email or username is required.');

    setLoading(true);
    try {
      const payload = {
        displayName: displayName.trim(),
        handle: handle.trim(),
        loginIdentifier: loginIdentifier.trim(),
        loginConfirmation: loginConfirmation.trim() || undefined,
        enabled,
      };
      const account = editing === 'new'
        ? await api.createAccount(platform, payload)
        : await api.updateAccount(editing!.id, payload);
      closeForm();
      onSuccess();
      if (loginAfterSave) await openManualLogin(account);
    } catch (error) {
      alert('Error: ' + (error instanceof Error ? error.message : 'Could not save account'));
    } finally {
      setLoading(false);
    }
  };

  const removeAccount = async (account: PlatformAccount) => {
    if (!confirm(`Delete ${account.displayName}?`)) return;
    setLoading(true);
    try {
      await api.deleteAccount(account.id);
      onSuccess();
    } catch (error) {
      alert('Error: ' + (error instanceof Error ? error.message : 'Could not delete account'));
    } finally {
      setLoading(false);
    }
  };

  return <div className='modal-overlay' onClick={onClose}>
    <div className='modal-panel account-manager-modal' onClick={event => event.stopPropagation()}>
      <div className='modal-head'><span>{platformLabels[platform]} accounts</span><button onClick={onClose}><X size={22} /></button></div>
      <div className='modal-body'>
        {editing ? <div className='account-form'>
          <div className='account-form-heading'><KeyRound size={34} /><div><strong>{editing === 'new' ? 'Add account' : 'Edit account'}</strong><span>Manual login creates the saved browser session used at schedule time.</span></div></div>
          <div className='account-form-grid'>
            <div className='field'><label>Account name</label><input value={displayName} onChange={event => setDisplayName(event.target.value)} placeholder='Brand Instagram' /></div>
            <div className='field'><label>Handle</label><input value={handle} onChange={event => setHandle(event.target.value)} placeholder='@brand' /></div>
            <div className='field'><label>Login email or username</label><input value={loginIdentifier} onChange={event => setLoginIdentifier(event.target.value)} placeholder='name@example.com' /></div>
            <div className='field account-form-wide'><label>Login confirmation</label><input value={loginConfirmation} onChange={event => setLoginConfirmation(event.target.value)} placeholder='Optional username, phone, or recovery hint for manual prompts' /></div>
            <label className='account-enabled-toggle'><input type='checkbox' checked={enabled} onChange={event => setEnabled(event.target.checked)} /><span>Enabled for publishing</span></label>
          </div>
          <div className='account-form-actions'>
            <button className='btn-outline' onClick={closeForm}>Cancel</button>
            <button className='btn-outline' onClick={() => saveAccount(true)} disabled={loading}>{loading ? <Loader2 className='spin' size={17} /> : <KeyRound size={17} />}Save & login</button>
            <button className='btn-primary' onClick={() => saveAccount(false)} disabled={loading}>{loading ? <Loader2 className='spin' size={17} /> : <ShieldCheck size={17} />}Save account</button>
          </div>
        </div> : <div className='account-list-view'>
          <div className='account-list-intro'><div><strong>{accounts.length} {platformLabels[platform]} {accounts.length === 1 ? 'account' : 'accounts'}</strong><span>Open login for each account once, then scheduled posts reuse that saved session.</span></div><button className='btn-primary' onClick={() => openForm()}><KeyRound size={16} />Add account</button></div>
          <div className='storage-access-list'>
            {accounts.length === 0 ? <div className='account-list-empty'><UsersRound size={27} /><strong>No publishing accounts yet</strong><span>Add an account, then open its login page and sign in manually.</span><button className='btn-primary' onClick={() => openForm()}>Add first account</button></div> : accounts.map(account => <article className='storage-access-row account-session-row' key={account.id}>
              <span className='publishing-account-icon'><CustomIcon platform={account.platform} size={18} /></span>
              <span><strong>{account.displayName}</strong><small>{platformLabels[account.platform]} · {account.handle}</small></span>
              <span className={`schedule-status ${account.enabled ? 'active' : 'inactive'}`}>{account.enabled ? 'active' : 'paused'}</span>
              <span className='storage-access-path'>{account.loginIdentifier}</span>
              <button className='btn-outline' onClick={() => openForm(account)} disabled={loading}><Pencil size={14} />Edit</button>
              <button className='btn-outline' onClick={() => openManualLogin(account)} disabled={Boolean(loginAccountId) || !account.enabled}>
                {loginAccountId === account.id ? <Loader2 className='spin' size={14} /> : <KeyRound size={14} />}Login
              </button>
              <button className='btn-danger ghost-danger' onClick={() => removeAccount(account)} disabled={loading}><Trash2 size={14} /></button>
            </article>)}
          </div>
        </div>}
      </div>
    </div>
  </div>;
}

function StorageAccessModal({ platform, accounts, storageConnections, permissions, onClose, onSuccess }: {
  platform: Platform;
  accounts: PlatformAccount[];
  storageConnections: StorageConnection[];
  permissions: RolePermissions;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [accountId, setAccountId] = useState('');
  const [storageType, setStorageType] = useState<StorageSourceType>('local_drive');
  const [displayName, setDisplayName] = useState('');
  const [folderPath, setFolderPath] = useState('');
  const [driveFolderId, setDriveFolderId] = useState('');
  const [driveFolderUrl, setDriveFolderUrl] = useState('');
  const [driveFolderName, setDriveFolderName] = useState('');
  const [loading, setLoading] = useState(false);
  const platformAccounts = accounts.filter(account => account.enabled);

  useEffect(() => {
    setAccountId(platformAccounts[0]?.id ?? '');
  }, [platformAccounts[0]?.id]);

  const save = async () => {
    if (!accountId) return alert('Choose a publishing account.');
    if (storageType === 'local_drive' && !folderPath.trim()) return alert('Local folder path is required.');
    if (storageType === 'google_drive' && !driveFolderId.trim() && !driveFolderUrl.trim()) return alert('Google Drive folder id or URL is required.');

    setLoading(true);
    try {
      if (storageType === 'local_drive') {
        await api.createLocalDriveConnection({
          accountId,
          folderPath: folderPath.trim(),
          displayName: displayName.trim() || undefined,
        });
      } else {
        await api.createGoogleDriveConnection({
          accountId,
          displayName: displayName.trim() || driveFolderName.trim() || 'Google Drive source',
          googleDriveFolderId: driveFolderId.trim() || undefined,
          googleDriveFolderUrl: driveFolderUrl.trim() || undefined,
          googleDriveFolderName: driveFolderName.trim() || undefined,
        });
      }
      onSuccess();
      setDisplayName('');
      setFolderPath('');
      setDriveFolderId('');
      setDriveFolderUrl('');
      setDriveFolderName('');
    } catch (error) {
      alert('Error: ' + (error instanceof Error ? error.message : 'Could not save storage access'));
    } finally {
      setLoading(false);
    }
  };

  const syncConnection = async (connection: StorageConnection) => {
    setLoading(true);
    try {
      await api.syncStorageConnection(connection.id);
      onSuccess();
    } catch (error) {
      alert('Error: ' + (error instanceof Error ? error.message : 'Could not sync storage source'));
    } finally {
      setLoading(false);
    }
  };

  const removeConnection = async (connection: StorageConnection) => {
    if (!confirm(`Remove ${connection.displayName}?`)) return;
    setLoading(true);
    try {
      await api.deleteStorageConnection(connection.id);
      onSuccess();
    } catch (error) {
      alert('Error: ' + (error instanceof Error ? error.message : 'Could not remove storage source'));
    } finally {
      setLoading(false);
    }
  };

  const accountName = (accountId: string) => {
    const account = accounts.find(item => item.id === accountId);
    return account ? `${account.displayName} (${account.handle})` : 'Publishing account';
  };

  return <div className='modal-overlay' onClick={onClose}>
    <div className='modal-panel account-manager-modal storage-access-modal' onClick={event => event.stopPropagation()}>
      <div className='modal-head'><span>{platformLabels[platform]} storage</span><button onClick={onClose}><X size={22} /></button></div>
      <div className='modal-body'>
        <div className='account-form'>
          <div className='account-form-heading'><FolderSync size={34} /><div><strong>Add storage source</strong><span>Connect Local Drive or Google Drive as the media source for posts.</span></div></div>
          <div className='account-form-grid'>
            <div className='field'><label>Storage type</label><select value={storageType} onChange={event => setStorageType(event.target.value as StorageSourceType)}><option value='local_drive'>Local Drive</option><option value='google_drive'>Google Drive</option></select></div>
            <div className='field'><label>Publishing account</label><select value={accountId} onChange={event => setAccountId(event.target.value)}><option value=''>Choose account</option>{platformAccounts.map(account => <option key={account.id} value={account.id}>{account.displayName} ({account.handle})</option>)}</select></div>
            <div className='field account-form-wide'><label>Display name</label><input value={displayName} onChange={event => setDisplayName(event.target.value)} placeholder={storageType === 'local_drive' ? 'Local campaign folder' : 'Google Drive campaign folder'} /></div>
            {storageType === 'local_drive' && <div className='field account-form-wide'><label>Local folder path</label><input value={folderPath} onChange={event => setFolderPath(event.target.value)} placeholder='C:\\Posts\\Instagram' /></div>}
            {storageType === 'google_drive' && <>
              <div className='field'><label>Drive folder id</label><input value={driveFolderId} onChange={event => setDriveFolderId(event.target.value)} placeholder='1AbCDEF...' /></div>
              <div className='field'><label>Drive folder name</label><input value={driveFolderName} onChange={event => setDriveFolderName(event.target.value)} placeholder='Campaign posts' /></div>
              <div className='field account-form-wide'><label>Drive folder URL</label><input value={driveFolderUrl} onChange={event => setDriveFolderUrl(event.target.value)} placeholder='https://drive.google.com/drive/folders/...' /></div>
            </>}
          </div>
          <div className='account-form-actions'><button className='btn-outline' onClick={onClose}>Close</button><button className='btn-primary' onClick={save} disabled={loading || !permissions.canManageStorageAccess}>{loading ? <Loader2 className='spin' size={17} /> : <FolderSync size={17} />}Add source</button></div>
        </div>
        <div className='account-list-view storage-access-list-view'>
          <div className='account-list-intro'><div><strong>{storageConnections.length} storage {storageConnections.length === 1 ? 'source' : 'sources'}</strong><span>Media imports should come from these connected sources.</span></div></div>
          <div className='storage-access-list'>
            {storageConnections.length === 0 ? <div className='account-list-empty'><FolderOpen size={27} /><strong>No storage sources yet</strong><span>Add a Local Drive or Google Drive connection to start importing media.</span></div> : storageConnections.map(connection => <article className='storage-access-row' key={connection.id}>
              <span className='publishing-account-icon'><FolderSync size={18} /></span>
              <span><strong>{connection.displayName}</strong><small>{storageSourceTypeLabels[connection.storageType]} · {accountName(connection.accountId)}</small></span>
              <span className={`schedule-status ${connection.status === 'connected' ? 'active' : 'inactive'}`}>{connection.status}</span>
              <span className='storage-access-path'>{connection.storageType === 'local_drive' ? connection.localFolderPath : connection.googleDriveFolderName || connection.googleDriveFolderId || connection.googleDriveFolderUrl}</span>
              {connection.storageType === 'local_drive' && <button className='btn-outline' onClick={() => syncConnection(connection)} disabled={loading}><RefreshCw size={14} />Sync</button>}
              <button className='btn-danger ghost-danger' onClick={() => removeConnection(connection)} disabled={loading}><Trash2 size={14} /></button>
            </article>)}
          </div>
        </div>
      </div>
    </div>
  </div>;
}

function UserManagementModal({ currentUser, users, onClose, onSuccess }: {
  currentUser: UserProfile;
  users: UserProfile[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [editing, setEditing] = useState<UserProfile | 'new' | null>(users.length === 0 ? 'new' : null);
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('viewer');
  const [isActive, setIsActive] = useState(true);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const openForm = (user?: UserProfile) => {
    setEditing(user ?? 'new');
    setUsername(user?.username ?? '');
    setFullName(user?.fullName ?? '');
    setEmail(user?.email ?? '');
    setRole(user?.role ?? 'viewer');
    setIsActive(user?.isActive ?? true);
    setPassword('');
  };

  const closeForm = () => {
    setEditing(null);
    setUsername('');
    setFullName('');
    setEmail('');
    setRole('viewer');
    setIsActive(true);
    setPassword('');
  };

  const saveUser = async () => {
    if (!username.trim()) return alert('Username is required.');
    if (!fullName.trim()) return alert('Full name is required.');
    if (editing === 'new' && password.length < 8) return alert('Password must be at least 8 characters.');
    setLoading(true);
    try {
      if (editing === 'new') {
        await api.createUser({ username: username.trim(), fullName: fullName.trim(), email: email.trim(), role, isActive, password });
      } else if (editing) {
        await api.updateUser(editing.id, { username: username.trim(), fullName: fullName.trim(), email: email.trim(), role, isActive, password: password || undefined });
      }
      closeForm();
      onSuccess();
    } catch (error) {
      alert('Error: ' + (error instanceof Error ? error.message : 'Could not save user'));
    } finally {
      setLoading(false);
    }
  };

  const deactivate = async (user: UserProfile) => {
    if (user.id === currentUser.id) return alert('You cannot deactivate your own session from here.');
    if (!confirm(`Deactivate ${user.fullName}?`)) return;
    setLoading(true);
    try {
      await api.deactivateUser(user.id);
      onSuccess();
    } catch (error) {
      alert('Error: ' + (error instanceof Error ? error.message : 'Could not deactivate user'));
    } finally {
      setLoading(false);
    }
  };

  return <div className='modal-overlay' onClick={onClose}>
    <div className='modal-panel account-manager-modal user-manager-modal' onClick={event => event.stopPropagation()}>
      <div className='modal-head'><span>User roles</span><button onClick={onClose}><X size={22} /></button></div>
      <div className='modal-body'>
        {editing ? <div className='account-form'>
          <div className='account-form-heading'><UsersRound size={34} /><div><strong>{editing === 'new' ? 'Add user' : 'Edit user'}</strong><span>Managers assign one role per user. The backend enforces each role.</span></div></div>
          <div className='account-form-grid'>
            <div className='field'><label>Username</label><input value={username} onChange={event => setUsername(event.target.value)} /></div>
            <div className='field'><label>Full name</label><input value={fullName} onChange={event => setFullName(event.target.value)} /></div>
            <div className='field account-form-wide'><label>Email</label><input value={email} onChange={event => setEmail(event.target.value)} /></div>
            <div className='field'><label>Role</label><select value={role} onChange={event => setRole(event.target.value as UserRole)}>{userRoles.map(item => <option key={item} value={item}>{userRoleLabels[item]}</option>)}</select></div>
            <label className='account-enabled-toggle'><input type='checkbox' checked={isActive} onChange={event => setIsActive(event.target.checked)} /><span>Active user</span></label>
            <div className='field account-form-wide'><label>{editing === 'new' ? 'Password' : 'New password'}</label><input type='password' value={password} onChange={event => setPassword(event.target.value)} autoComplete='new-password' /></div>
          </div>
          <div className='account-form-actions'><button className='btn-outline' onClick={closeForm}>Cancel</button><button className='btn-primary' onClick={saveUser} disabled={loading}>{loading ? <Loader2 className='spin' size={17} /> : <ShieldCheck size={17} />}Save user</button></div>
        </div> : <div className='account-list-view'>
          <div className='account-list-intro'><div><strong>{users.length} workspace {users.length === 1 ? 'user' : 'users'}</strong><span>Assign upload, schedule, manager, or view-only access.</span></div><button className='btn-primary' onClick={() => openForm()}><UsersRound size={16} />Add user</button></div>
          <div className='user-role-list'>{users.map(user => <article className='user-role-row' key={user.id}>
            <span className='workboard-user'>{roleInitials[user.role]}</span>
            <span><strong>{user.fullName}</strong><small>{user.username} - {userRoleLabels[user.role]}</small></span>
            <span className={`schedule-status ${user.isActive ? 'active' : 'inactive'}`}>{user.isActive ? 'active' : 'inactive'}</span>
            <button className='btn-outline' onClick={() => openForm(user)}><Pencil size={14} />Edit</button>
            <button className='btn-danger ghost-danger' onClick={() => deactivate(user)} disabled={loading || user.id === currentUser.id || !user.isActive}><Trash2 size={14} /></button>
          </article>)}</div>
        </div>}
      </div>
    </div>
  </div>;
}

function ActivityLogModal({ activityLogs, onClose }: {
  activityLogs: ActivityLog[];
  onClose: () => void;
}) {
  return <div className='modal-overlay' onClick={onClose}>
    <div className='modal-panel account-manager-modal activity-log-modal' onClick={event => event.stopPropagation()}>
      <div className='modal-head'><span>Operations activity</span><button onClick={onClose}><X size={22} /></button></div>
      <div className='modal-body'>
        <div className='account-list-view'>
          <div className='account-list-intro'><div><strong>{activityLogs.length} recent events</strong><span>Audit trail for uploads, schedules, users, accounts, folders, and automation.</span></div></div>
          <div className='activity-log-list'>{activityLogs.length === 0 ? <div className='account-list-empty'><ListFilter size={27} /><strong>No activity yet</strong><span>New actions will appear here after users start working.</span></div> : activityLogs.map(item => <article className='activity-log-row' key={item.id}>
            <span className='activity-dot' />
            <span><strong>{item.summary}</strong><small>{item.actorName ?? item.actorUsername ?? 'System'} - {item.action}</small></span>
            <time>{formatEventTime(item.createdAt)}</time>
          </article>)}</div>
        </div>
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
  schedules,
  permissions,
  onClose,
  onSuccess,
}: {
  upload: PlatformUpload;
  accounts: PlatformAccount[];
  schedules: PublishingSchedule[];
  permissions: RolePermissions;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [title, setTitle] = useState(upload.title ?? upload.caption);
  const [caption, setCaption] = useState(upload.caption);
  const [accountId, setAccountId] = useState(upload.accountId);
  const [scheduleMode, setScheduleMode] = useState<'none' | 'exact' | 'template'>(upload.scheduleId ? 'template' : upload.scheduledAt ? 'exact' : 'none');
  const [scheduleId, setScheduleId] = useState<number | ''>(upload.scheduleId ?? '');
  const [schedule, setSchedule] = useState(
    upload.scheduledAt ? toLocalDateTimeInputValue(new Date(upload.scheduledAt)) : "",
  );
  const [minimumSchedule] = useState(() => toLocalDateTimeInputValue(new Date(Date.now() + 60_000)));
  const [loading, setLoading] = useState(false);
  const isYouTube = upload.platform === "youtube";
  const canEditContent = permissions.canEditContent;
  const canEditSchedule = permissions.canSchedulePosts;

  const save = async () => {
    if (canEditContent && !caption.trim()) return alert("Caption is required");
    if (canEditContent && isYouTube && !title.trim()) return alert("Video title is required");

    const scheduledDate = scheduleMode === 'exact' && schedule ? new Date(schedule) : null;
    if (canEditSchedule && upload.folderSource && scheduleMode === 'none') return alert("Choose a schedule for this folder post");
    if (canEditSchedule && scheduleMode === 'exact' && !scheduledDate) return alert("Choose a scheduled date and time.");
    if (canEditSchedule && scheduleMode === 'template' && !scheduleId) return alert("Choose a schedule template.");
    if (scheduledDate && (!Number.isFinite(scheduledDate.getTime()) || scheduledDate.getTime() <= Date.now())) {
      return alert("Choose a scheduled date and time in the future");
    }

    setLoading(true);
    try {
      const payload: Record<string, unknown> = {};
      if (canEditContent) {
        payload.title = isYouTube ? title.trim() : undefined;
        payload.caption = caption.trim();
        payload.accountId = accountId;
      }
      if (canEditSchedule) {
        payload.scheduledAt = scheduleMode === 'exact' ? scheduledDate?.toISOString() ?? null : null;
        payload.scheduleId = scheduleMode === 'template' ? Number(scheduleId) : null;
      }
      await api.updateUploadDetails(upload.id, payload as any);
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
        <div className="modal-head"><span>{canEditContent && canEditSchedule ? 'Edit post' : canEditSchedule ? 'Schedule post' : 'Edit content'}</span><button onClick={onClose}><X size={22} /></button></div>
        <div className="modal-body">
          <div className="post-editor-workspace">
            <div className="post-editor-form">
              <div className="edit-source-row">
                <CustomIcon platform={upload.platform} size={28} />
                <div><strong>{upload.originalName}</strong><span>{platformLabels[upload.platform]}</span></div>
              </div>
              <div className='field'><label>Publish through account</label><select value={accountId} onChange={event => setAccountId(event.target.value)} disabled={Boolean(upload.folderSource)}>{accounts.map(account => <option key={account.id} value={account.id}>{account.displayName} ({account.handle}){account.enabled ? '' : ' — paused'}</option>)}</select>{upload.folderSource && <small className='field-help'>This post is locked to the account that owns its source folder.</small>}</div>
              {isYouTube && (
                <div className="field"><label>Video title</label><input type="text" value={title} onChange={event => setTitle(event.target.value)} disabled={!canEditContent} /></div>
              )}
              <div className="field">
                <label>{isYouTube ? "Description" : "Caption"}</label>
                <textarea rows={5} value={caption} onChange={event => setCaption(event.target.value)} disabled={!canEditContent} />
              </div>
              <div className="field">
                <label>Schedule option</label>
                <select value={scheduleMode} onChange={event => setScheduleMode(event.target.value as 'none' | 'exact' | 'template')} disabled={!canEditSchedule}>
                  <option value='none'>No schedule yet</option>
                  <option value='exact'>Exact date and time</option>
                  <option value='template'>Use schedule template</option>
                </select>
              </div>
              {scheduleMode === 'exact' && <div className="field">
                <label>Scheduled date and time</label>
                <input type="datetime-local" min={minimumSchedule} value={schedule} onChange={event => setSchedule(event.target.value)} disabled={!canEditSchedule} />
              </div>}
              {scheduleMode === 'template' && <div className="field">
                <label>Schedule template</label>
                <select value={scheduleId} onChange={event => setScheduleId(event.target.value ? Number(event.target.value) : '')} disabled={!canEditSchedule}>
                  <option value=''>Choose schedule</option>
                  {schedules.map(scheduleItem => <option key={scheduleItem.id} value={scheduleItem.id}>#{scheduleItem.id} {scheduleItem.name} - {scheduleFrequencyLabels[scheduleItem.frequency]} at {scheduleItem.time}{scheduleItem.status === 'inactive' ? ' (inactive)' : ''}</option>)}
                </select>
                <small className='field-help'>This applies only to this post.</small>
              </div>}
            </div>
            <NetworkPostPreview upload={upload} account={accounts.find(account => account.id === accountId)} title={title} caption={caption} />
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={loading}>
            {loading ? <Loader2 className="spin" size={17} /> : <Pencil size={17} />} Save
          </button>
        </div>
      </div>
    </div>
  );
}
