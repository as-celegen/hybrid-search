import {NextRequest, NextResponse} from "next/server";
import {semanticSearch} from "@/context/semantic-search";

export async function GET(req: NextRequest, { params }: { params?: { namespace: string[] } }): Promise<NextResponse> {
    const payload: any = await req.json();
    if (!payload) {
        return NextResponse.json({result: 'Key is required'}, {status: 400});
    }
    if(!('cursor' in payload) || !('limit' in payload)) {
        return NextResponse.json({result: 'Payload must contain cursor and limit fields'}, {status: 400});
    }

    const namespace = params?.namespace?.join('/') ?? "";

    const documents = semanticSearch.range(payload, {namespace});

    return NextResponse.json({result: documents});
}

export async function POST(req: NextRequest, { params }: { params?: { namespace: string[] } }): Promise<NextResponse> {
    return await GET(req, {params});
}