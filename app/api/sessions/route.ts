import { NextResponse } from "next/server";
import { manualLogin, getSavedSessions, deleteSession } from "@/lib/playwright";

// GET /api/sessions — list all saved login sessions
export async function GET() {
  try {
    const sessions = getSavedSessions();
    return NextResponse.json({ sessions });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/sessions — start a manual login flow
// Body: { board: "linkedin" | "indeed" | "glassdoor" }
export async function POST(req: Request) {
  try {
    const { board } = await req.json();
    if (!board) {
      return NextResponse.json({ error: "board is required" }, { status: 400 });
    }

    const result = await manualLogin(board);
    if (result.success) {
      return NextResponse.json({ success: true, board, message: result.message });
    } else {
      return NextResponse.json({ success: false, board, message: result.message }, { status: 408 });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/sessions — delete a saved session
// Body: { board: "linkedin" }
export async function DELETE(req: Request) {
  try {
    const { board } = await req.json();
    if (!board) {
      return NextResponse.json({ error: "board is required" }, { status: 400 });
    }

    deleteSession(board);
    return NextResponse.json({ success: true, message: `Session for ${board} deleted.` });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
