import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { config } from '../config/index.js';

export const chunkText = async ({ text, metadata }) => {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: config.CHUNK_SIZE,
    chunkOverlap: config.CHUNK_OVERLAP,
    separators: ['\n\n', '\n', '. ', ' ', '']
  });
  const docs = await splitter.createDocuments([text]);
  const total = docs.length;
  return docs.map((d, i) => ({
    text: d.pageContent,
    metadata: { ...metadata, chunk_index: i, total_chunks: total }
  }));
};
