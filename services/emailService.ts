import emailjs from '@emailjs/browser';

// ============================================================
// SETUP: Replace these with your EmailJS credentials
// 1. Create free account at https://www.emailjs.com/
// 2. Add Email Service (Gmail etc.) → get SERVICE_ID
// 3. Create Template with: {{to_email}}, {{medicine_name}},
//    {{reminder_time}}, {{user_name}} → get TEMPLATE_ID
// 4. Copy Public Key from Account → API Keys
// ============================================================

const SERVICE_ID = 'YOUR_SERVICE_ID';
const TEMPLATE_ID = 'YOUR_TEMPLATE_ID';
const PUBLIC_KEY = 'YOUR_PUBLIC_KEY';

let initialized = false;

export function initEmailJS() {
    if (initialized) return;
    if (PUBLIC_KEY && PUBLIC_KEY !== 'YOUR_PUBLIC_KEY') {
        emailjs.init(PUBLIC_KEY);
        initialized = true;
    }
}

export function isEmailJSConfigured(): boolean {
    return SERVICE_ID !== 'YOUR_SERVICE_ID' && TEMPLATE_ID !== 'YOUR_TEMPLATE_ID' && PUBLIC_KEY !== 'YOUR_PUBLIC_KEY';
}

interface ReminderEmailParams {
    toEmail: string;
    medicineName: string;
    reminderTime: string;
    userName?: string;
}

export async function sendReminderEmail(params: ReminderEmailParams): Promise<boolean> {
    if (!isEmailJSConfigured()) {
        console.warn('[EmailJS] Not configured. Set VITE_EMAILJS_* env vars.');
        return false;
    }

    initEmailJS();

    try {
        await emailjs.send(SERVICE_ID, TEMPLATE_ID, {
            to_email: params.toEmail,
            medicine_name: params.medicineName,
            reminder_time: params.reminderTime,
            user_name: params.userName || 'User',
        });
        console.log(`[EmailJS] Reminder sent to ${params.toEmail} for ${params.medicineName}`);
        return true;
    } catch (error) {
        console.error('[EmailJS] Failed to send email:', error);
        return false;
    }
}

interface HealthCheckEmailParams {
    toEmail: string;
    userName?: string;
    frequency: string;
}

export async function sendHealthCheckEmail(params: HealthCheckEmailParams): Promise<boolean> {
    if (!isEmailJSConfigured()) return false;

    initEmailJS();

    try {
        await emailjs.send(SERVICE_ID, TEMPLATE_ID, {
            to_email: params.toEmail,
            medicine_name: 'Health Check Reminder',
            reminder_time: `${params.frequency} check`,
            user_name: params.userName || 'User',
        });
        return true;
    } catch (error) {
        console.error('[EmailJS] Failed to send health check email:', error);
        return false;
    }
}
