import {
  CloudFrontClient,
  ListCachePoliciesCommand,
  ListOriginRequestPoliciesCommand,
  ListResponseHeadersPoliciesCommand,
  CachePolicyList,
  OriginRequestPolicyList,
  ResponseHeadersPolicyList,
} from "@aws-sdk/client-cloudfront";

type Params = {
  client: CloudFrontClient;
  responseType?: "custom" | "managed";
};

/**
 * Obtiene las políticas de caché de CloudFront.
 * @param client Nombre del profile configurado en ~/.aws/config
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
    if (!list.Items) throw new Error("No cache policies found.");

    return list;
  } catch (error) {
    console.error("Error listing cache policies:", error);
    throw error;
  }
};

/**
 * Obtiene las políticas de solicitud de origen de CloudFront.
 * @param client Nombre del profile configurado en ~/.aws/config
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
    if (!list.Items) throw new Error("No origin request policies found.");

    return list;
  } catch (error) {
    console.error("Error listing origin request policies:", error);
    throw error;
  }
};


/**
 * Obtiene las políticas de encabezados de respuesta de CloudFront.
 * @param client Nombre del profile configurado en ~/.aws/config
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
    if (!list.Items) throw new Error("No response headers policies found.");

    return list;
  } catch (error) {
    console.error("Error listing response headers policies:", error);
    throw error;
  }
};