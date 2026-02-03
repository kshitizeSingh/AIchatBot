import { ApiService } from './ApiService';
import type { AuthResponse } from './types';

export class AuthService {
  constructor(private apiService: ApiService) {}

  /**
   * Login user with email and password
   */
  async login(email: string, password: string): Promise<AuthResponse> {
    return this.apiService.login(email, password);
  }

  /**
   * Register new user for organization
   */
  async signup(email: string, password: string, orgId: string): Promise<AuthResponse> {
    return this.apiService.signup(email, password, orgId);
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(): Promise<AuthResponse> {
    return this.apiService.refreshToken();
  }

  /**
   * Logout user by clearing stored tokens
   */
  async logout(): Promise<void> {
    try {
      // Clear stored tokens
      await this.clearStoredTokens();
    } catch (error) {
      console.warn('Error during logout:', error);
    }
  }

  /**
   * Check if user is authenticated
   */
  async isAuthenticated(): Promise<boolean> {
    try {
      const token = await this.getStoredAccessToken();
      return !!token;
    } catch {
      return false;
    }
  }

  /**
   * Get stored access token
   */
  async getStoredAccessToken(): Promise<string | null> {
    const AsyncStorage = require('@react-native-async-storage/async-storage');
    return AsyncStorage.getItem('access_token');
  }

  /**
   * Get stored refresh token
   */
  async getStoredRefreshToken(): Promise<string | null> {
    const AsyncStorage = require('@react-native-async-storage/async-storage');
    return AsyncStorage.getItem('refresh_token');
  }

  /**
   * Clear all stored authentication tokens
   */
  private async clearStoredTokens(): Promise<void> {
    const AsyncStorage = require('@react-native-async-storage/async-storage');
    await AsyncStorage.removeItem('access_token');
    await AsyncStorage.removeItem('refresh_token');
  }
}