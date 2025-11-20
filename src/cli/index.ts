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

  const originDistributionConfig = await getDistributionConfig(
    distributionIdToCopy,
    originClient,
  );

  const originCachePolicies = await getCachePolicies({ client: originClient });
  const destinationCachePolicies = await getCachePolicies({ client: destinationClient });
  const missingCachePolicies = compareCachePoliciesByName(originCachePolicies, destinationCachePolicies);

  const originResponseHeadersPolicies = await getResponseHeadersPolicies({ client: originClient });
  const destinationResponseHeadersPolicies = await getResponseHeadersPolicies({ client: destinationClient });
  const missingResponseHeadersPolicies = compareResponseHeadersPoliciesByName(originResponseHeadersPolicies, destinationResponseHeadersPolicies);

  const originOriginRequestPolicies = await getOriginRequestPolicies({ client: originClient });
  const destinationOriginRequestPolicies = await getOriginRequestPolicies({ client: destinationClient });
  const missingOriginRequestPolicies = compareOriginRequestPoliciesByName(originOriginRequestPolicies, destinationOriginRequestPolicies);

  console.log("Missing Cache Policies IDs:", missingCachePolicies);
  console.log("Missing Response Headers Policies IDs:", missingResponseHeadersPolicies);
  console.log("Missing Origin Request Policies IDs:", missingOriginRequestPolicies);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});