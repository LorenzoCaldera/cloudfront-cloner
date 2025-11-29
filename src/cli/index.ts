import { CloudFrontClient } from "@aws-sdk/client-cloudfront";
import { parseArgs } from "../logic/parseArgs";
import { fromIni } from "@aws-sdk/credential-providers";
import { getDistributionConfig } from "../aws/getDistributionConfig";
import { getCachePolicies, getOriginRequestPolicies, getResponseHeadersPolicies } from "../aws/getPolicies";
import { compareCachePoliciesByName, compareOriginRequestPoliciesByName, compareResponseHeadersPoliciesByName } from "../logic/comparePolicies";
import { getInUseMissingPolicies } from "../logic/getInUseMissingPolicies";
import { createCachePolicy, createOriginRequestPolicy, createResponseHeadersPolicy } from "../aws/createPolicies";
import { writeFileSync } from "fs";

interface DebugReport {
  summary: {
    originProfile: string;
    destinationProfile: string;
    distributionIdToCopy: string;
    timestamp: string;
  };
  policiesToCreate: {
    cachePolicies: any[];
    responseHeadersPolicies: any[];
    originRequestPolicies: any[];
  };
  distributionConfig: {
    original: any;
    modified: any;
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

  const idsToReplace = new Map<string, string>();
  const createAllPolicies: Promise<void>[] = [];

  // Process Cache Policies
  for (const policie of inUseMissingCachePolicies) {
    createAllPolicies.push(
      (async () => {
        if (debug) {
          const mockNewId = `DEBUG_CACHE_${policie.CachePolicy.Id}`;
          idsToReplace.set(policie.CachePolicy.Id, mockNewId);
          debugReport.policiesToCreate.cachePolicies.push({
            originalId: policie.CachePolicy.Id,
            mockNewId,
            name: policie.CachePolicy.CachePolicyConfig.Name,
            config: policie.CachePolicy.CachePolicyConfig
          });
          console.log(`[DEBUG] Would create cache policy: ${policie.CachePolicy.CachePolicyConfig.Name}`);
          console.log(`[DEBUG]   Original ID: ${policie.CachePolicy.Id}`);
          console.log(`[DEBUG]   Mock New ID: ${mockNewId}`);
        } else {
          try {
            console.log("The cache policy:" + policie.CachePolicy.CachePolicyConfig.Name + " it's gonna be created");
            const createPolicyResult = await createCachePolicy(destinationClient, policie.CachePolicy.CachePolicyConfig);
            idsToReplace.set(policie.CachePolicy.Id, createPolicyResult.CachePolicy.Id);
          } catch (error) {
            console.error(error);
          }
        }
      })()
    );
  }

  // Process Response Headers Policies
  for (const policie of inUseMissingResponseHeadersPolicies) {
    createAllPolicies.push(
      (async () => {
        if (debug) {
          const mockNewId = `DEBUG_RESPONSE_${policie.ResponseHeadersPolicy.Id}`;
          idsToReplace.set(policie.ResponseHeadersPolicy.Id, mockNewId);
          debugReport.policiesToCreate.responseHeadersPolicies.push({
            originalId: policie.ResponseHeadersPolicy.Id,
            mockNewId,
            name: policie.ResponseHeadersPolicy.ResponseHeadersPolicyConfig.Name,
            config: policie.ResponseHeadersPolicy.ResponseHeadersPolicyConfig
          });
          console.log(`[DEBUG] Would create response headers policy: ${policie.ResponseHeadersPolicy.ResponseHeadersPolicyConfig.Name}`);
          console.log(`[DEBUG]   Original ID: ${policie.ResponseHeadersPolicy.Id}`);
          console.log(`[DEBUG]   Mock New ID: ${mockNewId}`);
        } else {
          try {
            console.log("The response header policy: " + policie.ResponseHeadersPolicy.ResponseHeadersPolicyConfig.Name + " it's gonna be created");
            const createPolicyResult = await createResponseHeadersPolicy(destinationClient, policie.ResponseHeadersPolicy.ResponseHeadersPolicyConfig);
            idsToReplace.set(policie.ResponseHeadersPolicy.Id, createPolicyResult.ResponseHeadersPolicy.Id);
          } catch (error) {
            console.error(error);
          }
        }
      })()
    );
  }

  // Process Origin Request Policies
  for (const policie of inUseMissingOriginRequestPolicies) {
    createAllPolicies.push(
      (async () => {
        if (debug) {
          const mockNewId = `DEBUG_ORIGIN_${policie.OriginRequestPolicy.Id}`;
          idsToReplace.set(policie.OriginRequestPolicy.Id, mockNewId);
          debugReport.policiesToCreate.originRequestPolicies.push({
            originalId: policie.OriginRequestPolicy.Id,
            mockNewId,
            name: policie.OriginRequestPolicy.OriginRequestPolicyConfig.Name,
            config: policie.OriginRequestPolicy.OriginRequestPolicyConfig
          });
          console.log(`[DEBUG] Would create origin request policy: ${policie.OriginRequestPolicy.OriginRequestPolicyConfig.Name}`);
          console.log(`[DEBUG]   Original ID: ${policie.OriginRequestPolicy.Id}`);
          console.log(`[DEBUG]   Mock New ID: ${mockNewId}`);
        } else {
          try {
            console.log("The origin request policy:" + policie.OriginRequestPolicy.OriginRequestPolicyConfig.Name + " it's gonna be created");
            const createPolicyResult = await createOriginRequestPolicy(destinationClient, policie.OriginRequestPolicy.OriginRequestPolicyConfig);
            idsToReplace.set(policie.OriginRequestPolicy.Id, createPolicyResult.OriginRequestPolicy.Id);
          } catch (error) {
            console.error(error);
          }
        }
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

  const newDefaultCachePolicyId = idsToReplace.get(CachePolicyId);
  if (newDefaultCachePolicyId) {
    if (debug) {
      console.log(`[DEBUG] Would update DefaultCacheBehavior.CachePolicyId: ${CachePolicyId} -> ${newDefaultCachePolicyId}`);
    }
    newDistributionConfig.DefaultCacheBehavior.CachePolicyId = newDefaultCachePolicyId;
  }
  const newDefaultResponseHeadersPolicyId = idsToReplace.get(ResponseHeadersPolicyId);
  if (newDefaultResponseHeadersPolicyId) {
    if (debug) {
      console.log(`[DEBUG] Would update DefaultCacheBehavior.ResponseHeadersPolicyId: ${ResponseHeadersPolicyId} -> ${newDefaultResponseHeadersPolicyId}`);
    }
    newDistributionConfig.DefaultCacheBehavior.ResponseHeadersPolicyId = newDefaultResponseHeadersPolicyId;
  }
  const newDefaultOriginRequestPolicyId = idsToReplace.get(OriginRequestPolicyId);
  if (newDefaultOriginRequestPolicyId) {
    if (debug) {
      console.log(`[DEBUG] Would update DefaultCacheBehavior.OriginRequestPolicyId: ${OriginRequestPolicyId} -> ${newDefaultOriginRequestPolicyId}`);
    }
    newDistributionConfig.DefaultCacheBehavior.OriginRequestPolicyId = newDefaultOriginRequestPolicyId;
  }

  for (const item of newDistributionConfig.CacheBehaviors.Items) {
    const {
      CachePolicyId,
      ResponseHeadersPolicyId,
      OriginRequestPolicyId,
    } = item;
    const newCachePolicyId = idsToReplace.get(CachePolicyId);
    if (newCachePolicyId) {
      if (debug) {
        console.log(`[DEBUG] Would update CacheBehavior.CachePolicyId: ${CachePolicyId} -> ${newCachePolicyId}`);
      }
      item.CachePolicyId = newCachePolicyId;
    }
    const newResponseHeadersPolicyId = idsToReplace.get(ResponseHeadersPolicyId);
    if (newResponseHeadersPolicyId) {
      if (debug) {
        console.log(`[DEBUG] Would update CacheBehavior.ResponseHeadersPolicyId: ${ResponseHeadersPolicyId} -> ${newResponseHeadersPolicyId}`);
      }
      item.ResponseHeadersPolicyId = newResponseHeadersPolicyId;
    }
    const newOriginRequestPolicyId = idsToReplace.get(OriginRequestPolicyId);
    if (newOriginRequestPolicyId) {
      if (debug) {
        console.log(`[DEBUG] Would update CacheBehavior.OriginRequestPolicyId: ${OriginRequestPolicyId} -> ${newOriginRequestPolicyId}`);
      }
      item.OriginRequestPolicyId = newOriginRequestPolicyId;
    }
  }

  // Build policy ID mappings for debug report
  idsToReplace.forEach((newId, oldId) => {
    debugReport.policyIdMappings[oldId] = newId;
  });

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