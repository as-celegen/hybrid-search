import {fullTextSearch} from "@/context/full-text-search";
import {NextRequest, NextResponse} from "next/server";
import {redis} from "@/context/redis";
import {semanticSearch} from "@/context/semantic-search";

export async function DELETE(req: NextRequest): Promise<NextResponse> {
    await redis.flushall();
    await fullTextSearch.resetIndex();
    await semanticSearch.resetIndex();

    return new NextResponse('OK');
}

