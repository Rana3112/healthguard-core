const OPENSHIFT_BACKEND =
  "https://healthguard-core-utkarshrana40-dev.apps.rm1.0a51.p1.openshiftapps.com";
const LOCAL_BACKEND = "http://localhost:5001";

export function isCapacitor(): boolean {
  return !!(window as any)?.Capacitor?.isNativePlatform?.();
}

export function getBackendUrl(): string {
  const env = (import.meta as any)?.env;
  const sharedUrl = env?.VITE_BACKEND_URL;
  const androidUrl = env?.VITE_ANDROID_BACKEND_URL;

  if (isCapacitor()) {
    return androidUrl || sharedUrl || OPENSHIFT_BACKEND;
  }

  return sharedUrl || OPENSHIFT_BACKEND || LOCAL_BACKEND;
}

export const BACKEND_URL = getBackendUrl();
