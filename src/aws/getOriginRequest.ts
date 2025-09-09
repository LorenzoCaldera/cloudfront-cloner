import { CloudFrontClient, ListOriginRequestPoliciesCommand, ListOriginRequestPoliciesCommandOutput } from "@aws-sdk/client-cloudfront";
import { fromIni } from "@aws-sdk/credential-providers";

/**
 * Obtiene las políticas de solicitud de origen de CloudFront.
 * @param profileName Nombre del profile configurado en ~/.aws/config
 * @param responseType Tipo de políticas a listar (default custom)
 * @returns Lista de políticas de solicitud de origen
 */
export const getOriginRequestPolicies = async (
  profileName: string,
  responseType: "custom" | "managed" = "custom",
): Promise<ListOriginRequestPoliciesCommandOutput> => {
  const client = new CloudFrontClient({
    region: "us-east-1",
    credentials: fromIni({ profile: profileName }),
  });

  try {
    const command = new ListOriginRequestPoliciesCommand({ Type: responseType});
    const response = await client.send(command);

    if (!response.OriginRequestPolicyList || !response.OriginRequestPolicyList.Items) {
      throw new Error("No origin request policies found.");
    }

    return response;
  } catch (error) {
    console.error("Error listing origin request policies:", error);
    throw error;
  }
}
