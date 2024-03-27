export type Document = {key: string, title: string, document: string};

export interface Metadata extends Record<string, unknown> {
    key: string;
    title: string;
}

export abstract class Search {
    abstract search(query: string): Promise<{key: string, title: string, score: number}[]>;
    abstract add(document: Document | Document[]): Promise<boolean>;
    abstract remove(key: string | string[]): Promise<number>;
    abstract buildIndex(documents: {key: string, document: string}[]): Promise<boolean>;
    abstract resetIndex(): Promise<void>;
}