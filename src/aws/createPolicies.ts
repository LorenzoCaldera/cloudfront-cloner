import {
  CloudFrontClient,
  CreateCachePolicyCommand,
  CachePolicyConfig,
  CreateCachePolicyResult,
  
  CreateOriginRequestPolicyCommand,
  OriginRequestPolicyConfig,
  CreateOriginRequestPolicyResult,
  
  CreateResponseHeadersPolicyCommand,
  ResponseHeadersPolicyConfig,
  CreateResponseHeadersPolicyResult
} from "@aws-sdk/client-cloudfront";

/**
 * Crea una Cache Policy en CloudFront.
 */
export const createCachePolicy = async (
  client: CloudFrontClient,
  config: CachePolicyConfig
): Promise<CreateCachePolicyResult> => {
  try {
    const command = new CreateCachePolicyCommand({ CachePolicyConfig: config });
    const response = await client.send(command);

    if (!response.CachePolicy) {
      throw new Error("Cache policy not returned after creation.");
    }

    return response;
  } catch (error) {
    console.error("Error creating cache policy:", error);
    throw error;
  }
};

/**
 * Crea una Origin Request Policy en CloudFront.
 */
export const createOriginRequestPolicy = async (
  client: CloudFrontClient,
  config: OriginRequestPolicyConfig
): Promise<CreateOriginRequestPolicyResult> => {
  try {
    const command = new CreateOriginRequestPolicyCommand({
      OriginRequestPolicyConfig: config
    });
    const response = await client.send(command);

    if (!response.OriginRequestPolicy) {
      throw new Error("Origin request policy not returned after creation.");
    }

    return response;
  } catch (error) {
    console.error("Error creating origin request policy:", error);
    throw error;
  }
};

/**
 * Crea una Response Headers Policy en CloudFront.
 */
export const createResponseHeadersPolicy = async (
  client: CloudFrontClient,
  config: ResponseHeadersPolicyConfig
): Promise<CreateResponseHeadersPolicyResult> => {
  try {
    const command = new CreateResponseHeadersPolicyCommand({
      ResponseHeadersPolicyConfig: config
    });
    const response = await client.send(command);

    if (!response.ResponseHeadersPolicy) {
      throw new Error("Response headers policy not returned after creation.");
    }

    return response;
  } catch (error) {
    console.error("Error creating response headers policy:", error);
    throw error;
  }
};
