import {NextRequest, NextResponse} from "next/server";
import {redis} from "@/context/redis";
import {QueryStatistics} from "@/types/query";

export async function GET(req: NextRequest): Promise<NextResponse> {
    const query = req.nextUrl.searchParams.get('query');
    if (!query) {
        return new NextResponse('query is required', {status: 400});
    }

    const queryStatistics = await redis.json.get<QueryStatistics>(`statistics#${query}`);
    if (!queryStatistics) {
        return new NextResponse('Query not found', {status: 404});
    }

    return new NextResponse(JSON.stringify(queryStatistics));
}