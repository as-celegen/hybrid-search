import { fullTextSearch } from '@/context/full-text-search';
import {semanticSearch} from "@/context/semantic-search";
import {NextRequest, NextResponse} from "next/server";
import {waitUntil} from "@vercel/functions";

export const maxDuration = 60;

export async function POST(req: NextRequest, { params }: { params?: { namespace: string[] } }): Promise<NextResponse> {
    const body = await req.json();
    if (!body) {
        return NextResponse.json({result: 'Body is required'}, {status: 400});
    }
    if(Array.isArray(body) || !body.id || body.vector || (!body.data  && !body.metadata) || (Object.keys(body).length > 2)
    ) {
        return NextResponse.json({result: 'Only one object with just one of the data or metadata is accepted'}, {status: 400});
    }

    const namespace = params?.namespace?.join('/') ?? "";
    waitUntil(semanticSearch.update(body, {namespace}));
    waitUntil(fullTextSearch.update(body, {namespace}));

    return NextResponse.json({result: 'Success'});
}