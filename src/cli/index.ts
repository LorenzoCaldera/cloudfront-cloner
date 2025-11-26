import { CloudFrontClient } from "@aws-sdk/client-cloudfront";
import { parseArgs } from "../logic/parseArgs";
import { fromIni } from "@aws-sdk/credential-providers";
import { getDistributionConfig } from "../aws/getDistributionConfig";
import { getCachePolicies, getOriginRequestPolicies, getResponseHeadersPolicies } from "../aws/getPolicies";
import { compareCachePoliciesByName, compareOriginRequestPoliciesByName, compareResponseHeadersPoliciesByName } from "../logic/comparePolicies";
import { getInUseMissingPolicies } from "../logic/getInUseMissingPolicies";
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
    console.error("Error: --debug must be a string.");
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
  } = getInUseMissingPolicies({
    distributionConfig: originDistributionConfig.DistributionConfig,
    missingCachePolicies,
    missingResponseHeadersPolicies,
    missingOriginRequestPolicies,
  })

  const idsToReplace = new Map<string, string>();
  const createAllPolicies: Promise<void>[] = [];
  for (const policie of inUseMissingCachePolicies) {
    createAllPolicies.push(
      (async () => {
        console.log("The cache policy:" + policie.CachePolicy.CachePolicyConfig.Name + " it's gonna be created")
        const createPolicyResult = await createCachePolicy(destinationClient, policie.CachePolicy.CachePolicyConfig);
        idsToReplace.set(policie.CachePolicy.Id, createPolicyResult.CachePolicy.Id);
      })()
    );
  }
  for (const policie of inUseMissingResponseHeadersPolicies) {
    createAllPolicies.push(
      (async () => {
        console.log("The response header policy: " + policie.ResponseHeadersPolicy.ResponseHeadersPolicyConfig.Name + " it's gonna be created")
        const createPolicyResult = await createResponseHeadersPolicy(destinationClient, policie.ResponseHeadersPolicy.ResponseHeadersPolicyConfig);
        idsToReplace.set(policie.ResponseHeadersPolicy.Id, createPolicyResult.ResponseHeadersPolicy.Id);
      })()
    );
  }
  for (const policie of inUseMissingOriginRequestPolicies) {
    createAllPolicies.push(
      (async () => {
        console.log("The origin request policy:" + policie.OriginRequestPolicy.OriginRequestPolicyConfig.Name + " it's gonna be created")
        const createPolicyResult = await createOriginRequestPolicy(destinationClient, policie.OriginRequestPolicy.OriginRequestPolicyConfig);
        idsToReplace.set(policie.OriginRequestPolicy.Id, createPolicyResult.OriginRequestPolicy.Id);
      })()
    );
  }
  await Promise.all(createAllPolicies);

  const newDistributionConfig = { ...originDistributionConfig.DistributionConfig }
  const newRefererName = copyRefererName ?? `copyOf_${distributionIdToCopy}`;
  const newComment = copyComment ?? 'COPY: ' + newDistributionConfig.Comment;
  newDistributionConfig.CallerReference = newRefererName + '_' + new Date().getUTCMilliseconds();
  newDistributionConfig.Comment = newComment;
  newDistributionConfig.Aliases.Quantity = 0;
  delete newDistributionConfig.Aliases.Items;
  newDistributionConfig.ViewerCertificate = { CloudFrontDefaultCertificate: true };

  const {
    CachePolicyId,
    ResponseHeadersPolicyId,
    OriginRequestPolicyId,
  } = newDistributionConfig.DefaultCacheBehavior;

  const defaultCachePolicyId = idsToReplace.get(CachePolicyId);
  if (defaultCachePolicyId) {
    newDistributionConfig.DefaultCacheBehavior.CachePolicyId = defaultCachePolicyId;
  }
  const defaultResponseHeadersPolicyId = idsToReplace.get(ResponseHeadersPolicyId);
  if (defaultResponseHeadersPolicyId) {
    newDistributionConfig.DefaultCacheBehavior.ResponseHeadersPolicyId = defaultResponseHeadersPolicyId;
  }
  const defaultOriginRequestPolicyId = idsToReplace.get(OriginRequestPolicyId);
  if (defaultOriginRequestPolicyId) {
    newDistributionConfig.DefaultCacheBehavior.OriginRequestPolicyId = defaultOriginRequestPolicyId;
  }

  for (const item of newDistributionConfig.CacheBehaviors.Items) {
    const {
      CachePolicyId,
      ResponseHeadersPolicyId,
      OriginRequestPolicyId,
    } = item;
    const defaultCachePolicyId = idsToReplace.get(CachePolicyId);
    if (defaultCachePolicyId) {
      item.CachePolicyId = defaultCachePolicyId;
    }
    const defaultResponseHeadersPolicyId = idsToReplace.get(ResponseHeadersPolicyId);
    if (defaultResponseHeadersPolicyId) {
      item.ResponseHeadersPolicyId = defaultResponseHeadersPolicyId;
    }
    const defaultOriginRequestPolicyId = idsToReplace.get(OriginRequestPolicyId);
    if (defaultOriginRequestPolicyId) {
      item.OriginRequestPolicyId = defaultOriginRequestPolicyId;
    }
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});