import {NextRequest, NextResponse} from "next/server";
import {redis} from "@/context/redis";

export async function POST(req: NextRequest): Promise<NextResponse> {
    const body = await req.nextUrl.searchParams;
    const key = body.get('key');
    const query = body.get('query');
    if (!key || !query) {
        return new NextResponse('Key and query are required', {status: 400});
    }

    await redis.json.numincrby(key, "$.statistics.clickCount", 1);
    await redis.json.arrappend(key, "$.statistics.clickedQueries", query);

    await redis.json.numincrby(`${query}#statistics`, '$.clickCount', 1);
    await redis.json.arrappend(`${query}#statistics`, '$.clickedResults', key);

    return new NextResponse('OK');
}
