// src/hooks/useAuth.ts
import { useContext } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { SDKContext } from '../contexts/SDKContext';
import { setCredentials, setLoading, setError, logout, clearError } from '../store/slices/authSlice';
import type { RootState } from '../store/store';

export const useAuth = () => {
  const dispatch = useDispatch();
  const { isAuthenticated, user, token, organization, isLoading, error } = useSelector(
    (state: RootState) => state.auth
  );
  const sdk = useContext(SDKContext);

  const login = async (email: string, password: string) => {
    try {
      dispatch(setLoading(true));
      dispatch(clearError());

      const result = await sdk.login(email, password);

      dispatch(setCredentials({
        user: result.user,
        token: result.access_token,
        org: result.organization
      }));

      return result;
    } catch (error: any) {
      const errorMessage = error.message || 'Login failed';
      dispatch(setError(errorMessage));
      throw new Error(errorMessage);
    }
  };

  const logoutUser = async () => {
    try {
      // Call SDK logout if needed
      dispatch(logout());
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const clearAuthError = () => {
    dispatch(clearError());
  };

  return {
    isAuthenticated,
    user,
    token,
    organization,
    isLoading,
    error,
    login,
    logout: logoutUser,
    clearError: clearAuthError,
  };
};