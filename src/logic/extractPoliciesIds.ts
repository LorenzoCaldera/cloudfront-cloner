import type { DistributionConfig } from "@aws-sdk/client-cloudfront";

/**
 * Extrae todas las CachePolicyId de DefaultCacheBehavior y CacheBehaviors.
 * @param config Objeto de configuración de distribución de CloudFront.
 * @returns Set de IDs de políticas de caché.
 */
export function extractCachePolicyIds(config: DistributionConfig): Set<string> {
  const ids = new Set<string>(); // Usamos Set para evitar duplicados

  if (config.DefaultCacheBehavior?.CachePolicyId) {
    ids.add(config.DefaultCacheBehavior.CachePolicyId);
  }

  if (config.CacheBehaviors?.Items) {
    for (const behavior of config.CacheBehaviors.Items) {
      if (behavior.CachePolicyId) {
        ids.add(behavior.CachePolicyId);
      }
    }
  }

  return ids;
}

/**
 * Extrae todas las OriginRequestPolicyId de DefaultCacheBehavior y CacheBehaviors.
 * @param config Objeto de configuración de distribución de CloudFront.
 * @returns Set de IDs de políticas de solicitud de origen.
 */
export function extractOriginRequestPolicyIds(config: DistributionConfig): Set<string> {
  const ids = new Set<string>(); // Usamos Set para evitar duplicados

  if (config.DefaultCacheBehavior?.OriginRequestPolicyId) {
    ids.add(config.DefaultCacheBehavior.OriginRequestPolicyId);
  }

  if (config.CacheBehaviors?.Items) {
    for (const behavior of config.CacheBehaviors.Items) {
      if (behavior.OriginRequestPolicyId) {
        ids.add(behavior.OriginRequestPolicyId);
      }
    }
  }

  return ids;
}

/**
 * Extrae todas las ResponseHeadersPolicyId de DefaultCacheBehavior y CacheBehaviors.
 * @param config Objeto de configuración de distribución de CloudFront.
 * @returns Set de IDs de políticas de respuesta.
 */
export function extractResponseHeadersPolicyIds(config: DistributionConfig): Set<string> {
  const ids = new Set<string>(); // Usamos Set para evitar duplicados

  if (config.DefaultCacheBehavior?.ResponseHeadersPolicyId) {
    ids.add(config.DefaultCacheBehavior.ResponseHeadersPolicyId);
  }

  if (config.CacheBehaviors?.Items) {
    for (const behavior of config.CacheBehaviors.Items) {
      if (behavior.ResponseHeadersPolicyId) {
        ids.add(behavior.ResponseHeadersPolicyId);
      }
    }
  }

  return ids;
}
