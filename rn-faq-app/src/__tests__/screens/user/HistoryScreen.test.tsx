/**
 * HistoryScreen Unit Tests
 * 
 * Tests the user chat history screen including:
 * - Component rendering with conversation list
 * - Conversation loading and error handling
 * - Navigation to chat screen
 * - Conversation deletion functionality
 * - Empty state handling
 * - Date formatting and text truncation
 * - Refresh functionality
 */

import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, waitFor } from '@testing-library/react-native';
import HistoryScreen from '../../../screens/user/HistoryScreen';
import { renderWithProviders } from '../../mocks/testUtils';
import { mockConversations } from '../../mocks/mockSDK';
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

describe('HistoryScreen', () => {
  const mockSDK = {
    getConversations: jest.fn(),
    deleteConversation: jest.fn(),
  };

  const mockConversationsWithDetails = [
    {
      id: '1',
      title: 'Test Conversation 1',
      lastMessage: 'Hello, how can I help you today?',
      messageCount: 5,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T12:00:00Z',
    },
    {
      id: '2',
      title: 'Test Conversation 2',
      lastMessage: 'What is the weather like today? I need to know if I should bring an umbrella when I go out later.',
      messageCount: 12,
      createdAt: '2024-01-02T00:00:00Z',
      updatedAt: '2024-01-02T15:30:00Z',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockSDK.getConversations.mockResolvedValue(mockConversationsWithDetails);
    mockSDK.deleteConversation.mockResolvedValue(undefined);
  });

  /**
   * Test: Should render loading state initially
   * Scenario: Component mounts and shows loading indicator
   * Expected: Loading component is displayed with appropriate text
   */
  it('should render loading state initially', () => {
    const { getByText } = renderWithProviders(<HistoryScreen />, {
      initialState: mockAuthenticatedState,
      mockSDK,
    });

    expect(getByText('Loading conversations...')).toBeTruthy();
  });

  /**
   * Test: Should render conversation list after loading
   * Scenario: SDK call succeeds and conversations are displayed
   * Expected: Conversation list with proper information is shown
   */
  it('should render conversation list after loading', async () => {
    const { getByText, queryByText } = renderWithProviders(<HistoryScreen />, {
      initialState: mockAuthenticatedState,
      mockSDK,
    });

    await waitFor(() => {
      expect(queryByText('Loading conversations...')).toBeNull();
    });

    // Check header
    expect(getByText('Chat History')).toBeTruthy();
    expect(getByText('2 conversations')).toBeTruthy();

    // Check conversation items
    expect(getByText('Test Conversation 1')).toBeTruthy();
    expect(getByText('Test Conversation 2')).toBeTruthy();
    expect(getByText('Hello, how can I help you today?')).toBeTruthy();
  });

  /**
   * Test: Should display conversation details correctly
   * Scenario: Conversations are loaded and details are formatted properly
   * Expected: Message counts and dates are displayed correctly
   */
  it('should display conversation details correctly', async () => {
    const { getByText, queryByText } = renderWithProviders(<HistoryScreen />, {
      initialState: mockAuthenticatedState,
      mockSDK,
    });

    await waitFor(() => {
      expect(queryByText('Loading conversations...')).toBeNull();
    });

    // Check message counts
    expect(getByText('5 messages')).toBeTruthy();
    expect(getByText('12 messages')).toBeTruthy();

    // Check delete buttons
    const deleteButtons = getByText('Delete');
    expect(deleteButtons).toBeTruthy();
  });

  /**
   * Test: Should truncate long messages
   * Scenario: Conversation with long last message is displayed
   * Expected: Message text is truncated with ellipsis
   */
  it('should truncate long messages', async () => {
    const { getByText, queryByText } = renderWithProviders(<HistoryScreen />, {
      initialState: mockAuthenticatedState,
      mockSDK,
    });

    await waitFor(() => {
      expect(queryByText('Loading conversations...')).toBeNull();
    });

    // Check that long message is truncated
    const longMessage = 'What is the weather like today? I need to know if I should bring an umbrella when I go out later.';
    const truncatedMessage = longMessage.substring(0, 100) + '...';
    expect(getByText(truncatedMessage)).toBeTruthy();
  });

  /**
   * Test: Should handle navigation to chat screen
   * Scenario: User taps on a conversation
   * Expected: Navigation to Chat screen with conversation ID
   */
  it('should navigate to chat screen when conversation is pressed', async () => {
    const { getByText, queryByText } = renderWithProviders(<HistoryScreen />, {
      initialState: mockAuthenticatedState,
      mockSDK,
    });

    await waitFor(() => {
      expect(queryByText('Loading conversations...')).toBeNull();
    });

    const conversationCard = getByText('Test Conversation 1');
    fireEvent.press(conversationCard);

    expect(mockNavigate).toHaveBeenCalledWith('Chat', { conversationId: '1' });
  });

  /**
   * Test: Should show delete confirmation dialog
   * Scenario: User taps delete button on a conversation
   * Expected: Confirmation alert is displayed with proper options
   */
  it('should show delete confirmation dialog', async () => {
    const { getAllByText, queryByText } = renderWithProviders(<HistoryScreen />, {
      initialState: mockAuthenticatedState,
      mockSDK,
    });

    await waitFor(() => {
      expect(queryByText('Loading conversations...')).toBeNull();
    });

    const deleteButtons = getAllByText('Delete');
    fireEvent.press(deleteButtons[0]);

    expect(Alert.alert).toHaveBeenCalledWith(
      'Delete Conversation',
      'Are you sure you want to delete "Test Conversation 1"?',
      expect.arrayContaining([
        expect.objectContaining({ text: 'Cancel', style: 'cancel' }),
        expect.objectContaining({ text: 'Delete', style: 'destructive' }),
      ])
    );
  });

  /**
   * Test: Should handle conversation deletion successfully
   * Scenario: User confirms deletion and SDK call succeeds
   * Expected: Conversation is removed from list and success message is shown
   */
  it('should handle conversation deletion successfully', async () => {
    // Mock Alert.alert to simulate user confirming deletion
    (Alert.alert as jest.Mock).mockImplementation((title, message, buttons) => {
      if (buttons && buttons[1] && buttons[1].onPress) {
        buttons[1].onPress();
      }
    });

    const { getAllByText, queryByText } = renderWithProviders(<HistoryScreen />, {
      initialState: mockAuthenticatedState,
      mockSDK,
    });

    await waitFor(() => {
      expect(queryByText('Loading conversations...')).toBeNull();
    });

    const deleteButtons = getAllByText('Delete');
    fireEvent.press(deleteButtons[0]);

    await waitFor(() => {
      expect(mockSDK.deleteConversation).toHaveBeenCalledWith('1');
    });

    // Check success alert
    expect(Alert.alert).toHaveBeenCalledWith('Success', 'Conversation deleted successfully');
  });

  /**
   * Test: Should handle conversation deletion error
   * Scenario: User confirms deletion but SDK call fails
   * Expected: Error alert is displayed
   */
  it('should handle conversation deletion error', async () => {
    const errorSDK = {
      ...mockSDK,
      deleteConversation: jest.fn().mockRejectedValue(new Error('Delete failed')),
    };

    // Mock Alert.alert to simulate user confirming deletion
    (Alert.alert as jest.Mock).mockImplementation((title, message, buttons) => {
      if (buttons && buttons[1] && buttons[1].onPress) {
        buttons[1].onPress();
      }
    });

    const { getAllByText, queryByText } = renderWithProviders(<HistoryScreen />, {
      initialState: mockAuthenticatedState,
      mockSDK: errorSDK,
    });

    await waitFor(() => {
      expect(queryByText('Loading conversations...')).toBeNull();
    });

    const deleteButtons = getAllByText('Delete');
    fireEvent.press(deleteButtons[0]);

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith('Error', 'Failed to delete conversation');
    });
  });

  /**
   * Test: Should display empty state when no conversations
   * Scenario: SDK returns empty array of conversations
   * Expected: Empty state with start chat button is displayed
   */
  it('should display empty state when no conversations', async () => {
    const emptySDK = {
      getConversations: jest.fn().mockResolvedValue([]),
    };

    const { getByText, queryByText } = renderWithProviders(<HistoryScreen />, {
      initialState: mockAuthenticatedState,
      mockSDK: emptySDK,
    });

    await waitFor(() => {
      expect(queryByText('Loading conversations...')).toBeNull();
    });

    expect(getByText('No Conversations Yet')).toBeTruthy();
    expect(getByText('Start a conversation with the AI assistant to see your chat history here')).toBeTruthy();
    expect(getByText('Start New Chat')).toBeTruthy();
    expect(getByText('0 conversations')).toBeTruthy();
  });

  /**
   * Test: Should handle navigation from empty state
   * Scenario: User taps start new chat button in empty state
   * Expected: Navigation to Chat screen is triggered
   */
  it('should navigate to chat from empty state', async () => {
    const emptySDK = {
      getConversations: jest.fn().mockResolvedValue([]),
    };

    const { getByText, queryByText } = renderWithProviders(<HistoryScreen />, {
      initialState: mockAuthenticatedState,
      mockSDK: emptySDK,
    });

    await waitFor(() => {
      expect(queryByText('Loading conversations...')).toBeNull();
    });

    const startChatButton = getByText('Start New Chat');
    fireEvent.press(startChatButton);

    expect(mockNavigate).toHaveBeenCalledWith('Chat');
  });

  /**
   * Test: Should handle API errors gracefully
   * Scenario: SDK getConversations call fails
   * Expected: Error alert is displayed and loading state is cleared
   */
  it('should handle API errors gracefully', async () => {
    const errorSDK = {
      getConversations: jest.fn().mockRejectedValue(new Error('API Error')),
    };

    const { queryByText } = renderWithProviders(<HistoryScreen />, {
      initialState: mockAuthenticatedState,
      mockSDK: errorSDK,
    });

    await waitFor(() => {
      expect(queryByText('Loading conversations...')).toBeNull();
    });

    expect(Alert.alert).toHaveBeenCalledWith('Error', 'Failed to load conversation history');
  });

  /**
   * Test: Should call getConversations on component mount
   * Scenario: Component mounts and loads conversations
   * Expected: SDK getConversations method is called once
   */
  it('should call getConversations on mount', async () => {
    renderWithProviders(<HistoryScreen />, {
      initialState: mockAuthenticatedState,
      mockSDK,
    });

    await waitFor(() => {
      expect(mockSDK.getConversations).toHaveBeenCalledTimes(1);
    });
  });

  /**
   * Test: Should display correct conversation count
   * Scenario: Conversations are loaded and count is displayed
   * Expected: Header shows accurate conversation count
   */
  it('should display correct conversation count', async () => {
    const { getByText, queryByText } = renderWithProviders(<HistoryScreen />, {
      initialState: mockAuthenticatedState,
      mockSDK,
    });

    await waitFor(() => {
      expect(queryByText('Loading conversations...')).toBeNull();
    });

    expect(getByText(`${mockConversationsWithDetails.length} conversations`)).toBeTruthy();
  });

  /**
   * Test: Should handle single conversation count correctly
   * Scenario: Only one conversation exists
   * Expected: Singular form is used in the count display
   */
  it('should handle single conversation count correctly', async () => {
    const singleConversationSDK = {
      getConversations: jest.fn().mockResolvedValue([mockConversationsWithDetails[0]]),
    };

    const { getByText, queryByText } = renderWithProviders(<HistoryScreen />, {
      initialState: mockAuthenticatedState,
      mockSDK: singleConversationSDK,
    });

    await waitFor(() => {
      expect(queryByText('Loading conversations...')).toBeNull();
    });

    expect(getByText('1 conversation')).toBeTruthy();
  });

  /**
   * Test: Should handle single message count correctly
   * Scenario: Conversation with one message is displayed
   * Expected: Singular form is used for message count
   */
  it('should handle single message count correctly', async () => {
    const singleMessageConversation = {
      ...mockConversationsWithDetails[0],
      messageCount: 1,
    };

    const singleMessageSDK = {
      getConversations: jest.fn().mockResolvedValue([singleMessageConversation]),
    };

    const { getByText, queryByText } = renderWithProviders(<HistoryScreen />, {
      initialState: mockAuthenticatedState,
      mockSDK: singleMessageSDK,
    });

    await waitFor(() => {
      expect(queryByText('Loading conversations...')).toBeNull();
    });

    expect(getByText('1 message')).toBeTruthy();
  });

  /**
   * Test: Should handle untitled conversations
   * Scenario: Conversation without title is displayed
   * Expected: Default title is shown
   */
  it('should handle untitled conversations', async () => {
    const untitledConversation = {
      ...mockConversationsWithDetails[0],
      title: '',
    };

    const untitledSDK = {
      getConversations: jest.fn().mockResolvedValue([untitledConversation]),
    };

    const { getByText, queryByText } = renderWithProviders(<HistoryScreen />, {
      initialState: mockAuthenticatedState,
      mockSDK: untitledSDK,
    });

    await waitFor(() => {
      expect(queryByText('Loading conversations...')).toBeNull();
    });

    expect(getByText('Untitled Conversation')).toBeTruthy();
  });
});