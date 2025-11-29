import {
  CachePolicyConfig,
  CloudFrontClient,
  DistributionConfig,
  OriginRequestPolicyConfig,
  ResponseHeadersPolicyConfig
} from "@aws-sdk/client-cloudfront";
import { parseArgs } from "../logic/parseArgs";
import { fromIni } from "@aws-sdk/credential-providers";
import { getDistributionConfig } from "../aws/getDistributionConfig";
import {
  getCachePolicies,
  getOriginRequestPolicies,
  getResponseHeadersPolicies
} from "../aws/getPolicies";
import { replaceIds } from "../logic/replaceIds";
import { writeFileSync } from "fs";

export interface DebugReport {
  summary: {
    originProfile: string;
    destinationProfile: string;
    distributionIdToCopy: string;
    timestamp: string;
  };
  policiesToCreate: {
    cachePolicies: Array<{
      originalId: string;
      mockNewId: string;
      name: string;
      config: CachePolicyConfig;
    }>;
    responseHeadersPolicies: Array<{
      originalId: string;
      mockNewId: string;
      name: string;
      config: ResponseHeadersPolicyConfig;
    }>;
    originRequestPolicies: Array<{
      originalId: string;
      mockNewId: string;
      name: string;
      config: OriginRequestPolicyConfig;
    }>;
  };
  distributionConfig: {
    original: DistributionConfig;
    modified?: DistributionConfig;
  };
  policyIdMappings: Record<string, string>;
}

const main = async () => {
  const args = process.argv.slice(2); // skip first two (node executable and script path)
  const parsedArgs = parseArgs(args);
  const {
    originProfileName,
    destinationProfileName,
    distributionIdToCopy,
    copyRefererName,
    copyComment,
    debug
  } = parsedArgs;

  if (!originProfileName || typeof originProfileName !== "string") {
    console.error("Error: --originProfileName is required and must be a string.");
    process.exit(1);
  }

  if (!destinationProfileName || typeof destinationProfileName !== "string") {
    console.error("Error: --destinationProfileName is required and must be a string.");
    process.exit(1);
  }

  if (!distributionIdToCopy || typeof distributionIdToCopy !== "string") {
    console.error("Error: --distributionIdToCopy is required and must be a string.");
    process.exit(1);
  }

  if ((copyRefererName !== undefined && typeof copyRefererName !== "string") || typeof copyComment === "boolean") {
    console.error("Error: --copyRefererName must be a string.");
    process.exit(1);
  }

  if ((copyComment !== undefined && typeof copyComment !== "string") || typeof copyComment === "boolean") {
    console.error("Error: --copyComment must be a string.");
    process.exit(1);
  }

  if ((debug !== undefined && typeof debug !== "boolean") || typeof debug === "string") {
    console.error("Error: --debug must be a boolean.");
    process.exit(1);
  }

  const originClient = new CloudFrontClient({
    region: "us-east-1",
    credentials: fromIni({ profile: originProfileName }),
  });
  const destinationClient = new CloudFrontClient({
    region: "us-east-1",
    credentials: fromIni({ profile: destinationProfileName }),
  });

  const [
    originDistributionConfig,
    destinationCachePolicies,
    destinationResponseHeadersPolicies,
    destinationOriginRequestPolicies,
  ] = await Promise.all([
    await getDistributionConfig(distributionIdToCopy, originClient),
    await getCachePolicies({ client: destinationClient }),
    await getResponseHeadersPolicies({ client: destinationClient }),
    await getOriginRequestPolicies({ client: destinationClient }),
  ]);

  // Initialize debug report
  const debugReport: DebugReport = {
    summary: {
      originProfile: originProfileName,
      destinationProfile: destinationProfileName,
      distributionIdToCopy,
      timestamp: new Date().toISOString()
    },
    policiesToCreate: {
      cachePolicies: [],
      responseHeadersPolicies: [],
      originRequestPolicies: []
    },
    distributionConfig: {
      original: null,
      modified: null
    },
    policyIdMappings: {}
  };

  const newDistributionConfig = await replaceIds({
    distributionConfig: originDistributionConfig.DistributionConfig,
    debugReport,
    debug,
    originClient,
    destinationClient,
    destinationCachePolicies,
    destinationResponseHeadersPolicies,
    destinationOriginRequestPolicies,
  });

  const newRefererName = copyRefererName ?? `copyOf_${distributionIdToCopy}`;
  const newComment = copyComment ?? 'COPY: ' + newDistributionConfig.Comment;
  newDistributionConfig.CallerReference = newRefererName + '_' + new Date().getUTCMilliseconds();
  newDistributionConfig.Comment = newComment;
  newDistributionConfig.Aliases.Quantity = 0;
  delete newDistributionConfig.Aliases.Items;
  newDistributionConfig.ViewerCertificate = { CloudFrontDefaultCertificate: true };

  // Save debug report if in debug mode
  if (debug) {
    debugReport.distributionConfig.original = originDistributionConfig.DistributionConfig;
    debugReport.distributionConfig.modified = newDistributionConfig;

    writeFileSync(
      'debug-report.json',
      JSON.stringify(debugReport, null, 2),
      'utf-8'
    );
    console.log('\n========================================');
    console.log('[DEBUG] Debug report saved to debug-report.json');
    console.log('========================================');
    console.log(`[DEBUG] Total policies to create: ${debugReport.policiesToCreate.cachePolicies.length +
      debugReport.policiesToCreate.responseHeadersPolicies.length +
      debugReport.policiesToCreate.originRequestPolicies.length
      }`);
    console.log(`[DEBUG]   - Cache Policies: ${debugReport.policiesToCreate.cachePolicies.length}`);
    console.log(`[DEBUG]   - Response Headers Policies: ${debugReport.policiesToCreate.responseHeadersPolicies.length}`);
    console.log(`[DEBUG]   - Origin Request Policies: ${debugReport.policiesToCreate.originRequestPolicies.length}`);
    console.log(`[DEBUG] Total policy ID mappings: ${Object.keys(debugReport.policyIdMappings).length}`);
    console.log('========================================\n');
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});