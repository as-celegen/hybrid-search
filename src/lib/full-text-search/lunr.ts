import { Search } from "@/lib/search";
import {  } from "lunr";
import Error from "next/error";

export class Lunr extends Search {
    async resetIndex(): Promise<void> {
        return Promise.resolve(undefined);
    }
    async search(query: string): Promise<{ key: string; document: string; score: number; }[]> {
        throw new Error("Method not implemented.");
    }
    async add(document: { key: string; document: string; } | { key: string; document: string; }[]): Promise<boolean> {
        throw new Error("Method not implemented.");
    }
    async remove(key: string | string[]): Promise<boolean> {
        throw new Error("Method not implemented.");
    }

    async buildIndex(documents: { key: string; document: string }[]): Promise<boolean> {
        throw new Error("Method not implemented.");
    }
}


