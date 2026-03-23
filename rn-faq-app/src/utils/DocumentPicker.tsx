// src/utils/DocumentPicker.tsx
// Universal document picker that automatically selects the correct implementation

import { Platform } from 'react-native';

// Platform-specific imports
let PlatformDocumentPicker: any;

if (Platform.OS === 'web') {
  PlatformDocumentPicker = require('./DocumentPicker.web').default;
} else {
  PlatformDocumentPicker = require('./DocumentPicker.native').default;
}

export interface DocumentPickerResponse {
  uri: string;
  name: string;
  size: number;
  type: string;
}

export interface DocumentPickerOptions {
  type?: string[];
  allowMultiSelection?: boolean;
  copyToCacheDirectory?: boolean;
}

export class UniversalDocumentPicker {
  static get types() {
    return PlatformDocumentPicker.types;
  }

  static async pick(options: DocumentPickerOptions = {}): Promise<DocumentPickerResponse[]> {
    return PlatformDocumentPicker.pick(options);
  }

  static async pickSingle(options: DocumentPickerOptions = {}): Promise<DocumentPickerResponse> {
    return PlatformDocumentPicker.pickSingle(options);
  }

  static isCancel(error: any): boolean {
    return PlatformDocumentPicker.isCancel(error);
  }

  static isInProgress(error: any): boolean {
    return PlatformDocumentPicker.isInProgress(error);
  }
}

// Export types and classes
export { DocumentPickerCancelError, DocumentPickerInProgressError } from './DocumentPicker.web';

// Default export
export default UniversalDocumentPicker;
