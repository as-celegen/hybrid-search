import {fullTextSearch} from "@/context/full-text-search";
import {NextRequest, NextResponse} from "next/server";
import {semanticSearch} from "@/context/semantic-search";

export async function DELETE(req: NextRequest, { params }: { params?: { namespace: string[] } }): Promise<NextResponse> {
    const namespace = params?.namespace?.join('/') ?? "";

    await Promise.all([
        semanticSearch.reset({namespace}),
        fullTextSearch.reset({namespace}),
    ]);

    return NextResponse.json({result: 'Success'});
}

export async function POST(req: NextRequest, { params }: { params?: { namespace: string[] } }): Promise<NextResponse> {
    return await DELETE(req, {params});
}