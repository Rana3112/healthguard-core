import { getBackendUrl } from '../src/lib/backendUrl';

interface ReminderEmailParams {
    toEmail: string;
    medicineName: string;
    reminderTime: string;
    userName?: string;
}

interface HealthCheckEmailParams {
    toEmail: string;
    userName?: string;
    frequency: string;
}

async function postEmail(path: string, payload: Record<string, string>): Promise<boolean> {
    try {
        const response = await fetch(`${getBackendUrl()}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const data = await response.json().catch(() => ({}));
        return response.ok && data.success === true;
    } catch (error) {
        console.error('[Email] Failed to send via backend:', error);
        return false;
    }
}

export async function sendReminderEmail(params: ReminderEmailParams): Promise<boolean> {
    return postEmail('/api/email/medicine-reminder', {
        email: params.toEmail,
        medicine_name: params.medicineName,
        reminder_time: params.reminderTime,
        user_name: params.userName || 'User',
    });
}

export async function sendHealthCheckEmail(params: HealthCheckEmailParams): Promise<boolean> {
    return postEmail('/api/email/health-check', {
        email: params.toEmail,
        user_name: params.userName || 'User',
        frequency: params.frequency,
    });
}
