import { fullTextSearch } from '@/context/full-text-search';
import {semanticSearch} from "@/context/semantic-search";
import {NextRequest, NextResponse} from "next/server";
import {VectorWithData} from "@/lib/full-text-search/bm25";

export async function POST(req: NextRequest, { params }: { params?: { namespace: string[] } }): Promise<NextResponse> {
    const body = await req.json();
    if (!body) {
        return NextResponse.json({result: 'Body is required'}, {status: 400});
    }
    if((!Array.isArray(body) && (!body.id || !body.data))
        || (Array.isArray(body) && body.some(doc => !doc.id || !doc.data))
    ) {
        return NextResponse.json({result: 'Missing body fields'}, {status: 400});
    }
    const documents: VectorWithData[] = Array.isArray(body) ? body : [body];
    const namespace = params?.namespace?.join('/') ?? "";
    await Promise.all([semanticSearch.upsert(documents, {namespace}), fullTextSearch.upsert(documents, {namespace})]);

    return NextResponse.json({result: 'Success'});
}