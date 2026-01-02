import { Origin } from "@aws-sdk/client-cloudfront";
import { DebugReport } from "../../cli";
import chalk from "../../utils/mini-chalk";
import { getUserInput } from "../../utils/getUserInput";

interface IReplaceOrigins {
  origins: Origin[];
  debug?: boolean;
  debugReport?: DebugReport;
}

export interface OriginUpdate {
  originalId: string;
  originalDomain: string;
  newDomain?: string;
  originType: string;
  wasModified: boolean;
}

/**
 * Detects the type of origin based on the domain name
 */
const detectOriginType = (domainName: string): string => {
  if (domainName.includes('.s3.') || domainName.includes('.s3-website-')) {
    return 'S3';
  }
  if (domainName.includes('.amplifyapp.com')) {
    return 'Amplify';
  }
  if (domainName.includes('.cloudfront.net')) {
    return 'CloudFront';
  }
  if (domainName.includes('.elb.amazonaws.com') || domainName.includes('.elasticbeanstalk.com')) {
    return 'AWS Load Balancer';
  }
  return 'Custom';
};

export const replaceOrigins = async ({
  origins = [],
  debug = false,
  debugReport,
}: IReplaceOrigins): Promise<Origin[]> => {
  if (debug && debugReport) {
    console.log(chalk.blue.bold('\n╔════════════════════════════════════════════╗'));
    console.log(chalk.blue.bold('║') + chalk.white.bold('  DEBUG MODE - Origin Replacement           ') + chalk.blue.bold('║'));
    console.log(chalk.blue.bold('║') + chalk.dim('  Reviewing origin configurations           ') + chalk.blue.bold('║'));
    console.log(chalk.blue.bold('╚════════════════════════════════════════════╝'), '\n');
  }

  if (origins.length === 0) {
    console.log(chalk.yellow('⚠️  No origins found in distribution'), '\n');
    return origins;
  }

  console.log(chalk.yellow(`📊 Found ${origins.length} origin(s) to process`), '\n');

  const originUpdates: OriginUpdate[] = [];
  const uniqueOACIds = new Set(
    origins
      .filter(o => o.OriginAccessControlId)
      .map(o => o.OriginAccessControlId!)
  );
  const oacReplacements = new Map<string, string>();
  if (uniqueOACIds.size > 0) {
    console.log(chalk.cyan.bold('🔐 Origin Access Control ID Replacement'));
    console.log(chalk.white(`Found ${uniqueOACIds.size} unique OAC ID(s)`));

    for (const oacId of uniqueOACIds) {
      const newOACId = await getUserInput({
        question: `Enter value for Origin Access Control ID: "${oacId}"`,
        defaultValue: oacId,
        validate: (id: string) => {
          if (!id.trim()) {
            return {
              isValid: false,
              reason: 'Origin Access Control ID cannot be empty',
            };
          }

          return { isValid: true };
        },
      });
      oacReplacements.set(oacId, newOACId);
    }
  }

  for (const [index, origin] of origins.entries()) {
    const originType = detectOriginType(origin.DomainName);

    console.log(chalk.magenta.bold(`📍 Origin #${index + 1}`) + chalk.dim(` - ID: `) + chalk.cyan(`"${origin.Id}"`));
    console.log(chalk.dim('   Type: ') + chalk.white(originType));
    console.log(chalk.dim('   Current Domain: ') + chalk.white(origin.DomainName));

    const update: OriginUpdate = {
      originalId: origin.Id,
      originalDomain: origin.DomainName,
      originType,
      wasModified: false,
    };

    const newDomain = await getUserInput({
      question: `Enter new domain name for origin "${origin.Id}"`,
      defaultValue: origin.DomainName,
      validate: (domain: string) => {
        if (!domain.trim()) {
          return {
            isValid: false,
            reason: 'Domain name cannot be empty',
          };
        }
        // Basic domain validation
        if (!/^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/.test(domain)) {
          return {
            isValid: false,
            reason: 'Invalid domain name format',
          };
        }

        if (detectOriginType(domain) !== originType) {
          return {
            isValid: false,
            reason: `The new domain does not match the detected origin type (${originType})`,
          };
        }

        return { isValid: true };
      },
    });

    origin.DomainName = newDomain;
    update.wasModified = newDomain !== origin.DomainName;
    update.newDomain = newDomain;

    console.log(chalk.green(`   ✅ Domain updated to: `) + chalk.white.bold(newDomain), '\n');

    if (origin.OriginAccessControlId) {
      console.log(chalk.dim('   📍 Detected Origin Access Control ID: ') + chalk.white(origin.OriginAccessControlId));
      const newOACId = oacReplacements.get(origin.OriginAccessControlId);
      if (newOACId && newOACId !== origin.OriginAccessControlId) {
        origin.OriginAccessControlId = newOACId;
        console.log(chalk.green(`   ✅ Origin Access Control ID updated to: `) + chalk.white.bold(newOACId), '\n');
      }
    }

    originUpdates.push(update);
  }

  const modifiedCount = originUpdates.filter(u => u.wasModified).length;
  const keptCount = originUpdates.filter(u => !u.wasModified).length;

  console.log(chalk.green.bold('✅ Origins processing complete'), '\n');
  console.log(chalk.cyan.bold('📊 Summary:'));
  console.log(chalk.dim('   ├─ ') + chalk.white('Total origins: ') + chalk.bold(origins.length.toString()));
  console.log(chalk.dim('   ├─ ') + chalk.green('Modified: ') + chalk.bold(modifiedCount.toString()));
  console.log(chalk.dim('   └─ ') + chalk.blue('Kept as-is: ') + chalk.bold(keptCount.toString()), '\n');

  if (debugReport) {
    if (!debugReport.originUpdates) {
      debugReport.originUpdates = [];
    }
    debugReport.originUpdates = originUpdates;
  }

  return origins;
};