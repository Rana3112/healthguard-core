const RAILWAY_BACKEND = "https://backend-production-96ca3.up.railway.app";
const OPENSHIFT_BACKEND =
  "https://healthguard-core-utkarshrana40-dev.apps.rm1.0a51.p1.openshiftapps.com";
const LOCAL_BACKEND = "http://localhost:5001";
const SHARED_BACKEND = import.meta.env.VITE_BACKEND_URL;
const ANDROID_BACKEND = import.meta.env.VITE_ANDROID_BACKEND_URL;

export function isCapacitor(): boolean {
  return !!(window as any)?.Capacitor?.isNativePlatform?.();
}

export function getBackendUrl(): string {
  if (isCapacitor()) {
    return ANDROID_BACKEND || SHARED_BACKEND || RAILWAY_BACKEND || OPENSHIFT_BACKEND;
  }

  return SHARED_BACKEND || RAILWAY_BACKEND || OPENSHIFT_BACKEND || LOCAL_BACKEND;
}

export const BACKEND_URL = getBackendUrl();
