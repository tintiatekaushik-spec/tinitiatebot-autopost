import type {
  ActivityLog,
  AutomationInput,
  CreateUserProfileInput,
  DashboardSummary,
  CreateGoogleDriveStorageConnectionInput,
  CreateLocalDriveStorageConnectionInput,
  LoginInput,
  Platform,
  PlatformAccount,
  PlatformUpload,
  PublishingSchedule,
  SocialMediaSchedule,
  StorageConnection,
  UpdateUploadDetailsInput,
  UpdateUploadStatusInput,
  UpdateUserProfileInput,
  UpsertPlatformAccountInput,
  UpsertPublishingScheduleInput,
  UserProfile
} from "../../shared/schema";

const API_BASE = import.meta.env.VITE_API_URL ?? "";
let authToken: string | null = null;

export type AuthResponse = {
  user: UserProfile;
  token: string;
};

export type LocalDriveConnectionResponse = {
  connection: StorageConnection;
  sync: {
    added: number;
    updated: number;
    removed: number;
    retainedHistory?: number;
  };
};

export function setAuthToken(token: string | null) {
  authToken = token;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!(init?.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (authToken) {
    headers.set("Authorization", `Bearer ${authToken}`);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(error?.message ?? `Request failed with ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export function assetUrl(url: string) {
  if (url.startsWith("http") || url.startsWith("data:")) return url;
  return `${API_BASE}${url}`;
}

export const api = {
  login: (payload: LoginInput) =>
    request<AuthResponse>("/api/auth/login", { method: "POST", body: JSON.stringify(payload) }),

  me: () => request<UserProfile>("/api/auth/me"),

  dashboard: () => request<DashboardSummary>("/api/dashboard"),
  
  uploads: (platform?: Platform, accountId?: string) => {
    const query = new URLSearchParams();
    if (platform) query.set("platform", platform);
    if (accountId) query.set("accountId", accountId);
    return request<PlatformUpload[]>(`/api/uploads${query.size ? `?${query}` : ""}`);
  },
  
  updateUploadStatus: (id: string, payload: UpdateUploadStatusInput) =>
    request<PlatformUpload>(`/api/uploads/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),

  updateUploadDetails: (id: string, payload: UpdateUploadDetailsInput) =>
    request<PlatformUpload>(`/api/uploads/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),

  deleteUpload: (id: string) =>
    request<void>(`/api/uploads/${id}`, {
      method: "DELETE"
    }),

  storageConnections: () => request<StorageConnection[]>("/api/storage-connections"),

  createLocalDriveConnection: (payload: CreateLocalDriveStorageConnectionInput) =>
    request<LocalDriveConnectionResponse>("/api/storage-connections/local-drive", {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  createGoogleDriveConnection: (payload: CreateGoogleDriveStorageConnectionInput) =>
    request<StorageConnection>("/api/storage-connections/google-drive", {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  syncStorageConnection: (connectionId: string) =>
    request<LocalDriveConnectionResponse>(`/api/storage-connections/${connectionId}/sync`, {
      method: "POST"
    }),

  deleteStorageConnection: (connectionId: string) =>
    request<void>(`/api/storage-connections/${connectionId}`, { method: "DELETE" }),

  accounts: (platform?: Platform) => request<PlatformAccount[]>(`/api/accounts${platform ? `?platform=${platform}` : ""}`),

  schedules: () => request<PublishingSchedule[]>("/api/schedules"),

  socialMediaSchedules: () => request<SocialMediaSchedule[]>("/api/social-media-schedules"),

  createSchedule: (payload: UpsertPublishingScheduleInput) =>
    request<PublishingSchedule>("/api/schedules", { method: "POST", body: JSON.stringify(payload) }),

  updateSchedule: (scheduleId: number, payload: UpsertPublishingScheduleInput) =>
    request<PublishingSchedule>(`/api/schedules/${scheduleId}`, { method: "PATCH", body: JSON.stringify(payload) }),

  deleteSchedule: (scheduleId: number) =>
    request<void>(`/api/schedules/${scheduleId}`, { method: "DELETE" }),

  createAccount: (platform: Platform, payload: UpsertPlatformAccountInput) =>
    request<PlatformAccount>(`/api/platforms/${platform}/accounts`, { method: "POST", body: JSON.stringify(payload) }),

  updateAccount: (accountId: string, payload: UpsertPlatformAccountInput) =>
    request<PlatformAccount>(`/api/accounts/${accountId}`, { method: "PATCH", body: JSON.stringify(payload) }),

  deleteAccount: (accountId: string) =>
    request<void>(`/api/accounts/${accountId}`, { method: "DELETE" }),

  users: () => request<UserProfile[]>("/api/users"),

  createUser: (payload: CreateUserProfileInput) =>
    request<UserProfile>("/api/users", { method: "POST", body: JSON.stringify(payload) }),

  updateUser: (userId: string, payload: UpdateUserProfileInput) =>
    request<UserProfile>(`/api/users/${userId}`, { method: "PATCH", body: JSON.stringify(payload) }),

  deactivateUser: (userId: string) =>
    request<void>(`/api/users/${userId}`, { method: "DELETE" }),

  activityLogs: (limit = 100) => request<ActivityLog[]>(`/api/activity-logs?limit=${limit}`),
    
  automationInput: () => request<AutomationInput>("/api/automation/input"),
  
  runAutomation: () => request<{ message: string }>("/api/automation/run", {
    method: "POST"
  })
};
