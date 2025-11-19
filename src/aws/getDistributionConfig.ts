import {
  CloudFrontClient,
  GetDistributionConfigCommand,
  GetDistributionConfigCommandOutput
} from "@aws-sdk/client-cloudfront";

/**
 * Obtiene la configuración de una distribución de CloudFront usando un profile de AWS SSO.
 * 
 * @param distributionId ID de la distribución de CloudFront
 * @param client Cliente de AWS
 * @returns Configuración de la distribución
 */
export const getDistributionConfig = async (
  distributionId: string,
  client: CloudFrontClient,
): Promise<GetDistributionConfigCommandOutput> => {
  try {
    const command = new GetDistributionConfigCommand({ Id: distributionId });
    const response = await client.send(command);

    if (!response.DistributionConfig) {
      throw new Error(`Distribution's configuration not found by the ID: ${distributionId}`);
    }

    return response;
  } catch (error) {
    console.error("Error getting distribution config:", error);
    throw error;
  }
}
