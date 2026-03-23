// src/components/common/DocumentPickerWeb.tsx
import React from 'react';
import { Platform } from 'react-native';

export interface DocumentPickerResponse {
  uri: string;
  name: string;
  size: number;
  type: string;
}

export interface DocumentPickerOptions {
  type?: string[];
  allowMultiSelection?: boolean;
}

class DocumentPickerWeb {
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

  static async pick(options: DocumentPickerOptions = {}): Promise<DocumentPickerResponse[]> {
    if (Platform.OS === 'web') {
      return new Promise((resolve, reject) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = options.allowMultiSelection || false;
        
        if (options.type && options.type.length > 0) {
          input.accept = options.type.join(',');
        }

        input.onchange = (event: any) => {
          const files = event.target.files;
          if (files && files.length > 0) {
            const results: DocumentPickerResponse[] = [];
            
            for (let i = 0; i < files.length; i++) {
              const file = files[i];
              results.push({
                uri: URL.createObjectURL(file),
                name: file.name,
                size: file.size,
                type: file.type,
              });
            }
            
            resolve(results);
          } else {
            reject(new Error('No file selected'));
          }
        };

        input.oncancel = () => {
          reject(new Error('User cancelled document picker'));
        };

        input.click();
      });
    } else {
      // For native platforms, this should not be called
      throw new Error('DocumentPickerWeb should only be used on web platform');
    }
  }

  static isCancel(error: any): boolean {
    return error && error.message === 'User cancelled document picker';
  }
}

export default DocumentPickerWeb;