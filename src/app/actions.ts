"use client";

import { Index } from "@upstash/vector";
import { z } from "zod";
import { MovieMetadata, Result, ResultCode } from "@/types/demo-results";
import { normalize } from "@/lib/utils";

export async function searchMovies(
  _prevState: Result | undefined,
  formData: FormData,
): Promise<Result | undefined> {
  try {
    const index = new Index<MovieMetadata>({
      url: window.location.origin,
      token: process.env.NEXT_PUBLIC_READ_ONLY_TOKEN ?? "placeholder-read-only",
    });

    const query = formData.get("query");

    const parsedCredentials = z
      .object({
        query: z.string().min(2),
      })
      .safeParse({
        query,
      });

    if (parsedCredentials.error) {
      return {
        code: ResultCode.MinLengthError,
        data: [],
      };
    }

    const response = await index.query<MovieMetadata>({
      data: query as string,
      topK: 50,
      includeVectors: false,
      includeMetadata: true,
    });

    if (!response || !Array.isArray(response)) {
      console.error("Unexpected response structure:", response);
      return {
        code: ResultCode.UnknownError,
        data: [],
      };
    }

    const filteredResponse = response.filter(
      (movie) =>
        movie.metadata?.poster_link !== null &&
        !movie.metadata?.poster_link.endsWith("null") &&
        movie.metadata?.imdb_link !== "IMDb link not available",
    );

    filteredResponse.sort((a, b) => b.score - a.score);

    return {
      code: ResultCode.Success,
      data: filteredResponse,
    };
  } catch (error) {
    console.error("Error querying Upstash:", error);
    return {
      code: ResultCode.UnknownError,
      data: [],
    };
  }
}
