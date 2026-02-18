/**
 * FCM Service for Admin App
 * Handles FCM token registration, message reception, and ACK sending
 */

class AdminFCMService {
  constructor() {
    this.token = null;
    this.ackQueue = new Map();
    this.isInitialized = false;
    this.isNative = window.Capacitor !== undefined;
  }

  /**
   * Initialize FCM service
   */
  async initialize() {
    if (this.isInitialized) {
      console.log('[Admin FCM] Already initialized');
      return;
    }

    if (!this.isNative) {
      console.log('[Admin FCM] Web environment, skipping native FCM');
      return;
    }

    const { PushNotifications, LocalNotifications } = window.Capacitor.Plugins;

    try {
      // Request permission
      const result = await PushNotifications.requestPermissions();
      if (result.receive === 'granted') {
        console.log('[Admin FCM] Push notification permission granted');
        await this.register();
      } else {
        console.warn('[Admin FCM] Push notification permission denied');
      }

      // Setup listeners
      this.setupListeners();
      this.isInitialized = true;
    } catch (error) {
      console.error('[Admin FCM] Initialization error:', error);
    }
  }

  /**
   * Register with FCM and get token
   */
  async register() {
    const { PushNotifications } = window.Capacitor.Plugins;

    try {
      await PushNotifications.register();
      console.log('[Admin FCM] Registered with FCM');

      await PushNotifications.addListener('registration', async (token) => {
        console.log('[Admin FCM] Registration token received:', token.value);
        this.token = token.value;
        await this.sendTokenToServer(token.value);
      });

      await PushNotifications.addListener('registrationError', (error) => {
        console.error('[Admin FCM] Registration error:', error.error);
      });
    } catch (error) {
      console.error('[Admin FCM] Register error:', error);
    }
  }

  /**
   * Send FCM token to server
   */
  async sendTokenToServer(fcmToken) {
    try {
      const deviceInfo = await this.getDeviceInfo();

      const response = await fetch('/api/v1/fcm/tokens/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.getAuthToken()}`
        },
        body: JSON.stringify({
          fcm_token: fcmToken,
          device_info: deviceInfo,
          user_type: 'admin'
        })
      });

      const result = await response.json();
      if (result.success) {
        console.log('[Admin FCM] Token registered successfully');
      } else {
        console.error('[Admin FCM] Token registration failed:', result.error);
      }
    } catch (error) {
      console.error('[Admin FCM] Failed to send token to server:', error);
    }
  }

  /**
   * Setup notification listeners
   */
  setupListeners() {
    const { PushNotifications, LocalNotifications } = window.Capacitor.Plugins;

    // Listen for incoming notifications (app in foreground)
    PushNotifications.addListener('pushNotificationReceived', async (notification) => {
      console.log('[Admin FCM] Push notification received:', notification);

      const data = notification.data || {};
      const messageId = data.message_id;

      // Schedule local notification for visibility
      try {
        await LocalNotifications.schedule({
          notifications: [{
            id: this.generateNotificationId(messageId),
            title: notification.title,
            body: notification.body,
            data: data,
            sound: 'default',
            smallText: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
          }]
        });
      } catch (error) {
        console.error('[Admin FCM] Local notification error:', error);
      }

      // Send ACK for delivered
      if (messageId) {
        await this.sendAck(messageId, 'delivered');
      }

      // Trigger custom event for app logic
      window.dispatchEvent(new CustomEvent('adminPushNotification', {
        detail: { notification, data }
      }));
    });

    // Listen for notification tap (app in background or killed)
    PushNotifications.addListener('pushNotificationActionPerformed', async (action) => {
      console.log('[Admin FCM] Notification action performed:', action);

      const data = action.notification.data || {};
      const messageId = data.message_id;

      // Send ACK for read
      if (messageId) {
        await this.sendAck(messageId, 'read');
      }

      // Navigate based on notification type
      this.handleNotificationNavigation(data);
    });

    // Listen for local notification tap
    LocalNotifications.addListener('localNotificationActionPerformed', async (action) => {
      const data = action.notification.data || {};
      const messageId = data.message_id;

      if (messageId) {
        await this.sendAck(messageId, 'read');
      }

      this.handleNotificationNavigation(data);
    });

    console.log('[Admin FCM] Notification listeners setup complete');
  }

  /**
   * Send acknowledgment to server
   */
  async sendAck(messageId, ackType) {
    const payload = {
      message_id: messageId,
      ack_type: ackType,
      client_timestamp: new Date().toISOString(),
      app_state: {
        foreground: document.visibilityState === 'visible',
        screen: this.getCurrentScreen(),
        url: window.location.pathname
      }
    };

    // Queue for retry if fails
    this.ackQueue.set(messageId, { ...payload, attempts: 0 });

    try {
      const response = await fetch('/api/v1/notifications/ack', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.getAuthToken()}`
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        this.ackQueue.delete(messageId);
        console.log(`[Admin FCM] ACK sent (${ackType}):`, messageId);
      } else {
        console.warn(`[Admin FCM] ACK failed, keeping in queue:`, messageId);
      }
    } catch (error) {
      console.error('[Admin FCM] Failed to send ACK:', error);
    }
  }

  /**
   * Start ACK retry monitor
   */
  startAckRetryMonitor() {
    setInterval(async () => {
      if (navigator.onLine && this.ackQueue.size > 0) {
        console.log(`[Admin FCM] Retrying ${this.ackQueue.size} pending ACKs`);

        for (const [messageId, payload] of this.ackQueue.entries()) {
          if (payload.attempts < 3) {
            payload.attempts++;
            await this.sendAck(payload.message_id, payload.ack_type);
          } else {
            console.warn(`[Admin FCM] Giving up on ACK after 3 attempts:`, messageId);
            this.ackQueue.delete(messageId);
          }
        }
      }
    }, 30000);

    window.addEventListener('online', async () => {
      console.log('[Admin FCM] Back online, retrying ACKs');
    });
  }

  /**
   * Get device information
   */
  async getDeviceInfo() {
    if (!this.isNative) {
      return {
        platform: 'web',
        user_agent: navigator.userAgent
      };
    }

    try {
      const { Device } = window.Capacitor.Plugins;
      const info = await Device.getInfo();

      return {
        platform: info.platform,
        os_version: info.osVersion,
        app_version: this.getAppVersion(),
        device_id: await this.getDeviceId(),
        device_model: info.model,
        manufacturer: info.manufacturer
      };
    } catch (error) {
      console.error('[Admin FCM] Error getting device info:', error);
      return { platform: 'unknown' };
    }
  }

  /**
   * Get or generate persistent device ID
   */
  async getDeviceId() {
    let deviceId = localStorage.getItem('admin_fcm_device_id');
    if (!deviceId) {
      deviceId = crypto.randomUUID();
      localStorage.setItem('admin_fcm_device_id', deviceId);
    }
    return deviceId;
  }

  /**
   * Get app version
   */
  getAppVersion() {
    const config = window.appConfig || {};
    return config.version || '1.0.0';
  }

  /**
   * Get current screen name
   */
  getCurrentScreen() {
    const path = window.location.pathname;
    if (path.includes('kiosk')) return 'kiosk';
    if (path.includes('franchise')) return 'franchise';
    if (path.includes('course-registration')) return 'course_registration';
    if (path.includes('admin-status')) return 'admin_status';
    return 'unknown';
  }

  /**
   * Handle notification navigation
   */
  handleNotificationNavigation(data) {
    const type = data.type;

    switch (type) {
      case 'student_approval':
      case 'franchise_approval':
        if (!window.location.pathname.includes('admin-status')) {
          window.location.href = '/admin-status.html';
        }
        break;
      case 'emergency':
        // Stay on current screen for emergency
        break;
      default:
        break;
    }
  }

  /**
   * Generate notification ID from message ID
   */
  generateNotificationId(messageId) {
    if (!messageId) return Date.now();
    const hash = messageId.split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0);
      return a & a;
    }, 0);
    return Math.abs(hash);
  }

  /**
   * Get Supabase auth token
   */
  getAuthToken() {
    if (window.supabase) {
      const { data } = window.supabase.auth.getSession();
      return data?.session?.access_token || '';
    }
    return localStorage.getItem('sb-access-token') || '';
  }

  /**
   * Unregister FCM token (logout)
   */
  async unregister() {
    try {
      const { PushNotifications } = window.Capacitor.Plugins;
      await PushNotifications.removeAllListeners();
      this.isInitialized = false;
      console.log('[Admin FCM] Unregistered');
    } catch (error) {
      console.error('[Admin FCM] Unregister error:', error);
    }
  }
}

// Create singleton instance
window.adminFcmService = new AdminFCMService();

// Auto-initialize on DOMContentLoaded
document.addEventListener('DOMContentLoaded', async () => {
  if (window.adminFcmService) {
    await window.adminFcmService.initialize();
    window.adminFcmService.startAckRetryMonitor();
  }
});

// Also initialize on deviceready for Capacitor
document.addEventListener('deviceready', async () => {
  if (window.adminFcmService && !window.adminFcmService.isInitialized) {
    await window.adminFcmService.initialize();
    window.adminFcmService.startAckRetryMonitor();
  }
});

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AdminFCMService };
}
