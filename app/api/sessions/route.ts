import { NextResponse } from "next/server";
import { JOB_BOARD_CONFIGS } from "@/lib/constants";
import type { JobBoard } from "@/lib/types";

const IS_SERVERLESS = !!process.env.NETLIFY || !!process.env.AWS_LAMBDA_FUNCTION_NAME || !!process.env.VERCEL;

// GET /api/sessions — list all saved login sessions
export async function GET() {
  try {
    if (IS_SERVERLESS) {
      return NextResponse.json({ sessions: [], serverless: true });
    }
    const { getSavedSessions } = await import("@/lib/playwright");
    const sessions = getSavedSessions();
    return NextResponse.json({ sessions });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/sessions — get login URL or start manual login
// Body: { board: "glassdoor", action?: "getLoginUrl" }
export async function POST(req: Request) {
  try {
    const { board, action } = await req.json();
    if (!board) {
      return NextResponse.json({ error: "board is required" }, { status: 400 });
    }

    // Return the login URL so the frontend can open it in a new tab
    if (action === "getLoginUrl") {
      const config = JOB_BOARD_CONFIGS[board as JobBoard];
      if (!config?.loginUrl) {
        return NextResponse.json({ error: `${config?.name ?? board} does not have a login URL.` }, { status: 400 });
      }
      return NextResponse.json({ success: true, board, loginUrl: config.loginUrl });
    }

    if (IS_SERVERLESS) {
      return NextResponse.json({ error: "Browser sessions are not available in serverless deployment. Run the app locally to use this feature." }, { status: 400 });
    }

    const { manualLogin } = await import("@/lib/playwright");
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
    if (IS_SERVERLESS) {
      return NextResponse.json({ error: "Browser sessions are not available in serverless deployment." }, { status: 400 });
    }
    const { board } = await req.json();
    if (!board) {
      return NextResponse.json({ error: "board is required" }, { status: 400 });
    }

    const { deleteSession } = await import("@/lib/playwright");
    deleteSession(board);
    return NextResponse.json({ success: true, message: `Session for ${board} deleted.` });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
