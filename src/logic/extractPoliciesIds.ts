import type {
  CacheBehavior,
  DefaultCacheBehavior,
  DistributionConfig
} from "@aws-sdk/client-cloudfront";

/**
 * Extrae los IDs de las políticas de caché, solicitud de origen y respuesta de un objeto de configuración de distribución de CloudFront.
 * @param config Objeto de configuración de distribución de CloudFront.
 * @param getId Función para obtener el ID de la política.
 * @returns Un conjunto de IDs de políticas.
 */
const extractPolicyIds = (
  config: DistributionConfig,
  getId: (policy?: DefaultCacheBehavior | CacheBehavior) => string | undefined
): Set<string> => {
  const ids = new Set<string>();

  const defaultId = getId(config.DefaultCacheBehavior);
  if (defaultId) ids.add(defaultId);

  const behaviorsId = config.CacheBehaviors?.Items?.map(getId).filter((id): id is string => !!id) ?? [];
  if (behaviorsId.length > 0) behaviorsId.forEach(id => ids.add(id))

  return ids;
}

/**
 * Extrae todas las CachePolicyId de DefaultCacheBehavior y CacheBehaviors.
 * @param config Objeto de configuración de distribución de CloudFront.
 * @returns Set de IDs de políticas de caché.
 */
export const extractCachePolicyIds = (config: DistributionConfig): Set<string> => (
  extractPolicyIds(
    config,
    (policy?: DefaultCacheBehavior | CacheBehavior) => policy?.CachePolicyId,
  )
)

/**
 * Extrae todas las OriginRequestPolicyId de DefaultCacheBehavior y CacheBehaviors.
 * @param config Objeto de configuración de distribución de CloudFront.
 * @returns Set de IDs de políticas de solicitud de origen.
 */
export const extractOriginRequestPolicyIds = (config: DistributionConfig): Set<string> => (
  extractPolicyIds(
    config,
    (policy?: DefaultCacheBehavior | CacheBehavior) => policy?.OriginRequestPolicyId,
  )
)

/**
 * Extrae todas las ResponseHeadersPolicyId de DefaultCacheBehavior y CacheBehaviors.
 * @param config Objeto de configuración de distribución de CloudFront.
 * @returns Set de IDs de políticas de respuesta.
 */
export const extractResponseHeadersPolicyIds = (config: DistributionConfig): Set<string> => (
  extractPolicyIds(
    config,
    (policy?: DefaultCacheBehavior | CacheBehavior) => policy?.ResponseHeadersPolicyId,
  )
)