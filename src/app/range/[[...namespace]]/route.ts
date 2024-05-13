import {NextRequest, NextResponse} from "next/server";
import {semanticSearch} from "@/context/semantic-search";

export async function GET(req: NextRequest, { params }: { params?: { namespace: string[] } }): Promise<NextResponse> {
    const payload: any = await req.json();
    if (!payload) {
        return new NextResponse('Key is required', {status: 400});
    }
    if(!('cursor' in payload) || !('limit' in payload)) {
        return new NextResponse('Payload must contain cursor and limit fields', {status: 400});
    }

    const namespace = params?.namespace.join('/') ?? "";

    const documents = semanticSearch.range(payload, {namespace});

    return NextResponse.json({result: documents});
}