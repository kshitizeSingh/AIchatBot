import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { encode as base64Encode } from 'base-64';
import HmacSHA256 from 'crypto-js/hmac-sha256';
import Base64 from 'crypto-js/enc-base64';
import type {
  SDKConfig,
  AuthResponse,
  Document,
  ChatResponse,
  Conversation,
  Message,
  User,
  UploadResponse,
  DocumentStatus,
  APIError
} from './types';

export class ApiService {
  private config: SDKConfig;

  constructor(config: SDKConfig) {
    this.config = config;
  }

  /**
   * Generate HMAC signature for request using crypto-js
   */
  private generateHMAC(method: string, path: string, body: any = null): { timestamp: number; signature: string } {
    const timestamp = Date.now();
    
    // CHANGE: Use JSON structure instead of pipe-delimited string to match server
    const payload = {
      method,
      path,
      timestamp: timestamp.toString(), // CHANGE: Ensure string consistency
      body: body || {}
    };

    // CHANGE: Generate HMAC-SHA256 with hex encoding
    const signature = HmacSHA256(JSON.stringify(payload), this.config.clientSecret).toString();

    return { timestamp, signature };
  }

  /**
   * Make authenticated request with JWT + HMAC
   */
  private async request(method: string, path: string, body: any = null): Promise<any> {
    const { timestamp, signature } = this.generateHMAC(method, path, body);

    // Get JWT token from storage
    const jwtToken = await AsyncStorage.getItem('access_token');

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Client-ID': this.config.clientId,
      'X-Timestamp': timestamp.toString(),
      'X-Signature': signature,
    };

    if (jwtToken) {
      headers['Authorization'] = `Bearer ${jwtToken}`;
    }

    const options: RequestInit = {
      method,
      headers,
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(`${this.config.apiBaseUrl}${path}`, options);

      if (!response.ok) {
        const error: APIError = await response.json();
        throw new Error(error.error || 'Request failed');
      }

      return await response.json();
    } catch (error) {
      if (this.config.debug) {
        console.error('API Request Error:', error);
      }
      throw error;
    }
  }

  // Authentication methods
  async login(email: string, password: string): Promise<AuthResponse> {
    const result = await this.request('POST', '/v1/auth/login', { email, password });

    // Store tokens
    await AsyncStorage.setItem('access_token', result.access_token);
    await AsyncStorage.setItem('refresh_token', result.refresh_token);

    return result;
  }

  async signup(email: string, password: string, orgId: string): Promise<AuthResponse> {
    return this.request('POST', '/v1/auth/signup', { email, password, org_id: orgId });
  }

  async refreshToken(): Promise<AuthResponse> {
    const refreshToken = await AsyncStorage.getItem('refresh_token');
    if (!refreshToken) throw new Error('No refresh token available');

    const result = await this.request('POST', '/v1/auth/refresh', { refresh_token: refreshToken });

    // Update stored tokens
    await AsyncStorage.setItem('access_token', result.access_token);
    await AsyncStorage.setItem('refresh_token', result.refresh_token);

    return result;
  }

  // Document methods
  async uploadDocument(filename: string, contentType: string): Promise<UploadResponse> {
    return this.request('POST', '/v1/documents/upload', { filename, content_type: contentType });
  }

  async getDocuments(): Promise<Document[]> {
    return this.request('GET', '/v1/documents');
  }

  async getDocumentStatus(id: string): Promise<DocumentStatus> {
    return this.request('GET', `/v1/documents/${id}/status`);
  }

  // Chat methods
  async sendMessage(query: string, conversationId?: string): Promise<ChatResponse> {
    return this.request('POST', '/v1/chat/query', {
      query,
      conversation_id: conversationId
    });
  }

  async getConversations(): Promise<Conversation[]> {
    return this.request('GET', '/v1/chat/conversations');
  }

  async getConversationHistory(id: string): Promise<Message[]> {
    return this.request('GET', `/v1/chat/history/${id}`);
  }

  // Admin methods
  async getUsers(): Promise<User[]> {
    return this.request('GET', '/v1/users');
  }

  async promoteUserToAdmin(userId: string): Promise<void> {
    return this.request('POST', '/v1/convert-user-to-admin', { user_id: userId });
  }

  async revokeUserAccess(userId: string): Promise<void> {
    return this.request('POST', '/v1/revoke-access', { user_id: userId });
  }
}