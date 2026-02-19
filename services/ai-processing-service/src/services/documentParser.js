import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import fs from 'fs';

const isEncryptedPdf = (meta) => !!(meta && meta.info && meta.info.Encrypted);

export const parseDocument = async ({ buffer, filename, contentType }) => {
  const ext = (filename || '').toLowerCase().split('.').pop();
  const type = contentType || (ext === 'pdf' ? 'application/pdf' : ext === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : ext === 'md' ? 'text/markdown' : 'text/plain');

  if (type === 'application/pdf') {
    try {
      const data = await pdfParse(buffer);
      if (isEncryptedPdf(data)) throw Object.assign(new Error('PDF encrypted'), { code: 'PDF_ENCRYPTED' });
      const text = (data.text || '').trim();
      if (text.length < 100) throw Object.assign(new Error('Insufficient text'), { code: 'INSUFFICIENT_TEXT' });
      return text;
    } catch (err) {
      if (!err.code) err.code = 'PARSE_ERROR';
      throw err;
    }
  }
  if (type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || ext === 'docx') {
    try {
      const { value } = await mammoth.extractRawText({ buffer });
      const text = (value || '').trim();
      if (text.length < 100) throw Object.assign(new Error('Insufficient text'), { code: 'INSUFFICIENT_TEXT' });
      return text;
    } catch (err) {
      if (!err.code) err.code = 'PARSE_ERROR';
      throw err;
    }
  }
  // TXT / MD
  try {
    const text = buffer.toString('utf-8').trim();
    if (text.length < 100) throw Object.assign(new Error('Insufficient text'), { code: 'INSUFFICIENT_TEXT' });
    return text;
  } catch (err) {
    if (!err.code) err.code = 'PARSE_ERROR';
    throw err;
  }
};
