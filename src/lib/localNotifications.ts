import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { MedicineReminderRecord } from './healthStore';

function notificationIdFromString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash % 2147483647) || Date.now() % 2147483647;
}

function nextOccurrence(time: string): Date {
  const [hourRaw, minuteRaw] = time.split(':');
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  const scheduled = new Date();
  scheduled.setHours(Number.isFinite(hour) ? hour : 8, Number.isFinite(minute) ? minute : 0, 0, 0);
  if (scheduled.getTime() <= Date.now()) {
    scheduled.setDate(scheduled.getDate() + 1);
  }
  return scheduled;
}

export function isNativeNotificationsAvailable(): boolean {
  return Capacitor.isNativePlatform();
}

export async function ensureLocalNotificationPermission(): Promise<boolean> {
  if (!isNativeNotificationsAvailable()) {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') return true;
      if (Notification.permission === 'denied') return false;
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }
    return false;
  }

  const current = await LocalNotifications.checkPermissions();
  if (current.display === 'granted') return true;
  const requested = await LocalNotifications.requestPermissions();
  return requested.display === 'granted';
}

export async function scheduleMedicineLocalNotification(reminder: MedicineReminderRecord): Promise<number[]> {
  if (!reminder.enabled) return [];
  const id = notificationIdFromString(reminder.id);

  if (!isNativeNotificationsAvailable()) {
    return [id];
  }

  const allowed = await ensureLocalNotificationPermission();
  if (!allowed) return [];

  await LocalNotifications.schedule({
    notifications: [
      {
        id,
        title: reminder.title,
        body: 'It is time to take your scheduled medicine.',
        schedule: {
          at: nextOccurrence(reminder.time),
          repeats: true,
          every: 'day',
          allowWhileIdle: true,
        },
      },
    ],
  });

  return [id];
}

export async function scheduleOneTimeLocalNotification(params: {
  id: string;
  title: string;
  body: string;
  at: Date;
}): Promise<number[]> {
  const id = notificationIdFromString(params.id);
  if (!isNativeNotificationsAvailable()) {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      const delay = params.at.getTime() - Date.now();
      if (delay > 0 && delay < 2147483647) {
        window.setTimeout(() => new Notification(params.title, { body: params.body }), delay);
      }
    }
    return [id];
  }

  const allowed = await ensureLocalNotificationPermission();
  if (!allowed) return [];

  await LocalNotifications.schedule({
    notifications: [
      {
        id,
        title: params.title,
        body: params.body,
        schedule: {
          at: params.at,
          allowWhileIdle: true,
        },
      },
    ],
  });

  return [id];
}

export async function cancelLocalNotifications(ids: Array<number | string> | undefined): Promise<void> {
  if (!ids?.length || !isNativeNotificationsAvailable()) return;
  await LocalNotifications.cancel({
    notifications: ids.map(id => ({ id: Number(id) })).filter(item => Number.isFinite(item.id)),
  });
}

export function formatNotificationTime(time: string): string {
  const [hourRaw, minuteRaw] = time.split(':');
  const date = new Date();
  date.setHours(Number(hourRaw) || 0, Number(minuteRaw) || 0, 0, 0);
  return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}
