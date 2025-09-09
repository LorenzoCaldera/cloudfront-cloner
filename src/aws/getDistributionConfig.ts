import {
  CloudFrontClient,
  GetDistributionConfigCommand,
  GetDistributionConfigCommandOutput
} from "@aws-sdk/client-cloudfront";
import { fromIni } from "@aws-sdk/credential-providers";

/**
 * Obtiene la configuración de una distribución de CloudFront usando un profile de AWS SSO.
 * 
 * @param distributionId ID de la distribución de CloudFront
 * @param profileName Nombre del profile configurado en ~/.aws/config
 * @returns Configuración de la distribución
 */
export async function getDistributionConfig(
  distributionId: string,
  profileName: string,
): Promise<GetDistributionConfigCommandOutput> {
  const client = new CloudFrontClient({
    region: "us-east-1",
    credentials: fromIni({ profile: profileName }),
  });

  try {
    const command = new GetDistributionConfigCommand({ Id: distributionId });
    const response = await client.send(command);
    
    if (!response.DistributionConfig) {
      throw new Error(`No se encontró la configuración para la distribución con ID: ${distributionId}`);
    }

    return response;
  } catch (error) {
    console.error("Error getting distribution config:", error);
    throw error;
  }
}
