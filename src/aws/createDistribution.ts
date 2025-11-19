import {
  CloudFrontClient,
  CreateDistributionCommand,
  CreateDistributionCommandOutput,
  DistributionConfig
} from "@aws-sdk/client-cloudfront";

/**
 * Crea una distribución de CloudFront con una configuración ya preparada.
 * @param client Cliente de AWS
 * @param config Configuración completa de la distribución
 * @returns Resultado de la creación de la distribución
 */
export const createDistribution = async (
  client: CloudFrontClient,
  config: DistributionConfig
): Promise<CreateDistributionCommandOutput> => {
  try {
    const command = new CreateDistributionCommand({ DistributionConfig: config });
    const response = await client.send(command);

    if (!response.Distribution) {
      throw new Error("Error inesperado: no se devolvió la distribución creada.");
    }

    return response;
  } catch (error) {
    console.error("Error creating CloudFront distribution:", error);
    throw error;
  }
};
