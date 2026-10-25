// All `shop` behavior, shared by the sandbox command, the tests and the MCP server.

export interface ShopContext {
  storeUrl: string;
  cartId: string;
}

export interface ShopResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export async function runShop(_args: string[], _ctx: ShopContext): Promise<ShopResult> {
  return { stdout: "", stderr: "shop: not implemented yet\n", exitCode: 1 };
}
