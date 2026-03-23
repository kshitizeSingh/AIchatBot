// Mock Redux Store
import { configureStore } from '@reduxjs/toolkit';
import type { RootState } from '../../store/store';

// Mock reducers
const mockAuthSlice = {
  name: 'auth',
  initialState: {
    user: null,
    isAuthenticated: false,
    loading: false,
    error: null,
  },
  reducers: {},
};

const mockDocumentSlice = {
  name: 'documents',
  initialState: {
    documents: [],
    loading: false,
    error: null,
  },
  reducers: {},
};

const mockChatSlice = {
  name: 'chat',
  initialState: {
    conversations: [],
    currentConversation: null,
    messages: [],
    loading: false,
    error: null,
  },
  reducers: {},
};

const mockUserSlice = {
  name: 'users',
  initialState: {
    users: [],
    loading: false,
    error: null,
  },
  reducers: {},
};

// Create mock store
export const createMockStore = (initialState?: Partial<RootState>) => {
  return configureStore({
    reducer: {
      auth: (state = mockAuthSlice.initialState) => state,
      documents: (state = mockDocumentSlice.initialState) => state,
      chat: (state = mockChatSlice.initialState) => state,
      users: (state = mockUserSlice.initialState) => state,
    },
    preloadedState: initialState,
  });
};

// Mock state data
export const mockAuthenticatedState: Partial<RootState> = {
  auth: {
    user: {
      id: '1',
      email: 'admin@example.com',
      role: 'admin',
    },
    isAuthenticated: true,
    loading: false,
    error: null,
  },
};

export const mockUnauthenticatedState: Partial<RootState> = {
  auth: {
    user: null,
    isAuthenticated: false,
    loading: false,
    error: null,
  },
};

export const mockDocumentsState: Partial<RootState> = {
  documents: {
    documents: [
      {
        id: '1',
        filename: 'test-doc.pdf',
        status: 'processed',
        uploadedAt: '2024-01-01T00:00:00Z',
        size: 1024,
      },
    ],
    loading: false,
    error: null,
  },
};

export const mockUsersState: Partial<RootState> = {
  users: {
    users: [
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
    ],
    loading: false,
    error: null,
  },
};