import { AIFAQSDK, createAIFAQSDK } from '../index';

// Mock the crypto module
jest.mock('expo-crypto', () => ({
  digestStringAsync: jest.fn().mockResolvedValue('mocked-signature'),
  CryptoDigestAlgorithm: {
    SHA256: 'SHA-256'
  }
}));

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn()
}));

describe('AIFAQSDK', () => {
  const mockConfig = {
    apiBaseUrl: 'https://api.test.com',
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    debug: false
  };

  let sdk: AIFAQSDK;

  beforeEach(() => {
    sdk = createAIFAQSDK(mockConfig);
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should create SDK instance', () => {
      expect(sdk).toBeInstanceOf(AIFAQSDK);
    });

    it('should initialize with correct config', () => {
      const newSdk = createAIFAQSDK(mockConfig);
      expect(newSdk).toBeDefined();
    });
  });

  describe('authentication methods', () => {
    it('should have login method', () => {
      expect(typeof sdk.login).toBe('function');
    });

    it('should have signup method', () => {
      expect(typeof sdk.signup).toBe('function');
    });

    it('should have logout method', () => {
      expect(typeof sdk.logout).toBe('function');
    });

    it('should have isAuthenticated method', () => {
      expect(typeof sdk.isAuthenticated).toBe('function');
    });
  });

  describe('chat methods', () => {
    it('should have sendMessage method', () => {
      expect(typeof sdk.sendMessage).toBe('function');
    });

    it('should have getConversations method', () => {
      expect(typeof sdk.getConversations).toBe('function');
    });

    it('should have getConversationHistory method', () => {
      expect(typeof sdk.getConversationHistory).toBe('function');
    });
  });

  describe('document methods', () => {
    it('should have uploadDocument method', () => {
      expect(typeof sdk.uploadDocument).toBe('function');
    });

    it('should have getDocuments method', () => {
      expect(typeof sdk.getDocuments).toBe('function');
    });

    it('should have getDocumentStatus method', () => {
      expect(typeof sdk.getDocumentStatus).toBe('function');
    });
  });

  describe('admin methods', () => {
    it('should have getUsers method', () => {
      expect(typeof sdk.getUsers).toBe('function');
    });

    it('should have promoteUserToAdmin method', () => {
      expect(typeof sdk.promoteUserToAdmin).toBe('function');
    });

    it('should have revokeUserAccess method', () => {
      expect(typeof sdk.revokeUserAccess).toBe('function');
    });
  });
});