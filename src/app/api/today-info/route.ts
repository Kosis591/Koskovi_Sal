import { getTodayInfo } from "@/lib/today-info";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await getTodayInfo());
}
