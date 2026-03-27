declare module "glimpseui" {
  export interface GlimpsePromptOptions {
    width?: number;
    height?: number;
    title?: string;
    timeout?: number;
    hidden?: boolean;
    autoClose?: boolean;
  }

  export interface GlimpseShowOptions {
    title?: string;
  }

  export interface GlimpseWindow {
    on(event: "ready", listener: () => void): this;
    on(event: "message", listener: (data: unknown) => void): this;
    once(event: "message", listener: (data: unknown) => void): this;
    once(event: "closed", listener: () => void): this;
    once(event: "error", listener: (error: unknown) => void): this;
    /** Evaluate JavaScript in the webview context */
    send(js: string): void;
    loadFile(path: string): void;
    show(options?: GlimpseShowOptions): void;
    close(): void;
  }

  export function open(html: string, options?: GlimpsePromptOptions): GlimpseWindow;
  export function prompt(html: string, options?: GlimpsePromptOptions): Promise<unknown>;
}
