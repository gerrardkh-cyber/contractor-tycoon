// A DOM just big enough to run the guide in. Not a test file.
//
// The tutorial controller is UI code: it builds a spotlight out of real
// elements and toggles classes on <html>. Everything it touches is in this
// file — a dozen methods — so the suite can keep running on the `node`
// environment instead of pulling in jsdom for them. Anything the guide does
// not use is missing on purpose: code that needs more should fail here loudly
// rather than be quietly served a stub.

type Listener = (event: unknown) => void;

interface FakeStyle extends Record<string, unknown> {
  setProperty(name: string, value: string): void;
  getPropertyValue(name: string): string;
}

function fakeStyle(): FakeStyle {
  const own: Record<string, string> = {};
  return Object.assign(own as Record<string, unknown>, {
    setProperty(name: string, value: string): void {
      own[name] = value;
    },
    getPropertyValue(name: string): string {
      return own[name] ?? '';
    },
  }) as FakeStyle;
}

export class FakeNode {
  readonly tag: string;
  readonly attrs = new Map<string, string>();
  readonly style = fakeStyle();
  children: FakeNode[] = [];
  parent: FakeNode | null = null;
  /** What getBoundingClientRect reports. The spotlight measures its target. */
  rect = { left: 20, top: 20, width: 200, height: 60 };
  /** How many times the guide asked for this node to be scrolled to. */
  scrolledIntoView = 0;

  private text: string;
  private readonly classes = new Set<string>();
  private readonly listeners = new Map<string, Listener[]>();

  constructor(tag: string, text = '') {
    this.tag = tag;
    this.text = text;
  }

  readonly classList = {
    add: (name: string): void => {
      this.classes.add(name);
      this.attrs.set('class', [...this.classes].join(' '));
    },
    remove: (name: string): void => {
      this.classes.delete(name);
      this.attrs.set('class', [...this.classes].join(' '));
    },
    contains: (name: string): boolean => this.classes.has(name),
  };

  get textContent(): string {
    if (this.tag === '#text') return this.text;
    return this.text + this.children.map((child) => child.textContent).join('');
  }

  set textContent(value: string) {
    this.children = [];
    this.text = value;
  }

  get firstChild(): FakeNode | null {
    return this.children[0] ?? null;
  }

  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value);
    if (name !== 'class') return;
    this.classes.clear();
    for (const entry of value.split(/\s+/)) if (entry) this.classes.add(entry);
  }

  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null;
  }

  append(...nodes: (FakeNode | string)[]): void {
    for (const node of nodes) {
      const child = typeof node === 'string' ? new FakeNode('#text', node) : node;
      child.parent?.removeChild(child);
      child.parent = this;
      this.children.push(child);
    }
  }

  removeChild(child: FakeNode): void {
    this.children = this.children.filter((entry) => entry !== child);
    child.parent = null;
  }

  remove(): void {
    this.parent?.removeChild(this);
  }

  getBoundingClientRect(): { left: number; top: number; width: number; height: number } {
    return this.rect;
  }

  /** Counted rather than performed: there is nothing here to scroll. */
  scrollIntoView(): void {
    this.scrolledIntoView += 1;
  }

  addEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter((e) => e !== listener));
  }

  /** Test seam: fires what a real click would. */
  fire(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener({ preventDefault: () => undefined, target: this });
    }
  }

  /**
   * Attribute selectors only - `[a="b"][c="d"]` - which is the shape the
   * guide's own selectors take. Anything else is rejected rather than guessed
   * at, so a selector this cannot answer fails the test instead of passing it.
   */
  matches(selector: string): boolean {
    const parts = selector.match(/\[[^\]]+\]/g);
    if (!parts || parts.join('') !== selector) {
      throw new Error(`the stand-in DOM cannot match ${selector}`);
    }
    return parts.every((part) => {
      const pair = /^\[([-\w]+)="([^"]*)"\]$/.exec(part);
      if (!pair) throw new Error(`the stand-in DOM cannot match ${part}`);
      return this.getAttribute(pair[1]!) === pair[2];
    });
  }

  /** Depth-first search by class, for finding a node inside the spotlight. */
  findByClass(name: string): FakeNode | null {
    if (this.classList.contains(name)) return this;
    for (const child of this.children) {
      const hit = child.findByClass(name);
      if (hit) return hit;
    }
    return null;
  }
}

export interface FakeDom {
  /** Stands in for <html>: the guide's hide rules are classes on it. */
  root: FakeNode;
  body: FakeNode;
  /** What localStorage holds, so a test can see what was remembered. */
  storage: Map<string, string>;
  /** The clock the UI reads through performance.now(). Milliseconds. */
  clock: { ms: number };
  restore(): void;
}

type Global = Record<string, unknown>;

export function installFakeDom(): FakeDom {
  const g = globalThis as unknown as Global;
  const saved = new Map<string, unknown>();
  const keys = [
    'document', 'innerWidth', 'innerHeight', 'localStorage',
    'requestAnimationFrame', 'cancelAnimationFrame', 'addEventListener', 'removeEventListener',
  ];
  for (const key of keys) saved.set(key, g[key]);

  const root = new FakeNode('html');
  const body = new FakeNode('body');
  const storage = new Map<string, string>();
  const clock = { ms: 0 };
  const savedNow = performance.now;

  g.document = {
    documentElement: root,
    body,
    createElement: (tag: string) => new FakeNode(tag),
    createElementNS: (_ns: string, tag: string) => new FakeNode(tag),
    createTextNode: (text: string) => new FakeNode('#text', text),
  };
  g.innerWidth = 1280;
  g.innerHeight = 800;
  g.localStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => void storage.set(key, value),
    removeItem: (key: string) => void storage.delete(key),
  };
  // The spotlight coalesces measurement into a frame; here the frame is now.
  g.requestAnimationFrame = (cb: (t: number) => void) => {
    cb(clock.ms);
    return 0;
  };
  g.cancelAnimationFrame = () => undefined;
  g.addEventListener = () => undefined;
  g.removeEventListener = () => undefined;
  performance.now = () => clock.ms;

  return {
    root,
    body,
    storage,
    clock,
    restore(): void {
      performance.now = savedNow;
      for (const key of keys) {
        if (saved.get(key) === undefined) delete g[key];
        else g[key] = saved.get(key);
      }
    },
  };
}
