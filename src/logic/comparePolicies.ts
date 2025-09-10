import {
  CachePolicyList,
} from "@aws-sdk/client-cloudfront";

export const compareCachePoliciesByName = (
  originPolicies: CachePolicyList,
  destinationPolicies: CachePolicyList,
): string[] => {
  const destinationNames: string[] = destinationPolicies.Items
    ?.map(item => item.CachePolicy?.CachePolicyConfig?.Name ?? '') ?? [];

  const missing = originPolicies.Items?.filter(policy => !destinationNames
    .includes(policy.CachePolicy?.CachePolicyConfig?.Name ?? '')) ?? [];

  const missingIds = missing.map(policy => policy.CachePolicy?.Id ?? '') ?? [];

  return missingIds;
};
