import {NextRequest, NextResponse} from "next/server";
import {semanticSearch} from "@/context/semantic-search";

export async function GET(req: NextRequest, { params }: { params?: { namespace: string[] } }): Promise<NextResponse> {
    const payload: any = await req.json();
    if (!payload) {
        return new NextResponse('Key is required', {status: 400});
    }
    if(!('ids' in payload)) {
        return new NextResponse('Payload must contain ids field', {status: 400});
    }
    const keys = payload.ids;
    const includeMetadata = payload.includeMetadata;
    const includeVectors = payload.includeVectors;
    const keysArray = (Array.isArray(keys) ? keys : [keys]).flatMap(key => typeof key === 'string' || typeof key === 'number' ? key : []);
    const namespace = params?.namespace.join('/') ?? "";

    const documents = semanticSearch.fetch([keysArray, {includeMetadata, includeVectors}], {namespace});

    return NextResponse.json({result: documents});
}