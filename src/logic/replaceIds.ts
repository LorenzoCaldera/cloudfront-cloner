import {
  CachePolicy,
  CachePolicyConfig,
  CachePolicyList,
  CloudFrontClient,
  CreateCachePolicyResult,
  CreateOriginRequestPolicyResult,
  CreateResponseHeadersPolicyResult,
  DistributionConfig,
  OriginRequestPolicy,
  OriginRequestPolicyConfig,
  OriginRequestPolicyList,
  ResponseHeadersPolicy,
  ResponseHeadersPolicyConfig,
  ResponseHeadersPolicyList,
} from "@aws-sdk/client-cloudfront"
import {
  createCachePolicy,
  createOriginRequestPolicy,
  createResponseHeadersPolicy,
} from "../aws/createPolicies";
import {
  getCachePolicyById,
  getOriginRequestPolicyById,
  getResponseHeadersPolicyById,
} from "../aws/getPolicies";

interface IreplaceIds {
  distributionConfig: DistributionConfig,
  originClient: CloudFrontClient,
  destinationClient: CloudFrontClient,
  destinationCachePolicies: CachePolicyList,
  destinationResponseHeadersPolicies: ResponseHeadersPolicyList,
  destinationOriginRequestPolicies: OriginRequestPolicyList,
}

type PolicyConfig = CachePolicyConfig | ResponseHeadersPolicyConfig | OriginRequestPolicyConfig;
type GetPolicyResult = CachePolicy | OriginRequestPolicy | ResponseHeadersPolicy;
type CreatePolicyResult = CreateCachePolicyResult | CreateOriginRequestPolicyResult | CreateResponseHeadersPolicyResult;

interface PolicyHandler<
  TConfig extends PolicyConfig,
  TGetResult extends GetPolicyResult,
  TCreateResult extends CreatePolicyResult,
> {
  getById: ({ client, policyId }: { client: CloudFrontClient, policyId: string }) => Promise<TGetResult>;
  create: (client: CloudFrontClient, config: TConfig) => Promise<TCreateResult>;
  extractConfig: (result: TGetResult) => TConfig;
  extractIdFromResult: (result: TCreateResult) => string;
  extractName: (config: TConfig) => string;
}

const cachePolicyHandler: PolicyHandler<
  CachePolicyConfig,
  CachePolicy,
  CreateCachePolicyResult
> = {
  getById: getCachePolicyById,
  create: createCachePolicy,
  extractConfig: (result) => result.CachePolicyConfig,
  extractIdFromResult: (result) => result.CachePolicy.Id,
  extractName: (config) => config.Name,
};

const responseHeadersPolicyHandler: PolicyHandler<
  ResponseHeadersPolicyConfig,
  ResponseHeadersPolicy,
  CreateResponseHeadersPolicyResult
> = {
  getById: getResponseHeadersPolicyById,
  create: createResponseHeadersPolicy,
  extractConfig: (result) => result.ResponseHeadersPolicyConfig,
  extractIdFromResult: (result) => result.ResponseHeadersPolicy.Id,
  extractName: (config) => config.Name,
};

const originRequestPolicyHandler: PolicyHandler<
  OriginRequestPolicyConfig,
  OriginRequestPolicy,
  CreateOriginRequestPolicyResult
> = {
  getById: getOriginRequestPolicyById,
  create: createOriginRequestPolicy,
  extractConfig: (result) => result.OriginRequestPolicyConfig,
  extractIdFromResult: (result) => result.OriginRequestPolicy.Id,
  extractName: (config) => config.Name,
};

async function replacePolicyId<
  TConfig extends PolicyConfig,
  TGetResult extends GetPolicyResult,
  TCreateResult extends CreatePolicyResult,
>(
  policyId: string,
  handler: PolicyHandler<TConfig, TGetResult, TCreateResult>,
  originClient: CloudFrontClient,
  destinationClient: CloudFrontClient,
  originPolicyCache: Map<string, TConfig>,
  destinationNameToId: Map<string, string>,
): Promise<string> {
  // Buscar o cargar la policy config del origen
  let policyConfig = originPolicyCache.get(policyId);
  if (!policyConfig) {
    const policy = await handler.getById({ client: originClient, policyId });
    policyConfig = handler.extractConfig(policy);
    originPolicyCache.set(policyId, policyConfig);
  }

  const policyName = handler.extractName(policyConfig);

  // Buscar o crear la policy en el destino
  let destinationPolicyId = destinationNameToId.get(policyName);
  if (!destinationPolicyId) {
    const createResult = await handler.create(destinationClient, policyConfig);
    destinationPolicyId = handler.extractIdFromResult(createResult);
    destinationNameToId.set(policyName, destinationPolicyId);
  }

  return destinationPolicyId;
}

export const replaceIds = async ({
  distributionConfig,
  originClient,
  destinationClient,
  destinationCachePolicies,
  destinationResponseHeadersPolicies,
  destinationOriginRequestPolicies,
}: IreplaceIds): Promise<DistributionConfig> => {
  // Caches para policies del origen
  const originCachePoliciesCache = new Map<string, CachePolicyConfig>();
  const originResponseHeadersPoliciesCache = new Map<string, ResponseHeadersPolicyConfig>();
  const originOriginRequestPoliciesCache = new Map<string, OriginRequestPolicyConfig>();
  const destinationNameToId = new Map<string, string>();

  // Popular map de destino con policies existentes
  for (const item of destinationCachePolicies.Items || []) {
    const policy = item.CachePolicy;
    destinationNameToId.set(policy.CachePolicyConfig.Name, policy.Id);
  }
  for (const item of destinationResponseHeadersPolicies.Items || []) {
    const policy = item.ResponseHeadersPolicy;
    destinationNameToId.set(policy.ResponseHeadersPolicyConfig.Name, policy.Id);
  }
  for (const item of destinationOriginRequestPolicies.Items || []) {
    const policy = item.OriginRequestPolicy;
    destinationNameToId.set(policy.OriginRequestPolicyConfig.Name, policy.Id);
  }

  // Reemplazar IDs en DefaultCacheBehavior
  const defaultBehavior = distributionConfig.DefaultCacheBehavior;

  defaultBehavior.CachePolicyId = await replacePolicyId(
    defaultBehavior.CachePolicyId,
    cachePolicyHandler,
    originClient,
    destinationClient,
    originCachePoliciesCache,
    destinationNameToId,
  );

  defaultBehavior.ResponseHeadersPolicyId = await replacePolicyId(
    defaultBehavior.ResponseHeadersPolicyId,
    responseHeadersPolicyHandler,
    originClient,
    destinationClient,
    originResponseHeadersPoliciesCache,
    destinationNameToId,
  );

  defaultBehavior.OriginRequestPolicyId = await replacePolicyId(
    defaultBehavior.OriginRequestPolicyId,
    originRequestPolicyHandler,
    originClient,
    destinationClient,
    originOriginRequestPoliciesCache,
    destinationNameToId,
  );

  // Reemplazar IDs en CacheBehaviors adicionales
  if (distributionConfig.CacheBehaviors?.Items) {
    for (const behavior of distributionConfig.CacheBehaviors.Items) {
      behavior.CachePolicyId = await replacePolicyId(
        behavior.CachePolicyId,
        cachePolicyHandler,
        originClient,
        destinationClient,
        originCachePoliciesCache,
        destinationNameToId,
      );

      behavior.ResponseHeadersPolicyId = await replacePolicyId(
        behavior.ResponseHeadersPolicyId,
        responseHeadersPolicyHandler,
        originClient,
        destinationClient,
        originResponseHeadersPoliciesCache,
        destinationNameToId,
      );

      behavior.OriginRequestPolicyId = await replacePolicyId(
        behavior.OriginRequestPolicyId,
        originRequestPolicyHandler,
        originClient,
        destinationClient,
        originOriginRequestPoliciesCache,
        destinationNameToId,
      );
    }
  }

  return distributionConfig;
}   