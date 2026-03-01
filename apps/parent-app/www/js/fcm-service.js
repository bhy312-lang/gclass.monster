/**
 * FCM Service for Parent App
 * Handles FCM token registration, message reception, and ACK sending
 */

class FCMService {
  constructor() {
    this.token = null;
    this.messageListener = null;
    this.ackQueue = new Map(); // Queue for pending ACKs
    this.isInitialized = false;
    this.isNative = window.Capacitor?.getPlatform() !== 'web';
    this.currentToken = null; // ✅ 비인증 상태에서 수신된 토큰 저장용
  }

  /**
   * Initialize FCM service
   */
  async initialize() {
    if (this.isInitialized) {
      console.log('[FCM Service] Already initialized');
      return;
    }

    if (!this.isNative) {
      console.log('[FCM Service] Web environment, skipping native FCM');
      return;
    }

    const { PushNotifications, LocalNotifications } = window.Capacitor.Plugins;

    try {
      // Check plugin availability
      if (!PushNotifications) {
        console.error('[FCM Service] PushNotifications plugin not found');
        return;
      }

      // Request permission
      const result = await PushNotifications.requestPermissions();
      if (result.receive === 'granted') {
        console.log('[FCM Service] Push notification permission granted');
        await this.register();
      } else {
        console.warn('[FCM Service] Push notification permission denied');
      }

      // Setup listeners
      this.setupListeners();
      this.isInitialized = true;
    } catch (error) {
      console.error('[FCM Service] Initialization error:', error);
    }
  }

  /**
   * Register with FCM and get token
   */
  async register() {
    const { PushNotifications } = window.Capacitor.Plugins;

    try {
      // Register with FCM
      await PushNotifications.register();
      console.log('[FCM Service] Registered with FCM');

      // Listen for registration
      await PushNotifications.addListener('registration', async (token) => {
        console.log('[FCM Service] Registration token received:', token.value);
        this.token = token.value;
        await this.sendTokenToServer(token.value);
      });

      // Handle registration error
      await PushNotifications.addListener('registrationError', (error) => {
        console.error('[FCM Service] Registration error:', error.error);
      });
    } catch (error) {
      console.error('[FCM Service] Register error:', error);
    }
  }

  /**
   * Send FCM token to server
   */
  async sendTokenToServer(fcmToken) {
    try {
      this.currentToken = fcmToken; // ✅ 토큰 저장

      // ✅ 세션 체크 추가 - 401 에러 방지
      const { data: { session } } = await window.supabase.auth.getSession();
      if (!session) {
        console.warn('[FCM Service] No active session, skipping token registration. Will retry after login.');
        return;
      }

      const deviceInfo = await this.getDeviceInfo();

      // Supabase Edge Function 호출 (자동 인증)
      const { data, error } = await window.supabase.functions.invoke('fcm-token-register', {
        body: {
          fcm_token: fcmToken,
          device_info: deviceInfo,
          user_type: 'parent'
        }
      });

      if (error) {
        console.error('[FCM Service] Token registration failed:', error.message, error.status);
      } else if (data?.success) {
        console.log('[FCM Service] Token registered successfully');
      } else {
        console.error('[FCM Service] Token registration failed:', data?.error);
      }
    } catch (error) {
      console.error('[FCM Service] Failed to send token to server:', error);
    }
  }

  /**
   * ✅ 로그인 후 수동으로 토큰 등록을 시도하는 메서드
   */
  async registerTokenAfterLogin() {
    if (this.currentToken) {
      console.log('[FCM Service] Retrying token registration with new session...');
      await this.sendTokenToServer(this.currentToken);
    } else {
      console.log('[FCM Service] No cached token to register');
    }
  }

  /**
   * Setup notification listeners
   */
  setupListeners() {
    const { PushNotifications, LocalNotifications } = window.Capacitor.Plugins;

    // Listen for incoming notifications (app in foreground)
    PushNotifications.addListener('pushNotificationReceived', async (notification) => {
      console.log('[FCM Service] Push notification received:', notification);

      const data = notification.data || {};
      const messageId = data.message_id;

      // Schedule local notification for visibility
      if (LocalNotifications) {
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
          console.error('[FCM Service] Local notification error:', error);
        }
      } else {
        console.warn('[FCM Service] LocalNotifications plugin not available, skipping local schedule');
      }

      // Send ACK for delivered
      if (messageId) {
        await this.sendAck(messageId, 'delivered');
      }

      // Trigger custom event for app logic
      window.dispatchEvent(new CustomEvent('pushNotification', {
        detail: { notification, data }
      }));
    });

    // Listen for notification tap (app in background or killed)
    PushNotifications.addListener('pushNotificationActionPerformed', async (action) => {
      console.log('[FCM Service] Notification action performed:', action);

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
    if (LocalNotifications) {
      LocalNotifications.addListener('localNotificationActionPerformed', async (action) => {
        const data = action.notification.data || {};
        const messageId = data.message_id;

        if (messageId) {
          await this.sendAck(messageId, 'read');
        }

        this.handleNotificationNavigation(data);
      });
    }

    console.log('[FCM Service] Notification listeners setup complete');
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
        console.log(`[FCM Service] ACK sent (${ackType}):`, messageId);
      } else {
        console.warn(`[FCM Service] ACK failed, keeping in queue:`, messageId);
      }
    } catch (error) {
      console.error('[FCM Service] Failed to send ACK:', error);
      // Keep in queue for retry
    }
  }

  /**
   * Start ACK retry monitor (for offline scenarios)
   */
  startAckRetryMonitor() {
    // Check every 30 seconds
    setInterval(async () => {
      if (navigator.onLine && this.ackQueue.size > 0) {
        console.log(`[FCM Service] Retrying ${this.ackQueue.size} pending ACKs`);

        for (const [messageId, payload] of this.ackQueue.entries()) {
          if (payload.attempts < 3) {
            payload.attempts++;
            await this.sendAck(payload.message_id, payload.ack_type);
          } else {
            // Give up after 3 attempts
            console.warn(`[FCM Service] Giving up on ACK after 3 attempts:`, messageId);
            this.ackQueue.delete(messageId);
          }
        }
      }
    }, 30000);

    // Also retry when coming back online
    window.addEventListener('online', async () => {
      console.log('[FCM Service] Back online, retrying ACKs');
      // Trigger immediate retry
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
      if (!Device) {
        console.warn('[FCM Service] Device plugin not available');
        return { platform: 'android', os_version: 'unknown' };
      }

      const info = await Device.getInfo();
      const id = await Device.getId();

      return {
        platform: info.platform,
        os_version: info.osVersion,
        app_version: this.getAppVersion ? this.getAppVersion() : '1.0.0',
        device_id: id ? id.identifier : 'unknown',
        device_model: info.model,
        manufacturer: info.manufacturer
      };
    } catch (error) {
      console.error('[FCM Service] Error getting device info:', error);
      return { platform: 'android', error: error.message };
    }
  }

  /**
   * Get or generate persistent device ID
   */
  async getDeviceId() {
    let deviceId = localStorage.getItem('fcm_device_id');
    if (!deviceId) {
      deviceId = crypto.randomUUID();
      localStorage.setItem('fcm_device_id', deviceId);
    }
    return deviceId;
  }

  /**
   * Get app version
   */
  getAppVersion() {
    // Try to get from config
    const config = window.appConfig || {};
    return config.version || '1.0.0';
  }

  /**
   * Get current screen name
   */
  getCurrentScreen() {
    const path = window.location.pathname;
    if (path.includes('attendance')) return 'attendance';
    if (path.includes('course-registration')) return 'course_registration';
    if (path.includes('feedback')) return 'feedback';
    return 'unknown';
  }

  /**
   * Handle notification navigation
   */
  handleNotificationNavigation(data) {
    const type = data.type;

    switch (type) {
      case 'parent_registration_rejected':
        if (!window.location.pathname.includes('parent-status')) {
          window.location.href = '/parent-status.html';
        }
        break;
      case 'parent_registration_approved':
        if (!window.location.pathname.includes('parent-main')) {
          window.location.href = '/parent-main.html';
        }
        break;
      case 'attendance_check_in':
      case 'attendance_check_out':
        if (!window.location.pathname.includes('attendance')) {
          window.location.href = '/attendance.html';
        }
        break;
      case 'course_registration':
        if (!window.location.pathname.includes('course-registration')) {
          window.location.href = '/course-registration.html';
        }
        break;
      case 'general':
      default:
        // Stay on current screen
        break;
    }
  }

  /**
   * Generate notification ID from message ID
   */
  generateNotificationId(messageId) {
    if (!messageId) return Date.now();
    // Extract numeric part or use hash
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
    // Get from Supabase client
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
      console.log('[FCM Service] Unregistered');
    } catch (error) {
      console.error('[FCM Service] Unregister error:', error);
    }
  }
}

// Create singleton instance
window.fcmService = new FCMService();

// Auto-initialize on DOMContentLoaded
document.addEventListener('DOMContentLoaded', async () => {
  if (window.fcmService) {
    await window.fcmService.initialize();
    window.fcmService.startAckRetryMonitor();
  }
});

// Also initialize on deviceready for Capacitor
document.addEventListener('deviceready', async () => {
  if (window.fcmService && !window.fcmService.isInitialized) {
    await window.fcmService.initialize();
    window.fcmService.startAckRetryMonitor();
  }
});

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { FCMService };
}
