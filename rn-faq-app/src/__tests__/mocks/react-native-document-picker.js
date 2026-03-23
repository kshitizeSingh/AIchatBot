// Mock react-native-document-picker for Jest testing
module.exports = {
  default: {
    pick: jest.fn(() => Promise.resolve([
      {
        uri: 'file://mock-document.pdf',
        name: 'mock-document.pdf',
        type: 'application/pdf',
        size: 1024,
      }
    ])),
    pickSingle: jest.fn(() => Promise.resolve({
      uri: 'file://mock-document.pdf',
      name: 'mock-document.pdf',
      type: 'application/pdf',
      size: 1024,
    })),
    isCancel: jest.fn(() => false),
    types: {
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
    },
  },
};