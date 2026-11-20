import { getPublicSchedule } from "../../../lib/public-schedule";
import { requireAdmin } from "../../../lib/admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const serviceId = url.searchParams.get("serviceId")?.trim() || undefined;
  const professionalId = url.searchParams.get("professionalId")?.trim() || undefined;
  const excludeAppointmentId = url.searchParams.get("excludeAppointmentId")?.trim() || undefined;
  if (excludeAppointmentId && !(await requireAdmin(request))) {
    return Response.json({ message: "Acesso restrito." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  const { days, failed } = await getPublicSchedule({ serviceId, professionalId, excludeAppointmentId });

  return Response.json(
    { dates: days },
    {
      status: failed ? 503 : 200,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
