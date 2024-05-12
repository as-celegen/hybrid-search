import { fullTextSearch } from '@/context/full-text-search';
import {semanticSearch} from "@/context/semantic-search";
import {NextRequest, NextResponse} from "next/server";
import { RedisDocument } from "@/types/document";
import { redis } from '@/context/redis';

export async function POST(req: NextRequest): Promise<NextResponse> {
    const body = await req.json();
    const documents: Document[] = Array.isArray(body) ? body : [body];
    await fullTextSearch.upsert(documents);
    await semanticSearch.upsert(documents);

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
        await redis.json.set(`key#${redisDocument.id}`, '$', redisDocument as any);
    }));

    await redis.sadd('document-keys', ...documents.map(doc => doc.id));
    return new NextResponse('OK');
}