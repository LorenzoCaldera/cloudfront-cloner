import {
  CloudFrontClient,
  ListCachePoliciesCommand,
  ListOriginRequestPoliciesCommand,
  ListResponseHeadersPoliciesCommand,
  CachePolicyList,
  OriginRequestPolicyList,
  ResponseHeadersPolicyList,
  CachePolicy,
  ResponseHeadersPolicy,
  OriginRequestPolicy,
  GetResponseHeadersPolicyCommand,
  GetOriginRequestPolicyCommand,
  GetCachePolicyCommand,
} from "@aws-sdk/client-cloudfront";

type Params = {
  client: CloudFrontClient;
  responseType?: "custom" | "managed";
};

/**
 * Obtiene las políticas de caché de CloudFront.
 * @param client Cliente de AWS
 * @param responseType Tipo de políticas a listar (default custom)
 * @returns Lista de políticas de caché
 */
export const getCachePolicies = async ({
  client,
  responseType = "custom"
}: Params): Promise<CachePolicyList> => {
  try {
    const command = new ListCachePoliciesCommand({ Type: responseType });
    const response = await client.send(command);

    const list = response.CachePolicyList;
    if (!list) throw new Error("Unexpected response structure.");
    if (list.NextMarker) throw new Error("Pagination not implemented yet.");
    if (list.Quantity === 0 || !list.Items.length) console.warn("No cache policies found.");

    return list;
  } catch (error) {
    console.error("Error listing cache policies:", error);
    throw error;
  }
};

/**
 * Obtiene las políticas de solicitud de origen de CloudFront.
 * @param client Cliente de AWS
 * @param responseType Tipo de políticas a listar (default custom)
 * @returns Lista de políticas de solicitud de origen
 */
export const getOriginRequestPolicies = async ({
  client,
  responseType = "custom"
}: Params): Promise<OriginRequestPolicyList> => {
  try {
    const command = new ListOriginRequestPoliciesCommand({ Type: responseType });
    const response = await client.send(command);

    const list = response.OriginRequestPolicyList;
    if (!list) throw new Error("Unexpected response structure.");
    if (list.NextMarker) throw new Error("Pagination not implemented yet.");
    if (list.Quantity === 0 || !list.Items.length) console.warn("No origin request policies found.");

    return list;
  } catch (error) {
    console.error("Error listing origin request policies:", error);
    throw error;
  }
};

/**
 * Obtiene las políticas de encabezados de respuesta de CloudFront.
 * @param client Cliente de AWS
 * @param responseType Tipo de políticas a listar (default custom)
 * @returns Lista de políticas de encabezados de respuesta
 */
export const getResponseHeadersPolicies = async ({
  client,
  responseType = "custom"
}: Params): Promise<ResponseHeadersPolicyList> => {
  try {
    const command = new ListResponseHeadersPoliciesCommand({ Type: responseType });
    const response = await client.send(command);

    const list = response.ResponseHeadersPolicyList;
    if (!list) throw new Error("Unexpected response structure.");
    if (list.NextMarker) throw new Error("Pagination not implemented yet.");
    if (list.Quantity === 0 || !list.Items.length) console.warn("No response headers policies found.");

    return list;
  } catch (error) {
    console.error("Error listing response headers policies:", error);
    throw error;
  }
};

export const getCachePolicyById = async ({
  client,
  policyId,
}: {
  client: CloudFrontClient,
  policyId: string,
}): Promise<CachePolicy> => {
  const command = new GetCachePolicyCommand({ Id: policyId })
  const response = await client.send(command);
  return response.CachePolicy;
};


export const getResponseHeadersPolicyById = async ({
  client,
  policyId,
}: {
  client: CloudFrontClient,
  policyId: string,
}): Promise<ResponseHeadersPolicy> => {
  const command = new GetResponseHeadersPolicyCommand({ Id: policyId })
  const response = await client.send(command);
  return response.ResponseHeadersPolicy;
};

export const getOriginRequestPolicyById = async ({
  client,
  policyId,
}: {
  client: CloudFrontClient,
  policyId: string,
}): Promise<OriginRequestPolicy> => {
  const command = new GetOriginRequestPolicyCommand({ Id: policyId })
  const response = await client.send(command);
  return response.OriginRequestPolicy;
};
