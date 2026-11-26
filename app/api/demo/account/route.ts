import { demoApi } from "@/lib/demo/server";

export function GET(request: Request): Promise<Response> {
  return demoApi.account(request);
}
