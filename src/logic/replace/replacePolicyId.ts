import { CachePolicyConfig, CloudFrontClient, CreateCachePolicyResult, CreateOriginRequestPolicyResult, CreateResponseHeadersPolicyResult, OriginRequestPolicyConfig, ResponseHeadersPolicyConfig } from "@aws-sdk/client-cloudfront";
import { DebugReport } from "../../cli";
import chalk from "../../utils/mini-chalk";

export type PolicyConfig = CachePolicyConfig | ResponseHeadersPolicyConfig | OriginRequestPolicyConfig;
export type CreatePolicyResult = CreateCachePolicyResult | CreateOriginRequestPolicyResult | CreateResponseHeadersPolicyResult;
export interface PolicyHandler<
  TConfig extends PolicyConfig,
  TCreateResult extends CreatePolicyResult,
> {
  create: (client: CloudFrontClient, config: TConfig) => Promise<TCreateResult>;
  extractIdFromResult: (result: TCreateResult) => string;
  extractName: (config: TConfig) => string;
}

export async function replacePolicyId<
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
      console.log(chalk.white(`  ❎ No ${policyTypeLabel} policy ID provided`) + chalk.dim(' - skipping'));
    }
    return undefined;
  }

  // Buscar o cargar la policy config del origen
  let policyConfig = originPoliciesStorage.get(policyId);
  if (!policyConfig) {
    if (debug) {
      console.log(chalk.white(`  ❎ ${policyTypeLabel} policy ${chalk.yellow(policyId)} not found in source - likely an AWS managed policy, keeping original ID...`));
    }
    return policyId; // Retorna el ID original para políticas manejadas por AWS
  }

  const policyName = handler.extractName(policyConfig);

  // Si ya existe en destino, retornar el ID
  const existingId = destinationNameToId.get(policyName);
  if (existingId) {
    if (debug) {
      console.log(chalk.white(`  ✅ ${policyTypeLabel} policy`) + chalk.cyan(` "${policyName}"`) + chalk.green(` already exists`));
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
    console.log(chalk.magenta.bold(`  ➕ Creating new ${policyTypeLabel} policy`));
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