import {
  CachePolicyList,
  CachePolicySummary,
  OriginRequestPolicyList,
  OriginRequestPolicySummary,
  ResponseHeadersPolicyList,
  ResponseHeadersPolicySummary,
} from "@aws-sdk/client-cloudfront";

const comparePoliciesByName = <
  TSummary,
  TList extends { Items?: TSummary[] }
>(
  originPolicies: TList,
  destinationPolicies: TList,
  getName: (policy: TSummary) => string | undefined,
  getId: (policy: TSummary) => string | undefined,
): string[] => {
  const destinationNames: string[] =
    destinationPolicies.Items
      ?.map(getName)
      .filter((name): name is string => !!name) || [];

  const destinationSet = new Set(destinationNames);

  const missing: TSummary[] =
    originPolicies.Items?.filter(policy => {
      const name = getName(policy);
      return !!name && !destinationSet.has(name);
    }) || [];

  const missingIds: string[] = missing
    .map(getId)
    .filter((id): id is string => !!id);

  return missingIds;
}

export const compareCachePoliciesByName = (
  originPolicies: CachePolicyList,
  destinationPolicies: CachePolicyList,
): string[] =>
  comparePoliciesByName(
    originPolicies,
    destinationPolicies,
    (policy: CachePolicySummary) => policy.CachePolicy?.CachePolicyConfig?.Name,
    (policy: CachePolicySummary) => policy.CachePolicy?.Id,
  );

export const compareResponseHeadersPoliciesByName = (
  originPolicies: ResponseHeadersPolicyList,
  destinationPolicies: ResponseHeadersPolicyList,
): string[] =>
  comparePoliciesByName(
    originPolicies,
    destinationPolicies,
    (policy: ResponseHeadersPolicySummary) => policy.ResponseHeadersPolicy?.ResponseHeadersPolicyConfig?.Name,
    (policy: ResponseHeadersPolicySummary) => policy.ResponseHeadersPolicy?.Id,
  );

export const compareOriginRequestPoliciesByName = (
  originPolicies: OriginRequestPolicyList,
  destinationPolicies: OriginRequestPolicyList,
): string[] =>
  comparePoliciesByName(
    originPolicies,
    destinationPolicies,
    (policy: OriginRequestPolicySummary) => policy.OriginRequestPolicy?.OriginRequestPolicyConfig?.Name,
    (policy: OriginRequestPolicySummary) => policy.OriginRequestPolicy?.Id,
  );
