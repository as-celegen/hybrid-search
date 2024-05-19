import {NextRequest, NextResponse} from "next/server";
import {semanticSearch} from "@/context/semantic-search";

export async function GET(req: NextRequest): Promise<NextResponse> {
    return NextResponse.json({result: await semanticSearch.info()});
}

export async function POST(req: NextRequest): Promise<NextResponse> {
    return await GET(req);
}