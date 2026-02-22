import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
    appId: 'com.healthguard.ai',
    appName: 'HealthGuard AI',
    webDir: 'dist',
    server: {
        androidScheme: 'https'
    },
    android: {
        backgroundColor: '#f9fafb',
        allowMixedContent: true,
    }
};

export default config;
