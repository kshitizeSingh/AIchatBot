/**
 * DashboardScreen Unit Tests
 * 
 * Tests the admin dashboard screen component including:
 * - Component rendering with proper UI elements
 * - Data loading and error handling
 * - User interactions (logout, refresh)
 * - SDK integration and method calls
 * - State management and loading states
 */

import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, waitFor } from '@testing-library/react-native';
import DashboardScreen from '../../../screens/admin/DashboardScreen';
import { renderWithProviders } from '../../mocks/testUtils';
import { mockDocuments, mockUsers, mockConversations } from '../../mocks/mockSDK';
import { mockAuthenticatedState } from '../../mocks/mockStore';

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

// Mock useAuth hook
jest.mock('../../../hooks/useAuth', () => ({
  useAuth: () => ({
    logout: jest.fn(),
  }),
}));

describe('DashboardScreen', () => {
  const mockSDK = {
    getDocuments: jest.fn(),
    getUsers: jest.fn(),
    getConversations: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockSDK.getDocuments.mockResolvedValue(mockDocuments);
    mockSDK.getUsers.mockResolvedValue(mockUsers);
    mockSDK.getConversations.mockResolvedValue(mockConversations);
  });

  /**
   * Test: Should render dashboard screen with loading state initially
   * Scenario: Component mounts and shows loading indicator
   * Expected: Loading component is displayed with appropriate text
   */
  it('should render loading state initially', () => {
    const { getByText } = renderWithProviders(<DashboardScreen />, {
      initialState: mockAuthenticatedState,
      mockSDK,
    });

    expect(getByText('Loading dashboard...')).toBeTruthy();
  });

  /**
   * Test: Should render dashboard content after successful data loading
   * Scenario: SDK calls succeed and dashboard displays stats and data
   * Expected: Dashboard title, stats cards, and sections are rendered
   */
  it('should render dashboard content after loading', async () => {
    const { getByText, queryByText } = renderWithProviders(<DashboardScreen />, {
      initialState: mockAuthenticatedState,
      mockSDK,
    });

    await waitFor(() => {
      expect(queryByText('Loading dashboard...')).toBeNull();
    });

    // Check header
    expect(getByText('Admin Dashboard')).toBeTruthy();
    expect(getByText('Logout')).toBeTruthy();

    // Check stats cards
    expect(getByText('2')).toBeTruthy(); // Total documents
    expect(getByText('Documents')).toBeTruthy();
    expect(getByText('Users')).toBeTruthy();
    expect(getByText('Conversations')).toBeTruthy();

    // Check sections
    expect(getByText('Recent Documents')).toBeTruthy();
    expect(getByText('Recent Users')).toBeTruthy();
  });

  /**
   * Test: Should display document information correctly
   * Scenario: Dashboard loads and displays recent documents with proper formatting
   * Expected: Document filenames and statuses are shown correctly
   */
  it('should display recent documents correctly', async () => {
    const { getByText, queryByText } = renderWithProviders(<DashboardScreen />, {
      initialState: mockAuthenticatedState,
      mockSDK,
    });

    await waitFor(() => {
      expect(queryByText('Loading dashboard...')).toBeNull();
    });

    // Check document information
    expect(getByText('test-doc-1.pdf')).toBeTruthy();
    expect(getByText('Status: processed')).toBeTruthy();
    expect(getByText('test-doc-2.pdf')).toBeTruthy();
    expect(getByText('Status: processing')).toBeTruthy();
  });

  /**
   * Test: Should display user information correctly
   * Scenario: Dashboard loads and displays recent users with proper formatting
   * Expected: User emails and roles are shown correctly
   */
  it('should display recent users correctly', async () => {
    const { getByText, queryByText } = renderWithProviders(<DashboardScreen />, {
      initialState: mockAuthenticatedState,
      mockSDK,
    });

    await waitFor(() => {
      expect(queryByText('Loading dashboard...')).toBeNull();
    });

    // Check user information
    expect(getByText('user1@example.com')).toBeTruthy();
    expect(getByText('Role: user')).toBeTruthy();
    expect(getByText('admin@example.com')).toBeTruthy();
    expect(getByText('Role: admin')).toBeTruthy();
  });

  /**
   * Test: Should handle SDK method calls correctly
   * Scenario: Component loads and makes appropriate SDK calls
   * Expected: All required SDK methods are called once
   */
  it('should call SDK methods on mount', async () => {
    renderWithProviders(<DashboardScreen />, {
      initialState: mockAuthenticatedState,
      mockSDK,
    });

    await waitFor(() => {
      expect(mockSDK.getDocuments).toHaveBeenCalledTimes(1);
      expect(mockSDK.getUsers).toHaveBeenCalledTimes(1);
      expect(mockSDK.getConversations).toHaveBeenCalledTimes(1);
    });
  });

  /**
   * Test: Should handle API errors gracefully
   * Scenario: SDK calls fail and error alert is shown
   * Expected: Error alert is displayed and loading state is cleared
   */
  it('should handle API errors gracefully', async () => {
    const errorSDK = {
      ...mockSDK,
      getDocuments: jest.fn().mockRejectedValue(new Error('API Error')),
    };

    const { queryByText } = renderWithProviders(<DashboardScreen />, {
      initialState: mockAuthenticatedState,
      mockSDK: errorSDK,
    });

    await waitFor(() => {
      expect(queryByText('Loading dashboard...')).toBeNull();
    });

    expect(Alert.alert).toHaveBeenCalledWith('Error', 'Failed to load dashboard data');
  });

  /**
   * Test: Should handle refresh functionality
   * Scenario: User pulls to refresh the dashboard
   * Expected: SDK methods are called again and refresh state is managed
   */
  it('should handle refresh functionality', async () => {
    const { getByTestId, queryByText } = renderWithProviders(<DashboardScreen />, {
      initialState: mockAuthenticatedState,
      mockSDK,
    });

    await waitFor(() => {
      expect(queryByText('Loading dashboard...')).toBeNull();
    });

    // Clear previous calls
    jest.clearAllMocks();

    // Find the ScrollView and trigger refresh
    const scrollView = getByTestId('dashboard-scroll-view') || 
                      getByText('Admin Dashboard').parent?.parent;
    
    if (scrollView) {
      fireEvent(scrollView, 'refresh');
      
      await waitFor(() => {
        expect(mockSDK.getDocuments).toHaveBeenCalledTimes(1);
        expect(mockSDK.getUsers).toHaveBeenCalledTimes(1);
        expect(mockSDK.getConversations).toHaveBeenCalledTimes(1);
      });
    }
  });

  /**
   * Test: Should show logout confirmation dialog
   * Scenario: User taps logout button
   * Expected: Confirmation alert is displayed with proper options
   */
  it('should show logout confirmation dialog', async () => {
    const { getByText, queryByText } = renderWithProviders(<DashboardScreen />, {
      initialState: mockAuthenticatedState,
      mockSDK,
    });

    await waitFor(() => {
      expect(queryByText('Loading dashboard...')).toBeNull();
    });

    const logoutButton = getByText('Logout');
    fireEvent.press(logoutButton);

    expect(Alert.alert).toHaveBeenCalledWith(
      'Logout',
      'Are you sure you want to logout?',
      expect.arrayContaining([
        expect.objectContaining({ text: 'Cancel', style: 'cancel' }),
        expect.objectContaining({ text: 'Logout', style: 'destructive' }),
      ])
    );
  });

  /**
   * Test: Should display empty state when no data is available
   * Scenario: SDK returns empty arrays for all data
   * Expected: Empty state messages are displayed appropriately
   */
  it('should display empty state when no data is available', async () => {
    const emptySDK = {
      getDocuments: jest.fn().mockResolvedValue([]),
      getUsers: jest.fn().mockResolvedValue([]),
      getConversations: jest.fn().mockResolvedValue([]),
    };

    const { getByText, queryByText } = renderWithProviders(<DashboardScreen />, {
      initialState: mockAuthenticatedState,
      mockSDK: emptySDK,
    });

    await waitFor(() => {
      expect(queryByText('Loading dashboard...')).toBeNull();
    });

    // Check stats show zero
    expect(getByText('0')).toBeTruthy();
    
    // Check empty state messages
    expect(getByText('No documents found')).toBeTruthy();
    expect(getByText('No users found')).toBeTruthy();
  });

  /**
   * Test: Should display correct stats counts
   * Scenario: Dashboard loads with specific data counts
   * Expected: Stats cards show accurate numbers from SDK responses
   */
  it('should display correct stats counts', async () => {
    const { getByText, queryByText } = renderWithProviders(<DashboardScreen />, {
      initialState: mockAuthenticatedState,
      mockSDK,
    });

    await waitFor(() => {
      expect(queryByText('Loading dashboard...')).toBeNull();
    });

    // Check that stats reflect the mock data counts
    const statsCards = [
      { count: mockDocuments.length.toString(), label: 'Documents' },
      { count: mockUsers.length.toString(), label: 'Users' },
      { count: mockConversations.length.toString(), label: 'Conversations' },
    ];

    statsCards.forEach(({ count, label }) => {
      expect(getByText(count)).toBeTruthy();
      expect(getByText(label)).toBeTruthy();
    });
  });
});