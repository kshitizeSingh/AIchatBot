// src/__tests__/utils/DocumentPicker.test.tsx
import { Platform } from 'react-native';
import UniversalDocumentPicker from '../../utils/DocumentPicker';

// Mock Platform.OS
jest.mock('react-native', () => ({
  Platform: {
    OS: 'web', // Default to web for testing
  },
}));

// Mock the platform-specific implementations
jest.mock('../../utils/DocumentPicker.web', () => ({
  default: {
    types: {
      pdf: 'application/pdf',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    },
    pick: jest.fn(),
    pickSingle: jest.fn(),
    isCancel: jest.fn(),
    isInProgress: jest.fn(),
  },
}));

jest.mock('../../utils/DocumentPicker.native', () => ({
  default: {
    types: {
      pdf: 'application/pdf',
      doc: 'application/msword', 
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    },
    pick: jest.fn(),
    pickSingle: jest.fn(),
    isCancel: jest.fn(),
    isInProgress: jest.fn(),
  },
}));

describe('UniversalDocumentPicker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Web Platform', () => {
    beforeEach(() => {
      (Platform as any).OS = 'web';
    });

    it('should have types available', () => {
      expect(UniversalDocumentPicker.types).toBeDefined();
      expect(UniversalDocumentPicker.types.pdf).toBe('application/pdf');
      expect(UniversalDocumentPicker.types.doc).toBe('application/msword');
      expect(UniversalDocumentPicker.types.docx).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    });

    it('should call web implementation pick method', async () => {
      const mockResult = [{
        uri: 'blob:http://localhost/test.pdf',
        name: 'test.pdf',
        size: 1024,
        type: 'application/pdf',
      }];

      const WebDocumentPicker = require('../../utils/DocumentPicker.web').default;
      WebDocumentPicker.pick.mockResolvedValue(mockResult);

      const options = {
        type: [UniversalDocumentPicker.types.pdf],
        allowMultiSelection: false,
      };

      const result = await UniversalDocumentPicker.pick(options);

      expect(WebDocumentPicker.pick).toHaveBeenCalledWith(options);
      expect(result).toEqual(mockResult);
    });

    it('should call web implementation pickSingle method', async () => {
      const mockResult = {
        uri: 'blob:http://localhost/test.pdf',
        name: 'test.pdf',
        size: 1024,
        type: 'application/pdf',
      };

      const WebDocumentPicker = require('../../utils/DocumentPicker.web').default;
      WebDocumentPicker.pickSingle.mockResolvedValue(mockResult);

      const options = {
        type: [UniversalDocumentPicker.types.pdf],
      };

      const result = await UniversalDocumentPicker.pickSingle(options);

      expect(WebDocumentPicker.pickSingle).toHaveBeenCalledWith(options);
      expect(result).toEqual(mockResult);
    });

    it('should call web implementation isCancel method', () => {
      const mockError = new Error('Cancel error');
      const WebDocumentPicker = require('../../utils/DocumentPicker.web').default;
      WebDocumentPicker.isCancel.mockReturnValue(true);

      const result = UniversalDocumentPicker.isCancel(mockError);

      expect(WebDocumentPicker.isCancel).toHaveBeenCalledWith(mockError);
      expect(result).toBe(true);
    });

    it('should call web implementation isInProgress method', () => {
      const mockError = new Error('In progress error');
      const WebDocumentPicker = require('../../utils/DocumentPicker.web').default;
      WebDocumentPicker.isInProgress.mockReturnValue(false);

      const result = UniversalDocumentPicker.isInProgress(mockError);

      expect(WebDocumentPicker.isInProgress).toHaveBeenCalledWith(mockError);
      expect(result).toBe(false);
    });
  });

  describe('Native Platform', () => {
    beforeEach(() => {
      (Platform as any).OS = 'ios';
    });

    it('should call native implementation pick method', async () => {
      const mockResult = [{
        uri: 'file:///path/to/test.pdf',
        name: 'test.pdf',
        size: 1024,
        type: 'application/pdf',
      }];

      const NativeDocumentPicker = require('../../utils/DocumentPicker.native').default;
      NativeDocumentPicker.pick.mockResolvedValue(mockResult);

      const options = {
        type: [UniversalDocumentPicker.types.pdf],
        allowMultiSelection: false,
      };

      const result = await UniversalDocumentPicker.pick(options);

      expect(NativeDocumentPicker.pick).toHaveBeenCalledWith(options);
      expect(result).toEqual(mockResult);
    });

    it('should call native implementation pickSingle method', async () => {
      const mockResult = {
        uri: 'file:///path/to/test.pdf',
        name: 'test.pdf',
        size: 1024,
        type: 'application/pdf',
      };

      const NativeDocumentPicker = require('../../utils/DocumentPicker.native').default;
      NativeDocumentPicker.pickSingle.mockResolvedValue(mockResult);

      const options = {
        type: [UniversalDocumentPicker.types.pdf],
      };

      const result = await UniversalDocumentPicker.pickSingle(options);

      expect(NativeDocumentPicker.pickSingle).toHaveBeenCalledWith(options);
      expect(result).toEqual(mockResult);
    });

    it('should call native implementation isCancel method', () => {
      const mockError = new Error('Cancel error');
      const NativeDocumentPicker = require('../../utils/DocumentPicker.native').default;
      NativeDocumentPicker.isCancel.mockReturnValue(true);

      const result = UniversalDocumentPicker.isCancel(mockError);

      expect(NativeDocumentPicker.isCancel).toHaveBeenCalledWith(mockError);
      expect(result).toBe(true);
    });

    it('should call native implementation isInProgress method', () => {
      const mockError = new Error('In progress error');
      const NativeDocumentPicker = require('../../utils/DocumentPicker.native').default;
      NativeDocumentPicker.isInProgress.mockReturnValue(false);

      const result = UniversalDocumentPicker.isInProgress(mockError);

      expect(NativeDocumentPicker.isInProgress).toHaveBeenCalledWith(mockError);
      expect(result).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle pick errors gracefully', async () => {
      const mockError = new Error('Pick failed');
      const WebDocumentPicker = require('../../utils/DocumentPicker.web').default;
      WebDocumentPicker.pick.mockRejectedValue(mockError);

      (Platform as any).OS = 'web';

      await expect(UniversalDocumentPicker.pick()).rejects.toThrow('Pick failed');
    });

    it('should handle pickSingle errors gracefully', async () => {
      const mockError = new Error('PickSingle failed');
      const WebDocumentPicker = require('../../utils/DocumentPicker.web').default;
      WebDocumentPicker.pickSingle.mockRejectedValue(mockError);

      (Platform as any).OS = 'web';

      await expect(UniversalDocumentPicker.pickSingle()).rejects.toThrow('PickSingle failed');
    });
  });
});
