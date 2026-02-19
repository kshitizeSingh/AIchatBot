import AWS from 'aws-sdk';
import fs from 'fs';
import path from 'path';
import { config } from './index.js';

let s3;
if (config.STORAGE_TYPE === 's3' || config.STORAGE_TYPE === 'minio') {
  s3 = new AWS.S3({
    region: config.AWS_REGION,
    accessKeyId: config.AWS_ACCESS_KEY_ID,
    secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
    s3ForcePathStyle: config.STORAGE_TYPE === 'minio',
    endpoint: config.STORAGE_TYPE === 'minio' ? new AWS.Endpoint('http://localhost:9000') : undefined
  });
}

export const downloadToBuffer = async ({ s3Key, bucket = config.AWS_S3_BUCKET }) => {
  if (config.STORAGE_TYPE === 'local') {
    const filePath = path.join(config.STORAGE_PATH, s3Key);
    return fs.promises.readFile(filePath);
  }
  const res = await s3.getObject({ Bucket: bucket, Key: s3Key }).promise();
  return res.Body;
};
