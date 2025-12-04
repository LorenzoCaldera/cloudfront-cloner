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
} from "../../aws/createPolicies";
import { DebugReport } from "../../cli";
import chalk from "../../utils/mini-chalk";
import { PolicyHandler, replacePolicyId } from "./replacePolicyId";
import { replaceLambdasARN } from "./replaceLambdasARN";

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
  // Lambda function associations
  await replaceLambdasARN({ behavior: defaultBehavior, debug });

  // Reemplazar IDs en CacheBehaviors adicionales
  if (distributionConfig.CacheBehaviors?.Items) {
    if (debug) {
      console.log(chalk.green.bold(`🔄 Processing ${distributionConfig.CacheBehaviors.Items.length} additional CacheBehaviors...\n`));
    }

    for (const [index, behavior] of distributionConfig.CacheBehaviors.Items.entries()) {
      if (debug) {
        console.log(chalk.magenta.bold(`📍 CacheBehavior #${index + 1}`) + chalk.dim(` - PathPattern: `) + chalk.cyan(`"${behavior.PathPattern}"`));
      }

      // Cache policies
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
      // Response headers policies
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
      // Origin request policies
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
      // Lambda function associations
      await replaceLambdasARN({ behavior, debug });
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