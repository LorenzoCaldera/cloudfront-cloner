import { CachePolicySummary, DistributionConfig, OriginRequestPolicySummary, ResponseHeadersPolicySummary } from "@aws-sdk/client-cloudfront"

type getInUseMissingPolicies = {
  distributionConfig: DistributionConfig,
  missingCachePolicies: CachePolicySummary[],
  missingResponseHeadersPolicies: ResponseHeadersPolicySummary[],
  missingOriginRequestPolicies: OriginRequestPolicySummary[],
}

export const getInUseMissingPolicies = ({
  distributionConfig,
  missingCachePolicies,
  missingResponseHeadersPolicies,
  missingOriginRequestPolicies,
}: getInUseMissingPolicies) => {
  const missingCachePoliciesMap = new Map(
    missingCachePolicies.map(p => [p.CachePolicy?.Id, p])
  );
  const missingResponseHeadersPoliciesMap = new Map(
    missingResponseHeadersPolicies.map(p => [p.ResponseHeadersPolicy?.Id, p])
  );
  const missingOriginRequestPoliciesMap = new Map(
    missingOriginRequestPolicies.map(p => [p.OriginRequestPolicy?.Id, p])
  );

  const inUseMissingCachePolicies = new Set<CachePolicySummary>();
  const inUseMissingResponseHeadersPolicies = new Set<ResponseHeadersPolicySummary>();
  const inUseMissingOriginRequestPolicies = new Set<OriginRequestPolicySummary>();

  const DefaultCacheBehavior = distributionConfig.DefaultCacheBehavior;
  const {
    CachePolicyId,
    ResponseHeadersPolicyId,
    OriginRequestPolicyId
  } = DefaultCacheBehavior;

  const cachePolicy = missingCachePoliciesMap.get(CachePolicyId);
  if (cachePolicy) inUseMissingCachePolicies.add(cachePolicy);

  const responseHeadersPolicy = missingResponseHeadersPoliciesMap.get(ResponseHeadersPolicyId);
  if (responseHeadersPolicy) inUseMissingResponseHeadersPolicies.add(responseHeadersPolicy);

  const originRequestPolicy = missingOriginRequestPoliciesMap.get(OriginRequestPolicyId);
  if (originRequestPolicy) inUseMissingOriginRequestPolicies.add(originRequestPolicy);

  for (const behavior of distributionConfig.CacheBehaviors.Items) {
    const {
      CachePolicyId,
      ResponseHeadersPolicyId,
      OriginRequestPolicyId
    } = behavior;

    const cachePolicy = missingCachePoliciesMap.get(CachePolicyId);
    if (cachePolicy) inUseMissingCachePolicies.add(cachePolicy);

    const responseHeadersPolicy = missingResponseHeadersPoliciesMap.get(ResponseHeadersPolicyId);
    if (responseHeadersPolicy) inUseMissingResponseHeadersPolicies.add(responseHeadersPolicy);

    const originRequestPolicy = missingOriginRequestPoliciesMap.get(OriginRequestPolicyId);
    if (originRequestPolicy) inUseMissingOriginRequestPolicies.add(originRequestPolicy);
  }

  return {
    inUseMissingCachePolicies,
    inUseMissingResponseHeadersPolicies,
    inUseMissingOriginRequestPolicies
  };
}