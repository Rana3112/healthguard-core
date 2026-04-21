const PERMISSIONS_REQUESTED_KEY = "healthguard_permissions_requested";

export function isNativePlatform(): boolean {
  return !!(window as any)?.Capacitor?.isNativePlatform?.();
}

export function isMicrophoneSupported(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
}

export async function requestAllPermissions(): Promise<Record<string, string>> {
  const result: Record<string, string> = {};

  if (!isNativePlatform()) {
    result.platform = "web";
    return result;
  }

  // Request Microphone
  try {
    if (isMicrophoneSupported()) {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      result.microphone = "granted";
    }
  } catch {
    result.microphone = "denied";
  }

  // Request Geolocation
  try {
    if ("geolocation" in navigator) {
      await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
      });
      result.geolocation = "granted";
    }
  } catch (error) {
    console.warn("[Permissions] Geolocation denied or timed out:", error);
    result.geolocation = "denied";
  }

  return result;
}

export async function requestMicrophoneWithSettingsPrompt(): Promise<boolean> {
  try {
    if (!isMicrophoneSupported()) return false;
    await navigator.mediaDevices.getUserMedia({ audio: true });
    return true;
  } catch {
    return false;
  }
}

export function hasRequestedPermissionsBefore(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(PERMISSIONS_REQUESTED_KEY) === "true";
}

export function markPermissionsRequested(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(PERMISSIONS_REQUESTED_KEY, "true");
}
