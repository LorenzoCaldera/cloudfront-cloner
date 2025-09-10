import {
  CloudFrontClient,
  ListCachePoliciesCommand,
  ListOriginRequestPoliciesCommand,
  ListResponseHeadersPoliciesCommand,
} from "@aws-sdk/client-cloudfront";

type params = {
  client: CloudFrontClient,
  responseType?: "custom" | "managed"
}

/**
 * Obtiene las políticas de caché de CloudFront.
 * @param client Nombre del profile configurado en ~/.aws/config
 * @param responseType Tipo de políticas a listar (default custom)
 * @returns Lista de políticas de caché
 */
export const getCachePolicies = async ({
  client,
  responseType = "custom",
}: params) => {
  try {
    const command = new ListCachePoliciesCommand({ Type: responseType });
    const response = await client.send(command);

    if (response.CachePolicyList?.NextMarker) {
      throw new Error("Pagination not implemented yet.");
    }

    if (!response.CachePolicyList || !response.CachePolicyList.Items) {
      throw new Error("No cache policies found.");
    }

    return response.CachePolicyList;
  } catch (error) {
    console.error("Error listing cache policies:", error);
    throw error;
  }
}

/**
 * Obtiene las políticas de solicitud de origen de CloudFront.
 * @param client Nombre del profile configurado en ~/.aws/config
 * @param responseType Tipo de políticas a listar (default custom)
 * @returns Lista de políticas de solicitud de origen
 */
export const getOriginRequestPolicies = async ({
  client,
  responseType = "custom",
}: params) => {
  try {
    const command = new ListOriginRequestPoliciesCommand({ Type: responseType });
    const response = await client.send(command);

    if (response.OriginRequestPolicyList?.NextMarker) {
      throw new Error("Pagination not implemented yet.");
    }

    if (!response.OriginRequestPolicyList || !response.OriginRequestPolicyList.Items) {
      throw new Error("No origin request policies found.");
    }

    return response.OriginRequestPolicyList;
  } catch (error) {
    console.error("Error listing origin request policies:", error);
    throw error;
  }
}


/**
 * Obtiene las políticas de encabezados de respuesta de CloudFront.
 * @param client Nombre del profile configurado en ~/.aws/config
 * @param responseType Tipo de políticas a listar (default custom)
 * @returns Lista de políticas de encabezados de respuesta
 */
export const getResponseHeadersPolicies = async ({
  client,
  responseType = "custom",
}: params) => {
  try {
    const command = new ListResponseHeadersPoliciesCommand({ Type: responseType });
    const response = await client.send(command);

    if (response.ResponseHeadersPolicyList?.NextMarker) {
      throw new Error("Pagination not implemented yet.");
    }

    if (!response.ResponseHeadersPolicyList || !response.ResponseHeadersPolicyList.Items) {
      throw new Error("No response headers policies found.");
    }

    return response.ResponseHeadersPolicyList;
  } catch (error) {
    console.error("Error listing response headers policies:", error);
    throw error;
  }
}
