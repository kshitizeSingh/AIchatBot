// Mock AI FAQ SDK
import type { AIFAQSDK } from 'ai-faq-sdk';

export const createMockSDK = (): jest.Mocked<AIFAQSDK> => ({
  // Authentication methods
  login: jest.fn(),
  signup: jest.fn(),
  refreshToken: jest.fn(),
  logout: jest.fn(),
  isAuthenticated: jest.fn(),

  // Document methods
  uploadDocument: jest.fn(),
  getDocuments: jest.fn(),
  getDocumentStatus: jest.fn(),

  // Chat methods
  sendMessage: jest.fn(),
  getConversations: jest.fn(),
  getConversationHistory: jest.fn(),

  // Admin methods
  getUsers: jest.fn(),
  promoteUserToAdmin: jest.fn(),
  revokeUserAccess: jest.fn(),
} as jest.Mocked<AIFAQSDK>);

// Mock data
export const mockDocuments = [
  {
    id: '1',
    filename: 'test-doc-1.pdf',
    status: 'processed',
    uploadedAt: '2024-01-01T00:00:00Z',
    size: 1024,
  },
  {
    id: '2',
    filename: 'test-doc-2.pdf',
    status: 'processing',
    uploadedAt: '2024-01-02T00:00:00Z',
    size: 2048,
  },
];

export const mockUsers = [
  {
    id: '1',
    email: 'user1@example.com',
    role: 'user',
    createdAt: '2024-01-01T00:00:00Z',
  },
  {
    id: '2',
    email: 'admin@example.com',
    role: 'admin',
    createdAt: '2024-01-01T00:00:00Z',
  },
];

export const mockConversations = [
  {
    id: '1',
    title: 'Test Conversation 1',
    createdAt: '2024-01-01T00:00:00Z',
    lastMessage: 'Hello, how can I help?',
  },
  {
    id: '2',
    title: 'Test Conversation 2',
    createdAt: '2024-01-02T00:00:00Z',
    lastMessage: 'What is the weather like?',
  },
];

export const mockMessages = [
  {
    id: '1',
    content: 'Hello',
    role: 'user',
    timestamp: '2024-01-01T00:00:00Z',
  },
  {
    id: '2',
    content: 'Hello! How can I help you today?',
    role: 'assistant',
    timestamp: '2024-01-01T00:01:00Z',
  },
];

export const mockAuthResponse = {
  user: {
    id: '1',
    email: 'test@example.com',
    role: 'admin',
  },
  token: 'mock-jwt-token',
  refreshToken: 'mock-refresh-token',
};

export const mockUploadResponse = {
  uploadUrl: 'https://example.com/upload',
  documentId: 'doc-123',
  fields: {
    key: 'documents/doc-123.pdf',
    'Content-Type': 'application/pdf',
  },
};