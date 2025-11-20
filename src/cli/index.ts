import { CloudFrontClient } from "@aws-sdk/client-cloudfront";
import { parseArgs } from "../logic/parseArgs";
import { fromIni } from "@aws-sdk/credential-providers";
import { getDistributionConfig } from "../aws/getDistributionConfig";
import { getCachePolicies, getOriginRequestPolicies, getResponseHeadersPolicies } from "../aws/getPolicies";
import { compareCachePoliciesByName, compareOriginRequestPoliciesByName, compareResponseHeadersPoliciesByName } from "../logic/comparePolicies";
import { getInUseMissingMissingPolicies } from "../logic/getInUseMissingPolicies";
import { createCachePolicy, createOriginRequestPolicy, createResponseHeadersPolicy } from "../aws/createPolicies";

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

  if (typeof copyRefererName !== "string") {
    console.error("Error: --copyRefererName must be a string.");
    process.exit(1);
  }

  if (typeof copyComment !== "string") {
    console.error("Error: --copyComment must be a string.");
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
    await getDistributionConfig(distributionIdToCopy, originClient),
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

  const {
    inUseMissingCachePolicies,
    inUseMissingResponseHeadersPolicies,
    inUseMissingOriginRequestPolicies
  } = getInUseMissingMissingPolicies({
    distributionConfig: originDistributionConfig.DistributionConfig,
    missingCachePolicies,
    missingResponseHeadersPolicies,
    missingOriginRequestPolicies,
  })

  const idsToReplace = new Map<string, string>();
  for (const policie of inUseMissingCachePolicies) {
    const createPolicyResult = await createCachePolicy(destinationClient, policie.CachePolicy.CachePolicyConfig);
    idsToReplace.set(policie.CachePolicy.Id, createPolicyResult.CachePolicy.Id);
  }
  for (const policie of inUseMissingResponseHeadersPolicies) {
    const createPolicyResult = await createResponseHeadersPolicy(destinationClient, policie.ResponseHeadersPolicy.ResponseHeadersPolicyConfig);
    idsToReplace.set(policie.ResponseHeadersPolicy.Id, createPolicyResult.ResponseHeadersPolicy.Id);
  }
  for (const policie of inUseMissingOriginRequestPolicies) {
    const createPolicyResult = await createOriginRequestPolicy(destinationClient, policie.OriginRequestPolicy.OriginRequestPolicyConfig);
    idsToReplace.set(policie.OriginRequestPolicy.Id, createPolicyResult.OriginRequestPolicy.Id);
  }

  const newDistributionConfig = { ...originDistributionConfig.DistributionConfig }
  const newRefererName = copyRefererName ?? `copyOf_${distributionIdToCopy}`;
  const newComment = copyComment ?? 'COPY: ' + newDistributionConfig.Comment;
  newDistributionConfig.CallerReference = newRefererName + '_' + new Date().getUTCMilliseconds();
  newDistributionConfig.Comment = newComment;
  newDistributionConfig.Aliases.Quantity = 0;
  delete newDistributionConfig.Aliases.Items;
  newDistributionConfig.ViewerCertificate = { CloudFrontDefaultCertificate: true };
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});