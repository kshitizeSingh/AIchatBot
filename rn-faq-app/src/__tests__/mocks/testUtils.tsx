// Test utilities for rendering components with providers
import React from 'react';
import { render, RenderOptions } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { NavigationContainer } from '@react-navigation/native';
import { SDKContext } from '../../contexts/SDKContext';
import { createMockStore } from './mockStore';
import { createMockSDK } from './mockSDK';
import type { RootState } from '../../store/store';
import type { AIFAQSDK } from 'ai-faq-sdk';

interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  initialState?: Partial<RootState>;
  mockSDK?: Partial<AIFAQSDK>;
  withNavigation?: boolean;
}

// Custom render function that includes providers
export const renderWithProviders = (
  ui: React.ReactElement,
  {
    initialState,
    mockSDK,
    withNavigation = true,
    ...renderOptions
  }: CustomRenderOptions = {}
) => {
  const store = createMockStore(initialState);
  const sdk = { ...createMockSDK(), ...mockSDK };

  const AllTheProviders: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const content = (
      <Provider store={store}>
        <SDKContext.Provider value={sdk as AIFAQSDK}>
          {children}
        </SDKContext.Provider>
      </Provider>
    );

    if (withNavigation) {
      return (
        <NavigationContainer>
          {content}
        </NavigationContainer>
      );
    }

    return content;
  };

  return {
    ...render(ui, { wrapper: AllTheProviders, ...renderOptions }),
    store,
    mockSDK: sdk,
  };
};

// Helper to create mock navigation props
export const createMockNavigation = () => ({
  navigate: jest.fn(),
  goBack: jest.fn(),
  dispatch: jest.fn(),
  setParams: jest.fn(),
  addListener: jest.fn(),
  removeListener: jest.fn(),
  canGoBack: jest.fn(() => false),
  isFocused: jest.fn(() => true),
  push: jest.fn(),
  pop: jest.fn(),
  popToTop: jest.fn(),
  replace: jest.fn(),
  reset: jest.fn(),
  setOptions: jest.fn(),
  getId: jest.fn(),
  getParent: jest.fn(),
  getState: jest.fn(),
});

// Helper to create mock route props
export const createMockRoute = (params = {}) => ({
  key: 'test-route',
  name: 'TestScreen',
  params,
  path: undefined,
});

// Helper to wait for async operations
export const waitForAsync = () => new Promise(resolve => setTimeout(resolve, 0));

// Helper to create mock Alert
export const mockAlert = {
  alert: jest.fn((title, message, buttons) => {
    // Simulate pressing the first button if it exists
    if (buttons && buttons.length > 0 && buttons[0].onPress) {
      buttons[0].onPress();
    }
  }),
};

// Re-export everything from testing library
export * from '@testing-library/react-native';