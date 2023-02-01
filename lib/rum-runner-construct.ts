import { Duration, Stack, CustomResource } from "aws-cdk-lib";
import { Distribution } from "aws-cdk-lib/aws-cloudfront";
import {
  CfnIdentityPool,
  CfnIdentityPoolRoleAttachment,
} from "aws-cdk-lib/aws-cognito";
import {
  PolicyStatement,
  Effect,
  FederatedPrincipal,
  Role,
} from "aws-cdk-lib/aws-iam";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { CfnAppMonitor } from "aws-cdk-lib/aws-rum";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { Provider } from "aws-cdk-lib/custom-resources";
import { Construct } from "constructs";
import { join } from "path";

export interface RumRunnerConstructProps {
  bucket: Bucket;
  cloudFront: Distribution;
}

export class RumRunnerConstruct extends Construct {
  constructor(scope: Construct, id: string, props: RumRunnerConstructProps) {
    super(scope, id);
    const { cloudFront, bucket } = props;

    const cwRumIdentityPool = new CfnIdentityPool(
      this,
      "cw-rum-identity-pool",
      {
        allowUnauthenticatedIdentities: true,
      }
    );
    const cwRumUnauthenticatedRole = new Role(
      this,
      "cw-rum-unauthenticated-role",
      {
        assumedBy: new FederatedPrincipal(
          "cognito-identity.amazonaws.com",
          {
            StringEquals: {
              "cognito-identity.amazonaws.com:aud": cwRumIdentityPool.ref,
            },
            "ForAnyValue:StringLike": {
              "cognito-identity.amazonaws.com:amr": "unauthenticated",
            },
          },
          "sts:AssumeRoleWithWebIdentity"
        ),
      }
    );
    cwRumUnauthenticatedRole.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["rum:PutRumEvents"],
        resources: [
          `arn:aws:rum:${Stack.of(this).region}:${
            Stack.of(this).account
          }:appmonitor/${cloudFront.distributionDomainName}`,
        ],
      })
    );

    const cwRumIdentityPoolRoleAttachment = new CfnIdentityPoolRoleAttachment(
      this,
      "cw-rum-identity-pool-role-attachment",
      {
        identityPoolId: cwRumIdentityPool.ref,
        roles: {
          unauthenticated: cwRumUnauthenticatedRole.roleArn,
        },
      }
    );

    const cwRumAppMonitor = new CfnAppMonitor(this, "cw-rum-app-monitor", {
      domain: cloudFront.distributionDomainName,
      name: cloudFront.distributionDomainName,
      appMonitorConfiguration: {
        allowCookies: true,
        enableXRay: false,
        sessionSampleRate: 1,
        telemetries: ["errors", "performance", "http"],
        identityPoolId: cwRumIdentityPool.ref,
        guestRoleArn: cwRumUnauthenticatedRole.roleArn,
      },
      cwLogEnabled: true,
    });

    const rumRunnerFn = new NodejsFunction(this, "rum-runner", {
      runtime: Runtime.NODEJS_18_X,
      environment: {
        BUCKET_NAME: bucket.bucketName,
        RUM_APP: cloudFront.distributionDomainName,
        // GUEST_ROLE_ARN: cwRumUnauthenticatedRole.roleArn,
        // IDENTITY_POOL_ID: cwRumIdentityPool.ref,
      },
      timeout: Duration.seconds(30),
      entry: join(__dirname, "./rum-runner-fn.ts"),
    });
    bucket.grantWrite(rumRunnerFn);
    rumRunnerFn.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        resources: [
          `arn:aws:rum:${Stack.of(this).region}:${
            Stack.of(this).account
          }:appmonitor/${cloudFront.distributionDomainName}`,
        ],
        actions: ["rum:GetAppMonitor"],
      })
    );

    const rumRunnerProvider = new Provider(this, "rum-runner-provider", {
      onEventHandler: rumRunnerFn,
    });

    const customResource = new CustomResource(this, "rum-runner-resource", {
      serviceToken: rumRunnerProvider.serviceToken,
      properties: {
        // Bump to force an update
        Version: "2",
      },
    });

    customResource.node.addDependency(cwRumAppMonitor);
  }
}
