export type Document = {key: string, title: string, document: string};

export abstract class Search {
    abstract search(query: string): Promise<{key: string, document: string, score: number}[]>;
    abstract add(document: Document | Document[]): Promise<boolean>;
    abstract remove(key: string | string[]): Promise<boolean>;
    abstract buildIndex(documents: {key: string, document: string}[]): Promise<boolean>;
    abstract resetIndex(): Promise<void>;
}