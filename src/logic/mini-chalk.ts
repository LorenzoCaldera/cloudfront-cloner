type ANSIStyle = [open: number, close: number];

const ANSI = {
  modifiers: {
    reset: [0, 0],
    bold: [1, 22],
    dim: [2, 22],
    italic: [3, 23],
    underline: [4, 24],
  } as Record<string, ANSIStyle>,

  colors: {
    black: [30, 39],
    red: [31, 39],
    green: [32, 39],
    yellow: [33, 39],
    blue: [34, 39],
    magenta: [35, 39],
    cyan: [36, 39],
    white: [37, 39],
  } as Record<string, ANSIStyle>,

  backgrounds: {
    bgBlack: [40, 49],
    bgRed: [41, 49],
    bgGreen: [42, 49],
    bgYellow: [43, 49],
    bgBlue: [44, 49],
    bgMagenta: [45, 49],
    bgCyan: [46, 49],
    bgWhite: [47, 49],
  } as Record<string, ANSIStyle>
};

interface Styler {
  open: string;
  close: string;
  parent: Styler | null;
  apply(text: string): string;
}

function createStyler(open: string, close: string, parent: Styler | null): Styler {
  return {
    open,
    close,
    parent,
    apply(text: string): string {
      if (this.parent) {
        text = this.parent.apply(text);
      }
      return `${this.open}${text}${this.close}`;
    }
  };
}

type ChalkFunction = ((text: string) => string) & {
  [key: string]: ChalkFunction;
};

function chalkFactory(parent: Styler | null = null): ChalkFunction {
  const handler: ProxyHandler<any> = {
    get(_, prop: string) {
      const code =
        ANSI.modifiers[prop] ||
        ANSI.colors[prop] ||
        ANSI.backgrounds[prop];

      if (code) {
        const [open, close] = code;
        const styler = createStyler(`\x1b[${open}m`, `\x1b[${close}m`, parent);
        return chalkFactory(styler);
      }

      throw new Error(`Unknown style: ${prop}`);
    },

    apply(_, __, args: [string]) {
      const text = String(args[0]);
      if (!parent) return text;
      return parent.apply(text);
    }
  };

  return new Proxy(() => {}, handler) as ChalkFunction;
}

const chalk = chalkFactory();

export default chalk;
