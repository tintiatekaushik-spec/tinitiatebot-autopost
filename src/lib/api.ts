import type {
  AutomationInput,
  DashboardSummary,
  FolderConnection,
  Platform,
  PlatformAccount,
  PlatformUpload,
  UpdateUploadDetailsInput,
  UpdateUploadStatusInput,
  UpsertPlatformAccountInput
} from "../../shared/schema";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: init?.body instanceof FormData ? undefined : { "Content-Type": "application/json" },
    ...init
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

  folderConnections: () => request<FolderConnection[]>("/api/folder-connections"),

  accounts: (platform?: Platform) => request<PlatformAccount[]>(`/api/accounts${platform ? `?platform=${platform}` : ""}`),

  createAccount: (platform: Platform, payload: UpsertPlatformAccountInput) =>
    request<PlatformAccount>(`/api/platforms/${platform}/accounts`, { method: "POST", body: JSON.stringify(payload) }),

  updateAccount: (accountId: string, payload: UpsertPlatformAccountInput) =>
    request<PlatformAccount>(`/api/accounts/${accountId}`, { method: "PATCH", body: JSON.stringify(payload) }),

  deleteAccount: (accountId: string) =>
    request<void>(`/api/accounts/${accountId}`, { method: "DELETE" }),

  connectFolder: (accountId: string, folderPath: string) =>
    request<{ connection: FolderConnection; sync: { added: number; updated: number; removed: number } }>(
      `/api/accounts/${accountId}/folder-connection`,
      { method: "POST", body: JSON.stringify({ folderPath }) },
    ),

  disconnectFolder: (connectionId: string) =>
    request<void>(`/api/folder-connections/${connectionId}`, { method: "DELETE" }),
    
  automationInput: () => request<AutomationInput>("/api/automation/input"),
  
  runAutomation: () => request<{ message: string }>("/api/automation/run", {
    method: "POST"
  })
};
