import {NextRequest, NextResponse} from "next/server";
import {fullTextSearch} from "@/context/full-text-search";
import {semanticSearch} from "@/context/semantic-search";

export async function DELETE(req: NextRequest, { params }: { params: { namespace: string[] } }): Promise<NextResponse> {
    const keys: any = await req.json();
    const keysArray = (Array.isArray(keys) ? keys : [keys]).flatMap(key => typeof key === 'string' ? key : []);
    const namespace = params.namespace.join('/');

    const [_, {deleted}] = await Promise.all([
        fullTextSearch.delete(keysArray),
        semanticSearch.delete(keysArray),
    ]);
    return NextResponse.json({result: {deleted}});
}