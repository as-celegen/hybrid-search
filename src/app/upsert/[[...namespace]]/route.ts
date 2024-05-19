import { fullTextSearch } from '@/context/full-text-search';
import {semanticSearch} from "@/context/semantic-search";
import {NextRequest, NextResponse} from "next/server";
import {VectorWithData} from "@/lib/full-text-search/bm25";

export async function POST(req: NextRequest, { params }: { params?: { namespace: string[] } }): Promise<NextResponse> {
    const body = await req.json();
    if (!body) {
        return new NextResponse('Body is required', {status: 400});
    }
    if((!Array.isArray(body) && (!body.id || body.data || body.vector))
        || (Array.isArray(body) && body.some(doc => (!doc.id || doc.data || doc.vector)))
    ) {
        return new NextResponse('Please include only id and metadata fields when using this endpoint', {status: 400});
    }
    const documents: VectorWithData[] = Array.isArray(body) ? body : [body];
    const namespace = params?.namespace.join('/') ?? "";
    await Promise.all([semanticSearch.upsert(documents, {namespace}), fullTextSearch.upsert(documents, {namespace})]);

    return NextResponse.json({result: 'Success'});
}