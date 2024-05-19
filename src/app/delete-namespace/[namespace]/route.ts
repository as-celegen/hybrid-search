import {NextRequest, NextResponse} from "next/server";
import {fullTextSearch} from "@/context/full-text-search";
import {semanticSearch} from "@/context/semantic-search";

export async function DELETE(req: NextRequest, { params }: { params?: { namespace: string[] } }): Promise<NextResponse> {
    const namespace = params?.namespace?.join('/') ?? "";

    const [a, b] = await Promise.all([
        fullTextSearch.deleteNamespace(namespace),
        semanticSearch.deleteNamespace(namespace),
    ]);
    return NextResponse.json({result: a && b ? 'OK' : 'Error'});
}