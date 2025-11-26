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
 * @param client Cliente de AWS CloudFront.
 * @param config Configuración de la Cache Policy.
 * @returns Resultado de la creación de la Cache Policy.
 * @throws Error si la política no se retorna después de la creación.
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
 * @param client Cliente de AWS CloudFront.
 * @param config Configuración de la Origin Request Policy.
 * @returns Resultado de la creación de la Origin Request Policy.
 * @throws Error si la política no se retorna después de la creación.
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
 * @param client Cliente de AWS CloudFront.
 * @param config Configuración de la Response Headers Policy.
 * @returns Resultado de la creación de la Response Headers Policy.
 * @throws Error si la política no se retorna después de la creación.
 */
export const createResponseHeadersPolicy = async (
  client: CloudFrontClient,
  config: ResponseHeadersPolicyConfig
): Promise<CreateResponseHeadersPolicyResult> => {
  try {
    const cleanConfig = sanitizeResponseHeadersPolicyConfig({ ...config });
    const command = new CreateResponseHeadersPolicyCommand({
      ResponseHeadersPolicyConfig: cleanConfig
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


const sanitizeResponseHeadersPolicyConfig = (config: ResponseHeadersPolicyConfig): ResponseHeadersPolicyConfig => {
  const sec = config.SecurityHeadersConfig;
  if (!sec) return config;

  // Si ReferrerPolicy existe pero tiene valores null es eliminado
  if (sec.ReferrerPolicy) {
    if (
      sec.ReferrerPolicy.ReferrerPolicy == null ||
      sec.ReferrerPolicy.Override == null
    ) {
      delete sec.ReferrerPolicy;
    }
  }

  // Elimina cualquier otro bloque vacío o con nulls
  for (const key of Object.keys(sec)) {
    const value = (sec as any)[key];
    if (
      value &&
      typeof value === "object" &&
      Object.values(value).every(v => v == null)
    ) {
      delete (sec as any)[key];
    }
  }

  return config;
}
