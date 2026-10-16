import { pluralCategory } from "./plural";

export type MessageParams = Record<string, string | number>;

export type FormatContext = {
  locale: string;
  resolveTerm?: (id: string) => string | undefined;
};

type Node =
  | { type: "text"; value: string }
  | { type: "var"; name: string }
  | { type: "term"; id: string }
  | { type: "pound" }
  | { type: "plural"; name: string; options: Record<string, Node[]> }
  | { type: "select"; name: string; options: Record<string, Node[]> };

const astCache = new Map<string, Node[]>();

class Parser {
  private pos = 0;

  constructor(private readonly src: string) {}

  parse(): Node[] {
    return this.parseNodes(false, false);
  }

  private parseNodes(inBraces: boolean, inPlural: boolean): Node[] {
    const nodes: Node[] = [];
    let text = "";
    const flush = () => {
      if (text) nodes.push({ type: "text", value: text });
      text = "";
    };

    while (this.pos < this.src.length) {
      const ch = this.src[this.pos];
      if (ch === "}" && inBraces) break;
      if (ch === "{") {
        flush();
        this.pos++;
        nodes.push(this.parseArgument());
        continue;
      }
      if (ch === "#" && inPlural) {
        flush();
        nodes.push({ type: "pound" });
        this.pos++;
        continue;
      }
      text += ch;
      this.pos++;
    }
    flush();
    return nodes;
  }

  private parseArgument(): Node {
    const nameStart = this.pos;
    while (this.pos < this.src.length && !",}".includes(this.src[this.pos])) this.pos++;
    const name = this.src.slice(nameStart, this.pos).trim();

    if (this.src[this.pos] === "}") {
      this.pos++;
      if (name.startsWith("term:")) return { type: "term", id: name.slice(5).trim() };
      return { type: "var", name };
    }

    this.pos++;
    const typeStart = this.pos;
    while (this.pos < this.src.length && !",}".includes(this.src[this.pos])) this.pos++;
    const kind = this.src.slice(typeStart, this.pos).trim();

    if (this.src[this.pos] === "}") {
      this.pos++;
      return { type: "var", name };
    }
    this.pos++;

    const isPlural = kind === "plural";
    const options: Record<string, Node[]> = {};
    for (;;) {
      this.skipWs();
      if (this.pos >= this.src.length || this.src[this.pos] === "}") break;
      const keyStart = this.pos;
      while (
        this.pos < this.src.length &&
        !/\s/.test(this.src[this.pos]) &&
        this.src[this.pos] !== "{"
      ) {
        this.pos++;
      }
      const key = this.src.slice(keyStart, this.pos);
      this.skipWs();
      if (this.src[this.pos] !== "{") break;
      this.pos++;
      options[key] = this.parseNodes(true, isPlural);
      if (this.src[this.pos] === "}") this.pos++;
    }
    if (this.src[this.pos] === "}") this.pos++;

    return isPlural ? { type: "plural", name, options } : { type: "select", name, options };
  }

  private skipWs() {
    while (this.pos < this.src.length && /\s/.test(this.src[this.pos])) this.pos++;
  }
}

function parseMessage(message: string): Node[] {
  let ast = astCache.get(message);
  if (!ast) {
    ast = new Parser(message).parse();
    astCache.set(message, ast);
  }
  return ast;
}

function formatNumber(locale: string, n: number): string {
  try {
    return new Intl.NumberFormat(locale).format(n);
  } catch {
    return String(n);
  }
}

function render(
  nodes: Node[],
  params: MessageParams,
  ctx: FormatContext,
  pound?: number,
): string {
  let out = "";
  for (const node of nodes) {
    switch (node.type) {
      case "text":
        out += node.value;
        break;
      case "var": {
        const v = params[node.name];
        out += v === undefined ? `{${node.name}}` : String(v);
        break;
      }
      case "term":
        out += ctx.resolveTerm?.(node.id) ?? node.id;
        break;
      case "pound":
        out += pound === undefined ? "#" : formatNumber(ctx.locale, pound);
        break;
      case "plural": {
        const raw = params[node.name];
        const n = typeof raw === "number" ? raw : Number(raw);
        const branch =
          node.options[`=${n}`] ??
          node.options[pluralCategory(ctx.locale, n)] ??
          node.options.other ??
          [];
        out += render(branch, params, ctx, n);
        break;
      }
      case "select": {
        const v = String(params[node.name] ?? "");
        out += render(node.options[v] ?? node.options.other ?? [], params, ctx, pound);
        break;
      }
    }
  }
  return out;
}

/** ICU subset: `{name}`, `{n, plural, one {…} other {…}}`, `{g, select, …}`, `{term:id}`. */
export function formatMessage(
  message: string,
  params: MessageParams = {},
  ctx: FormatContext = { locale: "en" },
): string {
  if (!message.includes("{")) return message;
  return render(parseMessage(message), params, ctx);
}
