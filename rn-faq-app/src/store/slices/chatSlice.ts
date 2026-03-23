// src/store/slices/chatSlice.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { Message, Conversation } from '../../types';

interface ChatState {
  currentMessages: Message[];
  conversations: Conversation[];
  currentConversationId: string | null;
  isLoading: boolean;
  error: string | null;
  isTyping: boolean;
}

const initialState: ChatState = {
  currentMessages: [],
  conversations: [],
  currentConversationId: null,
  isLoading: false,
  error: null,
  isTyping: false,
};

const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
    clearError: (state) => {
      state.error = null;
    },
    setTyping: (state, action: PayloadAction<boolean>) => {
      state.isTyping = action.payload;
    },
    setCurrentMessages: (state, action: PayloadAction<Message[]>) => {
      state.currentMessages = action.payload;
    },
    addMessage: (state, action: PayloadAction<Message>) => {
      state.currentMessages.push(action.payload);
    },
    updateMessage: (state, action: PayloadAction<{ id: string; updates: Partial<Message> }>) => {
      const { id, updates } = action.payload;
      const index = state.currentMessages.findIndex(msg => msg.id === id);
      if (index !== -1) {
        state.currentMessages[index] = { ...state.currentMessages[index], ...updates };
      }
    },
    removeMessage: (state, action: PayloadAction<string>) => {
      state.currentMessages = state.currentMessages.filter(msg => msg.id !== action.payload);
    },
    clearMessages: (state) => {
      state.currentMessages = [];
      state.currentConversationId = null;
    },
    setConversations: (state, action: PayloadAction<Conversation[]>) => {
      state.conversations = action.payload;
    },
    addConversation: (state, action: PayloadAction<Conversation>) => {
      state.conversations.unshift(action.payload);
    },
    updateConversation: (state, action: PayloadAction<{ id: string; updates: Partial<Conversation> }>) => {
      const { id, updates } = action.payload;
      const index = state.conversations.findIndex(conv => conv.id === id);
      if (index !== -1) {
        state.conversations[index] = { ...state.conversations[index], ...updates };
      }
    },
    removeConversation: (state, action: PayloadAction<string>) => {
      state.conversations = state.conversations.filter(conv => conv.id !== action.payload);
      if (state.currentConversationId === action.payload) {
        state.currentConversationId = null;
        state.currentMessages = [];
      }
    },
    setCurrentConversationId: (state, action: PayloadAction<string | null>) => {
      state.currentConversationId = action.payload;
    },
  },
});

export const {
  setLoading,
  setError,
  clearError,
  setTyping,
  setCurrentMessages,
  addMessage,
  updateMessage,
  removeMessage,
  clearMessages,
  setConversations,
  addConversation,
  updateConversation,
  removeConversation,
  setCurrentConversationId,
} = chatSlice.actions;

export default chatSlice.reducer;