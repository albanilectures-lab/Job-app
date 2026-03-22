import { NextResponse } from "next/server";
import { exportToExcel } from "@/lib/excel";
import { initDb } from "@/lib/db";
import { requireUserId } from "@/lib/session";

/**
 * GET /api/export — download application log as Excel file
 */
export async function GET() {
  try {
    const userId = await requireUserId();
    await initDb();
    const buffer = await exportToExcel(userId);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="job-applications-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      },
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
