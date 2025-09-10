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
  const destinationNames = new Set(destinationPolicies.Items?.map((item) => {
    const name = getName(item);
    if (!name) throw new Error('Cannot compare policies: one or more policies have an undefined name.');
    return name
  }));
  const missingIDs = originPolicies.Items
    ?.filter(policy => {
      const name = getName(policy);
      return name && !destinationNames.has(name);
    })
    .map(getId)
    .filter((id): id is string => !!id) || [];

  return missingIDs;
};

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
