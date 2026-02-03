# AI FAQ SDK

A TypeScript SDK for integrating with the AI FAQ Platform in React Native applications.

## Features

- 🔐 **Dual Authentication**: JWT + HMAC signature-based authentication
- 📄 **Document Management**: Upload and manage documents
- 💬 **Real-time Chat**: Send messages and receive AI responses
- 👥 **User Management**: Admin functions for user management
- 📱 **React Native Optimized**: Built for Expo and React Native
- 🔒 **Secure**: HMAC signatures and secure token storage

## Installation

```bash
npm install ai-faq-sdk
```

## Quick Start

### 1. Initialize the SDK

```typescript
import { createAIFAQSDK } from 'ai-faq-sdk';

const sdk = createAIFAQSDK({
  apiBaseUrl: 'https://api.yourplatform.com',
  clientId: 'your_client_id',
  clientSecret: 'your_client_secret',
  debug: true // Enable debug logging
});
```

### 2. Authentication

```typescript
// Login
try {
  const result = await sdk.login('user@example.com', 'password');
  console.log('Logged in:', result.user);
} catch (error) {
  console.error('Login failed:', error);
}

// Check authentication status
const isAuth = await sdk.isAuthenticated();

// Logout
await sdk.logout();
```

### 3. Chat Functionality

```typescript
// Send a message
try {
  const response = await sdk.sendMessage('How do I reset my password?');
  console.log('AI Response:', response.answer);
  console.log('Sources:', response.sources);
} catch (error) {
  console.error('Chat error:', error);
}

// Get conversation history
const conversations = await sdk.getConversations();
const messages = await sdk.getConversationHistory(conversationId);
```

### 4. Document Management

```typescript
// Upload a document
const uploadResult = await sdk.uploadDocument('document.pdf', 'application/pdf');
console.log('Upload URL:', uploadResult.upload_url);

// Get documents
const documents = await sdk.getDocuments();

// Check document status
const status = await sdk.getDocumentStatus(documentId);
```

## Configuration

```typescript
interface SDKConfig {
  apiBaseUrl: string;      // Base URL for the API
  clientId: string;        // Organization client ID
  clientSecret: string;    // Organization client secret
  wsUrl?: string;          // WebSocket URL for real-time features
  debug?: boolean;         // Enable debug logging
}
```

## React Native Integration

### App Setup

```typescript
// App.tsx
import React from 'react';
import { AIFAQSDK, createAIFAQSDK } from 'ai-faq-sdk';

const sdk = createAIFAQSDK({
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL!,
  clientId: process.env.EXPO_PUBLIC_CLIENT_ID!,
  clientSecret: process.env.EXPO_PUBLIC_CLIENT_SECRET!,
});

export const SDKContext = React.createContext<AIFAQSDK>(sdk);

export default function App() {
  return (
    <SDKContext.Provider value={sdk}>
      {/* Your app components */}
    </SDKContext.Provider>
  );
}
```

### Component Usage

```typescript
// LoginScreen.tsx
import React, { useContext, useState } from 'react';
import { SDKContext } from '../App';

const LoginScreen = () => {
  const sdk = useContext(SDKContext);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = async () => {
    try {
      await sdk.login(email, password);
      // Navigate to main app
    } catch (error) {
      // Handle error
    }
  };

  return (
    // Your login UI
  );
};
```

## API Reference

### Authentication

- `login(email, password)` - Authenticate user
- `signup(email, password, orgId)` - Register new user
- `refreshToken()` - Refresh access token
- `logout()` - Clear authentication
- `isAuthenticated()` - Check auth status

### Chat

- `sendMessage(query, conversationId?)` - Send chat message
- `getConversations()` - Get user's conversations
- `getConversationHistory(id)` - Get conversation messages

### Documents

- `uploadDocument(filename, contentType)` - Get upload URL
- `getDocuments()` - List user's documents
- `getDocumentStatus(id)` - Check processing status

### Admin

- `getUsers()` - List organization users
- `promoteUserToAdmin(userId)` - Promote user to admin
- `revokeUserAccess(userId)` - Revoke user access

## Error Handling

The SDK throws errors for failed requests. Always wrap API calls in try-catch blocks:

```typescript
try {
  const result = await sdk.sendMessage('Hello');
} catch (error) {
  if (error.message.includes('Unauthorized')) {
    // Handle auth error
  } else {
    // Handle other errors
  }
}
```

## Security Notes

- Client secrets are embedded in the app bundle - consider security implications
- Use secure storage for sensitive data
- Implement proper error handling to avoid exposing sensitive information
- Consider using a proxy service for production deployments

## Development

### Building the SDK

```bash
# Install dependencies
npm install

# Build for production
npm run build

# Development build with watch
npm run dev

# Run tests
npm test

# Type checking
npm run type-check
```

### Publishing

```bash
# Build
npm run build

# Publish to NPM
npm publish
```

## License

MIT