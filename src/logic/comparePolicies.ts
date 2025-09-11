import {
  CachePolicyList,
  CachePolicySummary,
  OriginRequestPolicyList,
  OriginRequestPolicySummary,
  ResponseHeadersPolicyList,
  ResponseHeadersPolicySummary,
} from "@aws-sdk/client-cloudfront";

/**
 * Compara las políticas de la cuenta origen y destino por nombre.
 * @param originPolicies Lista de políticas de la cuenta origen.
 * @param destinationPolicies Lista de políticas de la cuenta destino.
 * @param getName Función para obtener el nombre de la política.
 * @param getId Función para obtener el ID de la política.
 * @returns Lista de IDs de políticas que faltan en el destino.
 */
const comparePoliciesByName = <
  TSummary,
  TList extends { Items?: TSummary[] }
>(
  originPolicies: TList,
  destinationPolicies: TList,
  getName: (policy: TSummary) => string | undefined,
  getId: (policy: TSummary) => string | undefined,
): string[] => {
  const destinationNames = new Set(destinationPolicies.Items?.map((item) => {
    const name = getName(item);
    if (!name) throw new Error('Cannot compare policies: one or more policies have an undefined name.');
    return name
  }));
  const missingIDs = originPolicies.Items
    ?.filter(policy => {
      const name = getName(policy);
      return name && !destinationNames.has(name);
    })
    .map(getId)
    .filter((id): id is string => !!id) || [];

  return missingIDs;
};

/**
 * Compara las políticas de caché de la cuenta origen y destino por nombre.
 * @param originPolicies Lista de políticas de caché de la cuenta origen.
 * @param destinationPolicies Lista de políticas de caché de la cuenta destino.
 * @returns Lista de IDs de políticas que faltan en el destino.
 */
export const compareCachePoliciesByName = (
  originPolicies: CachePolicyList,
  destinationPolicies: CachePolicyList,
): string[] =>
  comparePoliciesByName(
    originPolicies,
    destinationPolicies,
    (policy: CachePolicySummary) => policy.CachePolicy?.CachePolicyConfig?.Name,
    (policy: CachePolicySummary) => policy.CachePolicy?.Id,
  );

/**
 * Compara las políticas de response headers de la cuenta origen y destino por nombre.
 * @param originPolicies Lista de políticas de response headers de la cuenta origen.
 * @param destinationPolicies Lista de políticas de response headers de la cuenta destino.
 * @returns Lista de IDs de políticas que faltan en el destino.
 */
export const compareResponseHeadersPoliciesByName = (
  originPolicies: ResponseHeadersPolicyList,
  destinationPolicies: ResponseHeadersPolicyList,
): string[] =>
  comparePoliciesByName(
    originPolicies,
    destinationPolicies,
    (policy: ResponseHeadersPolicySummary) => policy.ResponseHeadersPolicy?.ResponseHeadersPolicyConfig?.Name,
    (policy: ResponseHeadersPolicySummary) => policy.ResponseHeadersPolicy?.Id,
  );

/**
 * Compara las políticas de solicitud de origen de la cuenta origen y destino por nombre.
 * @param originPolicies Lista de políticas de solicitud de origen de la cuenta origen.
 * @param destinationPolicies Lista de políticas de solicitud de origen de la cuenta destino.
 * @returns Lista de IDs de políticas que faltan en el destino.
 */
export const compareOriginRequestPoliciesByName = (
  originPolicies: OriginRequestPolicyList,
  destinationPolicies: OriginRequestPolicyList,
): string[] =>
  comparePoliciesByName(
    originPolicies,
    destinationPolicies,
    (policy: OriginRequestPolicySummary) => policy.OriginRequestPolicy?.OriginRequestPolicyConfig?.Name,
    (policy: OriginRequestPolicySummary) => policy.OriginRequestPolicy?.Id,
  );
