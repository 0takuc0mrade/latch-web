import { demoApi } from "@/lib/demo/server";

export const maxDuration = 60;

export function POST(request: Request): Promise<Response> {
  return demoApi.signinVerify(request);
}
