import type { SDKConfig, AuthResponse, Document, ChatResponse, Conversation, Message, User, UploadResponse, DocumentStatus } from './core/types';
/**
 * Main AI FAQ SDK Class
 * Provides a unified interface for interacting with the AI FAQ Platform
 */
export declare class AIFAQSDK {
    private apiService;
    private authService;
    constructor(config: SDKConfig);
    login(email: string, password: string): Promise<AuthResponse>;
    signup(email: string, password: string, orgId: string): Promise<AuthResponse>;
    refreshToken(): Promise<AuthResponse>;
    logout(): Promise<void>;
    isAuthenticated(): Promise<boolean>;
    uploadDocument(filename: string, contentType: string): Promise<UploadResponse>;
    getDocuments(): Promise<Document[]>;
    getDocumentStatus(id: string): Promise<DocumentStatus>;
    sendMessage(query: string, conversationId?: string): Promise<ChatResponse>;
    getConversations(): Promise<Conversation[]>;
    getConversationHistory(id: string): Promise<Message[]>;
    getUsers(): Promise<User[]>;
    promoteUserToAdmin(userId: string): Promise<void>;
    revokeUserAccess(userId: string): Promise<void>;
}
/**
 * Factory function for easy SDK initialization
 */
export declare function createAIFAQSDK(config: SDKConfig): AIFAQSDK;
export default AIFAQSDK;
