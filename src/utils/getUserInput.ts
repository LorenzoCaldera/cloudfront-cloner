import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import chalk from "./mini-chalk";

export interface ValidatorResult {
  isValid: boolean;
  reason?: string;
}

export type ValidatorFn<T> = (value: T) => ValidatorResult;

export interface GetUserInputOptions<T> {
  question: string;
  defaultValue?: T;
  transformer?: (raw: string) => T; // para convertir string -> T
  validate?: ValidatorFn<T>;
}

export async function getUserInput<T = string>({
  question,
  defaultValue,
  transformer = (raw) => raw as T,
  validate,
}: GetUserInputOptions<T>): Promise<T> {
  const readlineInterface = createInterface({ input: stdin, output: stdout });

  while (true) {
    const prompt = defaultValue
      ? `${question} ${chalk.dim(`(Press Enter to use default: ${defaultValue})`)}: `
      : `${question}: `;

    const rawInput = await readlineInterface.question(prompt);

    const finalValue =
      rawInput.trim() === "" && defaultValue !== undefined
        ? defaultValue // Si no da respuesta y tiene valor default, usamos defaultValue
        : transformer(rawInput); // Si la respuesta es invalida sera correjida en la funcion validate

    if (!validate) {
      readlineInterface.close();
      return finalValue;
    }

    const validationResult = validate(finalValue);

    if (validationResult.isValid) {
      readlineInterface.close();
      return finalValue;
    }

    console.log(chalk.red.bold(`${validationResult.reason ?? "Invalid input"}`));
  }
}
