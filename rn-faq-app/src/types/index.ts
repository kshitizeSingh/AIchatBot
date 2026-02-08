// src/types/index.ts
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

export interface Document {
  id: string;
  filename: string;
  content_type: string;
  size: number;
  status: 'uploading' | 'processing' | 'completed' | 'failed';
  uploaded_at: string;
  processed_at?: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  sources?: Source[];
}

export interface Source {
  document_id: string;
  filename: string;
  content: string;
  relevance_score: number;
}

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

export interface ChatResponse {
  answer: string;
  conversation_id: string;
  sources: Source[];
  timestamp: string;
}

export interface AuthResponse {
  user: User;
  access_token: string;
  refresh_token: string;
  organization: Organization;
}

export interface UploadResponse {
  document_id: string;
  upload_url: string;
  status: string;
}

export interface DocumentStatus {
  id: string;
  status: string;
  progress?: number;
  error?: string;
}

// Navigation types
export type RootStackParamList = {
  Auth: undefined;
  Admin: undefined;
  User: undefined;
};

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
  OrgSetup: undefined;
};

export type AdminTabParamList = {
  Dashboard: undefined;
  Documents: undefined;
  Users: undefined;
  Settings: undefined;
};

export type UserStackParamList = {
  Chat: undefined;
  History: undefined;
  Profile: undefined;
};