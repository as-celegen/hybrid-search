import {NextRequest, NextResponse} from "next/server";
import {fullTextSearch} from "@/context/full-text-search";
import {semanticSearch} from "@/context/semantic-search";
import {hybridSearch} from "@/context/hybrid-search";

export async function POST(req: NextRequest, { params }: { params?: { namespace: string[] } }): Promise<NextResponse> {
    const query = await req.json();
    if (!query) {
        return NextResponse.json({result: 'Query is required'}, {status: 400});
    }
    if(!('topK' in query) || !('data' in query)) {
        return NextResponse.json({result: 'Query must contain topK and data fields'}, {status: 400});
    }
    const namespace = params?.namespace?.join('/') ?? "";

    const [semanticSearchResults, fullTextSearchResults] = await Promise.all([
        semanticSearch.query(query, {namespace}),
        fullTextSearch.query(query, {namespace})
    ]);
    const results = hybridSearch.combineResults(fullTextSearchResults, semanticSearchResults);

    return NextResponse.json({result: results});
}