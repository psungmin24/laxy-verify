declare module "playwright" {
  interface LaunchOptions {
    headless?: boolean;
  }

  interface ViewportSize {
    width: number;
    height: number;
  }

  interface ContextOptions {
    viewport?: ViewportSize;
  }

  interface ConsoleMessage {
    type(): string;
    text(): string;
  }

  interface PageError {
    message: string;
  }

  interface Locator {
    first(): Locator;
    click(options?: { timeout?: number }): Promise<void>;
    fill(value: string): Promise<void>;
    waitFor(options?: { state?: "visible" | "hidden" | "attached" | "detached"; timeout?: number }): Promise<void>;
    innerText(): Promise<string>;
    scrollIntoViewIfNeeded(): Promise<void>;
  }

  interface Page {
    goto(url: string, options?: { waitUntil?: "networkidle" | "load" | "domcontentloaded"; timeout?: number }): Promise<void>;
    waitForSelector(selector: string, options?: { timeout?: number }): Promise<void>;
    waitForTimeout(timeout: number): Promise<void>;
    locator(selector: string): Locator;
    evaluate<T>(fn: () => T): Promise<T>;
    title(): Promise<string>;
    url(): string;
    on(event: "console", handler: (msg: ConsoleMessage) => void): void;
    on(event: "pageerror", handler: (err: PageError) => void): void;
  }

  interface BrowserContext {
    newPage(): Promise<Page>;
    close(): Promise<void>;
  }

  interface Browser {
    newContext(options?: ContextOptions): Promise<BrowserContext>;
    close(): Promise<void>;
  }

  interface BrowserType {
    launch(options?: LaunchOptions): Promise<Browser>;
  }

  export const chromium: BrowserType;
  export const firefox: BrowserType;
  export const webkit: BrowserType;
}
