import { DefaultCacheBehavior } from "@aws-sdk/client-cloudfront";
import chalk from "../../utils/mini-chalk";
import { getUserInput } from "../../utils/getUserInput";

type AssociationType = 'lambda' | 'function';

interface AssociationConfig {
  type: AssociationType;
  label: string;
  arnField: 'LambdaFunctionARN' | 'FunctionARN';
}

const ASSOCIATION_CONFIGS: Record<AssociationType, AssociationConfig> = {
  lambda: {
    type: 'lambda',
    label: 'LambdaFunctionAssociation',
    arnField: 'LambdaFunctionARN',
  },
  function: {
    type: 'function',
    label: 'FunctionAssociation',
    arnField: 'FunctionARN',
  },
};

const processAssociations = async ({
  items,
  config,
  replaceFunctionsARNStorage,
}: {
  items: any[];
  config: AssociationConfig;
  replaceFunctionsARNStorage: Map<string, string>;
}): Promise<void> => {
  // Process in reverse to safely handle deletions
  for (let index = items.length - 1; index >= 0; index--) {
    const assoc = items[index];
    const currentARN = assoc[config.arnField];
    const displayIndex = index + 1;

    console.log(chalk.white(`  ✅ ${config.label} #${displayIndex}`));
    console.log(chalk.dim(`    EventType: `) + chalk.cyan(`"${assoc.EventType}"`));
    console.log(chalk.dim(`    ${config.arnField}: `) + chalk.cyan(`"${currentARN}"`));

    let newARN = replaceFunctionsARNStorage.get(currentARN);
    if (newARN) {
      console.log(chalk.white(`  ✅ ${config.label}`) + chalk.cyan(` "${currentARN}"`) + chalk.green(` has a cached replacement`));
      console.log(chalk.dim(`    ${currentARN} → ${newARN}`));
    } else {
      newARN = await getUserInput<string>({
        question: `The process to create ${config.type} is not done yet.\nCreate a new ${config.type === 'lambda' ? 'Lambda' : 'CloudFront'} Function to replace "${currentARN}" and enter the new Function ARN. Or type "delete" to remove this association`,
        validate: (input: string) => {
          if (input.trim().toLowerCase() === "delete") return { isValid: true };

          if (!input.trim())
            return { isValid: false, reason: "Function ARN cannot be empty" };

          // Basic ARN validation
          if (!/^arn:aws[a-zA-Z-]*:lambda:[a-z0-9-]+:\d{12}:function:[a-zA-Z0-9-_:]+$/.test(input) && !/^arn:aws[a-zA-Z-]*:cloudfront::\d{12}:function\/[a-zA-Z0-9-_:]+$/.test(input) && input.trim() !== "delete")
            return { isValid: false, reason: "Invalid ARN format" };

          return { isValid: true };
        },
      });

      replaceFunctionsARNStorage.set(currentARN, newARN);
    }

    if (newARN.trim().toLowerCase() === "delete") {
      console.log(chalk.yellow(`  🗑️  Deleting ${config.label} #${displayIndex} as per user request`));

      items.splice(index, 1);
    } else {
      console.log(chalk.green(`  🔄 Replacing ${config.arnField} for Association #${displayIndex}`));
      console.log(chalk.dim(`    ${currentARN} → ${newARN}`));
      assoc[config.arnField] = newARN;
    }
  }
};

export const replaceFunctionsARN = async ({
  behavior,
  replaceFunctionsARNStorage,
}: {
  behavior: DefaultCacheBehavior;
  replaceFunctionsARNStorage: Map<string, string>;
}): Promise<void> => {
  // Process Lambda Function Associations
  if (behavior.LambdaFunctionAssociations?.Items?.length) {
    await processAssociations({
      items: behavior.LambdaFunctionAssociations.Items,
      config: ASSOCIATION_CONFIGS.lambda,
      replaceFunctionsARNStorage,
    });
    behavior.LambdaFunctionAssociations.Quantity = behavior.LambdaFunctionAssociations.Items.length;
  }

  // Process CloudFront Function Associations
  if (behavior.FunctionAssociations?.Items?.length) {
    await processAssociations({
      items: behavior.FunctionAssociations.Items,
      config: ASSOCIATION_CONFIGS.function,
      replaceFunctionsARNStorage,
    });
    behavior.FunctionAssociations.Quantity = behavior.FunctionAssociations.Items.length;
  }
};