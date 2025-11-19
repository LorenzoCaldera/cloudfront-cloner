type ArgsObject = {
  [key: string]: string | boolean;
};

export const parseArgs = (argv: string[]): ArgsObject => {
  const args: ArgsObject = {};

  for (let i = 0; i < argv.length; i++) {
    let arg = argv[i];

    if (arg.startsWith('--')) {
      arg = arg.slice(2); // Quitar --

      // --key=value
      if (arg.includes('=')) {
        const [key, value] = arg.split('=');
        args[key] = value
      } else { // --key value
        const nextArg = argv[i + 1];
        const key = arg;

        if (nextArg && !nextArg.startsWith('--')) {
          const value = nextArg;
          args[key] = value
          i++; // Saltar el proximo arg porque lo usamos como value
        } else { // --key (default = true)
          args[key] = true;
        }
      }
    }
  }

  return args;
};
