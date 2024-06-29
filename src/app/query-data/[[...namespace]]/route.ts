import {NextRequest, NextResponse} from "next/server";
import {fullTextSearch} from "@/context/full-text-search";
import {semanticSearch} from "@/context/semantic-search";
import {hybridSearch} from "@/context/hybrid-search";

export async function POST(req: NextRequest, { params }: { params?: { namespace: string[] } }): Promise<NextResponse> {
    const query = await req.json();
    if (!query) {
        return NextResponse.json({result: 'Query is required'}, {status: 400});
    }
    if((Array.isArray(query) && query.some(q => (!('topK' in q) || !('data' in q)))) ||
        (!Array.isArray(query) && ( !('topK' in query) || !('data' in query) ))
    ) {
        return NextResponse.json({result: 'Query must contain topK and data fields'}, {status: 400});
    }
    const namespace = params?.namespace?.join('/') ?? "";
    let results;
    if(Array.isArray(query)){
        const [semanticSearchResults, fullTextSearchResults] = await Promise.all(
            [
                semanticSearch.queryMany(query, {namespace}),
                fullTextSearch.queryMany(query.map(q => ({...q, includeVectors: false})), {namespace})
            ]);
        results = query.map((q, i) => hybridSearch.combineResults(fullTextSearchResults[i], semanticSearchResults[i]).slice(0, q.topK));
    } else {
        const [semanticSearchResults, fullTextSearchResults] = await Promise.all([
                semanticSearch.query(query, {namespace}),
                fullTextSearch.query({...query, includeVectors: false}, {namespace})
            ]);
        results = hybridSearch.combineResults(fullTextSearchResults, semanticSearchResults).slice(0, query.topK);
    }

    return NextResponse.json({result: results});
}