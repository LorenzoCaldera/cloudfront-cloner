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
    console.log(chalk.blue.bold('║') + chalk.dim('  Reviewing origin configurations            ') + chalk.blue.bold('║'));
    console.log(chalk.blue.bold('╚════════════════════════════════════════════╝\n'));
  }

  if (origins.length === 0) {
    console.log(chalk.yellow('⚠️  No origins found in distribution\n'));
    return origins;
  }

  console.log(chalk.yellow(`📊 Found ${origins.length} origin(s) to process\n`));

  const originUpdates: OriginUpdate[] = [];

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
    update.newDomain = newDomain;
    update.wasModified = newDomain !== origin.DomainName;

    console.log(chalk.green(`   ✅ Domain updated to: `) + chalk.white.bold(newDomain));

    originUpdates.push(update);
  }

  const modifiedCount = originUpdates.filter(u => u.wasModified).length;
  const keptCount = originUpdates.filter(u => !u.wasModified).length;

  console.log(chalk.green.bold('✅ Origins processing complete\n'));
  console.log(chalk.cyan.bold('📊 Summary:'));
  console.log(chalk.dim('   ├─ ') + chalk.white('Total origins: ') + chalk.bold(origins.length.toString()));
  console.log(chalk.dim('   ├─ ') + chalk.green('Modified: ') + chalk.bold(modifiedCount.toString()));
  console.log(chalk.dim('   └─ ') + chalk.blue('Kept as-is: ') + chalk.bold(keptCount.toString()));
  console.log();

  if (debug && debugReport) {
    if (!debugReport.originUpdates) {
      debugReport.originUpdates = [];
    }
    debugReport.originUpdates = originUpdates;

    console.log(chalk.magenta('🐛 Debug: Origin updates recorded in debug report\n'));
  }

  return origins;
};