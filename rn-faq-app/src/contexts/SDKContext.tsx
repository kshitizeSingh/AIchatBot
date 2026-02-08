// src/contexts/SDKContext.tsx
import React from 'react';
import { AIFAQSDK } from 'ai-faq-sdk';

// Initialize SDK with environment variables
const sdk = new AIFAQSDK({
  clientId: process.env.EXPO_PUBLIC_CLIENT_ID || '',
  clientSecret: process.env.EXPO_PUBLIC_CLIENT_SECRET || '',
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL || '',
  debug: __DEV__
});

export const SDKContext = React.createContext<AIFAQSDK>(sdk);
export const SDKProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <SDKContext.Provider value={sdk}>
      {children}
    </SDKContext.Provider>
  );
};