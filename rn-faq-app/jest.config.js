
module.exports = {
  // Use a custom preset to avoid React Native's Jest setup issues
  testEnvironment: 'node',
  setupFilesAfterEnv: [


    '<rootDir>/src/__tests__/setup.ts'
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest',
    '^.+\\.(js|jsx)$': 'babel-jest',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|@react-navigation|react-redux|@reduxjs/toolkit|expo|ai-faq-sdk)/)/',
  ],
  testMatch: [
    '**/__tests__/**/*.(ts|tsx|js)',
    '**/*.(test|spec).(ts|tsx|js)'
  ],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/index.ts',
    '!src/**/__tests__/**',
    '!src/**/*.test.*',
    '!src/**/*.spec.*'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // Mock React Native components
    '^react-native$': '<rootDir>/src/__tests__/mocks/react-native.js',
    '^react-native-vector-icons/(.*)$': '<rootDir>/src/__tests__/mocks/react-native-vector-icons.js',
    '^react-native-document-picker$': '<rootDir>/src/__tests__/mocks/react-native-document-picker.js',
  },
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.json',
    },
  },
};