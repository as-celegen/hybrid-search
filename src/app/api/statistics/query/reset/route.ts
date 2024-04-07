import {redis} from "@/context/redis";
import {NextRequest, NextResponse} from "next/server";
import { QueryStatistics } from "@/types/query";

export async function DELETE(req: NextRequest): Promise<NextResponse> {
    const queries: string[] = await req.json();

    if (!queries || !Array.isArray(queries) || queries.length === 0){
        return new NextResponse('Query is required', {status: 400});
    }
    const defaultStatistics: QueryStatistics = {
        clickedResults: [],
        searchCount: 0,
        top10Results: [],
        clickCount: 0,
    }
    await Promise.all(queries.map(async query => {
        //TODO: Fix type
        await redis.json.set(`statistics#${query}`, '$', defaultStatistics as any);
    }));

    return new NextResponse('OK');
}