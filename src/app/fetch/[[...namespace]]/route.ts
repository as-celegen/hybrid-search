import {NextRequest, NextResponse} from "next/server";
import {redis} from "@/context/redis";
import {VectorWithData} from "@/lib/full-text-search/bm25";

export async function GET(req: NextRequest, { params }: { params?: { namespace: string[] } }): Promise<NextResponse> {
    const keys: any = await req.json();
    if (!keys) {
        return new NextResponse('Key is required', {status: 400});
    }
    const keysArray = (Array.isArray(keys) ? keys : [keys]).flatMap(key => typeof key === 'string' || typeof key === 'number' ? key : []);
    const namespace = params?.namespace.join('/') ?? "";
    const pipeline = redis.pipeline();
    keysArray.forEach(key => pipeline.json.get(namespace + '.' + key));

    const documents = await pipeline.exec<VectorWithData[]>();

    return NextResponse.json({result: documents});
}