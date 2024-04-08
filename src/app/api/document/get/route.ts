import {NextRequest, NextResponse} from "next/server";
import {redis} from "@/context/redis";
import {RedisDocument} from "@/types/document";

export async function GET(req: NextRequest): Promise<NextResponse> {
    const key = req.nextUrl.searchParams.get('key');
    if (!key) {
        return new NextResponse('Key is required', {status: 400});
    }

    const document = await redis.get<RedisDocument>(`key#${key}`);
    if (!document) {
        return new NextResponse('Document not found', {status: 404});
    }

    return new NextResponse(JSON.stringify(document));
}