import { CloudFrontClient } from "@aws-sdk/client-cloudfront";
import { parseArgs } from "../helpers/parseArgs";
import { fromIni } from "@aws-sdk/credential-providers";
import { getDistributionConfig } from "../aws/getDistributionConfig";
import { getCachePolicies, getOriginRequestPolicies, getResponseHeadersPolicies } from "../aws/getPolicies";
import { compareCachePoliciesByName, compareOriginRequestPoliciesByName, compareResponseHeadersPoliciesByName } from "../logic/comparePolicies";

const main = async () => {
  const args = process.argv.slice(2); // skip first two (node executable and script path)
  const parsedArgs = parseArgs(args);
  const {
    originProfileName,
    destinationProfileName,
    distributionIdToCopy,
    copyRefererName,
    copyComment,
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
    originCachePolicies,
    destinationCachePolicies,
    originResponseHeadersPolicies,
    destinationResponseHeadersPolicies,
    originOriginRequestPolicies,
    destinationOriginRequestPolicies,
  ] = await Promise.all([
    await getDistributionConfig(distributionIdToCopy,originClient),
    await getCachePolicies({ client: originClient }),
    await getCachePolicies({ client: destinationClient }),
    await getResponseHeadersPolicies({ client: originClient }),
    await getResponseHeadersPolicies({ client: destinationClient }),
    await getOriginRequestPolicies({ client: originClient }),
    await getOriginRequestPolicies({ client: destinationClient }),
  ]);

  const missingCachePolicies = compareCachePoliciesByName(originCachePolicies, destinationCachePolicies);
  const missingResponseHeadersPolicies = compareResponseHeadersPoliciesByName(originResponseHeadersPolicies, destinationResponseHeadersPolicies);
  const missingOriginRequestPolicies = compareOriginRequestPoliciesByName(originOriginRequestPolicies, destinationOriginRequestPolicies);

  console.log("Missing Cache Policies IDs:", missingCachePolicies);
  console.log("Missing Response Headers Policies IDs:", missingResponseHeadersPolicies);
  console.log("Missing Origin Request Policies IDs:", missingOriginRequestPolicies);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});