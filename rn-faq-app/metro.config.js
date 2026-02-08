const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Add custom resolver for ai-faq-sdk with proper path resolution
config.resolver = {
  ...config.resolver,
  alias: {
    'ai-faq-sdk': path.resolve(__dirname, '../ai-faq-sdk'),
  },
  // Add support for symlinks and local packages
  resolverMainFields: ['react-native', 'browser', 'main'],
  platforms: ['ios', 'android', 'native', 'web'],
};

// Add watchFolders to include the local ai-faq-sdk package
config.watchFolders = [
  path.resolve(__dirname, '../ai-faq-sdk'),
];

module.exports = config;