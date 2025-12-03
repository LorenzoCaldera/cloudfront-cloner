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
import { replaceCacheBehaviors } from "../logic/replaceIds";
import { writeFileSync } from "fs";
import chalk from "../utils/mini-chalk";

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
    original: DistributionConfig | null;
    modified: DistributionConfig | null;
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

  // Validation
  if (!originProfileName || typeof originProfileName !== "string") {
    console.error(chalk.red.bold("❌ Error:"), chalk.red("--originProfileName is required and must be a string"));
    process.exit(1);
  }

  if (!destinationProfileName || typeof destinationProfileName !== "string") {
    console.error(chalk.red.bold("❌ Error:"), chalk.red("--destinationProfileName is required and must be a string"));
    process.exit(1);
  }

  if (!distributionIdToCopy || typeof distributionIdToCopy !== "string") {
    console.error(chalk.red.bold("❌ Error:"), chalk.red("--distributionIdToCopy is required and must be a string"));
    process.exit(1);
  }

  if ((copyRefererName !== undefined && typeof copyRefererName !== "string") || typeof copyComment === "boolean") {
    console.error(chalk.red.bold("❌ Error:"), chalk.red("--copyRefererName must be a string"));
    process.exit(1);
  }

  if ((copyComment !== undefined && typeof copyComment !== "string") || typeof copyComment === "boolean") {
    console.error(chalk.red.bold("❌ Error:"), chalk.red("--copyComment must be a string"));
    process.exit(1);
  }

  if ((debug !== undefined && typeof debug !== "boolean") || typeof debug === "string") {
    console.error(chalk.red.bold("❌ Error:"), chalk.red("--debug must be a boolean"));
    process.exit(1);
  }

  console.log(chalk.cyan.bold("\n🚀 Starting CloudFront distribution copy"));
  console.log(chalk.blue("📋 Source distribution:"), chalk.white.bold(distributionIdToCopy));
  console.log(chalk.blue("📁 Source profile:"), chalk.white(originProfileName));
  console.log(chalk.blue("📁 Destination profile:"), chalk.white(destinationProfileName));
  if (debug) console.log(chalk.magenta.bold("🐛 Debug mode enabled\n"));

  const originClient = new CloudFrontClient({
    region: "us-east-1",
    maxAttempts: 5,
    retryMode: "adaptive",
    credentials: fromIni({ profile: originProfileName }),
  });

  const destinationClient = new CloudFrontClient({
    region: "us-east-1",
    maxAttempts: 5,
    retryMode: "adaptive",
    credentials: fromIni({ profile: destinationProfileName }),
  });

  console.log(chalk.yellow("⏳ Fetching configuration and policies..."));

  const [
    originDistributionConfig,
    originCachePolicies,
    destinationCachePolicies,
    originResponseHeadersPolicies,
    destinationResponseHeadersPolicies,
    originOriginRequestPolicies,
    destinationOriginRequestPolicies,
  ] = await Promise.all([
    getDistributionConfig(distributionIdToCopy, originClient),
    getCachePolicies({ client: originClient }),
    getCachePolicies({ client: destinationClient }),
    getResponseHeadersPolicies({ client: originClient }),
    getResponseHeadersPolicies({ client: destinationClient }),
    getOriginRequestPolicies({ client: originClient }),
    getOriginRequestPolicies({ client: destinationClient }),
  ]);

  console.log(chalk.green.bold("✅ Configuration fetched successfully\n"));

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

  console.log(chalk.cyan("🔄 Processing policies and replacing IDs..."));

  const newDistributionConfig = await replaceCacheBehaviors({
    distributionConfig: { ...originDistributionConfig.DistributionConfig },
    debugReport,
    debug,
    originCachePolicies,
    originResponseHeadersPolicies,
    originOriginRequestPolicies,
    destinationClient,
    destinationCachePolicies,
    destinationResponseHeadersPolicies,
    destinationOriginRequestPolicies,
  });

  const newRefererName = copyRefererName ?? `copyOf_${distributionIdToCopy}`;
  const newComment = copyComment ?? 'COPY: ' + newDistributionConfig.Comment;

  newDistributionConfig.CallerReference = newRefererName + '_' + new Date().getTime();
  newDistributionConfig.Comment = newComment;
  newDistributionConfig.Aliases.Quantity = 0;
  delete newDistributionConfig.Aliases.Items;
  newDistributionConfig.ViewerCertificate = { CloudFrontDefaultCertificate: true };

  console.log(chalk.green.bold("✅ Distribution configuration prepared"));
  console.log(chalk.blue("📝 New CallerReference:"), chalk.white(newDistributionConfig.CallerReference));
  console.log(chalk.blue("💬 New comment:"), chalk.white(newComment), "\n");

  // Save debug report if in debug mode
  if (debug) {
    debugReport.distributionConfig.original = originDistributionConfig.DistributionConfig;
    debugReport.distributionConfig.modified = newDistributionConfig;

    const totalPolicies =
      debugReport.policiesToCreate.cachePolicies.length +
      debugReport.policiesToCreate.responseHeadersPolicies.length +
      debugReport.policiesToCreate.originRequestPolicies.length;

    writeFileSync(
      'debug-report.json',
      JSON.stringify(debugReport, null, 2),
      'utf-8'
    );

    console.log(chalk.magenta.bold("╔═══════════════════════════════════════════════╗"));
    console.log(chalk.magenta.bold("║            DEBUG REPORT GENERATED             ║"));
    console.log(chalk.magenta.bold("╚═══════════════════════════════════════════════╝"));
    console.log(chalk.blue("📄 File:"), chalk.white.bold("debug-report.json"));
    console.log(chalk.blue("⏰ Timestamp:"), chalk.white(debugReport.summary.timestamp), "\n");
    console.log(chalk.cyan.bold("📊 POLICIES TO CREATE:"));
    console.log(chalk.yellow("   Total:"), chalk.white.bold(`${totalPolicies}`));
    console.log(chalk.dim("   ├─"), chalk.blue("Cache Policies:"), chalk.white(`${debugReport.policiesToCreate.cachePolicies.length}`));
    console.log(chalk.dim("   ├─"), chalk.blue("Response Headers Policies:"), chalk.white(`${debugReport.policiesToCreate.responseHeadersPolicies.length}`));
    console.log(chalk.dim("   └─"), chalk.blue("Origin Request Policies:"), chalk.white(`${debugReport.policiesToCreate.originRequestPolicies.length}`), "\n");
    console.log(chalk.cyan("🔗 ID Mappings:"), chalk.white.bold(`${Object.keys(debugReport.policyIdMappings).length}`));
    console.log(chalk.magenta("═══════════════════════════════════════════════\n"));
  }

  console.log(chalk.green.bold("🎉 Process completed successfully"));
};

main().catch((error) => {
  console.error(chalk.red.bold("\n❌ FATAL ERROR:"));
  console.error(chalk.red(error));
  process.exit(1);
});