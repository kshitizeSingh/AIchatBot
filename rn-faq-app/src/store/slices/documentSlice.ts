// src/store/slices/documentSlice.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { Document } from '../../types';

interface DocumentState {
  documents: Document[];
  selectedDocument: Document | null;
  isLoading: boolean;
  error: string | null;
  uploadProgress: number;
  isUploading: boolean;
}

const initialState: DocumentState = {
  documents: [],
  selectedDocument: null,
  isLoading: false,
  error: null,
  uploadProgress: 0,
  isUploading: false,
};

const documentSlice = createSlice({
  name: 'documents',
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
    setDocuments: (state, action: PayloadAction<Document[]>) => {
      state.documents = action.payload;
    },
    addDocument: (state, action: PayloadAction<Document>) => {
      state.documents.unshift(action.payload);
    },
    updateDocument: (state, action: PayloadAction<{ id: string; updates: Partial<Document> }>) => {
      const { id, updates } = action.payload;
      const index = state.documents.findIndex(doc => doc.id === id);
      if (index !== -1) {
        state.documents[index] = { ...state.documents[index], ...updates };
      }
    },
    removeDocument: (state, action: PayloadAction<string>) => {
      state.documents = state.documents.filter(doc => doc.id !== action.payload);
    },
    setSelectedDocument: (state, action: PayloadAction<Document | null>) => {
      state.selectedDocument = action.payload;
    },
    setUploadProgress: (state, action: PayloadAction<number>) => {
      state.uploadProgress = action.payload;
    },
    setUploading: (state, action: PayloadAction<boolean>) => {
      state.isUploading = action.payload;
      if (!action.payload) {
        state.uploadProgress = 0;
      }
    },
  },
});

export const {
  setLoading,
  setError,
  clearError,
  setDocuments,
  addDocument,
  updateDocument,
  removeDocument,
  setSelectedDocument,
  setUploadProgress,
  setUploading,
} = documentSlice.actions;

export default documentSlice.reducer;