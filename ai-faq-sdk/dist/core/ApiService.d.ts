import type { SDKConfig, AuthResponse, Document, ChatResponse, Conversation, Message, User, UploadResponse, DocumentStatus } from './types';
export declare class ApiService {
    private config;
    constructor(config: SDKConfig);
    /**
     * Generate HMAC signature for request using crypto-js
     */
    private generateHMAC;
    /**
     * Make authenticated request with JWT + HMAC
     */
    private request;
    login(email: string, password: string): Promise<AuthResponse>;
    signup(email: string, password: string, orgId: string): Promise<AuthResponse>;
    refreshToken(): Promise<AuthResponse>;
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
