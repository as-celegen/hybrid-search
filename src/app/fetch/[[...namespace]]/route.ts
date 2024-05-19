import {NextRequest, NextResponse} from "next/server";
import {semanticSearch} from "@/context/semantic-search";

export async function GET(req: NextRequest, { params }: { params?: { namespace: string[] } }): Promise<NextResponse> {
    const payload: any = await req.json();
    if (!payload) {
        return NextResponse.json({result: 'Key is required'}, {status: 400});
    }
    if(!('ids' in payload)) {
        return NextResponse.json({result: 'Payload must contain ids field'}, {status: 400});
    }
    const keys = payload.ids;
    const includeMetadata = payload.includeMetadata;
    const includeVectors = payload.includeVectors;
    const keysArray = (Array.isArray(keys) ? keys : [keys]).flatMap(key => typeof key === 'string' || typeof key === 'number' ? key.toString() : []);
    const namespace = params?.namespace?.join('/') ?? "";

    const documents = semanticSearch.fetch(keysArray, {namespace, includeMetadata, includeVectors});

    return NextResponse.json({result: documents});
}

export async function POST(req: NextRequest, { params }: { params?: { namespace: string[] } }): Promise<NextResponse> {
    return await GET(req, {params});
}