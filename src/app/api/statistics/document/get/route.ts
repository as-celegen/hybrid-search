import {DocumentStatistics} from "@/types/document";
import {redis} from "@/context/redis";
import {NextRequest, NextResponse} from "next/server";

export async function GET(req: NextRequest): Promise<NextResponse> {
    const key = req.nextUrl.searchParams.get('key');
    if (!key) {
        return new NextResponse('Key is required', {status: 400});
    }

    const document = await redis.json.get<DocumentStatistics>(key, '$.statistics');
    if (!document) {
        return new NextResponse('Document not found', {status: 404});
    }

    return new NextResponse(document.toString());
}