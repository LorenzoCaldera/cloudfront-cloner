import {
  CachePolicyList,
  CachePolicySummary,
  OriginRequestPolicyList,
  OriginRequestPolicySummary,
  ResponseHeadersPolicyList,
  ResponseHeadersPolicySummary,
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

export const compareResponseHeadersPoliciesByName = (
  originPolicies: ResponseHeadersPolicyList,
  destinationPolicies: ResponseHeadersPolicyList,
): string[] => {
  // Solo incluimos nombres válidos
  const destinationNames: string[] = destinationPolicies.Items
    ?.map(item => item.ResponseHeadersPolicy?.ResponseHeadersPolicyConfig?.Name)
    .filter((name): name is string => !!name) || [];

  const destinationSet = new Set(destinationNames);
  const missing: ResponseHeadersPolicySummary[] = originPolicies.Items
    ?.filter(policy => {
      const name = policy.ResponseHeadersPolicy?.ResponseHeadersPolicyConfig?.Name;
      return typeof name === 'string' && !destinationSet.has(name);
    }) || [];

  // Devuelve los IDs, filtrando los falsy
  const missingIds: string[] = missing
    .map(policy => policy.ResponseHeadersPolicy?.Id)
    .filter((id): id is string => !!id);

  return missingIds;
};

export const compareOriginRequestPoliciesByName = (
  originPolicies: OriginRequestPolicyList,
  destinationPolicies: OriginRequestPolicyList,
): string[] => {
  // Solo incluimos nombres válidos
  const destinationNames: string[] = destinationPolicies.Items
    ?.map(item => item.OriginRequestPolicy?.OriginRequestPolicyConfig?.Name)
    .filter((name): name is string => !!name) || [];

  const destinationSet = new Set(destinationNames);
  const missing: OriginRequestPolicySummary[] = originPolicies.Items
    ?.filter(policy => {
      const name = policy.OriginRequestPolicy?.OriginRequestPolicyConfig?.Name;
      return typeof name === 'string' && !destinationSet.has(name);
    }) || [];

  // Devuelve los IDs, filtrando los falsy
  const missingIds: string[] = missing
    .map(policy => policy.OriginRequestPolicy?.Id)
    .filter((id): id is string => !!id);

  return missingIds;
};
