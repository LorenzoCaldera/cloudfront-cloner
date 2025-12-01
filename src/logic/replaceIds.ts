import {
  CachePolicy,
  CachePolicyConfig,
  CachePolicyList,
  CloudFrontClient,
  CreateCachePolicyResult,
  CreateOriginRequestPolicyResult,
  CreateResponseHeadersPolicyResult,
  DistributionConfig,
  OriginRequestPolicy,
  OriginRequestPolicyConfig,
  OriginRequestPolicyList,
  ResponseHeadersPolicy,
  ResponseHeadersPolicyConfig,
  ResponseHeadersPolicyList,
} from "@aws-sdk/client-cloudfront"
import {
  createCachePolicy,
  createOriginRequestPolicy,
  createResponseHeadersPolicy,
} from "../aws/createPolicies";
import {
  getCachePolicyById,
  getOriginRequestPolicyById,
  getResponseHeadersPolicyById,
} from "../aws/getPolicies";
import { DebugReport } from "../cli";

interface IreplaceIds {
  distributionConfig: DistributionConfig,
  originClient: CloudFrontClient,
  destinationClient: CloudFrontClient,
  destinationCachePolicies: CachePolicyList,
  destinationResponseHeadersPolicies: ResponseHeadersPolicyList,
  destinationOriginRequestPolicies: OriginRequestPolicyList,
  debug?: boolean;
  debugReport?: DebugReport;
}

type PolicyConfig = CachePolicyConfig | ResponseHeadersPolicyConfig | OriginRequestPolicyConfig;
type GetPolicyResult = CachePolicy | OriginRequestPolicy | ResponseHeadersPolicy;
type CreatePolicyResult = CreateCachePolicyResult | CreateOriginRequestPolicyResult | CreateResponseHeadersPolicyResult;

interface PolicyHandler<
  TConfig extends PolicyConfig,
  TGetResult extends GetPolicyResult,
  TCreateResult extends CreatePolicyResult,
> {
  getById: ({ client, policyId }: { client: CloudFrontClient, policyId: string }) => Promise<TGetResult>;
  create: (client: CloudFrontClient, config: TConfig) => Promise<TCreateResult>;
  extractConfig: (result: TGetResult) => TConfig;
  extractIdFromResult: (result: TCreateResult) => string;
  extractName: (config: TConfig) => string;
}

const cachePolicyHandler: PolicyHandler<
  CachePolicyConfig,
  CachePolicy,
  CreateCachePolicyResult
> = {
  getById: getCachePolicyById,
  create: createCachePolicy,
  extractConfig: (result) => result.CachePolicyConfig,
  extractIdFromResult: (result) => result.CachePolicy.Id,
  extractName: (config) => config.Name,
};

const responseHeadersPolicyHandler: PolicyHandler<
  ResponseHeadersPolicyConfig,
  ResponseHeadersPolicy,
  CreateResponseHeadersPolicyResult
> = {
  getById: getResponseHeadersPolicyById,
  create: createResponseHeadersPolicy,
  extractConfig: (result) => result.ResponseHeadersPolicyConfig,
  extractIdFromResult: (result) => result.ResponseHeadersPolicy.Id,
  extractName: (config) => config.Name,
};

const originRequestPolicyHandler: PolicyHandler<
  OriginRequestPolicyConfig,
  OriginRequestPolicy,
  CreateOriginRequestPolicyResult
> = {
  getById: getOriginRequestPolicyById,
  create: createOriginRequestPolicy,
  extractConfig: (result) => result.OriginRequestPolicyConfig,
  extractIdFromResult: (result) => result.OriginRequestPolicy.Id,
  extractName: (config) => config.Name,
};

async function replacePolicyId<
  TConfig extends PolicyConfig,
  TGetResult extends GetPolicyResult,
  TCreateResult extends CreatePolicyResult,
>(
  policyId: string | undefined,
  handler: PolicyHandler<TConfig, TGetResult, TCreateResult>,
  originClient: CloudFrontClient,
  destinationClient: CloudFrontClient,
  originPoliciesStorage: Map<string, TConfig>,
  destinationNameToId: Map<string, string>,
  pendingCreations: Map<string, Promise<string>>,
  debug: boolean,
  debugReport: DebugReport | undefined,
  policyType: 'CACHE' | 'RESPONSE_HEADERS' | 'ORIGIN_REQUEST',
): Promise<string | undefined> {
  // Si no hay policyId o está vacío, retornar undefined
  if (!policyId || policyId.trim() === '') {
    if (debug) {
      console.log(`[DEBUG] No ${policyType} policy ID provided, skipping...`);
    }
    return undefined;
  }

  // Buscar o cargar la policy config del origen
  let policyConfig = originPoliciesStorage.get(policyId);
  if (!policyConfig) {
    try {
      const policy = await handler.getById({ client: originClient, policyId });
      policyConfig = handler.extractConfig(policy);
      originPoliciesStorage.set(policyId, policyConfig);
    } catch (error) {
      console.error(`[ERROR] Failed to get ${policyType} policy with ID ${policyId}:`, error);
      throw error;
    }
  }

  const policyName = handler.extractName(policyConfig);

  // Si ya existe en destino, retornar el ID
  const existingId = destinationNameToId.get(policyName);
  if (existingId) {
    if (debug) {
      console.log(`[DEBUG] Policy already exists in destination: ${policyName}`);
      console.log(`[DEBUG]   Original ID: ${policyId}`);
      console.log(`[DEBUG]   Destination ID: ${existingId}`);
      if (debugReport) {
        debugReport.policyIdMappings[policyId] = existingId;
      }
    }
    return existingId;
  }

  // Si ya hay una creación pendiente para esta policy, esperar a que termine
  const pendingCreation = pendingCreations.get(policyName);
  if (pendingCreation) {
    if (debug) {
      console.log(`[DEBUG] Waiting for pending creation of: ${policyName}`);
    }
    return pendingCreation;
  }

  if (debug) {
    const mockNewId = `DEBUG_${policyType}_${policyId}`;

    console.log(`\n[DEBUG] ========================================`);
    console.log(`[DEBUG] Would create ${policyType} policy: ${policyName}`);
    console.log(`[DEBUG]   Original ID: ${policyId}`);
    console.log(`[DEBUG]   Mock New ID: ${mockNewId}`);
    console.log(`[DEBUG] ========================================\n`);

    if (debugReport) {
      debugReport.policyIdMappings[policyId] = mockNewId;

      const policyEntry = {
        originalId: policyId,
        mockNewId,
        name: policyName,
        config: policyConfig as any,
      };

      switch (policyType) {
        case 'CACHE':
          debugReport.policiesToCreate.cachePolicies.push(policyEntry);
          break;
        case 'RESPONSE_HEADERS':
          debugReport.policiesToCreate.responseHeadersPolicies.push(policyEntry);
          break;
        case 'ORIGIN_REQUEST':
          debugReport.policiesToCreate.originRequestPolicies.push(policyEntry);
          break;
      }
    }

    // Agregar el mock ID al map para que otros behaviors lo encuentren
    destinationNameToId.set(policyName, mockNewId);
    return mockNewId;
  }

  const creationPromise = (async () => {
    const createResult = await handler.create(destinationClient, policyConfig!);
    const newId = handler.extractIdFromResult(createResult);
    destinationNameToId.set(policyName, newId);
    pendingCreations.delete(policyName); // Limpiar después de completar
    return newId;
  })();

  pendingCreations.set(policyName, creationPromise);
  return creationPromise;
}

export const replaceIds = async ({
  distributionConfig,
  originClient,
  destinationClient,
  destinationCachePolicies,
  destinationResponseHeadersPolicies,
  destinationOriginRequestPolicies,
  debug = false,
  debugReport,
}: IreplaceIds): Promise<DistributionConfig> => {
  // Guardar config original en debug report
  if (debug && debugReport) {
    debugReport.distributionConfig.original = distributionConfig;
    console.log('\n[DEBUG] ==========================================');
    console.log('[DEBUG] Starting replaceIds in DEBUG mode');
    console.log('[DEBUG] No real changes will be made to AWS');
    console.log('[DEBUG] ==========================================\n');
  }

  // Caches para policies del origen
  const originCachePoliciesStorage = new Map<string, CachePolicyConfig>();
  const originResponseHeadersPoliciesStorage = new Map<string, ResponseHeadersPolicyConfig>();
  const originOriginRequestPoliciesStorage = new Map<string, OriginRequestPolicyConfig>();
  const destinationNameToId = new Map<string, string>();

  // Maps para rastrear creaciones pendientes (evita duplicados)
  const pendingCachePolicyCreations = new Map<string, Promise<string>>();
  const pendingResponseHeadersCreations = new Map<string, Promise<string>>();
  const pendingOriginRequestCreations = new Map<string, Promise<string>>();

  // Popular map de destino con policies existentes
  if (debug) {
    console.log('[DEBUG] Loading existing destination policies...');
  }

  for (const item of destinationCachePolicies.Items || []) {
    const policy = item.CachePolicy;
    destinationNameToId.set(policy.CachePolicyConfig.Name, policy.Id);
    if (debug) 
      console.log(`[DEBUG]   Found cache policy: ${policy.CachePolicyConfig.Name} (${policy.Id})`);
  }

  for (const item of destinationResponseHeadersPolicies.Items || []) {
    const policy = item.ResponseHeadersPolicy;
    destinationNameToId.set(policy.ResponseHeadersPolicyConfig.Name, policy.Id);
    if (debug) 
      console.log(`[DEBUG]   Found response headers policy: ${policy.ResponseHeadersPolicyConfig.Name} (${policy.Id})`);
  }

  for (const item of destinationOriginRequestPolicies.Items || []) {
    const policy = item.OriginRequestPolicy;
    destinationNameToId.set(policy.OriginRequestPolicyConfig.Name, policy.Id);
    if (debug) 
      console.log(`[DEBUG]   Found origin request policy: ${policy.OriginRequestPolicyConfig.Name} (${policy.Id})`);
  }

  if (debug) {
    console.log(`[DEBUG] Found ${destinationCachePolicies.Items?.length || 0} cache policies`);
    console.log(`[DEBUG] Found ${destinationResponseHeadersPolicies.Items?.length || 0} response headers policies`);
    console.log(`[DEBUG] Found ${destinationOriginRequestPolicies.Items?.length || 0} origin request policies\n`);
  }

  // Crear array de promises para todas las operaciones
  const promises: Promise<void>[] = [];

  // Reemplazar IDs en DefaultCacheBehavior
  const defaultBehavior = distributionConfig.DefaultCacheBehavior;

  if (debug) {
    console.log('[DEBUG] Processing DefaultCacheBehavior...');
  }

  // Cache policies
  promises.push(
    replacePolicyId(
      defaultBehavior.CachePolicyId,
      cachePolicyHandler,
      originClient,
      destinationClient,
      originCachePoliciesStorage,
      destinationNameToId,
      pendingCachePolicyCreations,
      debug,
      debugReport,
      'CACHE',
    ).then((id) => { defaultBehavior.CachePolicyId = id; })
  );
  // Response headers policies
  promises.push(
    replacePolicyId(
      defaultBehavior.ResponseHeadersPolicyId,
      responseHeadersPolicyHandler,
      originClient,
      destinationClient,
      originResponseHeadersPoliciesStorage,
      destinationNameToId,
      pendingResponseHeadersCreations,
      debug,
      debugReport,
      'RESPONSE_HEADERS',
    ).then((id) => { defaultBehavior.ResponseHeadersPolicyId = id; })
  );
  // Origin request policies
  promises.push(
    replacePolicyId(
      defaultBehavior.OriginRequestPolicyId,
      originRequestPolicyHandler,
      originClient,
      destinationClient,
      originOriginRequestPoliciesStorage,
      destinationNameToId,
      pendingOriginRequestCreations,
      debug,
      debugReport,
      'ORIGIN_REQUEST',
    ).then((id) => { defaultBehavior.OriginRequestPolicyId = id; })
  );

  // Reemplazar IDs en CacheBehaviors adicionales
  if (distributionConfig.CacheBehaviors?.Items) {
    if (debug) {
      console.log(`[DEBUG] Processing ${distributionConfig.CacheBehaviors.Items.length} additional CacheBehaviors...`);
    }

    for (const [index, behavior] of distributionConfig.CacheBehaviors.Items.entries()) {
      if (debug) {
        console.log(`[DEBUG] Processing CacheBehavior #${index + 1} (PathPattern: ${behavior.PathPattern})`);
      }

      promises.push(
        replacePolicyId(
          behavior.CachePolicyId,
          cachePolicyHandler,
          originClient,
          destinationClient,
          originCachePoliciesStorage,
          destinationNameToId,
          pendingCachePolicyCreations,
          debug,
          debugReport,
          'CACHE',
        ).then((id) => { behavior.CachePolicyId = id; })
      );

      promises.push(
        replacePolicyId(
          behavior.ResponseHeadersPolicyId,
          responseHeadersPolicyHandler,
          originClient,
          destinationClient,
          originResponseHeadersPoliciesStorage,
          destinationNameToId,
          pendingResponseHeadersCreations,
          debug,
          debugReport,
          'RESPONSE_HEADERS',
        ).then((id) => { behavior.ResponseHeadersPolicyId = id; })
      );

      promises.push(
        replacePolicyId(
          behavior.OriginRequestPolicyId,
          originRequestPolicyHandler,
          originClient,
          destinationClient,
          originOriginRequestPoliciesStorage,
          destinationNameToId,
          pendingOriginRequestCreations,
          debug,
          debugReport,
          'ORIGIN_REQUEST',
        ).then((id) => { behavior.OriginRequestPolicyId = id; })
      );
    }
  }

  // Esperar a que todas las operaciones terminen
  await Promise.all(promises);

  // Guardar config modificada en debug report
  if (debug && debugReport) {
    debugReport.distributionConfig.modified = JSON.parse(JSON.stringify(distributionConfig));

    console.log('\n[DEBUG] ==========================================');
    console.log('[DEBUG] Summary of changes:');
    console.log(`[DEBUG]   Cache Policies to create: ${debugReport.policiesToCreate.cachePolicies.length}`);
    console.log(`[DEBUG]   Response Headers Policies to create: ${debugReport.policiesToCreate.responseHeadersPolicies.length}`);
    console.log(`[DEBUG]   Origin Request Policies to create: ${debugReport.policiesToCreate.originRequestPolicies.length}`);
    console.log(`[DEBUG]   Total policy ID mappings: ${Object.keys(debugReport.policyIdMappings).length}`);
    console.log('[DEBUG] ==========================================\n');
  }

  return distributionConfig;
}