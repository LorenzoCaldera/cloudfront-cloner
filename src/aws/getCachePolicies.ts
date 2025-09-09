import { CloudFrontClient, ListCachePoliciesCommand, ListCachePoliciesCommandOutput } from "@aws-sdk/client-cloudfront";
import { fromIni } from "@aws-sdk/credential-providers";

/**
 * Obtiene las políticas de caché de CloudFront.
 * @param profileName Nombre del profile configurado en ~/.aws/config
 * @param responseType Tipo de políticas a listar (default custom)
 * @returns Lista de políticas de caché
 */
export const getCachePolicies = async (
  profileName: string,
  responseType: "custom" | "managed" = "custom",
): Promise<ListCachePoliciesCommandOutput> => {
  const client = new CloudFrontClient({
    region: "us-east-1",
    credentials: fromIni({ profile: profileName }),
  });

  try {
    const command = new ListCachePoliciesCommand({ Type: responseType});
    const response = await client.send(command);

    if (!response.CachePolicyList || !response.CachePolicyList.Items) {
      throw new Error("No cache policies found.");
    }

    return response;
  } catch (error) {
    console.error("Error listing cache policies:", error);
    throw error;
  }
}
