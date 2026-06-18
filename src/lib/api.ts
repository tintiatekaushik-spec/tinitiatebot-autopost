import type { AutomationInput, DashboardSummary, Platform, PlatformUpload, UpdateUploadStatusInput } from "../../shared/schema";

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
  
  uploads: (platform?: Platform) => request<PlatformUpload[]>(`/api/uploads${platform ? `?platform=${platform}` : ""}`),
  
  // 👈 UPDATED: Added 'title' parameter
  uploadToPlatform: (platform: Platform, file: File, title: string, caption: string, scheduledAt?: string) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("title", title);
    formData.append("caption", caption);
    if (scheduledAt) formData.append("scheduledAt", scheduledAt);

    return request<PlatformUpload>(`/api/platforms/${platform}/uploads`, {
      method: "POST",
      body: formData
    });
  },
  
  updateUploadStatus: (id: string, payload: UpdateUploadStatusInput) =>
    request<PlatformUpload>(`/api/uploads/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
    
  deleteUpload: (id: string) =>
    request<void>(`/api/uploads/${id}`, {
      method: "DELETE"
    }),
    
  automationInput: () => request<AutomationInput>("/api/automation/input"),
  
  runAutomation: () => request<{ message: string }>("/api/automation/run", {
    method: "POST"
  })
};