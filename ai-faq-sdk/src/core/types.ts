// AI FAQ SDK - TypeScript Type Definitions

export interface SDKConfig {
  apiBaseUrl: string;
  clientId: string;
  clientSecret: string;
  wsUrl?: string;
  debug?: boolean;
  storage?: StorageInterface;
}

export interface StorageInterface {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

// Authentication Types
export interface AuthResponse {
  user: User;
  access_token: string;
  refresh_token: string;
  organization: Organization;
  expires_in: number;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface SignupRequest {
  email: string;
  password: string;
  org_id: string;
}

export interface RefreshTokenRequest {
  refresh_token: string;
}

// User Types
export interface User {
  id: string;
  email: string;
  role: 'admin' | 'user';
  org_id: string;
  created_at: string;
  updated_at: string;
}

export interface Organization {
  id: string;
  name: string;
  client_id: string;
  created_at: string;
}

// Document Types
export interface Document {
  id: string;
  filename: string;
  content_type: string;
  size: number;
  status: 'pending' | 'uploaded' | 'processing' | 'completed' | 'failed';
  uploaded_at: string;
  processed_at?: string;
  org_id: string;
}

export interface UploadResponse {
  document_id: string;
  upload_url: string;
  expires_in: number;
}

export interface DocumentStatus {
  id: string;
  status: string;
  progress?: number;
  error?: string;
}

// Chat Types
export interface ChatResponse {
  answer: string;
  sources: Source[];
  conversation_id?: string;
  timestamp: string;
}

export interface Source {
  document_id: string;
  filename: string;
  content: string;
  relevance_score: number;
}

export interface Conversation {
  id: string;
  title?: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  sources?: Source[];
}

// Admin Types
export interface UserListResponse {
  users: User[];
  total: number;
  page: number;
  limit: number;
}

export interface PromoteUserRequest {
  user_id: string;
}

export interface RevokeAccessRequest {
  user_id: string;
}

// Error Types
export interface APIError {
  error: string;
  code?: string;
  details?: any;
}

// WebSocket Types
export interface WebSocketMessage {
  type: 'message' | 'typing' | 'error';
  data: any;
  timestamp: string;
}

// Utility Types
export type RequestMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export interface RequestConfig {
  method: RequestMethod;
  path: string;
  body?: any;
  headers?: Record<string, string>;
}