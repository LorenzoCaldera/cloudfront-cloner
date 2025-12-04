import { DefaultCacheBehavior } from "@aws-sdk/client-cloudfront";
import chalk from "../../utils/mini-chalk";
import { getUserInput } from "../../utils/getUserInput";

export const replaceLambdasARN = async ({
  behavior,
  debug,
}: { behavior: DefaultCacheBehavior; debug: boolean }): Promise<void> => {
  if (!behavior.LambdaFunctionAssociations?.Items) return;

  for (const [index, lambdaAssoc] of behavior.LambdaFunctionAssociations.Items.entries()) {
    if (debug) {
      console.log(chalk.white(`  ✅ LambdaFunctionAssociation #${index + 1}`));
      console.log(chalk.dim(`    EventType: `) + chalk.cyan(`"${lambdaAssoc.EventType}"`));
      console.log(chalk.dim(`    LambdaFunctionARN: `) + chalk.cyan(`"${lambdaAssoc.LambdaFunctionARN}"`));
    }
    const newLambdaFunctionARN = await getUserInput<string>({
      question: `The process to create lambda functions is not done yet.\nCreate a new Lambda Function to replace "${lambdaAssoc.LambdaFunctionARN}" and enter the new Lambda Function ARN. Or type "delete" to remove this association`,
      validate: (input: string) => {
        if (input.trim().toLowerCase() === "delete") return { isValid: true };

        if (!input.trim())
          return { isValid: false, reason: "Lambda Function ARN cannot be empty" };

        if (input.trim() === lambdaAssoc.LambdaFunctionARN)
          return { isValid: false, reason: "Lambda Function ARN cannot be the same as the original one" };

        return { isValid: true };
      }
    });

    if (newLambdaFunctionARN.trim().toLowerCase() === "delete") {
      if (debug)
        console.log(chalk.yellow(`  🗑️  Deleting LambdaFunctionAssociation #${index + 1} as per user request`));

      behavior.LambdaFunctionAssociations.Items.splice(index, 1);
      behavior.LambdaFunctionAssociations.Quantity!--;
    } else {
      if (debug) {
        console.log(chalk.green(`  🔄 Replacing LambdaFunctionARN for Association #${index + 1}`));
        console.log(chalk.dim(`    ${lambdaAssoc.LambdaFunctionARN} → ${newLambdaFunctionARN}`));
      }
      lambdaAssoc.LambdaFunctionARN = newLambdaFunctionARN;
    }
  }
};