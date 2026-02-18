// FCM v1 API Client for Supabase Edge Functions
// Firebase Cloud Messaging v1 API wrapper with OAuth2 authentication

/**
 * FCM v1 API configuration interface
 */
export interface FCMMetadata {
  projectId: string;
  clientId: string;
  privateKey: string;
}

/**
 * Android configuration for FCM message
 */
export interface AndroidConfig {
  priority?: 'normal' | 'high';
  ttl?: string;
  notification?: {
    channel_id?: string;
    sound?: string;
    click_action?: string;
  };
}

/**
 * APNs (iOS) configuration for FCM message
 */
export interface ApnsConfig {
  headers?: {
    'apns-priority'?: string;
    'apns-push-type'?: string;
  };
  payload?: {
    aps: {
      alert?: {
        title?: string;
        body?: string;
      };
      sound?: string;
      badge?: number;
    };
  };
}

/**
 * FCM message payload
 */
export interface FCMMessagePayload {
  token: string;
  data: Record<string, string>;
  notification?: {
    title: string;
    body: string;
  };
  android?: AndroidConfig;
  apns?: ApnsConfig;
}

/**
 * FCM send result
 */
export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  errorCode?: string;
}

/**
 * OAuth2 token response
 */
interface OAuth2Token {
  access_token: string;
  expires_in: number;
  token_type: string;
}

/**
 * FCM v1 API Client class
 */
export class FCMClient {
  private metadata: FCMMetadata;
  private accessToken: string | null = null;
  private tokenExpiry: number | null = null;

  constructor(metadata: FCMMetadata) {
    this.metadata = metadata;
  }

  /**
   * Get OAuth2 access token for FCM v1 API
   * Uses JWT assertion for service account authentication
   */
  private async getAccessToken(): Promise<string> {
    // Check if current token is still valid
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    // Create JWT assertion
    const header = {
      alg: 'RS256',
      typ: 'JWT'
    };

    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: this.metadata.clientId,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600
    };

    // Encode header and payload
    const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
    const encodedPayload = this.base64UrlEncode(JSON.stringify(payload));

    // Sign with private key
    const signatureInput = `${encodedHeader}.${encodedPayload}`;
    const signature = await this.sign(signatureInput);

    const assertion = `${signatureInput}.${signature}`;

    // Exchange for access token
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: assertion
      })
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      throw new Error(`Failed to get access token: ${errorText}`);
    }

    const tokenData: OAuth2Token = await tokenResponse.json();

    this.accessToken = tokenData.access_token;
    this.tokenExpiry = Date.now() + (tokenData.expires_in - 60) * 1000; // 1min buffer

    return this.accessToken;
  }

  /**
   * Base64 URL encode without padding
   */
  private base64UrlEncode(str: string): string {
    const base64 = btoa(str);
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }

  /**
   * Sign data with RSA private key using Web Crypto API
   */
  private async sign(data: string): Promise<string> {
    // Convert PEM format to DER
    const pemHeader = '-----BEGIN PRIVATE KEY-----';
    const pemFooter = '-----END PRIVATE KEY-----';
    const pemContents = this.metadata.privateKey
      .replace(pemHeader, '')
      .replace(pemFooter, '')
      .replace(/\s/g, '');

    const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));

    // Import private key
    const key = await crypto.subtle.importKey(
      'pkcs8',
      binaryDer,
      {
        name: 'RSASSA-PKCS1-v1_5',
        hash: 'SHA-256'
      },
      false,
      ['sign']
    );

    // Sign data
    const signature = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      key,
      new TextEncoder().encode(data)
    );

    // Convert to base64 URL
    return this.base64UrlEncode(String.fromCharCode(...Array.from(new Uint8Array(signature))));
  }

  /**
   * Send single message via FCM v1 API
   * @param payload FCM message payload
   * @returns Send result with success status
   */
  async send(payload: FCMMessagePayload): Promise<SendResult> {
    try {
      const token = await this.getAccessToken();
      const url = `https://fcm.googleapis.com/v1/projects/${this.metadata.projectId}/messages:send`;

      const body = {
        message: {
          token: payload.token,
          data: payload.data,
          ...(payload.notification && { notification: payload.notification }),
          android: payload.android || {
            priority: 'normal',
            ttl: '2419200s' // 28 days
          },
          ...(payload.apns && { apns: payload.apns })
        }
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('[FCM Client] API Error:', errorData);

        // Handle specific FCM error codes
        const errorCode = errorData.error?.status || 'UNKNOWN';
        const errorMessage = errorData.error?.message || 'FCM send failed';

        return {
          success: false,
          error: errorMessage,
          errorCode: errorCode
        };
      }

      const result = await response.json();
      return {
        success: true,
        messageId: result.name
      };
    } catch (error) {
      console.error('[FCM Client] Send error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Send messages to multiple tokens with concurrency control
   * @param tokens Array of FCM tokens
   * @param payload Message payload (without token)
   * @param concurrency Maximum parallel requests
   * @returns Array of send results
   */
  async sendBatch(
    tokens: string[],
    payload: Omit<FCMMessagePayload, 'token'>,
    concurrency = 10
  ): Promise<SendResult[]> {
    const results: SendResult[] = [];

    // Process in batches
    for (let i = 0; i < tokens.length; i += concurrency) {
      const batch = tokens.slice(i, i + concurrency);
      const batchResults = await Promise.allSettled(
        batch.map(token => this.send({ ...payload, token }))
      );

      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push({
            success: false,
            error: result.reason?.message || 'Batch send failed'
          });
        }
      }
    }

    return results;
  }

  /**
   * Check if error code indicates token should be invalidated
   * @param errorCode FCM error code
   * @returns true if token should be marked inactive
   */
  shouldInvalidateToken(errorCode: string): boolean {
    const invalidatableErrors = [
      'UNREGISTERED',
      'INVALID_ARGUMENT',
      'SENDER_ID_MISMATCH'
    ];
    return invalidatableErrors.includes(errorCode);
  }

  /**
   * Check if error is retryable
   * @param errorCode FCM error code
   * @returns true if operation should be retried
   */
  isRetryableError(errorCode: string): boolean {
    const retryableErrors = [
      'UNAVAILABLE',
      'INTERNAL',
      'DEVICE_MESSAGE_RATE_EXCEEDED',
      'TOO_MANY_REQUESTS'
    ];
    return retryableErrors.includes(errorCode);
  }
}

/**
 * Create FCM client from environment variables
 */
export function createFCMClient(): FCMClient {
  const projectId = Deno.env.get('FCM_PROJECT_ID');
  const clientId = Deno.env.get('FCM_CLIENT_EMAIL');
  const privateKey = Deno.env.get('FCM_PRIVATE_KEY');

  if (!projectId || !clientId || !privateKey) {
    throw new Error('Missing FCM configuration. Set FCM_PROJECT_ID, FCM_CLIENT_EMAIL, and FCM_PRIVATE_KEY environment variables.');
  }

  // Convert private key with newlines
  const formattedPrivateKey = privateKey.replace(/\\n/g, '\n');

  return new FCMClient({
    projectId,
    clientId,
    privateKey: formattedPrivateKey
  });
}
