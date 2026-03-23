// src/utils/DocumentPicker.native.tsx
// Platform-specific document picker for native platforms

import DocumentPicker from 'react-native-document-picker';

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

export class PlatformDocumentPicker {
  static types = DocumentPicker.types;

  static async pick(options: DocumentPickerOptions = {}): Promise<DocumentPickerResponse[]> {
    try {
      const result = await DocumentPicker.pick({
        type: options.type || [DocumentPicker.types.allFiles],
        allowMultiSelection: options.allowMultiSelection || false,
        copyToCacheDirectory: options.copyToCacheDirectory,
      });

      // Normalize the result to match our interface
      return result.map(file => ({
        uri: file.uri,
        name: file.name || 'Unknown',
        size: file.size || 0,
        type: file.type || 'application/octet-stream',
      }));
    } catch (error) {
      throw error;
    }
  }

  static async pickSingle(options: DocumentPickerOptions = {}): Promise<DocumentPickerResponse> {
    const results = await this.pick({ ...options, allowMultiSelection: false });
    if (results.length === 0) {
      throw new Error('No file selected');
    }
    return results[0];
  }

  static isCancel(error: any): boolean {
    return DocumentPicker.isCancel(error);
  }

  static isInProgress(error: any): boolean {
    return DocumentPicker.isInProgress && DocumentPicker.isInProgress(error);
  }
}

export default PlatformDocumentPicker;
