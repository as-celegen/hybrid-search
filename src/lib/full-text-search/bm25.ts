import { Search } from "@/lib/search";
import Error from "next/error";

export class BM25 extends Search {
    async search(query: string): Promise<{key: string, title: string, score: number}[]> {
        throw new Error("Method not implemented.");
    }
    async add(document: { key: string; document: string } | { key: string; document: string }[]): Promise<boolean> {
        throw new Error("Method not implemented.");
    }
    async remove(key: string | string[]): Promise<number> {
        throw new Error("Method not implemented.");
    }

    async buildIndex(documents: { key: string; document: string }[]): Promise<boolean> {
        throw new Error("Method not implemented.");
    }

    async resetIndex(): Promise<void> {
        throw new Error("Method not implemented.");
    }
}

