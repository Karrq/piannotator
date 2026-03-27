declare module "glimpseui" {
  export interface GlimpsePromptOptions {
    width?: number;
    height?: number;
    title?: string;
    timeout?: number;
  }

  export function prompt(html: string, options?: GlimpsePromptOptions): Promise<unknown>;
}
