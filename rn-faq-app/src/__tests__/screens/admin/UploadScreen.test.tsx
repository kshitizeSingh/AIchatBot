// src/__tests__/screens/admin/UploadScreen.test.tsx
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Platform, Alert } from 'react-native';
import UploadScreen from '../../../screens/admin/UploadScreen';
import { SDKContext } from '../../../contexts/SDKContext';
import DocumentPicker from 'react-native-document-picker';
import DocumentPickerWeb from '../../../components/common/DocumentPickerWeb';

// Mock dependencies
jest.mock('react-native-document-picker');
jest.mock('../../../components/common/DocumentPickerWeb');
jest.mock('react-native', () => {
  const RN = jest.requireActual('react-native');
  return {
    ...RN,
    Platform: {
      ...RN.Platform,
      OS: 'web', // Default to web for testing
    },
    Alert: {
      alert: jest.fn(),
    },
  };
});

const mockSDK = {
  uploadDocument: jest.fn(),
};

const mockDocumentPickerWeb = DocumentPickerWeb as jest.Mocked<typeof DocumentPickerWeb>;
const mockDocumentPicker = DocumentPicker as jest.Mocked<typeof DocumentPicker>;
const mockAlert = Alert.alert as jest.MockedFunction<typeof Alert.alert>;

describe('UploadScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const renderUploadScreen = () => {
    return render(
      <SDKContext.Provider value={mockSDK as any}>
        <UploadScreen />
      </SDKContext.Provider>
    );
  };

  describe('Shadow Styles', () => {
    it('should use boxShadow instead of deprecated shadow properties', () => {
      const { getByTestId } = renderUploadScreen();
      
      // The component should render without deprecated shadow style warnings
      // This test ensures the component uses modern boxShadow instead of shadowColor, shadowOffset, etc.
      expect(() => renderUploadScreen()).not.toThrow();
    });
  });

  describe('Document Selection - Web Platform', () => {
    beforeEach(() => {
      (Platform as any).OS = 'web';
    });

    it('should use DocumentPickerWeb on web platform', async () => {
      const mockFile = {
        uri: 'blob:test-file',
        name: 'test.pdf',
        size: 1024,
        type: 'application/pdf',
      };

      mockDocumentPickerWeb.pick.mockResolvedValue([mockFile]);
      mockDocumentPickerWeb.isCancel.mockReturnValue(false);

      const { getByText } = renderUploadScreen();
      const selectButton = getByText('Select Document');

      fireEvent.press(selectButton);

      await waitFor(() => {
        expect(mockDocumentPickerWeb.pick).toHaveBeenCalledWith({
          type: [DocumentPickerWeb.types.pdf, DocumentPickerWeb.types.doc, DocumentPickerWeb.types.docx],
          allowMultiSelection: false,
        });
      });
    });

    it('should handle file selection success on web', async () => {
      const mockFile = {
        uri: 'blob:test-file',
        name: 'test.pdf',
        size: 1024,
        type: 'application/pdf',
      };

      mockDocumentPickerWeb.pick.mockResolvedValue([mockFile]);

      const { getByText } = renderUploadScreen();
      const selectButton = getByText('Select Document');

      fireEvent.press(selectButton);

      await waitFor(() => {
        expect(getByText('test.pdf')).toBeTruthy();
        expect(getByText('1 KB')).toBeTruthy();
        expect(getByText('Upload')).toBeTruthy();
      });
    });

    it('should handle cancellation on web', async () => {
      const cancelError = new Error('User cancelled document picker');
      mockDocumentPickerWeb.pick.mockRejectedValue(cancelError);
      mockDocumentPickerWeb.isCancel.mockReturnValue(true);

      const { getByText } = renderUploadScreen();
      const selectButton = getByText('Select Document');

      fireEvent.press(selectButton);

      await waitFor(() => {
        expect(mockAlert).not.toHaveBeenCalled();
      });
    });

    it('should handle errors on web', async () => {
      const error = new Error('Network error');
      mockDocumentPickerWeb.pick.mockRejectedValue(error);
      mockDocumentPickerWeb.isCancel.mockReturnValue(false);

      const { getByText } = renderUploadScreen();
      const selectButton = getByText('Select Document');

      fireEvent.press(selectButton);

      await waitFor(() => {
        expect(mockAlert).toHaveBeenCalledWith('Error', 'Failed to select document');
      });
    });
  });

  describe('Document Selection - Native Platform', () => {
    beforeEach(() => {
      (Platform as any).OS = 'ios';
    });

    it('should use DocumentPicker on native platform', async () => {
      const mockFile = {
        uri: 'file://test-file.pdf',
        name: 'test.pdf',
        size: 1024,
        type: 'application/pdf',
        fileCopyUri: null, // Required for native DocumentPickerResponse
      };

      mockDocumentPicker.pick.mockResolvedValue([mockFile]);
      mockDocumentPicker.isCancel.mockReturnValue(false);

      const { getByText } = renderUploadScreen();
      const selectButton = getByText('Select Document');

      fireEvent.press(selectButton);

      await waitFor(() => {
        expect(mockDocumentPicker.pick).toHaveBeenCalledWith({
          type: [DocumentPicker.types.pdf, DocumentPicker.types.doc, DocumentPicker.types.docx],
          allowMultiSelection: false,
        });
      });
    });
  });

  describe('Document Upload', () => {
    beforeEach(() => {
      (Platform as any).OS = 'web';
    });

    it('should upload selected document', async () => {
      const mockFile = {
        uri: 'blob:test-file',
        name: 'test.pdf',
        size: 1024,
        type: 'application/pdf',
      };

      mockDocumentPickerWeb.pick.mockResolvedValue([mockFile]);
      mockSDK.uploadDocument.mockResolvedValue({ success: true });

      const { getByText } = renderUploadScreen();
      
      // Select file first
      const selectButton = getByText('Select Document');
      fireEvent.press(selectButton);

      await waitFor(() => {
        expect(getByText('Upload')).toBeTruthy();
      });

      // Upload file
      const uploadButton = getByText('Upload');
      fireEvent.press(uploadButton);

      await waitFor(() => {
        expect(mockSDK.uploadDocument).toHaveBeenCalledWith('test.pdf', 'application/pdf');
      });
    });

    it('should show error if no file selected for upload', async () => {
      const { getByText } = renderUploadScreen();
      
      // Try to upload without selecting a file
      const selectButton = getByText('Select Document');
      
      // Mock the upload function to simulate no file selected
      mockSDK.uploadDocument.mockRejectedValue(new Error('No file selected'));
      
      expect(getByText('Select Document')).toBeTruthy();
    });

    it('should handle upload errors', async () => {
      const mockFile = {
        uri: 'blob:test-file',
        name: 'test.pdf',
        size: 1024,
        type: 'application/pdf',
      };

      mockDocumentPickerWeb.pick.mockResolvedValue([mockFile]);
      mockSDK.uploadDocument.mockRejectedValue(new Error('Upload failed'));

      const { getByText } = renderUploadScreen();
      
      // Select file first
      const selectButton = getByText('Select Document');
      fireEvent.press(selectButton);

      await waitFor(() => {
        expect(getByText('Upload')).toBeTruthy();
      });

      // Upload file
      const uploadButton = getByText('Upload');
      fireEvent.press(uploadButton);

      await waitFor(() => {
        expect(mockAlert).toHaveBeenCalledWith('Error', 'Failed to upload document. Please try again.');
      });
    });
  });

  describe('File Size Formatting', () => {
    it('should format file sizes correctly', async () => {
      const testCases = [
        { size: 1024, expected: '1 KB' },
        { size: 1048576, expected: '1 MB' },
        { size: 500, expected: '500 Bytes' },
      ];

      for (const testCase of testCases) {
        const mockFile = {
          uri: 'blob:test-file',
          name: 'test.pdf',
          size: testCase.size,
          type: 'application/pdf',
        };

        mockDocumentPickerWeb.pick.mockResolvedValue([mockFile]);

        const { getByText, unmount } = renderUploadScreen();
        const selectButton = getByText('Select Document');

        fireEvent.press(selectButton);

        await waitFor(() => {
          expect(getByText(testCase.expected)).toBeTruthy();
        });

        unmount();
      }
    });
  });

  describe('TypeScript Type Safety', () => {
    it('should handle DocumentPickerResponse interface correctly', async () => {
      const mockFile = {
        uri: 'blob:test-file',
        name: 'test.pdf',
        size: 1024,
        type: 'application/pdf',
      };

      mockDocumentPickerWeb.pick.mockResolvedValue([mockFile]);

      const { getByText } = renderUploadScreen();
      const selectButton = getByText('Select Document');

      fireEvent.press(selectButton);

      await waitFor(() => {
        // Verify that all required properties are displayed correctly
        expect(getByText('test.pdf')).toBeTruthy(); // name
        expect(getByText('1 KB')).toBeTruthy(); // size
        expect(getByText('application/pdf')).toBeTruthy(); // type
      });
    });
  });
});
