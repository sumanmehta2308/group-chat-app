import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

export const uploadFileToS3 = async (file) => {
  const bucketName = process.env.AWS_BUCKET_NAME;
  const region = process.env.AWS_REGION;

  const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
  const key = `chat-media/${Date.now()}-${Math.round(
    Math.random() * 1e6
  )}-${safeName}`;

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: file.buffer,
    ContentType: file.mimetype,
  });

  await s3Client.send(command);

  const fileUrl = `https://${bucketName}.s3.${region}.amazonaws.com/${key}`;
  return {
    fileUrl,
    fileName: file.originalname,
    mimeType: file.mimetype,
  };
};
