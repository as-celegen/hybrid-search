import {NextRequest, NextResponse} from "next/server";
import {redis} from "@/context/redis";
import {fullTextSearch} from "@/context/full-text-search";
import {semanticSearch} from "@/context/semantic-search";

export async function DELETE(req: NextRequest): Promise<NextResponse> {
    const keys: any = await req.json();

    if (!keys || !Array.isArray(keys) || keys.some((key: any) => typeof key !== 'string')){
        return new NextResponse('Key is required', {status: 400});
    }

    await fullTextSearch.remove(keys);
    await semanticSearch.remove(keys);

    await redis.del(...keys);
    await redis.srem('document-keys', ...keys);
    return new NextResponse('OK');
}