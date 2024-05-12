import {fullTextSearch} from "@/context/full-text-search";
import {NextRequest, NextResponse} from "next/server";
import {redis} from "@/context/redis";
import {semanticSearch} from "@/context/semantic-search";

export async function DELETE(req: NextRequest): Promise<NextResponse> {
    await redis.flushall();
    await fullTextSearch.reset();
    await semanticSearch.reset();

    return new NextResponse('OK');
}

