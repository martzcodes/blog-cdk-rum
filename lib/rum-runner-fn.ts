import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { RUMClient, GetAppMonitorCommand } from "@aws-sdk/client-rum";

const s3 = new S3Client({});
const rum = new RUMClient({});

export const handler = async () => {
  const app = await rum.send(
    new GetAppMonitorCommand({ Name: `${process.env.RUM_APP}` })
  );
  console.log(JSON.stringify({ app }, null, 2));
  const command = new PutObjectCommand({
    Key: "rum.json",
    Bucket: process.env.BUCKET_NAME,
    Body: JSON.stringify({
      APPLICATION_ID: `${app?.AppMonitor?.Id}`,
      guestRoleArn: `${process.env.GUEST_ROLE_ARN}`,
      identityPoolId: `${process.env.IDENTITY_POOL_ID}`,
    }),
  });
  await s3.send(command);
};
