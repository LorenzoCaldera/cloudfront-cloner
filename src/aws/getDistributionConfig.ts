import {
  CloudFrontClient,
  GetDistributionConfigCommand,
  GetDistributionConfigCommandOutput
} from "@aws-sdk/client-cloudfront";

/**
 * Obtiene la configuración de una distribución de CloudFront usando un profile de AWS SSO.
 * 
 * @param distributionId ID de la distribución de CloudFront
 * @param client Cliente de la cuenta de AWS
 * @returns Configuración de la distribución
 */
export async function getDistributionConfig(
  distributionId: string,
  client: CloudFrontClient,
): Promise<GetDistributionConfigCommandOutput> {
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
