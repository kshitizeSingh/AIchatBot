#!/bin/bash

# AI FAQ SDK Build Script

echo "Building AI FAQ SDK..."

# Install dependencies
echo "Installing dependencies..."
npm install

# Type check
echo "Running type check..."
npm run type-check

# Run tests (if any)
echo "Running tests..."
npm test

# Build the package
echo "Building package..."
npm run build

echo "Build complete! Package available in dist/"
echo ""
echo "To publish:"
echo "  npm publish"
echo ""
echo "For local development in React Native app:"
echo "  cd ../mobile-app"
echo "  npm install ../ai-faq-sdk"