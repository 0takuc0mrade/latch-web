import { demoApi } from "@/lib/demo/server";

export function POST(request: Request): Promise<Response> {
  return demoApi.signinOptions(request);
}
