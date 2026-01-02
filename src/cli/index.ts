import {
  CachePolicyConfig,
  CloudFrontClient,
  DistributionConfig,
  OriginRequestPolicyConfig,
  ResponseHeadersPolicyConfig
} from "@aws-sdk/client-cloudfront";
import { parseArgs } from "../utils/parseArgs";
import { fromIni } from "@aws-sdk/credential-providers";
import { getDistributionConfig } from "../aws/getDistributionConfig";
import {
  getCachePolicies,
  getOriginRequestPolicies,
  getResponseHeadersPolicies
} from "../aws/getPolicies";
import { replaceCacheBehaviors } from "../logic/replace/replaceCacheBehaviors";
import { writeFileSync } from "fs";
import chalk from "../utils/mini-chalk";
import { getUserInput } from "../utils/getUserInput";
import { OriginUpdate, replaceOrigins } from "../logic/replace/replaceOrigins";

export interface DebugReport {
  summary: {
    originProfile: string;
    destinationProfile: string;
    distributionIdToCopy: string;
    startTimestamp: string;
    endTimestamp?: string;
    totalTimeSeconds?: number;
  };
  policiesToCreate: {
    cachePolicies: Array<{
      originalId: string;
      newId?: string;
      name: string;
      config: CachePolicyConfig;
    }>;
    responseHeadersPolicies: Array<{
      originalId: string;
      newId?: string;
      name: string;
      config: ResponseHeadersPolicyConfig;
    }>;
    originRequestPolicies: Array<{
      originalId: string;
      newId?: string;
      name: string;
      config: OriginRequestPolicyConfig;
    }>;
  };
  distributionConfig: {
    original: DistributionConfig;
    modified: DistributionConfig | null;
  };
  functionUpdates: Array<{
    type: 'lambda' | 'function';
    originalARN: string;
    newARN?: string;
  }>;
  originUpdates: Array<OriginUpdate>;
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

  if ((copyRefererName !== undefined && typeof copyRefererName !== "string") || typeof copyRefererName === "boolean") {
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
      startTimestamp: new Date().toISOString()
    },
    policiesToCreate: {
      cachePolicies: [],
      responseHeadersPolicies: [],
      originRequestPolicies: []
    },
    distributionConfig: {
      original: originDistributionConfig.DistributionConfig,
      modified: null
    },
    functionUpdates: [],
    originUpdates: [],
    policyIdMappings: {}
  };

  console.log(chalk.cyan("🔄 Processing policies and replacing IDs..."));

  let newDistributionConfig = { ...originDistributionConfig.DistributionConfig };

  newDistributionConfig.Origins.Items = await replaceOrigins({
    origins: newDistributionConfig.Origins?.Items || [],
    debug,
    debugReport
  });

  newDistributionConfig = await replaceCacheBehaviors({
    distributionConfig: newDistributionConfig,
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

  // Ask the user if they want to change the CallerReference and Comment
  let newRefererName: string;
  if (!copyRefererName) {
    newRefererName = await getUserInput({
      question: "Enter the new referer name",
      defaultValue: `copyOf_${distributionIdToCopy}`,
      validate: (name: string) => {
        if (!name.trim())
          return { isValid: false, reason: "The new referer name cannot be empty", };

        if (name === distributionIdToCopy)
          return { isValid: false, reason: "The new referer name cannot be the same as the distribution ID to copy", };

        return { isValid: true };
      },
    });
  } else newRefererName = copyRefererName;

  let newComment: string;
  if (!copyComment) {
    newComment = await getUserInput({
      question: "Enter the new distribution comment",
      defaultValue: `COPY: ${newDistributionConfig.Comment}`,
      validate: (name: string) => {
        if (!name.trim())
          return { isValid: false, reason: "Distribution comment cannot be empty", };

        if (name === newDistributionConfig.Comment)
          return { isValid: false, reason: "Distribution comment cannot be the same as the previous distribution comment", };

        return { isValid: true };
      },
    });
  } else newComment = copyComment;

  newDistributionConfig.CallerReference = newRefererName + '_' + new Date().getTime();
  newDistributionConfig.Comment = newComment;
  newDistributionConfig.Aliases.Quantity = 0;
  delete newDistributionConfig.Aliases.Items;
  newDistributionConfig.ViewerCertificate = { CloudFrontDefaultCertificate: true };
  delete newDistributionConfig.WebACLId;

  console.log(chalk.green.bold("✅ Distribution configuration prepared"));
  console.log(chalk.blue("📝 New CallerReference:"), chalk.white(newDistributionConfig.CallerReference));
  console.log(chalk.blue("💬 New comment:"), chalk.white(newComment), "\n");

  debugReport.distributionConfig.original = originDistributionConfig.DistributionConfig;
  debugReport.distributionConfig.modified = newDistributionConfig;

  const totalPolicies =
    debugReport.policiesToCreate.cachePolicies.length +
    debugReport.policiesToCreate.responseHeadersPolicies.length +
    debugReport.policiesToCreate.originRequestPolicies.length;

  debugReport.summary.endTimestamp = new Date().toISOString();
  debugReport.summary.totalTimeSeconds =
    (new Date(debugReport.summary.endTimestamp).getTime() -
      new Date(debugReport.summary.startTimestamp).getTime()) /
    1000;

  writeFileSync(
    'debug-report.json',
    JSON.stringify(debugReport, null, 2),
    'utf-8'
  );

  console.log(chalk.magenta.bold("╔═══════════════════════════════════════════════╗"));
  console.log(chalk.magenta.bold("║            DEBUG REPORT GENERATED             ║"));
  console.log(chalk.magenta.bold("╚═══════════════════════════════════════════════╝"));
  console.log(chalk.blue("📄 File:"), chalk.white.bold("debug-report.json"), "\n");
  console.log(chalk.blue("⏰ Start:"), chalk.white(debugReport.summary.startTimestamp));
  console.log(chalk.blue("⏰ End:"), chalk.white(debugReport.summary.endTimestamp));
  console.log(chalk.blue("⏱️  Total time (seconds):"), chalk.white.bold(`${debugReport.summary.totalTimeSeconds}s`), "\n");
  console.log(chalk.magenta("═══════════════════════════════════════════════"), "\n");
  console.log(chalk.cyan.bold("📦 ORIGINS:"));
  console.log(chalk.yellow("   Total updated:"), chalk.white.bold(`${debugReport.originUpdates.length}`), "\n");
  console.log(chalk.cyan.bold("🔄 FUNCTIONS:"));
  console.log(chalk.yellow("   Total updated:"), chalk.white.bold(`${debugReport.functionUpdates.length}`), "\n");
  console.log(chalk.cyan.bold("📊 POLICIES:"));
  console.log(chalk.yellow("   Total to create:"), chalk.white.bold(`${totalPolicies}`));
  console.log(chalk.dim("   ├─"), chalk.blue("Cache Policies:"), chalk.white(`${debugReport.policiesToCreate.cachePolicies.length}`));
  console.log(chalk.dim("   ├─"), chalk.blue("Response Headers Policies:"), chalk.white(`${debugReport.policiesToCreate.responseHeadersPolicies.length}`));
  console.log(chalk.dim("   └─"), chalk.blue("Origin Request Policies:"), chalk.white(`${debugReport.policiesToCreate.originRequestPolicies.length}`), "\n");
  console.log(chalk.cyan("🔗 ID Mappings:"), chalk.white.bold(`${Object.keys(debugReport.policyIdMappings).length}`));
  console.log(chalk.magenta("═══════════════════════════════════════════════"), "\n");
  console.log(chalk.dim("for more details, please check the debug-report.json file generated in the current directory.\n"));

  console.log(chalk.green.bold("🎉 Process completed successfully"));
};

main().catch((error) => {
  console.error(chalk.red.bold("\n❌ FATAL ERROR:"));
  console.error(chalk.red(error));
  process.exit(1);
});