// src/__tests__/utils/DocumentPickerWeb.test.tsx
import { DocumentPickerWeb, DocumentPickerCancelError, DocumentPickerInProgressError } from '../../utils/DocumentPickerWeb';

// Mock DOM methods
const mockCreateElement = jest.fn();
const mockAppendChild = jest.fn();
const mockRemoveChild = jest.fn();
const mockClick = jest.fn();
const mockCreateObjectURL = jest.fn();

// Setup DOM mocks
Object.defineProperty(global, 'document', {
  value: {
    createElement: mockCreateElement,
    body: {
      appendChild: mockAppendChild,
      removeChild: mockRemoveChild,
    },
  },
});

Object.defineProperty(global, 'URL', {
  value: {
    createObjectURL: mockCreateObjectURL,
  },
});

describe('DocumentPickerWeb', () => {
  let mockInput: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create mock input element
    mockInput = {
      type: '',
      style: { display: '' },
      accept: '',
      multiple: false,
      onchange: null,
      oncancel: null,
      click: mockClick,
      files: null,
    };

    mockCreateElement.mockReturnValue(mockInput);
    mockCreateObjectURL.mockReturnValue('blob:http://localhost/test-file');
  });

  describe('types', () => {
    it('should have all expected file types', () => {
      expect(DocumentPickerWeb.types.allFiles).toBe('*/*');
      expect(DocumentPickerWeb.types.pdf).toBe('application/pdf');
      expect(DocumentPickerWeb.types.doc).toBe('application/msword');
      expect(DocumentPickerWeb.types.docx).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      expect(DocumentPickerWeb.types.images).toBe('image/*');
      expect(DocumentPickerWeb.types.audio).toBe('audio/*');
    });
  });

  describe('pick', () => {
    it('should create and configure input element correctly', async () => {
      const options = {
        type: ['application/pdf', 'application/msword'],
        allowMultiSelection: true,
      };

      // Start the pick process
      const pickPromise = DocumentPickerWeb.pick(options);

      // Verify input element setup
      expect(mockCreateElement).toHaveBeenCalledWith('input');
      expect(mockInput.type).toBe('file');
      expect(mockInput.style.display).toBe('none');
      expect(mockInput.accept).toBe('application/pdf,application/msword');
      expect(mockInput.multiple).toBe(true);
      expect(mockAppendChild).toHaveBeenCalledWith(mockInput);
      expect(mockClick).toHaveBeenCalled();

      // Simulate file selection
      const mockFile = {
        name: 'test.pdf',
        size: 1024,
        type: 'application/pdf',
      };

      mockInput.files = [mockFile];
      
      // Trigger onchange event
      const mockEvent = {
        target: mockInput,
      };
      mockInput.onchange(mockEvent);

      const result = await pickPromise;

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        uri: 'blob:http://localhost/test-file',
        name: 'test.pdf',
        size: 1024,
        type: 'application/pdf',
      });
      expect(mockRemoveChild).toHaveBeenCalledWith(mockInput);
    });

    it('should handle single file selection', async () => {
      const options = {
        type: ['application/pdf'],
        allowMultiSelection: false,
      };

      const pickPromise = DocumentPickerWeb.pick(options);

      expect(mockInput.multiple).toBe(false);

      // Simulate file selection
      const mockFile = {
        name: 'single.pdf',
        size: 2048,
        type: 'application/pdf',
      };

      mockInput.files = [mockFile];
      
      const mockEvent = { target: mockInput };
      mockInput.onchange(mockEvent);

      const result = await pickPromise;

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('single.pdf');
    });

    it('should handle file selection cancellation', async () => {
      const pickPromise = DocumentPickerWeb.pick();

      // Simulate no files selected
      mockInput.files = null;
      
      const mockEvent = { target: mockInput };
      mockInput.onchange(mockEvent);

      await expect(pickPromise).rejects.toThrow('No files selected');
      expect(mockRemoveChild).not.toHaveBeenCalled();
    });

    it('should handle oncancel event', async () => {
      const pickPromise = DocumentPickerWeb.pick();

      // Trigger oncancel event
      mockInput.oncancel();

      await expect(pickPromise).rejects.toBeInstanceOf(DocumentPickerCancelError);
      expect(mockRemoveChild).toHaveBeenCalledWith(mockInput);
    });

    it('should handle files with missing properties', async () => {
      const pickPromise = DocumentPickerWeb.pick();

      // Simulate file with missing properties
      const mockFile = {
        name: 'incomplete.txt',
        size: 512,
        type: '', // Empty type
      };

      mockInput.files = [mockFile];
      
      const mockEvent = { target: mockInput };
      mockInput.onchange(mockEvent);

      const result = await pickPromise;

      expect(result[0].type).toBe('application/octet-stream');
    });

    it('should handle multiple files', async () => {
      const options = { allowMultiSelection: true };
      const pickPromise = DocumentPickerWeb.pick(options);

      const mockFiles = [
        { name: 'file1.pdf', size: 1024, type: 'application/pdf' },
        { name: 'file2.doc', size: 2048, type: 'application/msword' },
      ];

      mockInput.files = mockFiles;
      
      const mockEvent = { target: mockInput };
      mockInput.onchange(mockEvent);

      const result = await pickPromise;

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('file1.pdf');
      expect(result[1].name).toBe('file2.doc');
    });
  });

  describe('pickSingle', () => {
    it('should return single file', async () => {
      const options = { type: ['application/pdf'] };
      
      const pickPromise = DocumentPickerWeb.pickSingle(options);

      const mockFile = {
        name: 'single.pdf',
        size: 1024,
        type: 'application/pdf',
      };

      mockInput.files = [mockFile];
      
      const mockEvent = { target: mockInput };
      mockInput.onchange(mockEvent);

      const result = await pickPromise;

      expect(result).toEqual({
        uri: 'blob:http://localhost/test-file',
        name: 'single.pdf',
        size: 1024,
        type: 'application/pdf',
      });
    });

    it('should throw error when no file selected', async () => {
      const pickPromise = DocumentPickerWeb.pickSingle();

      mockInput.files = [];
      
      const mockEvent = { target: mockInput };
      mockInput.onchange(mockEvent);

      await expect(pickPromise).rejects.toThrow('No file selected');
    });
  });

  describe('isCancel', () => {
    it('should return true for DocumentPickerCancelError', () => {
      const cancelError = new DocumentPickerCancelError();
      expect(DocumentPickerWeb.isCancel(cancelError)).toBe(true);
    });

    it('should return false for other errors', () => {
      const otherError = new Error('Some other error');
      expect(DocumentPickerWeb.isCancel(otherError)).toBe(false);
    });
  });

  describe('isInProgress', () => {
    it('should return true for DocumentPickerInProgressError', () => {
      const inProgressError = new DocumentPickerInProgressError();
      expect(DocumentPickerWeb.isInProgress(inProgressError)).toBe(true);
    });

    it('should return false for other errors', () => {
      const otherError = new Error('Some other error');
      expect(DocumentPickerWeb.isInProgress(otherError)).toBe(false);
    });
  });

  describe('Error Classes', () => {
    it('should create DocumentPickerCancelError correctly', () => {
      const error = new DocumentPickerCancelError();
      expect(error.name).toBe('DocumentPickerCancelError');
      expect(error.message).toBe('User canceled document picker');
      expect(error).toBeInstanceOf(Error);
    });

    it('should create DocumentPickerInProgressError correctly', () => {
      const error = new DocumentPickerInProgressError();
      expect(error.name).toBe('DocumentPickerInProgressError');
      expect(error.message).toBe('Document picker is already in progress');
      expect(error).toBeInstanceOf(Error);
    });
  });
});
