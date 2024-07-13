import { Ratelimit } from "@upstash/ratelimit";
import { redis } from "@/context/redis";
import { type NextFetchEvent, type NextRequest, NextResponse } from "next/server";

const ratelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.fixedWindow(20, "10s"),
    prefix: "ratelimit",
});

const allAccessToken = process.env.SEMANTIC_SEARCH_VECTOR_INDEX_TOKEN ?? '';
const readOnlyAccessToken = process.env.READ_ONLY_TOKEN ?? '';

export default async function middleware(
    request: NextRequest,
    event: NextFetchEvent,
): Promise<Response | undefined> {

    const pathSegments = request.nextUrl.pathname.split("/");
    const accessToken = request.headers.get('Authorization')?.substring(7);
    if(pathSegments.length > 1 && ['delete', 'delete-namespace', 'reset', 'upsert', 'upsert-data', 'update'].includes(pathSegments[1])) {
        if (accessToken !== allAccessToken) {
            return new Response('Unauthorized', {status: 401});
        }
    } else if(pathSegments.length > 1 && ['query-data', 'range', 'fetch', 'info', 'list-namespaces'].includes(pathSegments[1])) {
        if (accessToken !== allAccessToken && readOnlyAccessToken !== '' && accessToken !== readOnlyAccessToken) {
            return new Response('Unauthorized', {status: 401});
        }
    }
    const ip = request.ip ?? "127.0.0.1";

    const { success, pending, limit, reset, remaining } = await ratelimit.limit(
        `ratelimit_middleware_${ip}`,
    );
    event.waitUntil(pending);

    const res = success
        ? NextResponse.next()
        : NextResponse.json(
            { error: "Rate limit exceeded" },
            { status: 429 },
        );

    res.headers.set("X-RateLimit-Limit", limit.toString());
    res.headers.set("X-RateLimit-Remaining", remaining.toString());
    res.headers.set("X-RateLimit-Reset", reset.toString());
    return res;
}
