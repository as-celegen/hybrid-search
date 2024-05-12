import {NextRequest, NextResponse} from "next/server";
import {fullTextSearch} from "@/context/full-text-search";
import {semanticSearch} from "@/context/semantic-search";
import {hybridSearch} from "@/context/hybrid-search";
import {redis} from "@/context/redis";

export async function GET(req: NextRequest): Promise<NextResponse> {
    const query = req.nextUrl.searchParams.get('query');
    if (!query) {
        return new NextResponse('Query is required', {status: 400});
    }

    const fullTextSearchResults = await fullTextSearch.query(query);
    const semanticSearchResults = await semanticSearch.query(query);
    const results = hybridSearch.combineResults(fullTextSearchResults, semanticSearchResults);

    results.slice(0, 10).map(result => {
        redis.json.numincrby(`key#${result.id}`, '$.statistics.top10ResultCount', 1);
        redis.json.arrappend(`key#${result.id}`, '$.statistics.top10ResultQueries', [query]);
    })
    redis.exists(`${query}`).then((exists) => {
        if (exists) {
            redis.json.numincrby(`statistics#${query}`, '$.searchCount', 1);
            redis.json.set(`statistics#${query}`, '$.top10Results', results.slice(0, 10));
        } else {
            redis.json.set(`statistics#${query}`, '$', {
                searchCount: 1,
                top10Results: results.slice(0, 10),
                clickedResults: [],
                clickCount: 0
            });
        }
    });
    return new NextResponse(JSON.stringify(results));
}