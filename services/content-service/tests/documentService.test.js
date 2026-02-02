const documentRepository = require('../src/persistence/documentRepository');
jest.mock('../src/persistence/documentRepository');
const DocumentService = require('../src/services/documentService');

const service = new DocumentService();

describe('DocumentService', () => {
  afterEach(() => jest.clearAllMocks());

  test('createDocument delegates to repository with sanitized filename', async () => {
    documentRepository.insertDocument.mockResolvedValue({ id: 'doc-1', filename: 'file.pdf', status: 'pending' });

    const result = await service.createDocument('org-1', 'user-1', 'My File.pdf', 'org-1/documents/abc.pdf', 'application/pdf', 10);

    expect(documentRepository.insertDocument).toHaveBeenCalledTimes(1);
    const args = documentRepository.insertDocument.mock.calls[0][0];
    expect(args.orgId).toBe('org-1');
    expect(args.userId).toBe('user-1');
    expect(args.originalFilename).toBe('My File.pdf');
    expect(args.contentType).toBe('application/pdf');
    expect(args.fileSize).toBe(10);
    expect(args.s3Key).toContain('org-1/documents');
    expect(result).toEqual({ id: 'doc-1', filename: 'file.pdf', status: 'pending' });
  });
});
