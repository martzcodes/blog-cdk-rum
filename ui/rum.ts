import { AwsRum, AwsRumConfig } from "aws-rum-web";

export const rumRunner = async () => {
  try {
    const res = await fetch('/rum.json');
    const rum = await res.json();
    console.log(JSON.stringify({ rum }));
    const config: AwsRumConfig = {
      sessionSampleRate: 1,
      guestRoleArn: `${rum?.guestRoleArn}`,
      identityPoolId: `${rum?.identityPoolId}`,
      endpoint: "https://dataplane.rum.us-east-1.amazonaws.com",
      telemetries: ["errors","performance","http"],
      allowCookies: true,
      enableXRay: false
    };

    const APPLICATION_ID: string = `${rum?.APPLICATION_ID}`;
    const APPLICATION_VERSION: string = "1.0.0";
    const APPLICATION_REGION: string = "us-east-1";

    if (APPLICATION_ID) {
      const awsRum: AwsRum = new AwsRum(
        APPLICATION_ID,
        APPLICATION_VERSION,
        APPLICATION_REGION,
        config
      );
      console.log(awsRum);
    }
  } catch (error) {
    // Ignore errors thrown during CloudWatch RUM web client initialization
    console.log(error);
  }
};
