import { CloudFrontClient, ListResponseHeadersPoliciesCommand, ListResponseHeadersPoliciesCommandOutput } from "@aws-sdk/client-cloudfront";
import { fromIni } from "@aws-sdk/credential-providers";

/**
 * Obtiene las políticas de encabezados de respuesta de CloudFront.
 * @param profileName Nombre del profile configurado en ~/.aws/config
 * @param responseType Tipo de políticas a listar (default custom)
 * @returns Lista de políticas de encabezados de respuesta
 */
export const getResponseHeadersPolicies = async (
  profileName: string,
  responseType: "custom" | "managed" = "custom",
): Promise<ListResponseHeadersPoliciesCommandOutput> => {
  const client = new CloudFrontClient({
    region: "us-east-1",
    credentials: fromIni({ profile: profileName }),
  });

  try {
    const command = new ListResponseHeadersPoliciesCommand({ Type: responseType });
    const response = await client.send(command);

    if (!response.ResponseHeadersPolicyList || !response.ResponseHeadersPolicyList.Items) {
      throw new Error("No response headers policies found.");
    }

    return response;
  } catch (error) {
    console.error("Error listing response headers policies:", error);
    throw error;
  }
}
   
