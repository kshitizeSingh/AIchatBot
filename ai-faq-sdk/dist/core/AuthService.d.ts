import { ApiService } from './ApiService';
import type { AuthResponse } from './types';
export declare class AuthService {
    private apiService;
    constructor(apiService: ApiService);
    /**
     * Login user with email and password
     */
    login(email: string, password: string): Promise<AuthResponse>;
    /**
     * Register new user for organization
     */
    signup(email: string, password: string, orgId: string): Promise<AuthResponse>;
    /**
     * Refresh access token using refresh token
     */
    refreshToken(): Promise<AuthResponse>;
    /**
     * Logout user by clearing stored tokens
     */
    logout(): Promise<void>;
    /**
     * Check if user is authenticated
     */
    isAuthenticated(): Promise<boolean>;
    /**
     * Get stored access token
     */
    getStoredAccessToken(): Promise<string | null>;
    /**
     * Get stored refresh token
     */
    getStoredRefreshToken(): Promise<string | null>;
    /**
     * Clear all stored authentication tokens
     */
    private clearStoredTokens;
}
