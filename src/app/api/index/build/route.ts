import { fullTextSearch } from '@/context/full-text-search';
import {semanticSearch} from "@/context/semantic-search";
import { Document } from '@/lib/search';
import {NextRequest, NextResponse} from "next/server";
import { RedisDocument } from "@/types/document";
import { redis } from '@/context/redis';

export async function POST(req: NextRequest): Promise<NextResponse> {
    const documents: Document[] = await req.json();

    if (!documents || !Array.isArray(documents) || documents.length === 0){
        return new NextResponse('Document is required', {status: 400});
    }

    await fullTextSearch.buildIndex(documents);
    await semanticSearch.buildIndex(documents);

    await Promise.all(documents.map(async (doc) => {
        const redisDocument: RedisDocument = {
            ...doc,
            statistics: {
                clickCount: 0,
                clickedQueries: [],
                top10ResultCount: 0,
                top10ResultQueries: []
            }
        }
        await redis.set(redisDocument.key, JSON.stringify(redisDocument));
    }));

    await redis.sadd('document-keys', ...documents.map(doc => doc.key));
    return new NextResponse('OK');
}