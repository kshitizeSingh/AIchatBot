import { ApiService } from './core/ApiService';
import { AuthService } from './core/AuthService';
import type {
  SDKConfig,
  AuthResponse,
  Document,
  ChatResponse,
  Conversation,
  Message,
  User,
  UploadResponse,
  DocumentStatus
} from './core/types';

/**
 * Main AI FAQ SDK Class
 * Provides a unified interface for interacting with the AI FAQ Platform
 */
export class AIFAQSDK {
  private apiService: ApiService;
  private authService: AuthService;

  constructor(config: SDKConfig) {
    this.apiService = new ApiService(config);
    this.authService = new AuthService(this.apiService);
  }

  // Authentication methods
  async login(email: string, password: string): Promise<AuthResponse> {
    return this.authService.login(email, password);
  }

  async signup(email: string, password: string, orgId: string): Promise<AuthResponse> {
    return this.authService.signup(email, password, orgId);
  }

  async refreshToken(): Promise<AuthResponse> {
    return this.authService.refreshToken();
  }

  async logout(): Promise<void> {
    return this.authService.logout();
  }

  async isAuthenticated(): Promise<boolean> {
    return this.authService.isAuthenticated();
  }

  // Document methods
  async uploadDocument(filename: string, contentType: string): Promise<UploadResponse> {
    return this.apiService.uploadDocument(filename, contentType);
  }

  async getDocuments(): Promise<Document[]> {
    return this.apiService.getDocuments();
  }

  async getDocumentStatus(id: string): Promise<DocumentStatus> {
    return this.apiService.getDocumentStatus(id);
  }

  // Chat methods
  async sendMessage(query: string, conversationId?: string): Promise<ChatResponse> {
    return this.apiService.sendMessage(query, conversationId);
  }

  async getConversations(): Promise<Conversation[]> {
    return this.apiService.getConversations();
  }

  async getConversationHistory(id: string): Promise<Message[]> {
    return this.apiService.getConversationHistory(id);
  }

  // Admin methods
  async getUsers(): Promise<User[]> {
    return this.apiService.getUsers();
  }

  async promoteUserToAdmin(userId: string): Promise<void> {
    return this.apiService.promoteUserToAdmin(userId);
  }

  async revokeUserAccess(userId: string): Promise<void> {
    return this.apiService.revokeUserAccess(userId);
  }
}

/**
 * Factory function for easy SDK initialization
 */
export function createAIFAQSDK(config: SDKConfig): AIFAQSDK {
  return new AIFAQSDK(config);
}

// Default export
export default AIFAQSDK;