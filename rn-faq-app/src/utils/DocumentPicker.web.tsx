// src/utils/DocumentPicker.web.tsx
// Platform-specific document picker for web browsers

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
  static types = {
    allFiles: '*/*',
    images: 'image/*',
    plainText: 'text/plain',
    audio: 'audio/*',
    pdf: 'application/pdf',
    zip: 'application/zip',
    csv: 'text/csv',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  };

  static pick(options: DocumentPickerOptions = {}): Promise<DocumentPickerResponse[]> {
    return new Promise((resolve, reject) => {
      try {
        // Create a hidden file input element
        const input = document.createElement('input');
        input.type = 'file';
        input.style.display = 'none';
        
        // Set accepted file types
        if (options.type && options.type.length > 0) {
          input.accept = options.type.join(',');
        }
        
        // Set multiple selection
        if (options.allowMultiSelection) {
          input.multiple = true;
        }
        
        // Handle file selection
        input.onchange = (event) => {
          const target = event.target as HTMLInputElement;
          const files = target.files;
          
          if (!files || files.length === 0) {
            reject(new DocumentPickerCancelError());
            return;
          }
          
          const results: DocumentPickerResponse[] = [];
          
          for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const result: DocumentPickerResponse = {
              uri: URL.createObjectURL(file),
              name: file.name,
              size: file.size,
              type: file.type || 'application/octet-stream',
            };
            results.push(result);
          }
          
          // Clean up the input element
          document.body.removeChild(input);
          
          resolve(results);
        };
        
        // Handle cancellation
        input.oncancel = () => {
          document.body.removeChild(input);
          reject(new DocumentPickerCancelError());
        };
        
        // Add to DOM and trigger click
        document.body.appendChild(input);
        input.click();
        
      } catch (error) {
        reject(error);
      }
    });
  }

  static async pickSingle(options: DocumentPickerOptions = {}): Promise<DocumentPickerResponse> {
    const results = await this.pick({ ...options, allowMultiSelection: false });
    if (results.length === 0) {
      throw new Error('No file selected');
    }
    return results[0];
  }

  static isCancel(error: any): boolean {
    return error instanceof DocumentPickerCancelError;
  }

  static isInProgress(error: any): boolean {
    return error instanceof DocumentPickerInProgressError;
  }
}

export class DocumentPickerCancelError extends Error {
  constructor() {
    super('User canceled document picker');
    this.name = 'DocumentPickerCancelError';
  }
}

export class DocumentPickerInProgressError extends Error {
  constructor() {
    super('Document picker is already in progress');
    this.name = 'DocumentPickerInProgressError';
  }
}

export default PlatformDocumentPicker;
