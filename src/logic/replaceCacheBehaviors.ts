import {
  CachePolicyConfig,
  CachePolicyList,
  CloudFrontClient,
  CreateCachePolicyResult,
  CreateOriginRequestPolicyResult,
  CreateResponseHeadersPolicyResult,
  DistributionConfig,
  OriginRequestPolicyConfig,
  OriginRequestPolicyList,
  ResponseHeadersPolicyConfig,
  ResponseHeadersPolicyList,
} from "@aws-sdk/client-cloudfront"
import {
  createCachePolicy,
  createOriginRequestPolicy,
  createResponseHeadersPolicy,
} from "../aws/createPolicies";
import { DebugReport } from "../cli";
import chalk from "../utils/mini-chalk";

interface IreplaceIds {
  distributionConfig: DistributionConfig,
  originCachePolicies: CachePolicyList,
  originResponseHeadersPolicies: ResponseHeadersPolicyList,
  originOriginRequestPolicies: OriginRequestPolicyList,
  destinationClient: CloudFrontClient,
  destinationCachePolicies: CachePolicyList,
  destinationResponseHeadersPolicies: ResponseHeadersPolicyList,
  destinationOriginRequestPolicies: OriginRequestPolicyList,
  debug?: boolean;
  debugReport?: DebugReport;
}

type PolicyConfig = CachePolicyConfig | ResponseHeadersPolicyConfig | OriginRequestPolicyConfig;
type CreatePolicyResult = CreateCachePolicyResult | CreateOriginRequestPolicyResult | CreateResponseHeadersPolicyResult;

interface PolicyHandler<
  TConfig extends PolicyConfig,
  TCreateResult extends CreatePolicyResult,
> {
  create: (client: CloudFrontClient, config: TConfig) => Promise<TCreateResult>;
  extractIdFromResult: (result: TCreateResult) => string;
  extractName: (config: TConfig) => string;
}

const cachePolicyHandler: PolicyHandler<
  CachePolicyConfig,
  CreateCachePolicyResult
> = {
  create: createCachePolicy,
  extractIdFromResult: (result) => result.CachePolicy.Id,
  extractName: (config) => config.Name,
};

const responseHeadersPolicyHandler: PolicyHandler<
  ResponseHeadersPolicyConfig,
  CreateResponseHeadersPolicyResult
> = {
  create: createResponseHeadersPolicy,
  extractIdFromResult: (result) => result.ResponseHeadersPolicy.Id,
  extractName: (config) => config.Name,
};

const originRequestPolicyHandler: PolicyHandler<
  OriginRequestPolicyConfig,
  CreateOriginRequestPolicyResult
> = {
  create: createOriginRequestPolicy,
  extractIdFromResult: (result) => result.OriginRequestPolicy.Id,
  extractName: (config) => config.Name,
};

async function replacePolicyId<
  TConfig extends PolicyConfig,
  TCreateResult extends CreatePolicyResult,
>(
  policyId: string | undefined,
  handler: PolicyHandler<TConfig, TCreateResult>,
  destinationClient: CloudFrontClient,
  originPoliciesStorage: Map<string, TConfig>,
  destinationNameToId: Map<string, string>,
  pendingCreations: Map<string, Promise<string>>,
  debug: boolean,
  debugReport: DebugReport | undefined,
  policyType: 'CACHE' | 'RESPONSE_HEADERS' | 'ORIGIN_REQUEST',
): Promise<string | undefined> {
  const policyTypeLabel = policyType === 'CACHE' ? 'Cache' :
    policyType === 'RESPONSE_HEADERS' ? 'Response Headers' :
      'Origin Request';

  // Si no hay policyId o está vacío, retornar undefined
  if (!policyId || policyId.trim() === '') {
    if (debug) {
      console.log(chalk.dim(`  ⊘ No ${policyTypeLabel} policy ID provided - skipping`));
    }
    return undefined;
  }

  // Buscar o cargar la policy config del origen
  let policyConfig = originPoliciesStorage.get(policyId);
  if (!policyConfig) {
    if (debug) {
      console.log(chalk.dim(`  ⊘ ${policyTypeLabel} policy ${chalk.yellow(policyId)} not found in source - likely an AWS managed policy, keeping original ID`));
    }
    return policyId; // Retorna el ID original para políticas manejadas por AWS
  }

  const policyName = handler.extractName(policyConfig);

  // Si ya existe en destino, retornar el ID
  const existingId = destinationNameToId.get(policyName);
  if (existingId) {
    if (debug) {
      console.log(chalk.green(`  ✅ ${policyTypeLabel} policy`) + chalk.cyan(` "${policyName}"`) + chalk.green(` already exists`));
      console.log(chalk.dim(`    ${policyId} → ${existingId}`));
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
      console.log(chalk.yellow(`  ⏳ Waiting for pending creation: `) + chalk.cyan(`"${policyName}"`));
    }
    return pendingCreation;
  }

  if (debug) {
    const mockNewId = `DEBUG_${policyType}_${policyId}`;

    console.log(chalk.magenta(`\n  ════════════════════════════════════════`));
    console.log(chalk.magenta(`  ➕ Creating new ${policyTypeLabel} policy`));
    console.log(chalk.cyan(`     Name: `) + chalk.bold(policyName));
    console.log(chalk.dim(`     Source ID: ${policyId}`));
    console.log(chalk.dim(`     Mock Destination ID: ${mockNewId}`));
    console.log(chalk.magenta(`  ════════════════════════════════════════\n`));

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
    pendingCreations.delete(policyName);
    return newId;
  })();

  pendingCreations.set(policyName, creationPromise);
  return creationPromise;
}

export const replaceCacheBehaviors = async ({
  distributionConfig,
  originCachePolicies,
  originResponseHeadersPolicies,
  originOriginRequestPolicies,
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
    console.log(chalk.blue.bold('\n╔════════════════════════════════════════════╗'));
    console.log(chalk.blue.bold('║') + chalk.white.bold('  DEBUG MODE - Policy ID Replacement        ') + chalk.blue.bold('║'));
    console.log(chalk.blue.bold('║') + chalk.dim('  No real changes will be made to AWS       ') + chalk.blue.bold('║'));
    console.log(chalk.blue.bold('╚════════════════════════════════════════════╝\n'));
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

  // Popular map con policies de la distribución origen
  if (debug) {
    console.log(chalk.cyan.bold('📥 Policies from source distribution...\n'));
  }

  for (const item of originCachePolicies.Items || []) {
    const policy = item.CachePolicy;
    originCachePoliciesStorage.set(policy.Id, policy.CachePolicyConfig);
    if (debug)
      console.log(chalk.dim('   • ') + chalk.white(`Cache Policy: `) + chalk.cyan(`"${policy.CachePolicyConfig.Name}"`) + chalk.dim(` (${policy.Id})`));
  }

  for (const item of originResponseHeadersPolicies.Items || []) {
    const policy = item.ResponseHeadersPolicy;
    originResponseHeadersPoliciesStorage.set(policy.Id, policy.ResponseHeadersPolicyConfig);
    if (debug)
      console.log(chalk.dim('   • ') + chalk.white(`Response Headers Policy: `) + chalk.cyan(`"${policy.ResponseHeadersPolicyConfig.Name}"`) + chalk.dim(` (${policy.Id})`));
  }

  for (const item of originOriginRequestPolicies.Items || []) {
    const policy = item.OriginRequestPolicy;
    originOriginRequestPoliciesStorage.set(policy.Id, policy.OriginRequestPolicyConfig);
    if (debug)
      console.log(chalk.dim('   • ') + chalk.white(`Origin Request Policy: `) + chalk.cyan(`"${policy.OriginRequestPolicyConfig.Name}"`) + chalk.dim(` (${policy.Id})`));
  }

  if (debug) {
    console.log(chalk.yellow(`\n📊 Source distribution summary:`));
    console.log(chalk.dim(`   - ${originCachePolicies.Items?.length || 0} Cache policies`));
    console.log(chalk.dim(`   - ${originResponseHeadersPolicies.Items?.length || 0} Response Headers policies`));
    console.log(chalk.dim(`   - ${originOriginRequestPolicies.Items?.length || 0} Origin Request policies\n`));
  }

  // Popular map con policies existentes en destino
  if (debug) {
    console.log(chalk.cyan.bold('📥 Existing policies from destination account...\n'));
  }

  for (const item of destinationCachePolicies.Items || []) {
    const policy = item.CachePolicy;
    destinationNameToId.set(policy.CachePolicyConfig.Name, policy.Id);
    if (debug)
      console.log(chalk.dim('   • ') + chalk.white(`Cache Policy: `) + chalk.cyan(`"${policy.CachePolicyConfig.Name}"`) + chalk.dim(` (${policy.Id})`));
  }
  for (const item of destinationResponseHeadersPolicies.Items || []) {
    const policy = item.ResponseHeadersPolicy;
    destinationNameToId.set(policy.ResponseHeadersPolicyConfig.Name, policy.Id);
    if (debug)
      console.log(chalk.dim('   • ') + chalk.white(`Response Headers Policy: `) + chalk.cyan(`"${policy.ResponseHeadersPolicyConfig.Name}"`) + chalk.dim(` (${policy.Id})`));
  }
  for (const item of destinationOriginRequestPolicies.Items || []) {
    const policy = item.OriginRequestPolicy;
    destinationNameToId.set(policy.OriginRequestPolicyConfig.Name, policy.Id);
    if (debug)
      console.log(chalk.dim('   • ') + chalk.white(`Origin Request Policy: `) + chalk.cyan(`"${policy.OriginRequestPolicyConfig.Name}"`) + chalk.dim(` (${policy.Id})`));
  }

  if (debug) {
    console.log(chalk.yellow(`\n📊 Destination account summary:`));
    console.log(chalk.dim(`   - ${destinationCachePolicies.Items?.length || 0} Cache policies`));
    console.log(chalk.dim(`   - ${destinationResponseHeadersPolicies.Items?.length || 0} Response Headers policies`));
    console.log(chalk.dim(`   - ${destinationOriginRequestPolicies.Items?.length || 0} Origin Request policies\n`));
  }

  // Crear array de promises para todas las operaciones
  const promises: Promise<void>[] = [];

  // Reemplazar IDs en DefaultCacheBehavior
  const defaultBehavior = distributionConfig.DefaultCacheBehavior;

  if (debug) {
    console.log(chalk.green.bold('🔄 Processing DefaultCacheBehavior...\n'));
  }

  // Cache policies
  promises.push(
    replacePolicyId(
      defaultBehavior.CachePolicyId,
      cachePolicyHandler,
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
      console.log(chalk.green.bold(`🔄 Processing ${distributionConfig.CacheBehaviors.Items.length} additional CacheBehaviors...\n`));
    }

    for (const [index, behavior] of distributionConfig.CacheBehaviors.Items.entries()) {
      if (debug) {
        console.log(chalk.magenta(`📍 CacheBehavior #${index + 1}`) + chalk.dim(` - PathPattern: `) + chalk.cyan(`"${behavior.PathPattern}"`));
      }

      promises.push(
        replacePolicyId(
          behavior.CachePolicyId,
          cachePolicyHandler,
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
  }

  return distributionConfig;
}