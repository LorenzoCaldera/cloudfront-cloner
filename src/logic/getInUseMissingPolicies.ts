import { DistributionConfig } from "@aws-sdk/client-cloudfront"

type getInUseMissingMissingPolicies = {
  distributionConfig: DistributionConfig,
  missingCachePolicies: string[],
  missingResponseHeadersPolicies: string[],
  missingOriginRequestPolicies: string[],
}

export const getInUseMissingMissingPolicies = ({
  distributionConfig,
  missingCachePolicies,
  missingResponseHeadersPolicies,
  missingOriginRequestPolicies,
}: getInUseMissingMissingPolicies) => {
  const inUseMissingCachePolicies = new Set();
  const inUseMissingResponseHeadersPolicies = new Set();
  const inUseMissingOriginRequestPolicies = new Set();

  const DefaultCacheBehavior = distributionConfig.DefaultCacheBehavior;
  const {
    CachePolicyId,
    ResponseHeadersPolicyId,
    OriginRequestPolicyId
  } = DefaultCacheBehavior;
  if (missingCachePolicies.includes(CachePolicyId)) inUseMissingCachePolicies.add(CachePolicyId);
  if (missingResponseHeadersPolicies.includes(ResponseHeadersPolicyId)) inUseMissingResponseHeadersPolicies.add(ResponseHeadersPolicyId);
  if (missingOriginRequestPolicies.includes(OriginRequestPolicyId)) inUseMissingOriginRequestPolicies.add(OriginRequestPolicyId);

  for (const behavior of distributionConfig.CacheBehaviors.Items) {
    const { CachePolicyId, ResponseHeadersPolicyId, OriginRequestPolicyId } = behavior;

    if (missingCachePolicies.includes(CachePolicyId)) inUseMissingCachePolicies.add(CachePolicyId);
    if (missingResponseHeadersPolicies.includes(ResponseHeadersPolicyId)) inUseMissingResponseHeadersPolicies.add(ResponseHeadersPolicyId);
    if (missingOriginRequestPolicies.includes(OriginRequestPolicyId)) inUseMissingOriginRequestPolicies.add(OriginRequestPolicyId);
  }

  return {
    inUseMissingCachePolicies,
    inUseMissingResponseHeadersPolicies,
    inUseMissingOriginRequestPolicies
  };
}