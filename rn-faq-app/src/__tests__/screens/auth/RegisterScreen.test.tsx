/**
 * RegisterScreen Unit Tests
 * 
 * Tests the user registration screen including:
 * - Component rendering and form elements
 * - Form validation for all fields
 * - Registration process and success handling
 * - Error handling and user feedback
 * - Navigation between auth screens
 * - Loading states and user experience
 * - Input field interactions and error clearing
 */

import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, waitFor } from '@testing-library/react-native';
import RegisterScreen from '../../../screens/auth/RegisterScreen';
import { renderWithProviders } from '../../mocks/testUtils';
import { mockUnauthenticatedState } from '../../mocks/mockStore';

// Mock Alert
jest.mock('react-native', () => {
  const RN = jest.requireActual('react-native');
  return {
    ...RN,
    Alert: {
      alert: jest.fn(),
    },
  };
});

// Mock navigation
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => {
  const actualNav = jest.requireActual('@react-navigation/native');
  return {
    ...actualNav,
    useNavigation: () => ({
      navigate: mockNavigate,
    }),
  };
});

// Mock useAuth hook
const mockSignup = jest.fn();
jest.mock('../../../hooks/useAuth', () => ({
  useAuth: () => ({
    signup: mockSignup,
  }),
}));

describe('RegisterScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSignup.mockResolvedValue(undefined);
  });

  /**
   * Test: Should render registration form with all fields
   * Scenario: Component mounts and displays registration interface
   * Expected: All form fields, buttons, and text elements are visible
   */
  it('should render registration form with all fields', () => {
    const { getByText, getByPlaceholderText } = renderWithProviders(<RegisterScreen />, {
      initialState: mockUnauthenticatedState,
    });

    // Check header
    expect(getByText('Create Account')).toBeTruthy();
    expect(getByText('Join our AI FAQ platform')).toBeTruthy();

    // Check form fields
    expect(getByPlaceholderText('Enter your full name')).toBeTruthy();
    expect(getByPlaceholderText('Enter your email')).toBeTruthy();
    expect(getByPlaceholderText('Create a password')).toBeTruthy();
    expect(getByPlaceholderText('Confirm your password')).toBeTruthy();

    // Check buttons and links
    expect(getByText('Create Account')).toBeTruthy();
    expect(getByText('Already have an account? Sign in')).toBeTruthy();
  });

  /**
   * Test: Should display terms and privacy policy text
   * Scenario: Component renders with legal text
   * Expected: Terms of service and privacy policy text is visible
   */
  it('should display terms and privacy policy text', () => {
    const { getByText } = renderWithProviders(<RegisterScreen />, {
      initialState: mockUnauthenticatedState,
    });

    expect(getByText(/By creating an account, you agree to our/)).toBeTruthy();
    expect(getByText('Terms of Service')).toBeTruthy();
    expect(getByText('Privacy Policy')).toBeTruthy();
  });

  /**
   * Test: Should validate required name field
   * Scenario: User tries to submit form without entering name
   * Expected: Name validation error is displayed
   */
  it('should validate required name field', async () => {
    const { getByText, getByPlaceholderText } = renderWithProviders(<RegisterScreen />, {
      initialState: mockUnauthenticatedState,
    });

    // Fill other fields but leave name empty
    fireEvent.changeText(getByPlaceholderText('Enter your email'), 'test@example.com');
    fireEvent.changeText(getByPlaceholderText('Create a password'), 'password123');
    fireEvent.changeText(getByPlaceholderText('Confirm your password'), 'password123');

    // Try to submit
    const createButton = getByText('Create Account');
    fireEvent.press(createButton);

    await waitFor(() => {
      expect(getByText('Name is required')).toBeTruthy();
    });
  });

  /**
   * Test: Should validate email format
   * Scenario: User enters invalid email format
   * Expected: Email validation error is displayed
   */
  it('should validate email format', async () => {
    const { getByText, getByPlaceholderText } = renderWithProviders(<RegisterScreen />, {
      initialState: mockUnauthenticatedState,
    });

    // Fill form with invalid email
    fireEvent.changeText(getByPlaceholderText('Enter your full name'), 'Test User');
    fireEvent.changeText(getByPlaceholderText('Enter your email'), 'invalid-email');
    fireEvent.changeText(getByPlaceholderText('Create a password'), 'password123');
    fireEvent.changeText(getByPlaceholderText('Confirm your password'), 'password123');

    // Try to submit
    const createButton = getByText('Create Account');
    fireEvent.press(createButton);

    await waitFor(() => {
      expect(getByText('Please enter a valid email address')).toBeTruthy();
    });
  });

  /**
   * Test: Should validate required email field
   * Scenario: User tries to submit form without entering email
   * Expected: Email required validation error is displayed
   */
  it('should validate required email field', async () => {
    const { getByText, getByPlaceholderText } = renderWithProviders(<RegisterScreen />, {
      initialState: mockUnauthenticatedState,
    });

    // Fill other fields but leave email empty
    fireEvent.changeText(getByPlaceholderText('Enter your full name'), 'Test User');
    fireEvent.changeText(getByPlaceholderText('Create a password'), 'password123');
    fireEvent.changeText(getByPlaceholderText('Confirm your password'), 'password123');

    // Try to submit
    const createButton = getByText('Create Account');
    fireEvent.press(createButton);

    await waitFor(() => {
      expect(getByText('Email is required')).toBeTruthy();
    });
  });

  /**
   * Test: Should validate password length
   * Scenario: User enters password shorter than 8 characters
   * Expected: Password length validation error is displayed
   */
  it('should validate password length', async () => {
    const { getByText, getByPlaceholderText } = renderWithProviders(<RegisterScreen />, {
      initialState: mockUnauthenticatedState,
    });

    // Fill form with short password
    fireEvent.changeText(getByPlaceholderText('Enter your full name'), 'Test User');
    fireEvent.changeText(getByPlaceholderText('Enter your email'), 'test@example.com');
    fireEvent.changeText(getByPlaceholderText('Create a password'), '123');
    fireEvent.changeText(getByPlaceholderText('Confirm your password'), '123');

    // Try to submit
    const createButton = getByText('Create Account');
    fireEvent.press(createButton);

    await waitFor(() => {
      expect(getByText('Password must be at least 8 characters')).toBeTruthy();
    });
  });

  /**
   * Test: Should validate required password field
   * Scenario: User tries to submit form without entering password
   * Expected: Password required validation error is displayed
   */
  it('should validate required password field', async () => {
    const { getByText, getByPlaceholderText } = renderWithProviders(<RegisterScreen />, {
      initialState: mockUnauthenticatedState,
    });

    // Fill other fields but leave password empty
    fireEvent.changeText(getByPlaceholderText('Enter your full name'), 'Test User');
    fireEvent.changeText(getByPlaceholderText('Enter your email'), 'test@example.com');
    fireEvent.changeText(getByPlaceholderText('Confirm your password'), 'password123');

    // Try to submit
    const createButton = getByText('Create Account');
    fireEvent.press(createButton);

    await waitFor(() => {
      expect(getByText('Password is required')).toBeTruthy();
    });
  });

  /**
   * Test: Should validate password confirmation
   * Scenario: User enters mismatched passwords
   * Expected: Password mismatch validation error is displayed
   */
  it('should validate password confirmation', async () => {
    const { getByText, getByPlaceholderText } = renderWithProviders(<RegisterScreen />, {
      initialState: mockUnauthenticatedState,
    });

    // Fill form with mismatched passwords
    fireEvent.changeText(getByPlaceholderText('Enter your full name'), 'Test User');
    fireEvent.changeText(getByPlaceholderText('Enter your email'), 'test@example.com');
    fireEvent.changeText(getByPlaceholderText('Create a password'), 'password123');
    fireEvent.changeText(getByPlaceholderText('Confirm your password'), 'different123');

    // Try to submit
    const createButton = getByText('Create Account');
    fireEvent.press(createButton);

    await waitFor(() => {
      expect(getByText('Passwords do not match')).toBeTruthy();
    });
  });

  /**
   * Test: Should validate required password confirmation field
   * Scenario: User tries to submit form without confirming password
   * Expected: Password confirmation required error is displayed
   */
  it('should validate required password confirmation field', async () => {
    const { getByText, getByPlaceholderText } = renderWithProviders(<RegisterScreen />, {
      initialState: mockUnauthenticatedState,
    });

    // Fill other fields but leave confirm password empty
    fireEvent.changeText(getByPlaceholderText('Enter your full name'), 'Test User');
    fireEvent.changeText(getByPlaceholderText('Enter your email'), 'test@example.com');
    fireEvent.changeText(getByPlaceholderText('Create a password'), 'password123');

    // Try to submit
    const createButton = getByText('Create Account');
    fireEvent.press(createButton);

    await waitFor(() => {
      expect(getByText('Please confirm your password')).toBeTruthy();
    });
  });

  /**
   * Test: Should clear errors when user starts typing
   * Scenario: User sees validation error then starts typing in the field
   * Expected: Error message disappears when user modifies the field
   */
  it('should clear errors when user starts typing', async () => {
    const { getByText, getByPlaceholderText, queryByText } = renderWithProviders(<RegisterScreen />, {
      initialState: mockUnauthenticatedState,
    });

    // Submit form to trigger validation errors
    const createButton = getByText('Create Account');
    fireEvent.press(createButton);

    await waitFor(() => {
      expect(getByText('Name is required')).toBeTruthy();
    });

    // Start typing in name field
    fireEvent.changeText(getByPlaceholderText('Enter your full name'), 'Test');

    await waitFor(() => {
      expect(queryByText('Name is required')).toBeNull();
    });
  });

  /**
   * Test: Should handle successful registration
   * Scenario: User submits valid form and registration succeeds
   * Expected: Success alert is shown and navigation to login occurs
   */
  it('should handle successful registration', async () => {
    // Mock Alert.alert to simulate user pressing OK
    (Alert.alert as jest.Mock).mockImplementation((title, message, buttons) => {
      if (buttons && buttons[0] && buttons[0].onPress) {
        buttons[0].onPress();
      }
    });

    const { getByText, getByPlaceholderText } = renderWithProviders(<RegisterScreen />, {
      initialState: mockUnauthenticatedState,
    });

    // Fill form with valid data
    fireEvent.changeText(getByPlaceholderText('Enter your full name'), 'Test User');
    fireEvent.changeText(getByPlaceholderText('Enter your email'), 'test@example.com');
    fireEvent.changeText(getByPlaceholderText('Create a password'), 'password123');
    fireEvent.changeText(getByPlaceholderText('Confirm your password'), 'password123');

    // Submit form
    const createButton = getByText('Create Account');
    fireEvent.press(createButton);

    await waitFor(() => {
      expect(mockSignup).toHaveBeenCalledWith({
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123',
      });
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      'Success',
      'Account created successfully! You can now sign in.',
      expect.arrayContaining([
        expect.objectContaining({ text: 'OK' }),
      ])
    );

    expect(mockNavigate).toHaveBeenCalledWith('Login');
  });

  /**
   * Test: Should handle registration error
   * Scenario: User submits valid form but registration fails
   * Expected: Error alert is displayed with failure message
   */
  it('should handle registration error', async () => {
    const errorMessage = 'Email already exists';
    mockSignup.mockRejectedValue(new Error(errorMessage));

    const { getByText, getByPlaceholderText } = renderWithProviders(<RegisterScreen />, {
      initialState: mockUnauthenticatedState,
    });

    // Fill form with valid data
    fireEvent.changeText(getByPlaceholderText('Enter your full name'), 'Test User');
    fireEvent.changeText(getByPlaceholderText('Enter your email'), 'test@example.com');
    fireEvent.changeText(getByPlaceholderText('Create a password'), 'password123');
    fireEvent.changeText(getByPlaceholderText('Confirm your password'), 'password123');

    // Submit form
    const createButton = getByText('Create Account');
    fireEvent.press(createButton);

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith('Registration Failed', errorMessage);
    });
  });

  /**
   * Test: Should handle registration error without message
   * Scenario: Registration fails without specific error message
   * Expected: Generic error alert is displayed
   */
  it('should handle registration error without message', async () => {
    mockSignup.mockRejectedValue(new Error());

    const { getByText, getByPlaceholderText } = renderWithProviders(<RegisterScreen />, {
      initialState: mockUnauthenticatedState,
    });

    // Fill form with valid data
    fireEvent.changeText(getByPlaceholderText('Enter your full name'), 'Test User');
    fireEvent.changeText(getByPlaceholderText('Enter your email'), 'test@example.com');
    fireEvent.changeText(getByPlaceholderText('Create a password'), 'password123');
    fireEvent.changeText(getByPlaceholderText('Confirm your password'), 'password123');

    // Submit form
    const createButton = getByText('Create Account');
    fireEvent.press(createButton);

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith('Registration Failed', 'Failed to create account');
    });
  });

  /**
   * Test: Should navigate to login screen when sign in link is pressed
   * Scenario: User taps on "Sign in" link
   * Expected: Navigation to Login screen is triggered
   */
  it('should navigate to login screen when sign in link is pressed', () => {
    const { getByText } = renderWithProviders(<RegisterScreen />, {
      initialState: mockUnauthenticatedState,
    });

    const signInLink = getByText('Sign in');
    fireEvent.press(signInLink);

    expect(mockNavigate).toHaveBeenCalledWith('Login');
  });

  /**
   * Test: Should show loading state during registration
   * Scenario: User submits form and registration is in progress
   * Expected: Loading component is displayed
   */
  it('should show loading state during registration', async () => {
    // Mock signup to not resolve immediately
    let resolveSignup: () => void;
    const signupPromise = new Promise<void>((resolve) => {
      resolveSignup = resolve;
    });
    mockSignup.mockReturnValue(signupPromise);

    const { getByText, getByPlaceholderText } = renderWithProviders(<RegisterScreen />, {
      initialState: mockUnauthenticatedState,
    });

    // Fill form with valid data
    fireEvent.changeText(getByPlaceholderText('Enter your full name'), 'Test User');
    fireEvent.changeText(getByPlaceholderText('Enter your email'), 'test@example.com');
    fireEvent.changeText(getByPlaceholderText('Create a password'), 'password123');
    fireEvent.changeText(getByPlaceholderText('Confirm your password'), 'password123');

    // Submit form
    const createButton = getByText('Create Account');
    fireEvent.press(createButton);

    // Should show loading state
    await waitFor(() => {
      expect(getByText('Creating account...')).toBeTruthy();
    });

    // Resolve the signup promise
    resolveSignup!();
  });

  /**
   * Test: Should trim and format input data correctly
   * Scenario: User enters data with extra spaces and mixed case
   * Expected: Data is trimmed and email is lowercased before submission
   */
  it('should trim and format input data correctly', async () => {
    const { getByText, getByPlaceholderText } = renderWithProviders(<RegisterScreen />, {
      initialState: mockUnauthenticatedState,
    });

    // Fill form with data that needs formatting
    fireEvent.changeText(getByPlaceholderText('Enter your full name'), '  Test User  ');
    fireEvent.changeText(getByPlaceholderText('Enter your email'), '  TEST@EXAMPLE.COM  ');
    fireEvent.changeText(getByPlaceholderText('Create a password'), 'password123');
    fireEvent.changeText(getByPlaceholderText('Confirm your password'), 'password123');

    // Submit form
    const createButton = getByText('Create Account');
    fireEvent.press(createButton);

    await waitFor(() => {
      expect(mockSignup).toHaveBeenCalledWith({
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123',
      });
    });
  });

  /**
   * Test: Should display multiple validation errors simultaneously
   * Scenario: User submits empty form
   * Expected: All validation errors are displayed at once
   */
  it('should display multiple validation errors simultaneously', async () => {
    const { getByText } = renderWithProviders(<RegisterScreen />, {
      initialState: mockUnauthenticatedState,
    });

    // Submit empty form
    const createButton = getByText('Create Account');
    fireEvent.press(createButton);

    await waitFor(() => {
      expect(getByText('Name is required')).toBeTruthy();
      expect(getByText('Email is required')).toBeTruthy();
      expect(getByText('Password is required')).toBeTruthy();
      expect(getByText('Please confirm your password')).toBeTruthy();
    });
  });
});