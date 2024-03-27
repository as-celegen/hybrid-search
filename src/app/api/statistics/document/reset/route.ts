import {redis} from "@/context/redis";
import {NextRequest, NextResponse} from "next/server";
import {DocumentStatistics} from "@/types/document";

export async function DELETE(req: NextRequest): Promise<NextResponse> {
    const keys: string[] = await req.json();

    if (!keys || !Array.isArray(keys) || keys.length === 0){
        return new NextResponse('Key is required', {status: 400});
    }
    const defaultStatistics: DocumentStatistics = {
        clickCount: 0,
        clickedQueries: [],
        top10ResultCount: 0,
        top10ResultQueries: []
    }
    await Promise.all(keys.map(async key => {
        //TODO: Fix type
        await redis.json.set(key, '$.statistics', defaultStatistics as any);
    }));

    return new NextResponse('OK');
}