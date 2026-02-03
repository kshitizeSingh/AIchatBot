# React Native Application Implementation Plan

## Table of Contents

1. [Project Overview](#project-overview)
2. [Technology Stack](#technology-stack)
3. [Project Structure](#project-structure)
4. [Features Implementation](#features-implementation)
5. [Component Architecture](#component-architecture)
6. [State Management](#state-management)
7. [API Integration](#api-integration)
8. [Authentication Flow](#authentication-flow)
9. [Navigation Structure](#navigation-structure)
10. [UI/UX Design](#uiux-design)
11. [Testing Strategy](#testing-strategy)
12. [Deployment Plan](#deployment-plan)
13. [Timeline](#timeline)
14. [Risks and Mitigations](#risks-and-mitigations)

---

## Project Overview

### Objective
Create a unified React Native application that serves as both the Admin Interface and User SDK for the AI FAQ Platform. The app will provide a single codebase for managing content administration and user interactions with the chatbot.

### Key Requirements
- **Cross-platform**: iOS and Android support
- **Dual Interface**: Admin features (login, file upload) and User features (chat interface)
- **Authentication**: JWT + HMAC integration
- **Offline Support**: Basic caching for chat history
- **Real-time Chat**: WebSocket support for streaming responses
- **File Upload**: Document upload with progress tracking
- **Responsive Design**: Adaptive UI for different screen sizes

### Target Users
1. **Administrators**: Organization admins who manage content and users
2. **End Users**: Consumers who interact with the FAQ chatbot

### SDK Implementation Strategy

Based on the documented SDK approach, the React Native application will implement a comprehensive API service layer that handles:

#### HMAC Signature Generation
- **Library**: expo-crypto (Expo maintained, actively supported)
- **Algorithm**: HMAC-SHA256 with base64 encoding
- **Payload Format**: `${method}|${path}|${timestamp}|${bodyStr}`
- **Headers**: X-Client-ID, X-Timestamp, X-Signature
- **Timestamp Validation**: 5-minute window for request validity

#### Dual Authentication Flow
- **Organization Level**: HMAC signatures for all requests
- **User Level**: JWT Bearer tokens for authenticated endpoints
- **Token Storage**: Secure AsyncStorage with encryption
- **Auto-refresh**: Automatic token refresh on expiration

#### Service Methods
- **Authentication**: login, signup, refreshToken
- **Documents**: uploadDocument, getDocuments, getDocumentStatus
- **Chat**: sendMessage, getConversations, getConversationHistory
- **Admin**: getUsers, promoteUserToAdmin, revokeUserAccess

#### Error Handling
- **Network Errors**: Retry logic with exponential backoff
- **Authentication Errors**: Automatic logout on 401 responses
- **Validation Errors**: User-friendly error messages
- **Offline Support**: Queue requests for later retry

---

## Technology Stack

### Core Framework
- **React Native 0.72+**: Latest stable version with new architecture support
- **Expo SDK 49+**: Managed workflow for easier development and deployment

### Navigation
- **React Navigation 6.x**: Stack, Tab, and Drawer navigation
- **React Native Screens**: Native screen optimization

### State Management
- **Redux Toolkit**: Predictable state management with RTK Query
- **AsyncStorage**: Local storage for user sessions and cache

### API & Networking
- **Axios**: HTTP client with interceptors for auth
- **React Native WebSocket**: Real-time chat communication

### UI Components
- **React Native Paper**: Material Design components
- **React Native Vector Icons**: Icon library
- **React Native Image Picker**: File selection
- **React Native Document Picker**: Document upload

### Authentication & Security
- **expo-crypto**: HMAC signature generation (Expo maintained, actively supported)
  - *Note*: Replaced CryptoJS which is no longer maintained
  - Uses native crypto APIs for better performance and security
- **JWT Decode**: Token validation
- **expo-secure-store**: Secure storage for sensitive data

### Development Tools
- **TypeScript**: Type safety and better developer experience
- **ESLint + Prettier**: Code quality and formatting
- **React Native Debugger**: Debugging and inspection

### Key Dependencies
```json
{
  "dependencies": {
    "expo": "~49.0.0",
    "react": "18.2.0",
    "react-native": "0.72.6",
    "@react-navigation/native": "^6.1.9",
    "@react-navigation/stack": "^6.3.20",
    "@reduxjs/toolkit": "^1.9.7",
    "react-redux": "^8.1.3",
    "@react-native-async-storage/async-storage": "~1.19.3",
    "ai-faq-sdk": "^1.0.0",
    "react-native-paper": "^5.11.3",
    "react-native-vector-icons": "^10.0.2",
    "react-native-document-picker": "^9.1.1",
    "expo-image-picker": "~14.3.2"
  },
  "devDependencies": {
    "@types/react": "~18.2.14",
    "typescript": "^5.1.3",
    "eslint": "^8.50.0",
    "prettier": "^3.0.3"
  }
}
```

---

## Project Structure

```
mobile-app/
├── src/
│   ├── components/
│   │   ├── common/           # Shared components
│   │   │   ├── Button.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Loading.tsx
│   │   │   └── Modal.tsx
│   │   ├── admin/            # Admin-specific components
│   │   │   ├── DocumentList.tsx
│   │   │   ├── UploadProgress.tsx
│   │   │   └── UserManagement.tsx
│   │   └── user/             # User-specific components
│   │       ├── ChatBubble.tsx
│   │       ├── MessageList.tsx
│   │       └── TypingIndicator.tsx
│   ├── screens/
│   │   ├── auth/             # Authentication screens
│   │   │   ├── LoginScreen.tsx
│   │   │   ├── RegisterScreen.tsx
│   │   │   └── OrgSetupScreen.tsx
│   │   ├── admin/            # Admin screens
│   │   │   ├── DashboardScreen.tsx
│   │   │   ├── DocumentScreen.tsx
│   │   │   ├── UploadScreen.tsx
│   │   │   └── SettingsScreen.tsx
│   │   └── user/             # User screens
│   │       ├── ChatScreen.tsx
│   │       ├── HistoryScreen.tsx
│   │       └── ProfileScreen.tsx
│   ├── contexts/
│   │   └── SDKContext.tsx    # SDK provider context
│   ├── store/
│   │   ├── slices/           # Redux slices
│   │   │   ├── authSlice.ts
│   │   │   ├── chatSlice.ts
│   │   │   └── documentSlice.ts
│   │   ├── store.ts          # Redux store configuration
│   │   └── apiSlice.ts       # RTK Query API slice (optional)
│   ├── navigation/
│   │   ├── AppNavigator.tsx  # Main navigator
│   │   ├── AdminNavigator.tsx
│   │   ├── UserNavigator.tsx
│   │   └── AuthNavigator.tsx
│   ├── types/
│   │   ├── index.ts          # Type definitions (from SDK)
│   │   └── api.ts            # Additional app-specific types
│   └── hooks/
│       ├── useAuth.ts        # Authentication hook (uses SDK)
│       ├── useChat.ts        # Chat functionality hook (uses SDK)
│       └── useDocuments.ts   # Document management hook (uses SDK)
├── assets/
│   ├── images/               # Static images
│   ├── icons/                # Custom icons
│   └── fonts/                # Custom fonts
├── __tests__/                # Unit and integration tests
├── android/                  # Android-specific files
├── ios/                      # iOS-specific files
├── App.tsx                   # Main app component
├── index.js                  # Entry point
├── app.json                  # Expo configuration
├── .env                      # Environment variables
├── .env.example              # Environment template
├── package.json
├── tsconfig.json
├── .eslintrc.js
└── README.md
```

---

## Features Implementation

### Phase 1: Core Infrastructure
- [ ] Project setup with Expo and TypeScript
- [ ] Install and configure ai-faq-sdk package
- [ ] Navigation structure implementation
- [ ] SDK context provider setup
- [ ] Basic component library
- [ ] State management setup with Redux Toolkit

### Phase 2: Authentication
- [ ] Organization registration flow (Postman/API integration)
- [ ] User authentication screens (login/signup)
- [ ] SDK initialization with environment variables
- [ ] Authentication hooks using SDK methods
- [ ] Token management and storage
- [ ] Secure credential storage (Keychain)

### Phase 3: Admin Interface
- [ ] Dashboard with document overview
- [ ] Document upload with progress tracking
- [ ] Document management (list, delete, status)
- [ ] User management (view, promote, revoke)
- [ ] Settings and profile management

### Phase 4: User Interface
- [ ] Chat screen with message input and display
- [ ] Real-time message rendering with user/assistant roles
- [ ] Conversation management and history
- [ ] Source attribution for AI responses
- [ ] Typing indicators and loading states
- [ ] Offline message caching and sync

### Phase 5: Advanced Features
- [ ] Push notifications
- [ ] File attachment in chat
- [ ] Voice messages (future)
- [ ] Dark mode support
- [ ] Multi-language support

### SDK Context Provider Setup

```typescript
// contexts/SDKContext.tsx
import React from 'react';
import { AIFAQSDK, createAIFAQSDK } from 'ai-faq-sdk';

// Initialize SDK with environment variables
const sdk = createAIFAQSDK({
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL!,
  clientId: process.env.EXPO_PUBLIC_CLIENT_ID!,
  clientSecret: process.env.EXPO_PUBLIC_CLIENT_SECRET!,
  wsUrl: process.env.EXPO_PUBLIC_WS_URL,
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
```

### App Integration with SDK

```typescript
// App.tsx
import React from 'react';
import { Provider } from 'react-redux';
import { NavigationContainer } from '@react-navigation/native';
import { SDKProvider } from './contexts/SDKContext';
import { store } from './store';
import AppNavigator from './navigation/AppNavigator';

export default function App() {
  return (
    <Provider store={store}>
      <SDKProvider>
        <NavigationContainer>
          <AppNavigator />
        </NavigationContainer>
      </SDKProvider>
    </Provider>
  );
}
```

---

## Component Architecture

### Atomic Design Pattern
- **Atoms**: Basic UI elements (Button, Input, Icon)
- **Molecules**: Composite components (ChatBubble, DocumentCard)
- **Organisms**: Complex components (MessageList, DocumentUploader)
- **Templates**: Page layouts (ChatScreen, DashboardScreen)
- **Pages**: Complete screens with data

### Reusable Components
```typescript
// Example: ChatBubble Component
interface ChatBubbleProps {
  message: Message;
  isUser: boolean;
  timestamp: Date;
}

const ChatBubble: React.FC<ChatBubbleProps> = ({ message, isUser, timestamp }) => {
  return (
    <View style={[styles.container, isUser ? styles.userBubble : styles.botBubble]}>
      <Text style={styles.messageText}>{message.content}</Text>
      <Text style={styles.timestamp}>{formatTime(timestamp)}</Text>
    </View>
  );
};
```

### Screen Architecture
```typescript
// Example: ChatScreen Structure
const ChatScreen: React.FC = () => {
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  
  const sdk = useContext(SDKContext);

  const handleSend = async () => {
    if (!query.trim()) return;

    setLoading(true);

    try {
      const result = await sdk.sendMessage(query, conversationId);

      setMessages(prev => [
        ...prev,
        { role: 'user', content: query, timestamp: new Date() },
        {
          role: 'assistant',
          content: result.answer,
          sources: result.sources,
          timestamp: new Date()
        }
      ]);

      // Set conversation ID for subsequent messages
      if (result.conversation_id && !conversationId) {
        setConversationId(result.conversation_id);
      }

      setQuery('');
    } catch (error) {
      console.error('Send error:', error);
      // Handle error (show toast, etc.)
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={messages}
        renderItem={({ item }) => (
          <ChatBubble
            message={item}
            isUser={item.role === 'user'}
            timestamp={item.timestamp}
          />
        )}
        keyExtractor={(item, index) => `${item.role}-${index}`}
        style={styles.messagesList}
      />
      {loading && <TypingIndicator />}
      <MessageInput
        value={query}
        onChangeText={setQuery}
        onSend={handleSend}
        disabled={loading}
      />
    </SafeAreaView>
  );
};
```

---

## State Management

### Redux Toolkit Setup
```typescript
// store/slices/authSlice.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  organization: Organization | null;
}

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    user: null,
    token: null,
    isAuthenticated: false,
    organization: null,
  } as AuthState,
  reducers: {
    setCredentials: (state, action: PayloadAction<{ user: User; token: string; org: Organization }>) => {
      state.user = action.payload.user;
      state.token = action.payload.token;
      state.organization = action.payload.org;
      state.isAuthenticated = true;
    },
    logout: (state) => {
      state.user = null;
      state.token = null;
      state.isAuthenticated = false;
      state.organization = null;
    },
  },
});

export const { setCredentials, logout } = authSlice.actions;
export default authSlice.reducer;
```

### RTK Query for API Calls
```typescript
// store/apiSlice.ts
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

export const apiSlice = createApi({
  baseQuery: fetchBaseQuery({
    baseUrl: 'https://api.yourplatform.com',
    prepareHeaders: (headers, { getState }) => {
      const token = (getState() as RootState).auth.token;
      if (token) {
        headers.set('authorization', `Bearer ${token}`);
      }
      return headers;
    },
  }),
  endpoints: (builder) => ({
    login: builder.mutation<LoginResponse, LoginRequest>({
      query: (credentials) => ({
        url: '/v1/auth/login',
        method: 'POST',
        body: credentials,
      }),
    }),
    getDocuments: builder.query<Document[], void>({
      query: () => '/v1/documents',
    }),
    sendMessage: builder.mutation<MessageResponse, ChatRequest>({
      query: (message) => ({
        url: '/v1/chat/query',
        method: 'POST',
        body: message,
      }),
    }),
  }),
});

export const { useLoginMutation, useGetDocumentsQuery, useSendMessageMutation } = apiSlice;
```

---

## API Integration

### Service Layer Architecture
```typescript
// services/api.ts
import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { encode as base64Encode } from 'base-64'; // For HMAC output encoding

class ApiService {
  private baseURL: string;
  private clientId: string;
  private clientSecret: string;

  constructor() {
    this.baseURL = process.env.EXPO_PUBLIC_API_BASE_URL!;
    this.clientId = process.env.EXPO_PUBLIC_CLIENT_ID!;
    this.clientSecret = process.env.EXPO_PUBLIC_CLIENT_SECRET!;
  }

  /**
   * Generate HMAC signature for request using expo-crypto
   */
  private async generateHMAC(method: string, path: string, body: any = null): Promise<{ timestamp: number; signature: string }> {
    const timestamp = Date.now();
    const bodyStr = body ? JSON.stringify(body) : '';
    const payload = `${method}|${path}|${timestamp}|${bodyStr}`;

    // Convert strings to Uint8Array for expo-crypto
    const key = new TextEncoder().encode(this.clientSecret);
    const data = new TextEncoder().encode(payload);

    // Generate HMAC-SHA256
    const signatureBytes = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      data,
      { key, algorithm: Crypto.CryptoDigestAlgorithm.SHA256 }
    );

    // Convert to base64 for header
    const signature = base64Encode(signatureBytes);

    return { timestamp, signature };
  }

  /**
   * Make authenticated request with JWT + HMAC
   */
  private async request(method: string, path: string, body: any = null): Promise<any> {
    const { timestamp, signature } = await this.generateHMAC(method, path, body);

    // Get JWT token from storage
    const jwtToken = await AsyncStorage.getItem('access_token');

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Client-ID': this.clientId,
      'X-Timestamp': timestamp.toString(),
      'X-Signature': signature,
    };

    if (jwtToken) {
      headers['Authorization'] = `Bearer ${jwtToken}`;
    }

    const options: RequestInit = {
      method,
      headers,
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(`${this.baseURL}${path}`, options);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Request failed');
      }

      return await response.json();
    } catch (error) {
      console.error('API Request Error:', error);
      throw error;
    }
  }

  // Auth methods
  async login(email: string, password: string): Promise<LoginResponse> {
    const result = await this.request('POST', '/v1/auth/login', { email, password });

    // Store tokens
    await AsyncStorage.setItem('access_token', result.access_token);
    await AsyncStorage.setItem('refresh_token', result.refresh_token);

    return result;
  }

  async signup(email: string, password: string, orgId: string): Promise<SignupResponse> {
    return this.request('POST', '/v1/auth/signup', { email, password, org_id: orgId });
  }

  async refreshToken(): Promise<RefreshResponse> {
    const refreshToken = await AsyncStorage.getItem('refresh_token');
    if (!refreshToken) throw new Error('No refresh token available');

    const result = await this.request('POST', '/v1/auth/refresh', { refresh_token: refreshToken });

    // Update stored tokens
    await AsyncStorage.setItem('access_token', result.access_token);
    await AsyncStorage.setItem('refresh_token', result.refresh_token);

    return result;
  }

  // Document methods
  async uploadDocument(filename: string, contentType: string): Promise<UploadResponse> {
    return this.request('POST', '/v1/documents/upload', { filename, content_type: contentType });
  }

  async getDocuments(): Promise<Document[]> {
    return this.request('GET', '/v1/documents');
  }

  async getDocumentStatus(id: string): Promise<DocumentStatus> {
    return this.request('GET', `/v1/documents/${id}/status`);
  }

  // Chat methods
  async sendMessage(query: string, conversationId?: string): Promise<ChatResponse> {
    return this.request('POST', '/v1/chat/query', {
      query,
      conversation_id: conversationId
    });
  }

  async getConversations(): Promise<Conversation[]> {
    return this.request('GET', '/v1/chat/conversations');
  }

  async getConversationHistory(id: string): Promise<Message[]> {
    return this.request('GET', `/v1/chat/history/${id}`);
  }

  // Admin methods
  async getUsers(): Promise<User[]> {
    return this.request('GET', '/v1/users');
  }

  async promoteUserToAdmin(userId: string): Promise<void> {
    return this.request('POST', '/v1/convert-user-to-admin', { user_id: userId });
  }

  async revokeUserAccess(userId: string): Promise<void> {
    return this.request('POST', '/v1/revoke-access', { user_id: userId });
  }
}

export default new ApiService();
```

### WebSocket Integration
```typescript
// services/websocket.ts
import { io, Socket } from 'socket.io-client';

class WebSocketService {
  private socket: Socket | null = null;

  connect(token: string) {
    this.socket = io(process.env.EXPO_PUBLIC_WS_URL!, {
      auth: { token },
    });

    this.socket.on('connect', () => {
      console.log('Connected to WebSocket');
    });

    this.socket.on('message', (message: Message) => {
      // Handle incoming message
    });

    this.socket.on('typing', (data: { userId: string; isTyping: boolean }) => {
      // Handle typing indicators
    });
  }

  sendMessage(message: string) {
    if (this.socket) {
      this.socket.emit('sendMessage', { content: message });
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
    }
  }
}

export default new WebSocketService();
```

---

## Authentication Flow

### Organization Setup Flow
1. **App Launch**: Check for stored credentials
2. **Organization Registration**: If no org, show setup screen
3. **Admin Creation**: Register first admin user
4. **Credential Storage**: Securely store client_id and client_secret

### User Authentication Flow
1. **Login Screen**: Email/password input
2. **HMAC Signing**: Sign request with org credentials
3. **JWT Retrieval**: Receive access and refresh tokens
4. **Token Storage**: Store tokens securely
5. **Auto-refresh**: Handle token expiration

### Session Management
```typescript
// hooks/useAuth.ts
import { useContext } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { SDKContext } from '../contexts/SDKContext';
import { setCredentials, logout } from '../store/slices/authSlice';
import type { RootState } from '../store/store';

export const useAuth = () => {
  const dispatch = useDispatch();
  const { isAuthenticated, token } = useSelector((state: RootState) => state.auth);
  const sdk = useContext(SDKContext);

  const login = async (email: string, password: string) => {
    try {
      const result = await sdk.login(email, password);
      dispatch(setCredentials({
        user: result.user,
        token: result.access_token,
        org: result.organization
      }));
    } catch (error) {
      throw new Error('Login failed');
    }
  };

  const logoutUser = async () => {
    await sdk.logout();
    dispatch(logout());
  };

  return { isAuthenticated, token, login, logout: logoutUser };
};
```

---

## Navigation Structure

### Navigation Hierarchy
```
AppNavigator (Stack Navigator)
├── AuthNavigator (Stack)
│   ├── WelcomeScreen
│   ├── OrgSetupScreen
│   ├── LoginScreen
│   └── RegisterScreen
├── AdminNavigator (Tab Navigator)
│   ├── DashboardTab (Stack)
│   │   ├── DashboardScreen
│   │   └── DocumentDetailScreen
│   ├── UploadTab (Stack)
│   │   ├── DocumentListScreen
│   │   └── UploadScreen
│   ├── UsersTab (Stack)
│   │   ├── UserListScreen
│   │   └── UserDetailScreen
│   └── SettingsTab (Stack)
│       ├── SettingsScreen
│       └── ProfileScreen
└── UserNavigator (Stack Navigator)
    ├── ChatScreen
    ├── HistoryScreen
    └── ProfileScreen
```

### Conditional Navigation
```typescript
// navigation/AppNavigator.tsx
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { useSelector } from 'react-redux';

import AuthNavigator from './AuthNavigator';
import AdminNavigator from './AdminNavigator';
import UserNavigator from './UserNavigator';

const Stack = createStackNavigator();

const AppNavigator: React.FC = () => {
  const { isAuthenticated, user } = useSelector((state: RootState) => state.auth);

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!isAuthenticated ? (
          <Stack.Screen name="Auth" component={AuthNavigator} />
        ) : user?.role === 'admin' ? (
          <Stack.Screen name="Admin" component={AdminNavigator} />
        ) : (
          <Stack.Screen name="User" component={UserNavigator} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default AppNavigator;
```

---

## UI/UX Design

### Design System
- **Colors**: Primary (#007AFF), Secondary (#5856D6), Success (#34C759), Error (#FF3B30)
- **Typography**: System fonts with consistent sizing (12, 14, 16, 18, 20, 24, 32)
- **Spacing**: 4px base unit (4, 8, 12, 16, 20, 24, 32, 40, 48, 64)
- **Border Radius**: 4px for buttons, 8px for cards, 12px for modals

### Screen Layouts

#### Chat Screen Design
```
┌─────────────────────────────────┐
│ Header (Back, Title, Menu)      │
├─────────────────────────────────┤
│ Message List                    │
│ ┌─────────────────────────────┐ │
│ │ User: Hello!               │ │
│ └─────────────────────────────┘ │
│ ┌─────────────────────────────┐ │
│ │ Bot: Hi! How can I help?   │ │
│ └─────────────────────────────┘ │
│                                 │
│                                 │
│                                 │
└─────────────────────────────────┘
┌─────────────────────────────────┐
│ Message Input | Send Button     │
└─────────────────────────────────┘
```

#### Admin Dashboard Design
```
┌─────────────────────────────────┐
│ Header (Logo, Profile, Logout)  │
├─────────────────────────────────┤
│ Stats Cards                     │
│ ┌─────────┐ ┌─────────┐         │
│ │ Docs: 25│ │Users: 5 │         │
│ └─────────┘ └─────────┘         │
├─────────────────────────────────┤
│ Recent Documents                │
│ ┌─────────────────────────────┐ │
│ │ Document 1.pdf             │ │
│ │ Status: Processed          │ │
│ └─────────────────────────────┘ │
│ ┌─────────────────────────────┐ │
│ │ Document 2.docx            │ │
│ │ Status: Processing         │ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
Bottom Tab Navigation
```

### Responsive Design
- **Breakpoint System**: Small (320px), Medium (768px), Large (1024px)
- **Adaptive Components**: Use Dimensions API for dynamic sizing
- **Orientation Support**: Portrait and landscape modes

### SDK Usage Patterns

#### Component Integration
```typescript
// Example: Login Component using SDK
const LoginScreen: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    try {
      const result = await ApiService.login(email, password);
      // Navigation and state updates handled by auth context
      navigation.replace('Main');
    } catch (error) {
      Alert.alert('Login Failed', error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <TextInput
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
      />
      <TextInput
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      <Button
        title="Login"
        onPress={handleLogin}
        disabled={loading}
      />
    </View>
  );
};
```

#### Error Handling Patterns
- **Network Errors**: Automatic retry with exponential backoff
- **Auth Errors**: Clear user messages and logout on token issues
- **Validation Errors**: Field-specific error display
- **Offline Mode**: Queue operations for later sync

---

## Environment Configuration

### Environment Variables Setup

Create a `.env` file in the root of your React Native project:

```bash
# Create environment file
touch .env
```

### Environment Variables

```env
# API Configuration
EXPO_PUBLIC_API_BASE_URL=https://api.yourplatform.com

# Organization Credentials (from Auth Service registration)
EXPO_PUBLIC_CLIENT_ID=pk_a4f3c2e1d8b9f7e6d5c4b3a2918273645
EXPO_PUBLIC_CLIENT_SECRET=sk_x9w8v7u6t5s4r3q2p1o0n9m8l7k6j5i4

# WebSocket Configuration (optional)
EXPO_PUBLIC_WS_URL=wss://api.yourplatform.com

# App Configuration
EXPO_PUBLIC_APP_NAME=AI FAQ Platform
EXPO_PUBLIC_APP_VERSION=1.0.0

# Development Settings
EXPO_PUBLIC_DEBUG=true
EXPO_PUBLIC_LOG_LEVEL=info
```

### How to Get Organization Credentials

1. **Register Organization** (via Postman or API):
   ```http
   POST https://your-auth-service.com/v1/org/register
   Content-Type: application/json

   {
     "org_name": "Your Company Name",
     "admin_email": "admin@yourcompany.com",
     "admin_password": "SecurePassword123!"
   }
   ```

2. **Response** will contain:
   ```json
   {
     "org_id": "uuid",
     "client_id": "pk_...",
     "client_secret": "sk_..."
   }
   ```

3. **Copy credentials** to your `.env` file:
   - `client_id` → `EXPO_PUBLIC_CLIENT_ID`
   - `client_secret` → `EXPO_PUBLIC_CLIENT_SECRET`

### Environment Variable Usage in Code

```typescript
// services/api.ts
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL!;
const CLIENT_ID = process.env.EXPO_PUBLIC_CLIENT_ID!;
const CLIENT_SECRET = process.env.EXPO_PUBLIC_CLIENT_SECRET!;

// Only public env vars (prefixed with EXPO_PUBLIC_) are available
// Private env vars are not accessible in React Native/Expo
```

### Security Notes

⚠️ **Important Security Considerations:**

1. **EXPO_PUBLIC_ Prefix**: Only variables with this prefix are accessible in Expo/React Native
2. **Client Secret Exposure**: The client secret will be embedded in the app bundle
3. **Production Security**: Consider using a proxy service or API gateway for production
4. **Token Storage**: Use `expo-secure-store` for JWT tokens, not environment variables

### Development vs Production

```env
# .env.development
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000
EXPO_PUBLIC_DEBUG=true

# .env.production
EXPO_PUBLIC_API_BASE_URL=https://api.yourplatform.com
EXPO_PUBLIC_DEBUG=false
```

### Expo Environment Loading

Expo automatically loads `.env` files. For different environments:

```bash
# Development
npx expo start

# Production build
npx expo build:android --type app-bundle
npx expo build:ios --type archive
```

---

## SDK Development and Bundling

### SDK Architecture Overview

Instead of embedding API logic directly in the React Native app, create a separate **AI FAQ SDK** that can be bundled and distributed as a reusable package.

### SDK Package Structure

```
ai-faq-sdk/
├── src/
│   ├── core/
│   │   ├── ApiService.ts       # Main API service class
│   │   ├── AuthService.ts      # Authentication helpers
│   │   ├── types.ts            # TypeScript definitions
│   │   └── config.ts           # Configuration management
│   ├── services/
│   │   ├── auth.ts             # Authentication methods
│   │   ├── documents.ts        # Document management
│   │   ├── chat.ts             # Chat functionality
│   │   └── admin.ts            # Admin operations
│   ├── utils/
│   │   ├── hmac.ts             # HMAC utilities
│   │   ├── storage.ts          # Storage helpers
│   │   └── validation.ts       # Input validation
│   └── index.ts                # Main SDK exports
├── package.json
├── tsconfig.json
├── rollup.config.js            # Bundling configuration
├── .npmignore
└── README.md
```

### SDK Implementation

#### Main SDK Class

```typescript
// src/index.ts
import { ApiService } from './core/ApiService';
import { AuthService } from './core/AuthService';
import type { SDKConfig, AuthResponse, ChatResponse } from './core/types';

export class AIFAQSDK {
  private apiService: ApiService;
  private authService: AuthService;

  constructor(config: SDKConfig) {
    this.apiService = new ApiService(config);
    this.authService = new AuthService(this.apiService);
  }

  // Authentication methods
  async login(email: string, password: string): Promise<AuthResponse> {
    return this.authService.login(email, password);
  }

  async signup(email: string, password: string, orgId: string): Promise<AuthResponse> {
    return this.authService.signup(email, password, orgId);
  }

  async refreshToken(): Promise<AuthResponse> {
    return this.authService.refreshToken();
  }

  // Chat methods
  async sendMessage(query: string, conversationId?: string): Promise<ChatResponse> {
    return this.apiService.sendMessage(query, conversationId);
  }

  async getConversations(): Promise<Conversation[]> {
    return this.apiService.getConversations();
  }

  // Document methods
  async uploadDocument(filename: string, contentType: string): Promise<UploadResponse> {
    return this.apiService.uploadDocument(filename, contentType);
  }

  async getDocuments(): Promise<Document[]> {
    return this.apiService.getDocuments();
  }

  // Admin methods
  async getUsers(): Promise<User[]> {
    return this.apiService.getUsers();
  }

  async promoteUserToAdmin(userId: string): Promise<void> {
    return this.apiService.promoteUserToAdmin(userId);
  }
}

// Factory function for easy initialization
export function createAIFAQSDK(config: SDKConfig): AIFAQSDK {
  return new AIFAQSDK(config);
}

// Default export
export default AIFAQSDK;
```

#### SDK Configuration

```typescript
// src/core/types.ts
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
```

#### SDK Package.json

```json
// package.json
{
  "name": "ai-faq-sdk",
  "version": "1.0.0",
  "description": "SDK for AI FAQ Platform",
  "main": "dist/index.js",
  "module": "dist/index.esm.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "rollup -c",
    "dev": "rollup -c -w",
    "test": "jest",
    "lint": "eslint src/**/*.ts",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "expo-crypto": "^12.6.0",
    "base-64": "^1.0.0"
  },
  "devDependencies": {
    "@types/base-64": "^1.0.0",
    "@types/node": "^20.0.0",
    "rollup": "^4.0.0",
    "rollup-plugin-typescript2": "^0.36.0",
    "typescript": "^5.0.0",
    "jest": "^29.0.0",
    "eslint": "^8.0.0"
  },
  "peerDependencies": {
    "@react-native-async-storage/async-storage": "*",
    "expo-secure-store": "*"
  },
  "files": [
    "dist",
    "README.md"
  ]
}
```

### Bundling Configuration

#### Rollup Configuration

```javascript
// rollup.config.js
import typescript from 'rollup-plugin-typescript2';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import { terser } from 'rollup-plugin-terser';

export default {
  input: 'src/index.ts',
  output: [
    {
      file: 'dist/index.js',
      format: 'cjs',
      sourcemap: true
    },
    {
      file: 'dist/index.esm.js',
      format: 'esm',
      sourcemap: true
    }
  ],
  external: [
    'expo-crypto',
    'base-64',
    '@react-native-async-storage/async-storage',
    'expo-secure-store'
  ],
  plugins: [
    nodeResolve({
      preferBuiltins: false
    }),
    commonjs(),
    typescript({
      tsconfig: './tsconfig.json',
      useTsconfigDeclarationDir: true
    }),
    terser()
  ]
};
```

### SDK Usage in React Native App

#### Installation

```bash
# Install the SDK package
npm install ai-faq-sdk

# Or from local development
npm install ../ai-faq-sdk
```

#### App Integration

```typescript
// App.tsx
import React from 'react';
import { Provider } from 'react-redux';
import { NavigationContainer } from '@react-navigation/native';
import { AIFAQSDK, createAIFAQSDK } from 'ai-faq-sdk';
import { store } from './store';
import AppNavigator from './navigation/AppNavigator';

// Initialize SDK
const sdk = createAIFAQSDK({
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL!,
  clientId: process.env.EXPO_PUBLIC_CLIENT_ID!,
  clientSecret: process.env.EXPO_PUBLIC_CLIENT_SECRET!,
  wsUrl: process.env.EXPO_PUBLIC_WS_URL,
  debug: __DEV__
});

// Make SDK available globally or through context
export const SDKContext = React.createContext<AIFAQSDK>(sdk);

export default function App() {
  return (
    <Provider store={store}>
      <SDKContext.Provider value={sdk}>
        <NavigationContainer>
          <AppNavigator />
        </NavigationContainer>
      </SDKContext.Provider>
    </Provider>
  );
}
```

#### Component Usage

```typescript
// screens/LoginScreen.tsx
import React, { useContext } from 'react';
import { View, TextInput, Button, Alert } from 'react-native';
import { useDispatch } from 'react-redux';
import { SDKContext } from '../App';
import { setCredentials } from '../store/slices/authSlice';

const LoginScreen: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  
  const sdk = useContext(SDKContext);
  const dispatch = useDispatch();
  const navigation = useNavigation();

  const handleLogin = async () => {
    setLoading(true);
    try {
      const result = await sdk.login(email, password);
      
      dispatch(setCredentials({
        user: result.user,
        token: result.access_token,
        org: result.organization
      }));
      
      navigation.replace('Main');
    } catch (error) {
      Alert.alert('Login Failed', error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <TextInput
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
      />
      <TextInput
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      <Button 
        title="Login" 
        onPress={handleLogin} 
        disabled={loading} 
      />
    </View>
  );
};
```

#### Chat Screen with SDK

```typescript
// screens/ChatScreen.tsx
import React, { useContext, useState } from 'react';
import { FlatList } from 'react-native';
import { SDKContext } from '../App';
import { ChatBubble, MessageInput } from '../components';

const ChatScreen: React.FC = () => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState();
  
  const sdk = useContext(SDKContext);

  const handleSend = async (query: string) => {
    setLoading(true);
    try {
      const result = await sdk.sendMessage(query, conversationId);
      
      setMessages(prev => [
        ...prev,
        { role: 'user', content: query, timestamp: new Date() },
        {
          role: 'assistant',
          content: result.answer,
          sources: result.sources,
          timestamp: new Date()
        }
      ]);
      
      if (result.conversation_id && !conversationId) {
        setConversationId(result.conversation_id);
      }
    } catch (error) {
      console.error('Send error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={messages}
        renderItem={({ item }) => (
          <ChatBubble message={item} isUser={item.role === 'user'} />
        )}
        keyExtractor={(item, index) => `${item.role}-${index}`}
      />
      <MessageInput onSend={handleSend} disabled={loading} />
    </View>
  );
};
```

### SDK Distribution

#### NPM Publishing

```bash
# Build the SDK
npm run build

# Publish to NPM
npm publish

# Or publish with specific tag
npm publish --tag beta
```

#### Local Development

```bash
# In SDK directory
npm link

# In React Native app directory
npm link ai-faq-sdk
```

### Benefits of SDK Approach

1. **Separation of Concerns**: API logic separated from UI logic
2. **Reusability**: Same SDK can be used across different platforms
3. **Maintainability**: Centralized API management
4. **Testing**: SDK can be tested independently
5. **Versioning**: Clear API versioning and updates
6. **Security**: Centralized security implementation

### Implementation Steps

1. **Create SDK Package**: Set up separate `ai-faq-sdk` directory
2. **Implement Core Services**: Move API logic to SDK
3. **Configure Bundling**: Set up Rollup for distribution
4. **Add Tests**: Unit tests for SDK functionality
5. **Publish Package**: Make SDK available via NPM
6. **Update React Native App**: Use SDK instead of direct API calls
7. **Integration Testing**: Test SDK integration in app

---

## Testing Strategy

### Unit Testing
- **Framework**: Jest + React Native Testing Library
- **Coverage**: 80% minimum for components and utilities
- **Mocking**: API calls, navigation, and native modules

### Integration Testing
- **Framework**: Detox for end-to-end testing
- **Scenarios**: Authentication flow, document upload, chat interaction
- **Device Coverage**: iOS Simulator, Android Emulator

### Test Structure
```
__tests__/
├── components/
│   ├── Button.test.tsx
│   ├── ChatBubble.test.tsx
│   └── DocumentCard.test.tsx
├── screens/
│   ├── LoginScreen.test.tsx
│   ├── ChatScreen.test.tsx
│   └── UploadScreen.test.tsx
├── services/
│   ├── api.test.ts
│   └── auth.test.ts
├── utils/
│   ├── hmac.test.ts
│   └── validation.test.ts
└── e2e/
    ├── authentication.test.js
    ├── documentUpload.test.js
    └── chatInteraction.test.js
```

### CI/CD Testing
- **GitHub Actions**: Automated testing on PR and main branch
- **Device Farms**: Test on multiple device configurations
- **Screenshot Testing**: Visual regression testing

---

## Deployment Plan

### Development Environment
- **Expo Development Build**: Local development and testing
- **Expo Go**: Quick testing on physical devices
- **Simulator/Emulator**: iOS Simulator and Android Emulator

### Staging Environment
- **Internal Distribution**: Expo Application Services (EAS) Build
- **TestFlight**: iOS beta testing
- **Google Play Beta**: Android beta testing
- **Feature Flags**: Environment-based feature toggling

### Production Deployment
- **App Store**: iOS App Store submission
- **Google Play**: Android production release
- **CodePush**: Over-the-air updates for JS bundle
- **Monitoring**: Crash reporting and analytics

### Build Configuration
```json
// app.json
{
  "expo": {
    "name": "AI FAQ Platform",
    "slug": "ai-faq-platform",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "light",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#ffffff"
    },
    "assetBundlePatterns": ["**/*"],
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "com.yourcompany.aifaqplatform"
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#ffffff"
      },
      "package": "com.yourcompany.aifaqplatform"
    },
    "web": {
      "favicon": "./assets/favicon.png"
    },
    "plugins": [
      "expo-router",
      [
        "expo-build-properties",
        {
          "ios": {
            "useFrameworks": "static"
          }
        }
      ]
    ]
  }
}
```

---

## Timeline

### Phase 1: Foundation (Weeks 1-2)
- [ ] Project setup and basic structure
- [ ] Navigation implementation
- [ ] Basic component library
- [ ] State management setup
- [ ] API service layer

### Phase 2: Authentication (Weeks 3-4)
- [ ] Implement SDK service layer with HMAC signing
- [ ] Create authentication screens (login/signup)
- [ ] Integrate JWT token management
- [ ] Implement secure storage for credentials
- [ ] Add token refresh and error handling
- [ ] Test authentication flow with backend services

### Phase 3: Admin Features (Weeks 5-7)
- [ ] Dashboard implementation
- [ ] Document upload functionality
- [ ] Document management screens
- [ ] User management features
- [ ] Settings and profile

### Phase 4: User Features (Weeks 8-10)
- [ ] Implement chat screen using SDK sendMessage method
- [ ] Add real-time message display with role-based styling
- [ ] Integrate conversation history using SDK methods
- [ ] Display source attribution for AI responses
- [ ] Add typing indicators and loading states
- [ ] Implement offline caching for chat messages

### Phase 5: Polish and Testing (Weeks 11-12)
- [ ] UI/UX refinements
- [ ] Comprehensive testing
- [ ] Performance optimization
- [ ] Bug fixes and iterations

### Phase 6: Deployment (Week 13)
- [ ] Staging deployment
- [ ] Beta testing
- [ ] Production release
- [ ] Monitoring setup

**Total Timeline**: 13 weeks (3 months)
**Team Size**: 2-3 developers
**Key Milestones**: 
- End of Week 4: Working authentication
- End of Week 7: Complete admin interface
- End of Week 10: Functional user interface
- End of Week 13: Production deployment

---

## Risks and Mitigations

### Technical Risks
1. **React Native Performance Issues**
   - **Mitigation**: Use FlatList for large lists, optimize images, implement proper key props
   - **Monitoring**: Performance monitoring with Flipper

2. **WebSocket Connection Issues**
   - **Mitigation**: Implement reconnection logic, handle network changes
   - **Fallback**: Polling as backup for real-time features

3. **File Upload Failures**
   - **Mitigation**: Chunked uploads, resume functionality, progress tracking
   - **Error Handling**: Retry logic with exponential backoff

### Platform-Specific Risks
1. **iOS App Store Approval**
   - **Mitigation**: Follow all guidelines, implement proper permissions
   - **Testing**: TestFlight beta testing before submission

2. **Android Play Store Policies**
   - **Mitigation**: Ensure compliance with data policies, implement proper privacy settings
   - **Review**: Internal security audit before release

### Business Risks
1. **Timeline Delays**
   - **Mitigation**: Agile development with 2-week sprints, regular demos
   - **Buffer**: 20% buffer time in schedule

2. **Scope Creep**
   - **Mitigation**: Clear requirements, feature prioritization
   - **Process**: Change request approval process

### Security Risks
1. **Token Storage**
   - **Mitigation**: Use Keychain (iOS) and Keystore (Android) for sensitive data
   - **Encryption**: Encrypt stored tokens and credentials

2. **API Security**
   - **Mitigation**: Implement certificate pinning, HMAC validation
   - **Monitoring**: API call logging and anomaly detection

---

## Success Criteria

### Functional Requirements
- [ ] Users can register organizations and create admin accounts via external API
- [ ] Admins can authenticate and upload documents with HMAC signatures
- [ ] Users can engage in real-time chat with proper JWT + HMAC authentication
- [ ] SDK handles token refresh automatically
- [ ] All API calls include proper HMAC signatures and timestamps
- [ ] Chat responses include source attribution
- [ ] App functions on both iOS and Android platforms with Expo

### Non-Functional Requirements
- [ ] App loads within 3 seconds on 3G connection
- [ ] Chat responses appear within 2 seconds
- [ ] File uploads show progress and handle interruptions
- [ ] App works offline for basic functionality
- [ ] UI is responsive across different screen sizes

### Quality Metrics
- [ ] 80%+ test coverage
- [ ] Zero critical security vulnerabilities
- [ ] 95%+ crash-free users
- [ ] 4.5+ star rating on app stores
- [ ] 90%+ user retention after 30 days

---

## Next Steps

1. **Kickoff Meeting**: Review plan and assign responsibilities
2. **Environment Setup**: Configure development environment
3. **Design Review**: Finalize UI mockups and design system
4. **API Integration**: Test auth service and content service endpoints
5. **Sprint Planning**: Break down Phase 1 into specific tasks
6. **Development Start**: Begin with project setup and foundation

This implementation plan provides a comprehensive roadmap for building the React Native application. Regular check-ins and adjustments will ensure we stay on track and deliver a high-quality product.