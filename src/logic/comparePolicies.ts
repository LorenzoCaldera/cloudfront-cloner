import {
  CachePolicyList,
  CachePolicySummary,
} from "@aws-sdk/client-cloudfront";

export const compareCachePoliciesByName = (
  originPolicies: CachePolicyList,
  destinationPolicies: CachePolicyList,
): string[] => {
  // Solo incluimos nombres válidos
  const destinationNames: string[] = destinationPolicies.Items
    ?.map(item => item.CachePolicy?.CachePolicyConfig?.Name)
    .filter((name): name is string => !!name) || [];

  const destinationSet = new Set(destinationNames);
  const missing: CachePolicySummary[] = originPolicies.Items
    ?.filter(policy => {
      const name = policy.CachePolicy?.CachePolicyConfig?.Name;
      return typeof name === 'string' && !destinationSet.has(name);
    }) || [];

  // Devuelve los IDs, filtrando los falsy
  const missingIds: string[] = missing
    .map(policy => policy.CachePolicy?.Id)
    .filter((id): id is string => !!id);

  return missingIds;
};
