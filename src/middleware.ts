import { Ratelimit } from "@upstash/ratelimit";
import { redis } from "@/context/redis";
import { type NextFetchEvent, type NextRequest, NextResponse } from "next/server";

const ratelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.cachedFixedWindow(10, "10s"),
    prefix: "ratelimit",
});

const allAccessToken = process.env.SEMANTIC_SEARCH_VECTOR_INDEX_TOKEN ?? '';

export default async function middleware(
    request: NextRequest,
    event: NextFetchEvent,
): Promise<Response | undefined> {

    const pathSegments = request.nextUrl.pathname.split("/");
    if(pathSegments.length > 1 && ['delete', 'delete-namespace', 'reset', 'upsert', 'upsert-data'].includes(pathSegments[1])) {
        const accessToken = request.headers.get('Authorization')?.replace('Bearer ', '');

        if (accessToken !== allAccessToken) {
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
        : NextResponse.redirect(new URL("/api/blocked", request.url));

    res.headers.set("X-RateLimit-Limit", limit.toString());
    res.headers.set("X-RateLimit-Remaining", remaining.toString());
    res.headers.set("X-RateLimit-Reset", reset.toString());
    return res;
}
