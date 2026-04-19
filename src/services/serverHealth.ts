import { getBackendUrl } from "../lib/backendUrl";

type StatusCallback = (status: "online" | "offline" | "checking") => void;

let intervalId: ReturnType<typeof setInterval> | null = null;

export async function checkServerHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${getBackendUrl()}/`, { method: "GET" });
    return response.ok;
  } catch {
    return false;
  }
}

export function startHealthMonitor(callback: StatusCallback): void {
  const run = async () => {
    callback("checking");
    callback((await checkServerHealth()) ? "online" : "offline");
  };

  stopHealthMonitor();
  void run();
  intervalId = setInterval(() => {
    void run();
  }, 60000);
}

export function stopHealthMonitor(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
